'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { garantirContaAtiva } from '@/lib/seguranca/conta';

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

/**
 * Marca a conversa como lida.
 *
 * NOTA: esta função é chamada diretamente durante a renderização da página
 * de conversa (`app/(app)/mensagens/[id]/page.tsx`), não a partir de uma
 * Server Action disparada por um clique. O Next.js não permite chamar
 * `revalidatePath` nesse contexto — rebentava a página com um erro 500
 * ("used revalidatePath ... during render which is unsupported").
 * Por isso já não invalidamos aqui a cache de '/mensagens'; a lista voltará
 * a atualizar-se sozinha da próxima vez que essa página carregar.
 */
export async function marcarLida(conversaId: string) {
  const supabase = createClient();
  await supabase.rpc('cf_marcar_lida', { p_conversation_id: conversaId });
}

export async function enviarMensagem(formData: FormData) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

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