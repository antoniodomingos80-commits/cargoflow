'use server';

import { createAdminClient } from '@/lib/supabase/server';
import { enviarWhatsApp } from '@/lib/whatsapp/actions';

/**
 * Matching automático — quando uma carga ou uma viagem é publicada, o
 * sistema procura do outro lado (viagens compatíveis para uma carga nova,
 * ou cargas compatíveis para uma viagem nova) e notifica os melhores
 * candidatos, em vez de deixar tudo dependente de alguém ir navegar
 * manualmente no mercado.
 *
 * Não cria nenhuma tabela nova: usa a tabela `notifications` que já existe
 * e já tem UI própria (sino, lista, contagem por ler) — só nunca tinha sido
 * alimentada por este tipo de evento.
 */

const MAX_NOTIFICADOS = 5;

/** Rota tem de coincidir exatamente — é o filtro inicial, antes de pontuar. */
function scoreCompatibilidade(params: {
  peso: number;
  capacidade: number;
  precoA: number | null;
  precoB: number | null;
}): number {
  const folga = params.capacidade - params.peso;
  if (folga < 0) return 0; // não cabe — nem é candidato

  let score = 50; // já veio filtrado por rota exata

  // Até 30 pontos por aproveitamento do espaço: penaliza folga excessiva
  // (viagem muito maior que a carga = pior aproveitamento para o transportador)
  const proporcaoFolga = params.capacidade > 0 ? folga / params.capacidade : 1;
  score += Math.max(0, 30 - proporcaoFolga * 30);

  // Até 20 pontos por proximidade de preço, quando ambos os lados o indicam
  if (params.precoA && params.precoB) {
    const diferenca = Math.abs(params.precoA - params.precoB);
    const base = Math.max(params.precoA, params.precoB);
    const proporcaoDiferenca = base > 0 ? diferenca / base : 0;
    score += Math.max(0, 20 - proporcaoDiferenca * 20);
  } else {
    score += 10; // sem dados de preço de nenhum lado — nem penaliza nem beneficia
  }

  return Math.round(Math.min(100, score));
}

