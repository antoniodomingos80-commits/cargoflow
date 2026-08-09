'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getSessionProfile } from '@/lib/supabase/server';

export interface Conversa {
  conversation_id: string;
  load_id: string | null;
  load_reference: string | null;
  load_title: string | null;
  load_status: string | null;
  origin_city: string | null;
  destination_city: string | null;
  outro_nome: string | null;
  outro_verificado: boolean;
  ultima_mensagem: string | null;
  ultima_em: string | null;
  por_ler: number;
}

export interface Mensagem {
  message_id: string;
  content: string | null;
  attachment_url: string | null;
  attachment_type: string | null;
  created_at: string;
  sender_id: string;
  sender_name: string;
  sou_eu: boolean;
}

export async function listarConversas(): Promise<Conversa[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_minhas_conversas');
  if (error) {
    console.error('Erro ao listar conversas:', error.message);
    return [];
  }
  return (data ?? []) as Conversa[];
}

export async function listarMensagens(conversaId: string): Promise<Mensagem[]> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_mensagens_da_conversa', {
    p_conversation_id: conversaId,
  });
  if (error) {
    console.error('Erro ao listar mensagens:', error.message);
    return [];
  }
  return (data ?? []) as Mensagem[];
}

export async function marcarLida(conversaId: string) {
  const supabase = createClient();
  await supabase.rpc('cf_marcar_lida', { p_conversation_id: conversaId });
  revalidatePath('/mensagens');
}

export async function enviarMensagem(formData: FormData) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const conversaId = formData.get('conversationId') as string;
  const conteudo = ((formData.get('content') as string) ?? '').trim();

  if (!conversaId || !conteudo) return;
  if (conteudo.length > 4000) return;

  const supabase = createClient();
  // O RLS de `messages` já garante que só participantes escrevem
  const { error } = await supabase.from('messages').insert({
    conversation_id: conversaId,
    sender_id: perfil.user.id,
    content: conteudo,
  });

  if (error) {
    console.error('Erro ao enviar mensagem:', error.message);
    return;
  }

  revalidatePath(`/mensagens/${conversaId}`);
  revalidatePath('/mensagens');
}
