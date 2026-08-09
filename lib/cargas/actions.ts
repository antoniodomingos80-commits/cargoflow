'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { traduzirErro } from '@/lib/erros';

// =============================================================================
// Validação
// =============================================================================

const cargaSchema = z
  .object({
    title: z.string().min(5, 'Descreva a carga em pelo menos 5 caracteres.').max(200),
    description: z.string().max(2000).optional().or(z.literal('')),
    originId: z.string().uuid('Selecione a origem.'),
    destinationId: z.string().uuid('Selecione o destino.'),
    cargoType: z.enum([
      'GENERAL', 'PERISHABLE', 'REFRIGERATED', 'FRAGILE',
      'HAZARDOUS', 'BULK', 'LIQUID', 'CONTAINER', 'LIVESTOCK',
    ]),
    weightKg: z.coerce
      .number({ invalid_type_error: 'Indique o peso.' })
      .positive('O peso tem de ser maior que zero.')
      .max(60000, 'Peso acima do limite legal para transporte rodoviário.'),
    volumeM3: z.coerce.number().positive().max(200).optional().or(z.literal('')),
    requiredVehicleType: z
      .enum([
        'LIGHT_TRUCK', 'MEDIUM_TRUCK', 'HEAVY_TRUCK', 'TRAILER',
        'REFRIGERATED', 'TANKER', 'FLATBED', 'CONTAINER',
      ])
      .optional()
      .or(z.literal('')),
    pickupFrom: z.string().min(1, 'Indique a partir de quando pode recolher.'),
    pickupUntil: z.string().min(1, 'Indique até quando pode recolher.'),
    deliveryDeadline: z.string().optional().or(z.literal('')),
    isUrgent: z.boolean().default(false),
    budgetAmount: z.coerce.number().nonnegative().optional().or(z.literal('')),
    publicar: z.boolean().default(false),
  })
  .refine((d) => d.originId !== d.destinationId, {
    message: 'A origem e o destino têm de ser diferentes.',
    path: ['destinationId'],
  })
  .refine((d) => new Date(d.pickupUntil) >= new Date(d.pickupFrom), {
    message: 'A data final tem de ser igual ou posterior à inicial.',
    path: ['pickupUntil'],
  })
  .refine(
    (d) => !d.deliveryDeadline || new Date(d.deliveryDeadline) >= new Date(d.pickupFrom),
    { message: 'O prazo de entrega não pode ser anterior à recolha.', path: ['deliveryDeadline'] },
  );

export type EstadoCarga = {
  erro?: string;
  erros?: Record<string, string[]>;
};

// Só comerciantes publicam cargas. Empresas transportadoras também podem
// (subcontratação é prática comum no setor), mas camionistas individuais não.
const PERFIS_PODEM_PUBLICAR_CARGA = ['MERCHANT', 'COMPANY_ADMIN', 'PLATFORM_ADMIN'];

function lerFormulario(formData: FormData) {
  return {
    title: formData.get('title'),
    description: formData.get('description') || '',
    originId: formData.get('originId'),
    destinationId: formData.get('destinationId'),
    cargoType: formData.get('cargoType') || 'GENERAL',
    weightKg: formData.get('weightKg'),
    volumeM3: formData.get('volumeM3') || '',
    requiredVehicleType: formData.get('requiredVehicleType') || '',
    pickupFrom: formData.get('pickupFrom'),
    pickupUntil: formData.get('pickupUntil'),
    deliveryDeadline: formData.get('deliveryDeadline') || '',
    isUrgent: formData.get('isUrgent') === 'on',
    budgetAmount: formData.get('budgetAmount') || '',
    publicar: formData.get('accao') === 'publicar',
  };
}

// =============================================================================
// Criar carga
// =============================================================================

