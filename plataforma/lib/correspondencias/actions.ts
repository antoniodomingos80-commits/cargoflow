'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { traduzirErro } from '@/lib/erros';

/**
 * Correspondências calculadas pelo motor (função SQL `cf_pontuar_correspondencia`).
 * O cálculo é automático por gatilho ao publicar carga ou viagem — aqui só se lê.
 *
 * IMPORTANTE — porque se usa RPC e não uma consulta normal:
 *
 * A política RLS `users_visible` isola utilizadores por empresa, o que é
 * correto para dados operacionais. Mas numa correspondência o comerciante
 * precisa de ver quem é o transportador (nome e reputação) para decidir — e
 * essa pessoa é de OUTRA empresa. Uma consulta normal devolveria NULL sem
 * qualquer erro, escondendo o problema.
 *
 * As funções `cf_correspondencias_*` resolvem isto de forma explícita:
 * verificam a propriedade da carga/viagem e devolvem apenas os campos
 * PÚBLICOS da contraparte. Email e telefone continuam inacessíveis.
 */

// A forma da decomposição vive no componente que a apresenta
// (components/correspondencias/pontuacao.tsx) — fonte única de verdade.
import type { DecomposicaoScore } from '@/components/correspondencias/pontuacao';

export interface CorrespondenciaTransportador {
  match_id: string;
  score: number;
  score_breakdown: DecomposicaoScore;
  trip_id: string;
  trip_reference: string;
  departure_at: string;
  estimated_arrival: string | null;
  available_weight_kg: number;
  available_volume_m3: number | null;
  minimum_price: number | null;
  currency: string;
  is_return_trip: boolean;
  origin_city: string;
  origin_province: string;
  destination_city: string;
  destination_province: string;
  vehicle_plate: string;
  vehicle_type: string;
  has_refrigeration: boolean;
  carrier_name: string;
  carrier_rating: number | null;
  carrier_rating_count: number;
  carrier_verified: boolean;
}

export interface CorrespondenciaCarga {
  match_id: string;
  score: number;
  score_breakdown: DecomposicaoScore;
  load_id: string;
  load_reference: string;
  title: string;
  cargo_type: string;
  weight_kg: number;
  volume_m3: number | null;
  pickup_from: string;
  pickup_until: string;
  budget_amount: number | null;
  currency: string;
  is_urgent: boolean;
  requires_refrigeration: boolean;
  distance_km: number | null;
  origin_city: string;
  origin_province: string;
  destination_city: string;
  destination_province: string;
  merchant_name: string;
  merchant_rating: number | null;
  merchant_rating_count: number;
}

/** Transportadores compatíveis com uma carga (vista do comerciante) */
export async function correspondenciasDaCarga(
  cargaId: string,
): Promise<CorrespondenciaTransportador[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_correspondencias_da_carga', {
    p_load_id: cargaId,
  });

  if (error) {
    console.error('Erro ao obter correspondências da carga:', error.message);
    return [];
  }
  return (data ?? []) as CorrespondenciaTransportador[];
}

// =============================================================================
// Convite: o comerciante contacta um transportador sugerido
// =============================================================================

export type EstadoConvite = { erro?: string; sucesso?: boolean };

/**
 * O comerciante não envia propostas — envia convites.
 *
 * A aceitação atómica (`cf_aceitar_proposta`) exige que quem aceita seja o dono
 * da carga. Manter um único sentido para as propostas (transportador →
 * comerciante) evita duplicar a lógica de aceitação e de desconto de
 * capacidade. O convite abre a conversa e chama o transportador à ação; a
 * proposta formal continua a vir do lado de quem tem o camião.
 */
export async function convidarTransportador(
  _anterior: EstadoConvite,
  formData: FormData,
): Promise<EstadoConvite> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const loadId = String(formData.get('loadId') ?? '');
  const tripId = String(formData.get('tripId') ?? '');
  const mensagem = String(formData.get('message') ?? '').trim();

  if (!loadId || !tripId) return { erro: 'Faltam dados do contacto.' };
  if (mensagem.length > 1000) {
    return { erro: 'A mensagem é demasiado longa (máximo 1000 caracteres).' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('cf_convidar_transportador', {
    p_load_id: loadId,
    p_trip_id: tripId,
    p_mensagem: mensagem || null,
  });

  if (error) {
    // As mensagens da função são escritas para o utilizador final
    return { erro: error.message || traduzirErro(error, 'enviar o contacto') };
  }

  revalidatePath(`/cargas/${loadId}`);
  revalidatePath('/mensagens');
  return { sucesso: true };
}

/** Cargas compatíveis com uma viagem (vista do transportador) */
export async function correspondenciasDaViagem(
  viagemId: string,
): Promise<CorrespondenciaCarga[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_correspondencias_da_viagem', {
    p_trip_id: viagemId,
  });

  if (error) {
    console.error('Erro ao obter correspondências da viagem:', error.message);
    return [];
  }
  return (data ?? []) as CorrespondenciaCarga[];
}
