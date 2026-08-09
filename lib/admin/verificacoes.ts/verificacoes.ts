'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function listarPendentes() {
  try {
    const supabase = createClient();
    
    const { data, error } = await supabase
      .from('users')
      .select(`
        id,
        raw_user_meta_data->>'full_name' as full_name,
        email,
        raw_user_meta_data->>'phone' as phone,
        raw_user_meta_data->>'role' as role,
        created_at,
        verification_status,
        documento_tipo,
        documento_numero
      `)
      .eq('verification_status', 'PENDENTE')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (erro) {
    console.error('Erro ao listar pendentes:', erro);
    throw erro;
  }
}

export async function aprovarUtilizador(userId: string) {
  try {
    const supabase = createClient();

    const { error } = await supabase
      .from('users')
      .update({
        verification_status: 'APPROVED',
        verified_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;

    revalidatePath('/admin/verificacoes');
    return { sucesso: true, mensagem: 'Utilizador aprovado!' };
  } catch (erro) {
    console.error('Erro ao aprovar:', erro);
    throw erro;
  }
}

export async function rejeitarUtilizador(userId: string, motivo: string) {
  try {
    if (!motivo || motivo.trim().length === 0) {
      throw new Error('Motivo obrigatório');
    }

    const supabase = createClient();

    const { error } = await supabase
      .from('users')
      .update({
        verification_status: 'REJECTED',
        rejection_reason: motivo,
        rejected_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (error) throw error;

    revalidatePath('/admin/verificacoes');
    return { sucesso: true, mensagem: 'Utilizador rejeitado!' };
  } catch (erro) {
    console.error('Erro ao rejeitar:', erro);
    throw erro;
  }
}