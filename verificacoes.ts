'use server';

import { createClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { exigirPlatformAdmin } from '@/lib/admin/guard';

/**
 * Cliente com a chave de serviço — IGNORA Row Level Security.
 *
 * Todas as funções exportadas começam por `exigirPlatformAdmin()`: uma Server
 * Action é um endpoint HTTP e, sem essa barreira, qualquer sessão autenticada
 * conseguiria aprovar ou rejeitar verificações de toda a plataforma.
 */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/** Regista a decisão no histórico de auditoria. Nunca faz falhar a operação. */
async function registarAuditoria(
  utilizadorId: string,
  adminId: string,
  accao: 'VERIFICATION_APPROVED' | 'VERIFICATION_REJECTED',
  motivo?: string | null,
) {
  if (!supabase) return;

  try {
    const { data: alvo } = await supabase
      .from('users')
      .select('tenant_id')
      .eq('id', utilizadorId)
      .single();

    if (!alvo?.tenant_id) return;

    await supabase.from('verification_audit_log').insert({
      user_id: utilizadorId,
      tenant_id: alvo.tenant_id,
      admin_id: adminId,
      action: accao,
      reason: motivo ?? null,
    });
  } catch (erro) {
    console.error('Falha ao registar auditoria (operação principal não afectada):', erro);
  }
}

export async function listarPendentes() {
  await exigirPlatformAdmin();

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
  const admin = await exigirPlatformAdmin();

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

    await registarAuditoria(id, admin.user.id, 'VERIFICATION_APPROVED');
    revalidatePath('/admin/verificacoes');
    revalidatePath('/admin/trust');
    return { success: true };
  } catch (erro: any) {
    console.error('Falha ao aprovar utilizador:', erro);
    return { success: false, error: erro?.message ?? 'Erro desconhecido.' };
  }
}

export async function rejeitarUtilizador(id: string, motivo: string): Promise<{ success: boolean; error?: string }> {
  const admin = await exigirPlatformAdmin();

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

    await registarAuditoria(id, admin.user.id, 'VERIFICATION_REJECTED', motivo);
    revalidatePath('/admin/verificacoes');
    revalidatePath('/admin/trust');
    return { success: true };
  } catch (erro: any) {
    console.error('Falha ao rejeitar utilizador:', erro);
    return { success: false, error: erro?.message ?? 'Erro desconhecido.' };
  }
}
