'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { enviarWhatsApp } from '@/lib/whatsapp/actions';

/**
 * Matching — camada de notificação sobre o motor nativo.
 *
 * A pontuação de compatibilidade JÁ é calculada pela base de dados: os
 * triggers trg_matches_carga (em loads) e trg_matches_viagem (em trips)
 * chamam cf_calcular_matches_carga()/cf_pontuar_correspondencia(), que
 * avaliam geografia real (raio via PostGIS), avaliação do transportador,
 * proximidade de datas, capacidade e histórico com a empresa — e gravam
 * tudo na tabela `matches` (score 0-100), sempre que uma carga ou viagem
 * é publicada ou atualizada.
 *
 * Este ficheiro não recalcula nada disso. Só lê os matches que a BD já
 * preparou e ainda não notificou (matches.notified_at IS NULL — a coluna
 * já existia, só nunca tinha sido usada), notifica os melhores (in-app +
 * WhatsApp), e marca como notificados. Correu-se assim uma versão manual
 * mais simples deste motor que existia só no código da aplicação, com uma
 * fórmula própria (rota exata + peso + preço) — essa lógica está agora
 * completamente substituída pela pontuação nativa, mais rica.
 */

const MAX_NOTIFICADOS = 5;
const BASE_URL = 'https://cargoflow-theta.vercel.app';

function formatarPreco(valor: number | null, moeda: string): string {
  if (!valor) return '';
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: moeda,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}

/** Chamar logo depois de uma carga ficar PUBLISHED/NEGOTIATING. */

export async function contarCargasCompativeisParaBackhaul(tripId: string): Promise<number> {
  try {
    const admin = createAdminClient();

    const { data: viagem } = await admin
      .from('trips')
      .select('tenant_id, origin_id, destination_id, available_weight_kg')
      .eq('id', tripId)
      .single();

    if (!viagem) return 0;

    const { data: cargas } = await admin
      .from('loads')
      .select('id, weight_kg')
      .eq('origin_id', viagem.destination_id)
      .eq('destination_id', viagem.origin_id)
      .in('status', ['PUBLISHED', 'NEGOTIATING'])
      .neq('tenant_id', viagem.tenant_id);

    if (!cargas) return 0;

    return cargas.filter((c) => Number(c.weight_kg) <= Number(viagem.available_weight_kg)).length;
  } catch (erro) {
    console.error('Erro ao contar cargas compatíveis para backhaul:', erro);
    return 0;
  }
}
