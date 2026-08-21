'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { garantirContaAtiva } from '@/lib/seguranca/conta';
import { traduzirErro } from '@/lib/erros';
import { notificarMatchesDeViagem } from '@/lib/matching/notificacoes';
import { avaliarElegibilidade } from '@/lib/frota/elegibilidade';
import type { EstadoCompliance } from '@/lib/types';

const viagemSchema = z
  .object({
    vehicleId: z.string().uuid('Selecione o veículo.'),
    originId: z.string().uuid('Selecione a origem.'),
    destinationId: z.string().uuid('Selecione o destino.'),
    availableWeightKg: z.coerce
      .number({ invalid_type_error: 'Indique a capacidade disponível.' })
      .positive('Tem de ser maior que zero.')
      .max(60000),
    availableVolumeM3: z.coerce.number().positive().max(200).optional().or(z.literal('')),
    departureAt: z.string().min(1, 'Indique a data de partida.'),
    estimatedArrival: z.string().optional().or(z.literal('')),
    minimumPrice: z.coerce.number().nonnegative().optional().or(z.literal('')),
    isReturnTrip: z.boolean().default(false),
  })
  .refine((d) => d.originId !== d.destinationId, {
    message: 'A origem e o destino têm de ser diferentes.',
    path: ['destinationId'],
  })
  .refine(
    (d) => !d.estimatedArrival || new Date(d.estimatedArrival) > new Date(d.departureAt),
    { message: 'A chegada tem de ser posterior à partida.', path: ['estimatedArrival'] },
  );

export type EstadoViagem = {
  erro?: string;
  erros?: Record<string, string[]>;
};

const PERFIS_PODEM_PUBLICAR_VIAGEM = ['CARRIER', 'COMPANY_ADMIN', 'COMPANY_STAFF', 'PLATFORM_ADMIN'];

/**
 * Barreira de elegibilidade do veículo.
 *
 * Devolve o erro a mostrar, ou `null` quando o veículo pode operar.
 *
 * Isto NÃO é a segurança: a política RESTRICTIVE `trips_veiculo_elegivel` e o
 * gatilho `zz_trips_veiculo_elegivel` recusam a escrita mesmo que alguém
 * ignore a aplicação e chame o PostgREST directamente. Isto existe para dar
 * uma frase em português em vez de um erro de base de dados, e para não
 * escrever nada quando já se sabe que vai ser recusado.
 */
async function garantirVeiculoElegivel(
  supabase: ReturnType<typeof createClient>,
  veiculoId: string,
): Promise<EstadoViagem | null> {
  const { data: linha } = await supabase
    .from('vehicle_compliance')
    .select('estado_compliance, tipos_em_falta')
    .eq('vehicle_id', veiculoId)
    .maybeSingle();

  const { data: v } = await supabase
    .from('vehicles')
    .select('verification')
    .eq('id', veiculoId)
    .maybeSingle();

  const { elegivel, motivo } = avaliarElegibilidade(
    String(v?.verification ?? 'PENDING'),
    (linha?.estado_compliance ?? 'pending') as EstadoCompliance,
    linha?.tipos_em_falta ?? [],
  );

  if (elegivel) return null;

  return {
    erros: {
      vehicleId: [
        `Este veículo não está elegível para operar: ${(motivo ?? '').toLowerCase()}. ` +
          'Regularize a documentação na área de Frota.',
      ],
    },
  };
}

