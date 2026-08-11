 'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export async function listarPendentes() {
  if (!supabase) {
    console.warn('Supabase não configurado para listar utilizadores pendentes.');
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('users')
      .select('id, email, full_name, verification_status:verification')
      .eq('verification', 'PENDING')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Erro ao listar utilizadores pendentes:', error.message);
      return [];
    }

    return data || [];
  } catch (erro) {
    console.error('Falha ao listar utilizadores pendentes:', erro);
    return [];
  }
}

export async function aprovarUtilizador(id: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase não configurado.' };
  }

  try {
    const { error } = await supabase
      .from('users')
      .update({
        verification: 'APPROVED',
        updated_at: new Date().toISOString(),
        rejection_reason: null,
      })
      .eq('id', id);

    if (error) {
      console.error('Erro ao aprovar utilizador:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (erro: any) {
    console.error('Falha ao aprovar utilizador:', erro);
    return { success: false, error: erro?.message ?? 'Erro desconhecido.' };
  }
}

export async function rejeitarUtilizador(id: string, motivo: string): Promise<{ success: boolean; error?: string }> {
  if (!supabase) {
    return { success: false, error: 'Supabase não configurado.' };
  }

  try {
    const { error } = await supabase
      .from('users')
      .update({
        verification: 'REJECTED',
        rejection_reason: motivo,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('Erro ao rejeitar utilizador:', error.message);
      return { success: false, error: error.message };
    }

    return { success: true };
  } catch (erro: any) {
    console.error('Falha ao rejeitar utilizador:', erro);
    return { success: false, error: erro?.message ?? 'Erro desconhecido.' };
  }
}
