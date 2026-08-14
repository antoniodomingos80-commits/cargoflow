'use server';

import { createClient, getSessionProfile } from '@/lib/supabase/server';

export interface SugestaoPreco {
  valor: number;
  baseadoEm: 'historico' | 'historico_regional' | 'formula';
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
 * 2) Sem isso, mas havendo pelo menos 2 acordos entre a MESMA PROVÍNCIA
 *    de origem e a MESMA PROVÍNCIA de destino (rota diferente, mas
 *    geograficamente comparável), usa essa média — ainda reflete preços
 *    reais pagos, só que numa área mais larga.
 * 3) Sem histórico nenhum que sirva, cai para uma fórmula simples de
 *    referência (Kz/km + Kz/kg). Os valores de base são um ponto de
 *    partida razoável, não uma verdade absoluta — a ideia é dar um
 *    número para ancorar a negociação, não substituir o critério de
 *    quem publica.
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

  function precoPorHistorico(lista: any[]) {
    if (lista.length < 2 || !distanciaKm) return null;
    const precosPorKm = lista.map((h: any) => Number(h.agreed_amount) / Math.max(distanciaKm, 1));
    const mediaPorKm = precosPorKm.reduce((s, v) => s + v, 0) / precosPorKm.length;
    return Math.round((mediaPorKm * distanciaKm) / 1000) * 1000;
  }

  // Nível 1: histórico na rota exata
  const { data: historico } = await supabase
    .from('agreements')
    .select('agreed_amount, load:loads!agreements_load_id_fkey!inner(origin_id, destination_id, weight_kg)')
    .eq('load.origin_id', originId)
    .eq('load.destination_id', destinationId);

  const historicoValido = (historico ?? []).filter((h: any) => h.load && h.agreed_amount);
  const valorExato = precoPorHistorico(historicoValido);

  if (valorExato !== null) {
    return {
      valor: valorExato,
      baseadoEm: 'historico',
      numOperacoes: historicoValido.length,
      distanciaKm,
    };
  }

  // Nível 2: histórico entre as mesmas províncias de origem/destino,
  // mesmo que a rota exata não bata — ainda é preço real pago, só numa
  // área mais larga.
  const { data: locaisAtuais } = await supabase
    .from('locations')
    .select('id, province')
    .in('id', [originId, destinationId]);

  const provinciaOrigem = locaisAtuais?.find((l) => l.id === originId)?.province;
  const provinciaDestino = locaisAtuais?.find((l) => l.id === destinationId)?.province;

  if (provinciaOrigem && provinciaDestino) {
    const [{ data: locaisOrigemProv }, { data: locaisDestinoProv }] = await Promise.all([
      supabase.from('locations').select('id').eq('province', provinciaOrigem),
      supabase.from('locations').select('id').eq('province', provinciaDestino),
    ]);

    const idsOrigem = (locaisOrigemProv ?? []).map((l) => l.id);
    const idsDestino = (locaisDestinoProv ?? []).map((l) => l.id);

    if (idsOrigem.length > 0 && idsDestino.length > 0) {
      // Duas queries simples e diretas (sem relações aninhadas) — mais
      // verboso, mas evita depender de suporte incerto do PostgREST para
      // filtros combinados dentro de embeds.
      const { data: cargasRegiao } = await supabase
        .from('loads')
        .select('id')
        .in('origin_id', idsOrigem)
        .in('destination_id', idsDestino);

      const idsCargas = (cargasRegiao ?? []).map((c) => c.id);

      if (idsCargas.length > 0) {
        const { data: historicoRegional } = await supabase
          .from('agreements')
          .select('agreed_amount')
          .in('load_id', idsCargas);

        const historicoRegionalValido = (historicoRegional ?? []).filter((h) => h.agreed_amount);
        const valorRegional = precoPorHistorico(historicoRegionalValido);

        if (valorRegional !== null) {
          return {
            valor: valorRegional,
            baseadoEm: 'historico_regional',
            numOperacoes: historicoRegionalValido.length,
            distanciaKm,
          };
        }
      }
    }
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