export async function criarViagem(
  _anterior: EstadoViagem,
  formData: FormData,
): Promise<EstadoViagem> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  if (!PERFIS_PODEM_PUBLICAR_VIAGEM.includes(perfil.user.role)) {
    return { erro: 'O seu perfil não permite publicar viagens.' };
  }
  if (perfil.user.verification !== 'APPROVED') {
    return {
      erro:
        'A sua conta ainda não está verificada. Publicar viagens exige ' +
        'documentos aprovados — é o que dá confiança aos comerciantes.',
    };
  }

  const parsed = viagemSchema.safeParse({
    vehicleId: formData.get('vehicleId'),
    originId: formData.get('originId'),
    destinationId: formData.get('destinationId'),
    availableWeightKg: formData.get('availableWeightKg'),
    availableVolumeM3: formData.get('availableVolumeM3') || '',
    departureAt: formData.get('departureAt'),
    estimatedArrival: formData.get('estimatedArrival') || '',
    minimumPrice: formData.get('minimumPrice') || '',
    isReturnTrip: formData.get('isReturnTrip') === 'on',
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const supabase = createClient();

  // Verificar que o veículo pertence mesmo a esta empresa. O RLS já o
  // garantiria na inserção, mas assim damos uma mensagem clara.
  const { data: veiculo } = await supabase
    .from('vehicles')
    .select('id, max_weight_kg')
    .eq('id', d.vehicleId)
    .single();

  if (!veiculo) return { erro: 'Veículo não encontrado.' };

  const barreira = await garantirVeiculoElegivel(supabase, d.vehicleId);
  if (barreira) return barreira;

  if (d.availableWeightKg > Number(veiculo.max_weight_kg)) {
    return {
      erros: {
        availableWeightKg: [
          `A capacidade disponível não pode exceder a do veículo (${veiculo.max_weight_kg} kg).`,
        ],
      },
    };
  }

  const { data, error } = await supabase
    .from('trips')
    .insert({
      tenant_id: perfil.tenant.id,
      created_by: perfil.user.id,
      vehicle_id: d.vehicleId,
      origin_id: d.originId,
      destination_id: d.destinationId,
      available_weight_kg: d.availableWeightKg,
      available_volume_m3: d.availableVolumeM3 === '' ? null : d.availableVolumeM3,
      departure_at: new Date(d.departureAt).toISOString(),
      estimated_arrival: d.estimatedArrival
        ? new Date(d.estimatedArrival).toISOString()
        : null,
      minimum_price: d.minimumPrice === '' ? null : d.minimumPrice,
      currency: perfil.tenant.default_currency,
      is_return_trip: d.isReturnTrip,
      status: 'PUBLISHED',
      // reference gerada por gatilho; matches calculados automaticamente
    })
    .select('id')
    .single();

  if (error || !data) {
    return { erro: traduzirErro(error, 'publicar a viagem') };
  }

  // Não bloqueia o redirect — o matching é um extra, a viagem já está
  // publicada e confirmada nas linhas acima.
  await notificarMatchesDeViagem(data.id);

  revalidatePath('/viagens');
  revalidatePath('/mercado/viagens');
  redirect(`/viagens/${data.id}?criada=1`);
}

// =============================================================================
// Editar viagem
//
// Regras — o que se pode mudar depende do que já foi prometido a terceiros:
//
//   PUBLISHED           tudo editável. Ninguém depende ainda desta viagem.
//   PARTIALLY_BOOKED    já há carga adjudicada a bordo. Rota, veículo e data de
//   / FULL              partida ficam bloqueados: alterá-los mudaria unilateral-
//                       mente o que foi acordado com o comerciante. Continuam
//                       editáveis o preço mínimo, a chegada prevista e a
//                       capacidade — desde que não desça abaixo do já ocupado.
//   restantes estados   nada editável.
//
// Propostas pendentes feitas sobre as condições antigas são retiradas, com
// notificação. Deixá-las vivas permitiria que alguém aceitasse termos que já
// não existem.
// =============================================================================

export async function editarViagem(
  _anterior: EstadoViagem,
  formData: FormData,
): Promise<EstadoViagem> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  const viagemId = String(formData.get('viagemId') ?? '');
  if (!viagemId) return { erro: 'Viagem não identificada.' };

  const supabase = createClient();

  const { data: atual } = await supabase
    .from('trips')
    .select('id, tenant_id, status, vehicle_id, origin_id, destination_id, departure_at, available_weight_kg')
    .eq('id', viagemId)
    .single();

  if (!atual || atual.tenant_id !== perfil.tenant.id) {
    return { erro: 'Viagem não encontrada.' };
  }

  if (!['PUBLISHED', 'PARTIALLY_BOOKED', 'FULL'].includes(atual.status)) {
    return {
      erro:
        'Esta viagem já está em curso ou terminada. Nesse ponto as condições ' +
        'deixam de poder ser alteradas.',
    };
  }

  const temCargaABordo = atual.status !== 'PUBLISHED';

  const parsed = viagemSchema.safeParse({
    vehicleId: formData.get('vehicleId'),
    originId: formData.get('originId'),
    destinationId: formData.get('destinationId'),
    availableWeightKg: formData.get('availableWeightKg'),
    availableVolumeM3: formData.get('availableVolumeM3') || '',
    departureAt: formData.get('departureAt'),
    estimatedArrival: formData.get('estimatedArrival') || '',
    minimumPrice: formData.get('minimumPrice') || '',
    isReturnTrip: formData.get('isReturnTrip') === 'on',
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const { data: veiculo } = await supabase
    .from('vehicles')
    .select('id, max_weight_kg')
    .eq('id', d.vehicleId)
    .single();

  if (!veiculo) return { erro: 'Veículo não encontrado.' };

  // Só quando o veículo muda: um camião que ficou não elegível depois da
  // viagem ter sido publicada não deve impedir o camionista de corrigir o
  // preço ou de cancelar.
  if (d.vehicleId !== atual.vehicle_id) {
    const barreira = await garantirVeiculoElegivel(supabase, d.vehicleId);
    if (barreira) return barreira;
  }

  if (d.availableWeightKg > Number(veiculo.max_weight_kg)) {
    return {
      erros: {
        availableWeightKg: [
          `A capacidade disponível não pode exceder a do veículo (${veiculo.max_weight_kg} kg).`,
        ],
      },
    };
  }

  // Campos estruturais: só se ninguém depender deles
  if (temCargaABordo) {
    const mudouEstrutura =
      d.vehicleId !== atual.vehicle_id ||
      d.originId !== atual.origin_id ||
      d.destinationId !== atual.destination_id ||
      new Date(d.departureAt).toISOString() !== new Date(atual.departure_at).toISOString();

    if (mudouEstrutura) {
      return {
        erro:
          'Esta viagem já tem carga adjudicada. Rota, veículo e data de partida ' +
          'não podem mudar — foi com essas condições que o comerciante aceitou. ' +
          'Pode ainda ajustar o preço mínimo, a chegada prevista e a capacidade.',
      };
    }

    if (d.availableWeightKg < Number(atual.available_weight_kg)) {
      return {
        erros: {
          availableWeightKg: [
            'Não pode reduzir abaixo do espaço que ainda está livre — a carga ' +
              'já adjudicada tem de continuar a caber.',
          ],
        },
      };
    }
  }

  const { error } = await supabase
    .from('trips')
    .update({
      vehicle_id: d.vehicleId,
      origin_id: d.originId,
      destination_id: d.destinationId,
      available_weight_kg: d.availableWeightKg,
      available_volume_m3: d.availableVolumeM3 === '' ? null : d.availableVolumeM3,
      departure_at: new Date(d.departureAt).toISOString(),
      estimated_arrival: d.estimatedArrival
        ? new Date(d.estimatedArrival).toISOString()
        : null,
      minimum_price: d.minimumPrice === '' ? null : d.minimumPrice,
      is_return_trip: d.isReturnTrip,
    })
    .eq('id', viagemId);

  if (error) {
    return { erro: traduzirErro(error, 'guardar as alterações') };
  }

  // Retirar propostas feitas sobre as condições antigas
  await supabase
    .from('offers')
    .update({ status: 'WITHDRAWN', responded_at: new Date().toISOString() })
    .eq('trip_id', viagemId)
    .eq('status', 'PENDING');

  revalidatePath('/viagens');
  revalidatePath(`/viagens/${viagemId}`);
  revalidatePath('/mercado/viagens');
  redirect(`/viagens/${viagemId}?guardada=1`);
}

export async function cancelarViagem(viagemId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  const supabase = createClient();
  const { error } = await supabase
    .from('trips')
    .update({ status: 'CANCELLED' })
    .eq('id', viagemId)
    .in('status', ['PUBLISHED', 'PARTIALLY_BOOKED']);

  if (error) throw new Error('Não foi possível cancelar a viagem.');

  revalidatePath('/viagens');
  revalidatePath(`/viagens/${viagemId}`);
  revalidatePath('/mercado/viagens');
}

// =============================================================================
// Consultas
// =============================================================================

const SELECT_VIAGEM = `
  *,
  origin:locations!trips_origin_id_fkey (id, name, city, province),
  destination:locations!trips_destination_id_fkey (id, name, city, province),
  vehicle:vehicles (id, plate, type, max_weight_kg, has_refrigeration),
  tenant:tenants (id, name, verification),
  motorista:users!trips_created_by_fkey (id, full_name, phone, avatar_url, base_city)
`;

/**
 * Viagens da própria empresa.
 *
 * O filtro por tenant é EXPLÍCITO e não pode ser omitido. As políticas RLS
 * de `trips` permitem deliberadamente ler todas as viagens publicadas — é
 * isso que faz o marketplace funcionar. Confiar apenas no RLS para uma
 * consulta de "as minhas" devolveria as viagens de toda a gente.
 *
 * Regra geral: o RLS impede acessos indevidos; o âmbito de "meu" é
 * responsabilidade da consulta.
 */
export async function listarMinhasViagens(estado?: string) {
  const perfil = await getSessionProfile();
  if (!perfil) return [];

  const supabase = createClient();
  let q = supabase
    .from('trips')
    .select(SELECT_VIAGEM)
    .eq('tenant_id', perfil.tenant.id)
    .order('departure_at', { ascending: false });

  if (estado && estado !== 'todas') {
    q = q.eq('status', estado.toUpperCase());
  }

  const { data } = await q;
  return data ?? [];
}

export async function listarMercadoViagens(filtros: {
  origem?: string;
  destino?: string;
  pesoMin?: string;
}) {
  const supabase = createClient();
  let q = supabase
    .from('trips')
    .select(SELECT_VIAGEM)
    .in('status', ['PUBLISHED', 'PARTIALLY_BOOKED'])
    .gte('departure_at', new Date().toISOString())
    .order('departure_at', { ascending: true });

  if (filtros.origem) q = q.eq('origin_id', filtros.origem);
  if (filtros.destino) q = q.eq('destination_id', filtros.destino);
  if (filtros.pesoMin) q = q.gte('available_weight_kg', Number(filtros.pesoMin));

  const { data } = await q.limit(100);
  return data ?? [];
}

export async function obterViagem(viagemId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('trips')
    .select(SELECT_VIAGEM)
    .eq('id', viagemId)
    .single();
  return data;
}