export async function criarCarga(
  _anterior: EstadoCarga,
  formData: FormData,
): Promise<EstadoCarga> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  if (!PERFIS_PODEM_PUBLICAR_CARGA.includes(perfil.user.role)) {
    return { erro: 'O seu perfil não permite publicar cargas.' };
  }

  const parsed = cargaSchema.safeParse(lerFormulario(formData));
  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  // Publicar exige conta verificada. Guardar rascunho não — assim o
  // utilizador pode preparar cargas enquanto aguarda a verificação.
  if (d.publicar && perfil.user.verification !== 'APPROVED') {
    return {
      erro:
        'A sua conta ainda não está verificada. Pode guardar como rascunho e ' +
        'publicar assim que os documentos forem aprovados.',
    };
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from('loads')
    .insert({
      tenant_id: perfil.tenant.id,
      created_by: perfil.user.id,
      title: d.title,
      description: d.description || null,
      origin_id: d.originId,
      destination_id: d.destinationId,
      cargo_type: d.cargoType,
      weight_kg: d.weightKg,
      volume_m3: d.volumeM3 === '' ? null : d.volumeM3,
      required_vehicle_type: d.requiredVehicleType === '' ? null : d.requiredVehicleType,
      requires_refrigeration:
        d.cargoType === 'REFRIGERATED' || d.requiredVehicleType === 'REFRIGERATED',
      pickup_from: new Date(d.pickupFrom).toISOString(),
      pickup_until: new Date(d.pickupUntil).toISOString(),
      delivery_deadline: d.deliveryDeadline
        ? new Date(d.deliveryDeadline).toISOString()
        : null,
      is_urgent: d.isUrgent,
      budget_amount: d.budgetAmount === '' ? null : d.budgetAmount,
      currency: perfil.tenant.default_currency,
      status: d.publicar ? 'PUBLISHED' : 'DRAFT',
      // reference, distance_km e published_at são preenchidos pelo gatilho
    })
    .select('id, reference')
    .single();

  if (error || !data) {
    return { erro: traduzirErro(error, 'guardar a carga') };
  }

  revalidatePath('/cargas');
  revalidatePath('/mercado/cargas');
  redirect(`/cargas/${data.id}?criada=1`);
}

// =============================================================================
// Editar carga
//
// Só enquanto ninguém depende dela: rascunho, publicada ou em negociação.
// A partir do momento em que há transporte adjudicado, as condições fazem
// parte de um acordo — mudá-las unilateralmente seria alterar o contrato.
//
// Propostas pendentes são retiradas ao guardar, pelo mesmo motivo que nas
// viagens: foram feitas sobre outra carga que não esta.
// =============================================================================

const ESTADOS_CARGA_EDITAVEIS = ['DRAFT', 'PUBLISHED', 'NEGOTIATING'];

export async function editarCarga(
  _anterior: EstadoCarga,
  formData: FormData,
): Promise<EstadoCarga> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const cargaId = String(formData.get('cargaId') ?? '');
  if (!cargaId) return { erro: 'Carga não identificada.' };

  const supabase = createClient();

  const { data: atual } = await supabase
    .from('loads')
    .select('id, tenant_id, status')
    .eq('id', cargaId)
    .single();

  if (!atual || atual.tenant_id !== perfil.tenant.id) {
    return { erro: 'Carga não encontrada.' };
  }

  if (!ESTADOS_CARGA_EDITAVEIS.includes(atual.status)) {
    return {
      erro:
        'Esta carga já tem transporte adjudicado. As condições passaram a fazer ' +
        'parte do acordo e não podem ser alteradas de um lado só.',
    };
  }

  const parsed = cargaSchema.safeParse(lerFormulario(formData));
  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  // Publicar um rascunho pela edição exige o mesmo que publicar de origem
  const vaiPublicar = d.publicar && atual.status === 'DRAFT';
  if (vaiPublicar && perfil.user.verification !== 'APPROVED') {
    return {
      erro:
        'A sua conta ainda não está verificada. Pode guardar as alterações, ' +
        'mas só publicar depois de os documentos serem aprovados.',
    };
  }

  const { error } = await supabase
    .from('loads')
    .update({
      title: d.title,
      description: d.description || null,
      origin_id: d.originId,
      destination_id: d.destinationId,
      cargo_type: d.cargoType,
      weight_kg: d.weightKg,
      volume_m3: d.volumeM3 === '' ? null : d.volumeM3,
      required_vehicle_type: d.requiredVehicleType === '' ? null : d.requiredVehicleType,
      requires_refrigeration:
        d.cargoType === 'REFRIGERATED' || d.requiredVehicleType === 'REFRIGERATED',
      pickup_from: new Date(d.pickupFrom).toISOString(),
      pickup_until: new Date(d.pickupUntil).toISOString(),
      delivery_deadline: d.deliveryDeadline
        ? new Date(d.deliveryDeadline).toISOString()
        : null,
      is_urgent: d.isUrgent,
      budget_amount: d.budgetAmount === '' ? null : d.budgetAmount,
      ...(vaiPublicar ? { status: 'PUBLISHED' } : {}),
    })
    .eq('id', cargaId);

  if (error) {
    return { erro: traduzirErro(error, 'guardar as alterações') };
  }

  await supabase
    .from('offers')
    .update({ status: 'WITHDRAWN', responded_at: new Date().toISOString() })
    .eq('load_id', cargaId)
    .eq('status', 'PENDING');

  revalidatePath('/cargas');
  revalidatePath(`/cargas/${cargaId}`);
  revalidatePath('/mercado/cargas');
  redirect(`/cargas/${cargaId}?guardada=1`);
}

