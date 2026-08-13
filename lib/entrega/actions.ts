'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getSessionProfile } from '@/lib/supabase/server';

export interface ProvaEntrega {
  pod_id: string;
  received_by_name: string;
  signature_url: string | null;
  photo_urls: string[];
  notes: string | null;
  has_damage: boolean;
  damage_description: string | null;
  delivered_at: string;
  confirmed_at: string | null;
  lat: number | null;
  lng: number | null;
  entregue_por: string;
}

export interface Avaliacao {
  review_id: string;
  rating: number;
  punctuality: number | null;
  communication: number | null;
  cargo_condition: number | null;
  professionalism: number | null;
  comment: string | null;
  created_at: string;
  autor_nome: string;
  sou_eu: boolean;
}

export interface ResumoFatura {
  id: string;
  numero: string;
  valor: number;
  comissao: number;
  total: number;
  moeda: string;
  estado: 'EMITIDA';
}

export async function obterProvaEntrega(cargaId: string): Promise<ProvaEntrega | null> {
  const supabase = createClient();
  const { data } = await supabase.rpc('cf_prova_entrega', { p_load_id: cargaId });
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as ProvaEntrega | null;
}

export async function obterAvaliacoes(cargaId: string): Promise<Avaliacao[]> {
  const supabase = createClient();
  const { data } = await supabase.rpc('cf_avaliacoes_da_carga', { p_load_id: cargaId });
  return (data ?? []) as Avaliacao[];
}

export async function obterResumoFatura(cargaId: string): Promise<ResumoFatura | null> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  const { data: acordo } = await supabase
    .from('agreements')
    .select('id, agreed_amount, currency, platform_fee')
    .eq('load_id', cargaId)
    .maybeSingle();

  if (!acordo) return null;

  const valor = Number(acordo.agreed_amount ?? 0);
  const comissao = Number(acordo.platform_fee ?? 0);
  const numero = `INV-${new Date().getFullYear()}-${String(acordo.id).slice(0, 8).toUpperCase()}`;

  return {
    id: acordo.id,
    numero,
    valor,
    comissao,
    total: valor + comissao,
    moeda: acordo.currency ?? 'AOA',
    estado: 'EMITIDA',
  };
}

export async function criarBackhaul(cargaId: string, tripId?: string | null) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();

  const { data: carga } = await supabase
    .from('loads')
    .select('id, tenant_id, assigned_trip_id')
    .eq('id', cargaId)
    .single();

  if (!carga || carga.tenant_id !== perfil.tenant.id) {
    throw new Error('Carga não encontrada ou sem acesso para reutilizar.');
  }

  const viagemId = tripId ?? carga.assigned_trip_id;
  if (!viagemId) throw new Error('Não há uma viagem associada para reutilizar.');

  const { data: viagem } = await supabase
    .from('trips')
    .select('id, vehicle_id, driver_id, origin_id, destination_id, available_weight_kg, available_volume_m3, minimum_price, currency, departure_at, estimated_arrival')
    .eq('id', viagemId)
    .single();

  if (!viagem) throw new Error('Viagem original não encontrada.');

  const partida = viagem.estimated_arrival ?? viagem.departure_at ?? new Date().toISOString();
  const chegada = new Date(new Date(partida).getTime() + 24 * 60 * 60 * 1000).toISOString();

  const { data: novaViagem, error } = await supabase
    .from('trips')
    .insert({
      tenant_id: perfil.tenant.id,
      created_by: perfil.user.id,
      vehicle_id: viagem.vehicle_id,
      driver_id: viagem.driver_id,
      origin_id: viagem.destination_id,
      destination_id: viagem.origin_id,
      available_weight_kg: viagem.available_weight_kg,
      available_volume_m3: viagem.available_volume_m3,
      departure_at: partida,
      estimated_arrival: chegada,
      minimum_price: viagem.minimum_price,
      currency: viagem.currency ?? perfil.tenant.default_currency,
      status: 'PUBLISHED',
      is_return_trip: true,
    })
    .select('id')
    .single();

  if (error || !novaViagem) throw new Error('Não foi possível publicar a viagem de retorno.');

  revalidatePath('/viagens');
  revalidatePath('/mercado/viagens');
  revalidatePath(`/viagens/${novaViagem.id}`);
  redirect(`/viagens/${novaViagem.id}`);
}

