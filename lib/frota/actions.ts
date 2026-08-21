'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { garantirContaAtiva } from '@/lib/seguranca/conta';
import { traduzirErro } from '@/lib/erros';
import {
  avaliarElegibilidade,
  type VeiculoElegivel,
} from '@/lib/frota/elegibilidade';
import type { EstadoCompliance } from '@/lib/types';

const veiculoSchema = z.object({
  plate: z
    .string()
    .min(4, 'Indique a matrícula.')
    .max(20)
    .transform((s) => s.toUpperCase().trim()),
  type: z.enum([
    'LIGHT_TRUCK', 'MEDIUM_TRUCK', 'HEAVY_TRUCK', 'TRAILER',
    'REFRIGERATED', 'TANKER', 'FLATBED', 'CONTAINER',
  ]),
  brand: z.string().max(80).optional().or(z.literal('')),
  model: z.string().max(80).optional().or(z.literal('')),
  year: z.coerce.number().int().min(1970).max(new Date().getFullYear() + 1)
    .optional().or(z.literal('')),
  maxWeightKg: z.coerce
    .number({ invalid_type_error: 'Indique a capacidade.' })
    .positive('A capacidade tem de ser maior que zero.')
    .max(60000, 'Capacidade acima do limite legal.'),
  maxVolumeM3: z.coerce.number().positive().max(200).optional().or(z.literal('')),
  hasRefrigeration: z.boolean().default(false),
  hasTailLift: z.boolean().default(false),
});

export type EstadoVeiculo = {
  erro?: string;
  erros?: Record<string, string[]>;
};

const PERFIS_COM_FROTA = ['CARRIER', 'COMPANY_ADMIN', 'PLATFORM_ADMIN'];

export async function criarVeiculo(
  _anterior: EstadoVeiculo,
  formData: FormData,
): Promise<EstadoVeiculo> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  if (!PERFIS_COM_FROTA.includes(perfil.user.role)) {
    return { erro: 'O seu perfil não permite registar veículos.' };
  }

  const parsed = veiculoSchema.safeParse({
    plate: formData.get('plate'),
    type: formData.get('type'),
    brand: formData.get('brand') || '',
    model: formData.get('model') || '',
    year: formData.get('year') || '',
    maxWeightKg: formData.get('maxWeightKg'),
    maxVolumeM3: formData.get('maxVolumeM3') || '',
    hasRefrigeration: formData.get('hasRefrigeration') === 'on',
    hasTailLift: formData.get('hasTailLift') === 'on',
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const supabase = createClient();
  const { error } = await supabase.from('vehicles').insert({
    tenant_id: perfil.tenant.id,
    plate: d.plate,
    type: d.type,
    brand: d.brand || null,
    model: d.model || null,
    year: d.year === '' ? null : d.year,
    max_weight_kg: d.maxWeightKg,
    max_volume_m3: d.maxVolumeM3 === '' ? null : d.maxVolumeM3,
    // Refrigeração é implícita no tipo REFRIGERATED
    has_refrigeration: d.hasRefrigeration || d.type === 'REFRIGERATED',
    has_tail_lift: d.hasTailLift,
    verification: 'PENDING',
  });

  if (error) {
    if (error.code === '23505') {
      return { erro: 'Já registou um veículo com esta matrícula.' };
    }
    return { erro: traduzirErro(error, 'registar o veículo') };
  }

  revalidatePath('/frota');
  redirect('/frota?criado=1');
}

export async function listarVeiculos() {
  const supabase = createClient();
  const { data } = await supabase
    .from('vehicles')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  return data ?? [];
}

/**
 * Veículos para escolher ao publicar ou editar uma viagem.
 *
 * Devolve TODOS os veículos activos da empresa, cada um com o seu estado de
 * elegibilidade e, quando não pode ser usado, o motivo. Não filtra a lista.
 *
 * Porquê não filtrar: um veículo que desaparece sem explicação é pior do que
 * um veículo que aparece bloqueado. A pessoa fica a olhar para um seletor onde
 * falta o camião dela e não faz ideia do que correu mal. Assim vê o camião, vê
 * que não o pode usar, e vê porquê.
 *
 * A regra vive em `lib/frota/elegibilidade.ts` e é espelhada por
 * `cf_veiculo_elegivel()` na base de dados — esta lista é conveniência de
 * interface, quem decide é o RLS.
 */
export async function listarVeiculosDisponiveis(): Promise<VeiculoElegivel[]> {
  const perfil = await getSessionProfile();
  if (!perfil) return [];

  const supabase = createClient();

  const [{ data: veiculos }, { data: compliance }] = await Promise.all([
    supabase.from('vehicles').select('*').eq('is_active', true).order('plate'),
    supabase
      .from('vehicle_compliance')
      .select('vehicle_id, estado_compliance, tipos_em_falta, valido_ate')
      .eq('tenant_id', perfil.tenant.id),
  ]);

  const porId = new Map(
    ((compliance ?? []) as Array<{
      vehicle_id: string;
      estado_compliance: EstadoCompliance;
      tipos_em_falta: string[] | null;
      valido_ate: string | null;
    }>).map((c) => [c.vehicle_id, c]),
  );

  return ((veiculos ?? []) as Array<Record<string, unknown>>).map((v) => {
    const c = porId.get(v.id as string);
    const estado = c?.estado_compliance ?? 'pending';
    const emFalta = c?.tipos_em_falta ?? [];
    const { elegivel, motivo, gravidade } = avaliarElegibilidade(
      String(v.verification),
      estado,
      emFalta,
    );

    return {
      ...v,
      estado_compliance: estado,
      tipos_em_falta: emFalta,
      valido_ate: c?.valido_ate ?? null,
      elegivel,
      motivo,
      gravidade,
    } as unknown as VeiculoElegivel;
  });
}

export async function desativarVeiculo(veiculoId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  const supabase = createClient();
  const { error } = await supabase
    .from('vehicles')
    .update({ is_active: false })
    .eq('id', veiculoId);

  if (error) throw new Error('Não foi possível desativar o veículo.');
  revalidatePath('/frota');
}