// =============================================================================
// Publicar rascunho
// =============================================================================

export async function publicarCarga(cargaId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  if (perfil.user.verification !== 'APPROVED') {
    throw new Error('Conta ainda não verificada.');
  }

  const supabase = createClient();
  // O RLS garante que só o dono altera. A condição de status impede
  // republicar algo que já foi atribuído ou cancelado.
  const { error } = await supabase
    .from('loads')
    .update({ status: 'PUBLISHED' })
    .eq('id', cargaId)
    .eq('status', 'DRAFT');

  if (error) throw new Error('Não foi possível publicar a carga.');

  revalidatePath('/cargas');
  revalidatePath(`/cargas/${cargaId}`);
  revalidatePath('/mercado/cargas');
}

// =============================================================================
// Cancelar
// =============================================================================

export async function cancelarCarga(cargaId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  // Só se cancela antes de estar em trânsito — depois disso é uma disputa,
  // não um cancelamento.
  const { error } = await supabase
    .from('loads')
    .update({ status: 'CANCELLED' })
    .eq('id', cargaId)
    .in('status', ['DRAFT', 'PUBLISHED', 'NEGOTIATING']);

  if (error) throw new Error('Não foi possível cancelar a carga.');

  revalidatePath('/cargas');
  revalidatePath(`/cargas/${cargaId}`);
  revalidatePath('/mercado/cargas');
}

// =============================================================================
// Consultas
// =============================================================================

const SELECT_CARGA = `
  *,
  origin:locations!loads_origin_id_fkey (id, name, city, province),
  destination:locations!loads_destination_id_fkey (id, name, city, province)
`;

/**
 * Cargas da própria empresa (ecrã "As minhas cargas").
 *
 * O filtro por tenant é EXPLÍCITO e não pode ser omitido. As políticas RLS
 * de `loads` permitem deliberadamente ler todas as cargas publicadas — é isso
 * que faz o marketplace funcionar. Sem este filtro, este ecrã mostraria as
 * cargas de toda a gente.
 */
export async function listarMinhasCargas(estado?: string) {
  const perfil = await getSessionProfile();
  if (!perfil) return [];

  const supabase = createClient();
  let q = supabase
    .from('loads')
    .select(SELECT_CARGA)
    .eq('tenant_id', perfil.tenant.id)
    .order('created_at', { ascending: false });

  if (estado && estado !== 'todas') {
    q = q.eq('status', estado.toUpperCase());
  }

  const { data, error } = await q;
  if (error) return [];
  return data ?? [];
}

/** Marketplace: cargas publicadas por outros (ecrã dos transportadores) */
export async function listarMercadoCargas(filtros: {
  origem?: string;
  destino?: string;
  tipo?: string;
  pesoMax?: string;
}) {
  const supabase = createClient();
  // NEGOTIATING também aparece: uma carga que já recebeu propostas continua
  // aberta a melhores. Escondê-la retirava do mercado exatamente as cargas com
  // procura comprovada, e deixava quem tinha proposto sem forma de a reencontrar.
  let q = supabase
    .from('loads')
    .select(SELECT_CARGA)
    .in('status', ['PUBLISHED', 'NEGOTIATING'])
    .gte('pickup_until', new Date().toISOString())
    .order('is_urgent', { ascending: false })
    .order('pickup_from', { ascending: true });

  if (filtros.origem) q = q.eq('origin_id', filtros.origem);
  if (filtros.destino) q = q.eq('destination_id', filtros.destino);
  if (filtros.tipo) q = q.eq('cargo_type', filtros.tipo);
  if (filtros.pesoMax) q = q.lte('weight_kg', Number(filtros.pesoMax));

  const { data, error } = await q.limit(100);
  if (error) return [];
  return data ?? [];
}

export async function obterCarga(cargaId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('loads')
    .select(SELECT_CARGA)
    .eq('id', cargaId)
    .single();

  if (error) return null;
  return data;
}

/** Localidades para os seletores de origem/destino */
export async function listarLocalidades() {
  const supabase = createClient();
  const { data } = await supabase
    .from('locations')
    .select('id, name, city, province')
    .order('city');
  return data ?? [];
}
