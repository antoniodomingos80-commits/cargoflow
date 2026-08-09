'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getSessionProfile } from '@/lib/supabase/server';

export interface EstadoRastreio {
  load_reference: string;
  load_status: string;
  trip_id: string | null;
  origin_lat: number;
  origin_lng: number;
  origin_city: string;
  destination_lat: number;
  destination_lng: number;
  destination_city: string;
  atual_lat: number | null;
  atual_lng: number | null;
  atual_em: string | null;
  velocidade_kmh: number | null;
  minutos_sem_sinal: number | null;
  km_percorridos: number | null;
  km_restantes: number | null;
  progresso_pct: number;
  eta: string | null;
  motorista_nome: string | null;
  veiculo_matricula: string | null;
}

export async function obterEstadoRastreio(
  cargaId: string,
): Promise<EstadoRastreio | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_estado_rastreamento', {
    p_load_id: cargaId,
  });
  if (error) {
    console.error('Erro no estado de rastreamento:', error.message);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as EstadoRastreio | null;
}

export async function obterPercurso(viagemId: string) {
  const supabase = createClient();
  const { data } = await supabase.rpc('cf_percurso', { p_trip_id: viagemId });
  return (data ?? []) as { lat: number; lng: number; recorded_at: string }[];
}

export async function obterEventos(cargaId: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('tracking_events')
    .select('id, event_type, description, location_name, occurred_at')
    .eq('load_id', cargaId)
    .order('occurred_at', { ascending: false })
    .limit(50);
  return data ?? [];
}

/** Recebe o lote de posições acumuladas pelo telemóvel do motorista */
export async function sincronizarPosicoes(
  viagemId: string,
  pontos: {
    lat: number;
    lng: number;
    speed: number | null;
    heading: number | null;
    accuracy: number | null;
    recorded_at: string;
  }[],
): Promise<{ gravados: number } | { erro: string }> {
  const perfil = await getSessionProfile();
  if (!perfil) return { erro: 'Sessão expirada.' };
  if (pontos.length === 0) return { gravados: 0 };

  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_registar_posicoes', {
    p_trip_id: viagemId,
    p_pontos: pontos,
  });

  if (error) {
    console.error('Erro ao sincronizar posições:', error.message);
    return { erro: 'Não foi possível enviar as posições.' };
  }
  return { gravados: Number(data ?? 0) };
}

/** Marcar recolha, trânsito ou entrega */
export async function registarEvento(
  cargaId: string,
  tipo: 'PICKED_UP' | 'IN_TRANSIT' | 'DELIVERED',
  descricao: string,
  lat?: number,
  lng?: number,
) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  const { error } = await supabase.rpc('cf_registar_evento', {
    p_load_id: cargaId,
    p_tipo: tipo,
    p_descricao: descricao,
    p_lat: lat ?? null,
    p_lng: lng ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/rastreio/${cargaId}`);
  revalidatePath('/rastreio');
  revalidatePath('/cargas');
}

/** Cargas em trânsito relevantes para o utilizador */
export async function listarEmTransito() {
  const supabase = createClient();
  const { data } = await supabase
    .from('loads')
    .select(`
      id, reference, title, status, weight_kg, delivery_deadline,
      origin:locations!loads_origin_id_fkey (city),
      destination:locations!loads_destination_id_fkey (city)
    `)
    .in('status', ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'])
    .order('created_at', { ascending: false });
  return data ?? [];
}
