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

/**
 * Suspende uma conta a partir do painel legado `/admin/utilizadores`.
 *
 * Escreve nos três sítios de propósito: a entrada em `user_blocklist` é a fonte
 * de verdade e o que o painel Trust mostra; `is_blocked` é o estado refletido
 * que a barreira operacional lê; `banned` mantém a interface antiga coerente.
 * Suspender aqui e bloquear em `/admin/trust` passam a ser a mesma coisa.
 */
export async function suspenderUtilizador(id: string, motivo?: string) {
  const admin = await exigirPlatformAdmin();

  // Suspender a própria conta deixaria a plataforma sem administrador activo.
  if (id === admin.user.id) {
    throw new Error('Não é possível suspender a própria conta.');
  }

  const texto = motivo?.trim() || 'Suspensão administrativa';

  const { data: alvo, error: erroAlvo } = await supabase
    .from('users')
    .select('id, tenant_id')
    .eq('id', id)
    .single();

  if (erroAlvo || !alvo) throw new Error('Utilizador não encontrado.');

  const agora = new Date().toISOString();

  const { error } = await supabase
    .from('users')
    .update({
      banned: true,
      ban_reason: texto,
      is_blocked: true,
      blocked_at: agora,
      blocked_reason: texto.slice(0, 255),
      updated_at: agora,
    })
    .eq('id', id);

  if (error) throw error;

  // Registar na fonte de verdade, se ainda não houver bloqueio activo.
  const { data: existente } = await supabase
    .from('user_blocklist')
    .select('id')
    .eq('user_id', id)
    .eq('is_active', true)
    .maybeSingle();

  if (!existente) {
    const { error: erroLista } = await supabase.from('user_blocklist').insert({
      user_id: alvo.id,
      tenant_id: alvo.tenant_id,
      reason: texto,
      reason_code: 'ADMIN_SUSPENSION',
      blocked_by: admin.user.id,
      is_active: true,
    });
    if (erroLista) {
      console.error('Falha ao registar na blocklist:', erroLista.message);
    }
  }

  await registarAuditoria(id, admin.user.id, 'USER_BLOCKED', texto);
  revalidatePath('/admin/utilizadores');
  revalidatePath('/admin/trust');
  return { success: true };
}

export async function ativarUtilizador(id: string) {
  const admin = await exigirPlatformAdmin();
  const agora = new Date().toISOString();

  const { error } = await supabase
    .from('users')
    .update({
      banned: false,
      ban_reason: null,
      is_blocked: false,
      blocked_at: null,
      blocked_reason: null,
      updated_at: agora,
    })
    .eq('id', id);

  if (error) throw error;

  // Levantar todos os bloqueios activos na fonte de verdade — caso contrário o
  // painel Trust continuaria a mostrar a conta como bloqueada.
  const { error: erroLista } = await supabase
    .from('user_blocklist')
    .update({ is_active: false, unblocked_at: agora, unblocked_by: admin.user.id })
    .eq('user_id', id)
    .eq('is_active', true);

  if (erroLista) {
    console.error('Falha ao levantar bloqueios na blocklist:', erroLista.message);
  }

  await registarAuditoria(id, admin.user.id, 'USER_UNBLOCKED');
  revalidatePath('/admin/utilizadores');
  revalidatePath('/admin/trust');
  return { success: true };
}