function formatarPreco(valor: number | null, moeda: string): string {
  if (!valor) return '';
  return new Intl.NumberFormat('pt-AO', {
    style: 'currency',
    currency: moeda,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(valor);
}

/**
 * Chamar logo depois de uma carga ficar PUBLISHED.
 * Procura viagens compatíveis de OUTRAS empresas e notifica os transportadores.
 */
export async function notificarMatchesDeCarga(cargaId: string): Promise<void> {
  try {
    // Cliente admin, não o normal: o matching tem de ver cargas/viagens de
    // OUTROS tenants mesmo quando já não estão em 'PUBLISHED' (ex.: já em
    // negociação com outra proposta) — o RLS de leitura pública do
    // marketplace não cobre esses estados, e bloqueava isto silenciosamente,
    // sem gerar nenhum erro (a função só via 0 candidatos e saía calada).
    const supabase = createAdminClient();

    const { data: carga } = await supabase
      .from('loads')
      .select('id, tenant_id, reference, title, origin_id, destination_id, weight_kg, budget_amount, currency')
      .eq('id', cargaId)
      .single();

    if (!carga) return;

    const { data: viagens } = await supabase
      .from('trips')
      .select('id, tenant_id, reference, created_by, available_weight_kg, minimum_price, currency, motorista:users!trips_created_by_fkey(phone)')
      .eq('origin_id', carga.origin_id)
      .eq('destination_id', carga.destination_id)
      .in('status', ['PUBLISHED', 'PARTIALLY_BOOKED'])
      .neq('tenant_id', carga.tenant_id);

    if (!viagens || viagens.length === 0) return;

    const candidatos = viagens
      .map((v) => ({
        ...v,
        score: scoreCompatibilidade({
          peso: Number(carga.weight_kg),
          capacidade: Number(v.available_weight_kg),
          precoA: carga.budget_amount ? Number(carga.budget_amount) : null,
          precoB: v.minimum_price ? Number(v.minimum_price) : null,
        }),
      }))
      .filter((v) => v.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_NOTIFICADOS);

    if (candidatos.length === 0) return;

    const admin = supabase;
    const precoTexto = carga.budget_amount
      ? ` · orçamento ${formatarPreco(Number(carga.budget_amount), carga.currency)}`
      : '';

    await admin.from('notifications').insert(
      candidatos.map((v) => ({
        user_id: v.created_by,
        type: 'MATCH_CARGA',
        title: `Nova carga compatível com a sua viagem ${v.reference}`,
        body: `${carga.title} · ${Number(carga.weight_kg)} kg${precoTexto}`,
        action_url: `/mercado/cargas/${carga.id}`,
        metadata: { load_id: carga.id, trip_id: v.id, score: v.score },
      })),
    );

    // WhatsApp é um extra sobre a notificação in-app — se falhar (número
    // não registado na sandbox, Twilio não configurado, etc.), a
    // notificação já ficou gravada de qualquer forma.
    await Promise.all(
      candidatos.map((v) =>
        enviarWhatsApp(
          (v as any).motorista?.phone,
          `🚛 Nova carga compatível com a sua viagem ${v.reference}\n${carga.title} · ${Number(carga.weight_kg)} kg${precoTexto}\nVer: https://cargoflow-theta.vercel.app/mercado/cargas/${carga.id}`,
        ),
      ),
    );
  } catch (erro) {
    // O matching é um extra sobre a publicação, nunca deve impedi-la
    console.error('Erro ao notificar matches de carga:', erro);
  }
}

/**
 * Chamar logo depois de uma viagem ficar PUBLISHED.
 * Procura cargas compatíveis de OUTRAS empresas e notifica os comerciantes.
 */
export async function notificarMatchesDeViagem(viagemId: string): Promise<void> {
  try {
    // Idem — ver nota acima em notificarMatchesDeCarga.
    const supabase = createAdminClient();

    const { data: viagem } = await supabase
      .from('trips')
      .select('id, tenant_id, reference, origin_id, destination_id, available_weight_kg, minimum_price, currency')
      .eq('id', viagemId)
      .single();

    if (!viagem) return;

    const { data: cargas } = await supabase
      .from('loads')
      .select('id, tenant_id, reference, created_by, title, weight_kg, budget_amount, currency, comerciante:users!loads_created_by_fkey(phone)')
      .eq('origin_id', viagem.origin_id)
      .eq('destination_id', viagem.destination_id)
      .in('status', ['PUBLISHED', 'NEGOTIATING'])
      .neq('tenant_id', viagem.tenant_id);

    if (!cargas || cargas.length === 0) return;

    const candidatos = cargas
      .map((c) => ({
        ...c,
        score: scoreCompatibilidade({
          peso: Number(c.weight_kg),
          capacidade: Number(viagem.available_weight_kg),
          precoA: c.budget_amount ? Number(c.budget_amount) : null,
          precoB: viagem.minimum_price ? Number(viagem.minimum_price) : null,
        }),
      }))
      .filter((c) => c.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_NOTIFICADOS);

    if (candidatos.length === 0) return;

    const admin = supabase;

    const espacoTexto = `${Number(viagem.available_weight_kg)} kg disponíveis${
      viagem.minimum_price
        ? ` · a partir de ${formatarPreco(Number(viagem.minimum_price), viagem.currency)}`
        : ''
    }`;

    await admin.from('notifications').insert(
      candidatos.map((c) => ({
        user_id: c.created_by,
        type: 'MATCH_VIAGEM',
        title: `Encontrámos transporte para a sua carga ${c.reference}`,
        body: espacoTexto,
        action_url: `/mercado/viagens/${viagem.id}`,
        metadata: { load_id: c.id, trip_id: viagem.id, score: c.score },
      })),
    );

    await Promise.all(
      candidatos.map((c) =>
        enviarWhatsApp(
          (c as any).comerciante?.phone,
          `📦 Encontrámos transporte para a sua carga ${c.reference}\n${espacoTexto}\nVer: https://cargoflow-theta.vercel.app/mercado/viagens/${viagem.id}`,
        ),
      ),
    );
  } catch (erro) {
    console.error('Erro ao notificar matches de viagem:', erro);
  }
}

/**
 * Quantas cargas já publicadas por OUTRAS empresas encaixam na rota inversa
 * de uma viagem (destino → origem), com peso compatível. Usada para mostrar
 * ao transportador, antes de decidir publicar um backhaul, se vale a pena —
 * "há 3 cargas à espera nesta rota" pesa mais do que um botão sem contexto.
 */
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