/**
 * Carrega ficheiros para o Storage e devolve os caminhos.
 * O caminho começa sempre pelo id da empresa — é assim que as políticas de
 * acesso verificam a propriedade.
 */
export async function carregarFicheiros(
  bucket: 'provas-entrega' | 'documentos' | 'cargas',
  ficheiros: File[],
): Promise<{ caminhos: string[] } | { erro: string }> {
  const perfil = await getSessionProfile();
  if (!perfil) return { erro: 'Sessão expirada.' };

  const supabase = createClient();
  const caminhos: string[] = [];

  for (const ficheiro of ficheiros) {
    if (ficheiro.size > 10 * 1024 * 1024) {
      return { erro: `"${ficheiro.name}" excede 10 MB.` };
    }
    const extensao = ficheiro.name.split('.').pop()?.toLowerCase() ?? 'jpg';
    const nome = `${perfil.tenant.id}/${crypto.randomUUID()}.${extensao}`;

    const { error } = await supabase.storage
      .from(bucket)
      .upload(nome, ficheiro, { cacheControl: '3600', upsert: false });

    if (error) {
      console.error('Erro no carregamento:', error.message);
      return { erro: 'Não foi possível carregar os ficheiros.' };
    }
    caminhos.push(nome);
  }

  return { caminhos };
}

/** URLs assinados temporários — os buckets são privados */
export async function urlsAssinados(
  bucket: 'provas-entrega' | 'documentos' | 'cargas',
  caminhos: string[],
  segundos = 3600,
): Promise<Record<string, string>> {
  if (caminhos.length === 0) return {};
  const supabase = createClient();
  const { data } = await supabase.storage
    .from(bucket)
    .createSignedUrls(caminhos, segundos);

  const mapa: Record<string, string> = {};
  data?.forEach((d) => {
    if (d.path && d.signedUrl) mapa[d.path] = d.signedUrl;
  });
  return mapa;
}

