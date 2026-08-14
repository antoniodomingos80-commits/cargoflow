'use server';

import { createClient, getSessionProfile } from '@/lib/supabase/server';

export interface SugestaoPreco {
  valor: number;
  baseadoEm: 'historico' | 'formula';
  numOperacoes: number;
  distanciaKm: number | null;
}

/**
 * Sugere um preço de referência para uma carga/viagem, dados origem,
 * destino e peso.
 *
 * Prioridade:
 * 1) Se houver pelo menos 2 acordos fechados na MESMA rota exata (mesma
 *    origem+destino), usa o preço médio por km desse histórico real —
 *    é a estimativa mais fiável que existe, porque reflete o que outras
 *    empresas realmente pagaram nesta rota.
 * 2) Sem histórico suficiente, cai para uma fórmula simples de referência
 *    (Kz/km + Kz/kg). Os valores de base são um ponto de partida
 *    razoável, não uma verdade absoluta — a ideia é dar um número para
 *    ancorar a negociação, não substituir o critério de quem publica.
 */
export async function sugerirPreco(
  originId: string,
  destinationId: string,
  pesoKg: number,
): Promise<SugestaoPreco | { erro: string }> {
  const perfil = await getSessionProfile();
  if (!perfil) return { erro: 'Sessão expirada.' };

  if (!originId || !destinationId) {
    return { erro: 'Escolha a origem e o destino primeiro.' };
  }

  const supabase = createClient();

  const { data: distanciaData, error: erroDistancia } = await supabase.rpc(
    'calcular_distancia_km',
    { origem: originId, destino: destinationId },
  );

  if (erroDistancia) {
    console.error('Erro ao calcular distância:', erroDistancia.message);
    return { erro: 'Não foi possível calcular a distância desta rota.' };
  }

  const distanciaKm = typeof distanciaData === 'number' ? distanciaData : null;

  // Histórico: acordos fechados em cargas com esta rota exata
  const { data: historico } = await supabase
    .from('agreements')
    .select('agreed_amount, load:loads!agreements_load_id_fkey!inner(origin_id, destination_id, weight_kg)')
    .eq('load.origin_id', originId)
    .eq('load.destination_id', destinationId);

  const historicoValido = (historico ?? []).filter((h: any) => h.load && h.agreed_amount);

  if (historicoValido.length >= 2 && distanciaKm) {
    const precosPorKm = historicoValido.map(
      (h: any) => Number(h.agreed_amount) / Math.max(distanciaKm, 1),
    );
    const mediaPorKm = precosPorKm.reduce((s, v) => s + v, 0) / precosPorKm.length;
    const valor = Math.round((mediaPorKm * distanciaKm) / 1000) * 1000;

    return {
      valor,
      baseadoEm: 'historico',
      numOperacoes: historicoValido.length,
      distanciaKm,
    };
  }

  // Fórmula de referência — sem histórico suficiente nesta rota
  const KZ_POR_KM = 300;
  const KZ_POR_KG = 50;
  const base = distanciaKm ? distanciaKm * KZ_POR_KM : 0;
  const ajustePeso = (pesoKg || 0) * KZ_POR_KG;
  const valor = Math.round((base + ajustePeso) / 1000) * 1000;

  return {
    valor: Math.max(valor, 10000),
    baseadoEm: 'formula',
    numOperacoes: 0,
    distanciaKm,
  };
}
