'use server';

import { revalidatePath } from 'next/cache';
import { createClient, getSessionProfile } from '@/lib/supabase/server';

/**
 * Notificações.
 *
 * A base de dados já as gravava desde o início — propostas aceites, convites,
 * documentos aprovados — mas nunca eram mostradas a ninguém. Sem isto, quem
 * recebe uma proposta só descobre se por acaso voltar ao ecrã certo.
 *
 * Deliberadamente sem envio por email ou SMS nesta fase: primeiro há que
 * garantir que o essencial aparece dentro da aplicação. Notificações externas
 * dependem de um serviço de email próprio, que ainda não está configurado.
 */

export interface Notificacao {
  id: string;
  type: string;
  title: string;
  body: string | null;
  action_url: string | null;
  read_at: string | null;
  created_at: string;
}

const LIMITE = 20;

export async function listarNotificacoes(): Promise<{
  notificacoes: Notificacao[];
  porLer: number;
}> {
  const perfil = await getSessionProfile();
  if (!perfil) return { notificacoes: [], porLer: 0 };

  const supabase = createClient();

  const { data } = await supabase
    .from('notifications')
    .select('id, type, title, body, action_url, read_at, created_at')
    .eq('user_id', perfil.user.id)
    .order('created_at', { ascending: false })
    .limit(LIMITE);

  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', perfil.user.id)
    .is('read_at', null);

  return {
    notificacoes: (data ?? []) as Notificacao[],
    porLer: count ?? 0,
  };
}

export async function marcarLida(id: string) {
  const perfil = await getSessionProfile();
  if (!perfil) return;

  const supabase = createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', perfil.user.id)
    .is('read_at', null);

  revalidatePath('/', 'layout');
}

export async function marcarTodasLidas() {
  const perfil = await getSessionProfile();
  if (!perfil) return;

  const supabase = createClient();
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', perfil.user.id)
    .is('read_at', null);

  revalidatePath('/', 'layout');
}