export async function registarEntrega(params: {
  cargaId: string;
  recebidoPor: string;
  assinatura?: string | null;
  fotos?: string[];
  notas?: string | null;
  temDanos?: boolean;
  danosDescricao?: string | null;
  lat?: number | null;
  lng?: number | null;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  const { error } = await supabase.rpc('cf_registar_entrega', {
    p_load_id: params.cargaId,
    p_recebido_por: params.recebidoPor,
    p_assinatura: params.assinatura ?? null,
    p_fotos: params.fotos ?? [],
    p_notas: params.notas ?? null,
    p_tem_danos: params.temDanos ?? false,
    p_danos_desc: params.danosDescricao ?? null,
    p_lat: params.lat ?? null,
    p_lng: params.lng ?? null,
  });

  if (error) throw new Error(error.message);

  revalidatePath(`/rastreio/${params.cargaId}`);
  revalidatePath('/rastreio');
}

export async function confirmarRececao(cargaId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  const { error } = await supabase.rpc('cf_confirmar_receccao', { p_load_id: cargaId });
  if (error) throw new Error(error.message);

  revalidatePath(`/rastreio/${cargaId}`);
  revalidatePath('/cargas');
}

export async function avaliar(params: {
  cargaId: string;
  rating: number;
  pontualidade?: number;
  comunicacao?: number;
  estadoCarga?: number;
  profissionalismo?: number;
  comentario?: string;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  const { error } = await supabase.rpc('cf_avaliar', {
    p_load_id: params.cargaId,
    p_rating: params.rating,
    p_pontualidade: params.pontualidade ?? null,
    p_comunicacao: params.comunicacao ?? null,
    p_estado_carga: params.estadoCarga ?? null,
    p_profissional: params.profissionalismo ?? null,
    p_comentario: params.comentario ?? null,
  });

  if (error) throw new Error(error.message);
  revalidatePath(`/rastreio/${params.cargaId}`);
}

// =============================================================================
// Fotos de recolha e entrega (galeria partilhada)
//
// A prova de entrega formal (proof_of_delivery, acima) é um documento legal
// — só o transportador a regista, é única por carga, tem assinatura.
// Isto aqui é diferente: uma galeria simples onde AMBAS as partes podem
// juntar fotografias em dois momentos (recolha e entrega), sem burocracia.
// Não substitui a prova formal, complementa-a.
// =============================================================================

export interface FotoOperacao {
  id: string;
  stage: 'PICKUP' | 'DELIVERY';
  path: string;
  caption: string | null;
  uploaded_by_name: string;
  sou_eu: boolean;
  created_at: string;
}

async function exigirParticipante(cargaId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();
  const { data: carga } = await supabase
    .from('loads')
    .select('id, tenant_id, assigned_trip_id, trip:trips!loads_assigned_trip_id_fkey(tenant_id)')
    .eq('id', cargaId)
    .single();

  if (!carga) throw new Error('Carga não encontrada.');

  const tenantTransportador = (carga as any).trip?.tenant_id ?? null;
  const ehParticipante =
    carga.tenant_id === perfil.tenant.id || tenantTransportador === perfil.tenant.id;

  if (!ehParticipante) throw new Error('Sem acesso a esta operação.');

  return { perfil, cargaId: carga.id };
}

export async function listarFotosOperacao(cargaId: string): Promise<{
  fotos: FotoOperacao[];
  urls: Record<string, string>;
}> {
  const { perfil } = await exigirParticipante(cargaId);
  const supabase = createClient();

  const { data, error } = await supabase
    .from('shipment_photos')
    .select('id, stage, path, caption, created_at, uploaded_by, user:users(full_name)')
    .eq('load_id', cargaId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao listar fotos da operação:', error.message);
    return { fotos: [], urls: {} };
  }

  const fotos: FotoOperacao[] = (data ?? []).map((f: any) => ({
    id: f.id,
    stage: f.stage,
    path: f.path,
    caption: f.caption,
    uploaded_by_name: f.user?.full_name ?? 'Utilizador',
    sou_eu: f.uploaded_by === perfil.user.id,
    created_at: f.created_at,
  }));

  const caminhos = fotos.map((f) => f.path);
  const urls = caminhos.length ? await urlsAssinados('provas-entrega', caminhos) : {};

  return { fotos, urls };
}

export async function carregarFotoOperacao(
  cargaId: string,
  stage: 'PICKUP' | 'DELIVERY',
  ficheiro: File,
  caption?: string,
): Promise<{ erro: string } | { ok: true }> {
  const { perfil } = await exigirParticipante(cargaId);

  const resultado = await carregarFicheiros('provas-entrega', [ficheiro]);
  if ('erro' in resultado) return resultado;

  const supabase = createClient();
  const { error } = await supabase.from('shipment_photos').insert({
    load_id: cargaId,
    stage,
    uploaded_by: perfil.user.id,
    tenant_id: perfil.tenant.id,
    path: resultado.caminhos[0],
    caption: caption?.trim() || null,
  });

  if (error) {
    console.error('Erro ao registar foto da operação:', error.message);
    return { erro: 'Não foi possível guardar a fotografia.' };
  }

  revalidatePath(`/rastreio/${cargaId}`);
  return { ok: true };
}

export async function removerFotoOperacao(cargaId: string, fotoId: string) {
  const { perfil } = await exigirParticipante(cargaId);
  const supabase = createClient();

  // Só quem carregou a foto (ou o dono da carga) a pode remover
  const { error } = await supabase
    .from('shipment_photos')
    .delete()
    .eq('id', fotoId)
    .eq('load_id', cargaId)
    .eq('uploaded_by', perfil.user.id);

  if (error) throw new Error('Não foi possível remover a fotografia.');
  revalidatePath(`/rastreio/${cargaId}`);
}
