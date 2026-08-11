 'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';

const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

export async function listarUtilizadores() {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, phone, verification, banned, created_at, role')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function suspenderUtilizador(id: string, motivo?: string) {
  const { error } = await supabase
    .from('users')
    .update({ banned: true, ban_reason: motivo ?? null })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}

export async function ativarUtilizador(id: string) {
  const { error } = await supabase
    .from('users')
    .update({ banned: false, ban_reason: null })
    .eq('id', id);

  if (error) throw error;
  return { success: true };
}
