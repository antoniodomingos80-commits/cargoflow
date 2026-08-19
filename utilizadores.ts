'use server';

import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { revalidatePath } from 'next/cache';
import { exigirPlatformAdmin } from '@/lib/admin/guard';

/**
 * Cliente com a chave de serviço — IGNORA Row Level Security.
 *
 * Por isso, todas as funções exportadas neste ficheiro começam por
 * `exigirPlatformAdmin()`. Sem essa barreira, qualquer sessão autenticada
 * conseguiria listar os contactos de todos os utilizadores e suspendê-los:
 * uma Server Action é um endpoint HTTP, esconder o botão não impede a chamada.
 */
const supabase = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

/** Regista a decisão no histórico de auditoria. Nunca faz falhar a operação. */
async function registarAuditoria(
  utilizadorId: string,
  adminId: string,
  accao: 'USER_BLOCKED' | 'USER_UNBLOCKED',
  motivo?: string | null,
) {
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

export async function listarUtilizadores() {
  await exigirPlatformAdmin();

  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, phone, verification, banned, created_at, role')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function suspenderUtilizador(id: string, motivo?: string) {
  const admin = await exigirPlatformAdmin();

  // Suspender a própria conta deixaria a plataforma sem administrador activo.
  if (id === admin.user.id) {
    throw new Error('Não é possível suspender a própria conta.');
  }

  const { error } = await supabase
    .from('users')
    .update({ banned: true, ban_reason: motivo ?? null })
    .eq('id', id);

  if (error) throw error;

  await registarAuditoria(id, admin.user.id, 'USER_BLOCKED', motivo);
  revalidatePath('/admin/utilizadores');
  revalidatePath('/admin/trust');
  return { success: true };
}

export async function ativarUtilizador(id: string) {
  const admin = await exigirPlatformAdmin();

  const { error } = await supabase
    .from('users')
    .update({ banned: false, ban_reason: null })
    .eq('id', id);

  if (error) throw error;

  await registarAuditoria(id, admin.user.id, 'USER_UNBLOCKED');
  revalidatePath('/admin/utilizadores');
  revalidatePath('/admin/trust');
  return { success: true };
}
