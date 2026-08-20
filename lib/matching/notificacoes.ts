/**
 * Notificação de correspondências — NÃO são Server Actions.
 *
 * Estavam exportadas de um ficheiro `'use server'`, o que as tornava endpoints
 * HTTP invocáveis por qualquer pessoa, sem autenticação — e ambas inserem
 * notificações e enviam WhatsApp. Um vector de spam directo.
 *
 * São chamadas apenas por outras acções de servidor, já autenticadas e já
 * sujeitas à barreira de conta, depois de publicar uma carga ou uma viagem.
 * Num módulo simples deixam de ter superfície pública.
 */

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

export async function notificarMatchesDeCarga(cargaId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: carga } = await admin
      .from('loads')
      .select('id, reference, title, weight_kg')
      .eq('id', cargaId)
      .single();
    if (!carga) return;

    const { data: matches, error } = await admin
      .from('matches')
      .select(
        'id, score, ' +
          'trip:trips!matches_trip_id_fkey(id, reference, created_by, ' +
          'motorista:users!trips_created_by_fkey(phone))',
      )
      .eq('load_id', cargaId)
      .is('notified_at', null)
      .order('score', { ascending: false })
      .limit(MAX_NOTIFICADOS);

    if (error) {
      console.error('Erro ao ler matches de carga:', error.message);
      return;
    }
    if (!matches || matches.length === 0) return;

    const linkCarga = `${BASE_URL}/mercado/cargas/${carga.id}`;

    await admin.from('notifications').insert(
      matches.map((m: any) => ({
        user_id: m.trip.created_by,
        type: 'MATCH_CARGA',
        title: `Nova carga compatível com a sua viagem ${m.trip.reference}`,
        body: `${carga.title} · ${Number(carga.weight_kg)} kg · ${Math.round(Number(m.score))}% de compatibilidade`,
        action_url: `/mercado/cargas/${carga.id}`,
        metadata: { load_id: carga.id, trip_id: m.trip.id, score: m.score },
      })),
    );

    await Promise.all(
      matches.map((m: any) =>
        enviarWhatsApp(
          m.trip?.motorista?.phone,
          `🚛 Nova carga compatível com a sua viagem ${m.trip.reference} (${Math.round(Number(m.score))}%)\n${carga.title} · ${Number(carga.weight_kg)} kg\nVer: ${linkCarga}`,
        ),
      ),
    );

    await admin
      .from('matches')
      .update({ notified_at: new Date().toISOString() })
      .in(
        'id',
        matches.map((m: any) => m.id),
      );
  } catch (erro) {
    // O matching é um extra sobre a publicação, nunca deve impedi-la
    console.error('Erro ao notificar matches de carga:', erro);
  }
}

/** Chamar logo depois de uma viagem ficar PUBLISHED/PARTIALLY_BOOKED. */
export async function notificarMatchesDeViagem(viagemId: string): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: viagem } = await admin
      .from('trips')
      .select('id, reference, available_weight_kg, minimum_price, currency')
      .eq('id', viagemId)
      .single();
    if (!viagem) return;

    const { data: matches, error } = await admin
      .from('matches')
      .select(
        'id, score, ' +
          'load:loads!matches_load_id_fkey(id, reference, title, weight_kg, created_by, ' +
          'comerciante:users!loads_created_by_fkey(phone))',
      )
      .eq('trip_id', viagemId)
      .is('notified_at', null)
      .order('score', { ascending: false })
      .limit(MAX_NOTIFICADOS);

    if (error) {
      console.error('Erro ao ler matches de viagem:', error.message);
      return;
    }
    if (!matches || matches.length === 0) return;

    const linkViagem = `${BASE_URL}/mercado/viagens/${viagem.id}`;
    const espacoTexto = `${Number(viagem.available_weight_kg)} kg disponíveis${
      viagem.minimum_price
        ? ` · a partir de ${formatarPreco(Number(viagem.minimum_price), viagem.currency)}`
        : ''
    }`;

    await admin.from('notifications').insert(
      matches.map((m: any) => ({
        user_id: m.load.created_by,
        type: 'MATCH_VIAGEM',
        title: `Encontrámos transporte para a sua carga ${m.load.reference}`,
        body: `${espacoTexto} · ${Math.round(Number(m.score))}% de compatibilidade`,
        action_url: `/mercado/viagens/${viagem.id}`,
        metadata: { load_id: m.load.id, trip_id: viagem.id, score: m.score },
      })),
    );

    await Promise.all(
      matches.map((m: any) =>
        enviarWhatsApp(
          m.load?.comerciante?.phone,
          `📦 Encontrámos transporte para a sua carga ${m.load.reference} (${Math.round(Number(m.score))}%)\n${espacoTexto}\nVer: ${linkViagem}`,
        ),
      ),
    );

    await admin
      .from('matches')
      .update({ notified_at: new Date().toISOString() })
      .in(
        'id',
        matches.map((m: any) => m.id),
      );
  } catch (erro) {
    console.error('Erro ao notificar matches de viagem:', erro);
  }
}

/**
 * Quantas cargas já publicadas por OUTRAS empresas encaixariam na rota
 * inversa de uma viagem (destino → origem), com peso compatível.
 *
 * Fica de fora da unificação acima de propósito: isto simula "se eu
 * criasse agora uma viagem de retorno, quantas cargas encontraria" —
 * ANTES de essa viagem existir. A tabela `matches` só é preenchida pelos
 * triggers depois de a viagem já existir, por isso não serve aqui; o
 * cálculo (rota exata invertida + peso) tem de continuar manual.
 */
