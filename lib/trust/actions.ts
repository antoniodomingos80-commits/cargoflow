'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import { exigirPlatformAdmin } from '@/lib/admin/guard';

/**
 * Trust Layer — requisitos de verificação, bloqueios e auditoria.
 *
 * Estas acções usam o cliente ligado à sessão, por isso o RLS continua a ser a
 * última linha de defesa (as políticas já exigem `is_platform_admin()`). A
 * barreira em código serve para devolver um erro claro em vez de uma lista
 * vazia silenciosa, e para garantir que o administrador e a empresa vêm da
 * sessão — nunca de um parâmetro enviado pelo cliente.
 */

export interface RequisitoVerificacao {
  id: string;
  role: string;
  document_type: string;
  is_required: boolean;
  description: string | null;
  renewal_frequency_months: number | null;
}

export interface Bloqueio {
  id: string;
  user_id: string;
  tenant_id: string;
  reason: string;
  reason_code: string | null;
  blocked_by: string;
  blocked_at: string;
  is_active: boolean;
  utilizador?: { full_name: string; email: string | null; role: string } | null;
}

export interface RegistoAuditoria {
  id: string;
  user_id: string | null;
  tenant_id: string;
  admin_id: string;
  action: string;
  reason: string | null;
  comment: string | null;
  created_at: string;
  utilizador?: { full_name: string } | null;
  administrador?: { full_name: string } | null;
}

// ============================================================================
// REQUISITOS DE VERIFICAÇÃO
// ============================================================================

export async function getVerificationRequirements(): Promise<RequisitoVerificacao[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_requirements')
    .select('*')
    .order('role', { ascending: true })
    .order('document_type', { ascending: true });

  if (error) throw error;
  return (data ?? []) as RequisitoVerificacao[];
}

export async function getVerificationRequirementsByRole(
  role: string,
): Promise<RequisitoVerificacao[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_requirements')
    .select('*')
    .eq('role', role)
    .order('document_type', { ascending: true });

  if (error) throw error;
  return (data ?? []) as RequisitoVerificacao[];
}

// ============================================================================
// BLOQUEIOS
// ============================================================================

/** Bloqueios activos de toda a plataforma — visão do administrador. */
export async function listarBloqueiosAtivos(): Promise<Bloqueio[]> {
  await exigirPlatformAdmin();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_blocklist')
    .select('*, utilizador:users!user_blocklist_user_id_fkey(full_name, email, role)')
    .eq('is_active', true)
    .order('blocked_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as unknown as Bloqueio[];
}

export async function getUserBlocklist(tenantId: string): Promise<Bloqueio[]> {
  await exigirPlatformAdmin();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_blocklist')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('blocked_at', { ascending: false });

  if (error) throw error;
  return (data ?? []) as Bloqueio[];
}

/**
 * Bloqueia um utilizador.
 *
 * A empresa é lida do próprio utilizador e o autor do bloqueio vem da sessão —
 * não são aceites do cliente, para que ninguém possa forjar um bloqueio noutra
 * empresa ou em nome de outro administrador.
 */
export async function blockUser(userId: string, motivo: string, codigoMotivo?: string) {
  const admin = await exigirPlatformAdmin();

  const texto = motivo?.trim();
  if (!texto) throw new Error('É obrigatório indicar o motivo do bloqueio.');
  if (userId === admin.user.id) throw new Error('Não é possível bloquear a própria conta.');

  const supabase = createClient();

  const { data: alvo, error: erroAlvo } = await supabase
    .from('users')
    .select('id, tenant_id, full_name')
    .eq('id', userId)
    .single();

  if (erroAlvo || !alvo) throw new Error('Utilizador não encontrado.');

  const { data: existente } = await supabase
    .from('user_blocklist')
    .select('id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .maybeSingle();

  if (existente) throw new Error(`${alvo.full_name} já se encontra bloqueado.`);

  const { data, error } = await supabase
    .from('user_blocklist')
    .insert({
      user_id: alvo.id,
      tenant_id: alvo.tenant_id,
      reason: texto,
      reason_code: codigoMotivo ?? null,
      blocked_by: admin.user.id,
      is_active: true,
    })
    .select()
    .single();

  if (error) throw error;

  // Refletir em `users`. A blocklist é a fonte de verdade, mas o utilizador não
  // a consegue ler (RLS de administrador) — a barreira operacional em
  // lib/seguranca/conta.ts lê estas colunas, que viajam no perfil de sessão.
  // `banned` é o mecanismo legado de /admin/utilizadores, mantido em sincronia
  // para que os dois painéis nunca discordem.
  const { error: erroReflexo } = await supabase
    .from('users')
    .update({
      is_blocked: true,
      blocked_at: data.blocked_at ?? new Date().toISOString(),
      blocked_reason: texto.slice(0, 255),
      banned: true,
      ban_reason: texto,
      updated_at: new Date().toISOString(),
    })
    .eq('id', alvo.id);

  if (erroReflexo) {
    // Sem o reflexo o bloqueio não teria efeito operacional. Reverter a entrada
    // para não deixar um bloqueio que a plataforma ignora.
    await supabase.from('user_blocklist').delete().eq('id', data.id);
    throw new Error('Não foi possível aplicar o bloqueio. Nenhuma alteração foi feita.');
  }

  await gravarAuditoria(supabase, {
    userId: alvo.id,
    tenantId: alvo.tenant_id,
    adminId: admin.user.id,
    action: 'USER_BLOCKED',
    reason: texto,
  });

  revalidatePath('/admin/trust');
  revalidatePath('/admin/utilizadores');
  return data;
}

export async function unblockUser(blockId: string, motivo?: string) {
  const admin = await exigirPlatformAdmin();
  const supabase = createClient();

  const { data, error } = await supabase
    .from('user_blocklist')
    .update({
      is_active: false,
      unblocked_at: new Date().toISOString(),
      unblocked_by: admin.user.id,
    })
    .eq('id', blockId)
    .eq('is_active', true)
    .select()
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error('Bloqueio não encontrado ou já levantado.');

  // Só limpar o reflexo se não restar nenhum outro bloqueio activo.
  const { data: restantes } = await supabase
    .from('user_blocklist')
    .select('id')
    .eq('user_id', data.user_id)
    .eq('is_active', true)
    .limit(1);

  if (!restantes || restantes.length === 0) {
    const { error: erroReflexo } = await supabase
      .from('users')
      .update({
        is_blocked: false,
        blocked_at: null,
        blocked_reason: null,
        banned: false,
        ban_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data.user_id);

    if (erroReflexo) {
      // Reverter: manter o bloqueio activo é mais seguro do que deixar a conta
      // a operar com a blocklist a dizer que está levantada.
      await supabase
        .from('user_blocklist')
        .update({ is_active: true, unblocked_at: null, unblocked_by: null })
        .eq('id', blockId);
      throw new Error('Não foi possível levantar o bloqueio. Nenhuma alteração foi feita.');
    }
  }

  await gravarAuditoria(supabase, {
    userId: data.user_id,
    tenantId: data.tenant_id,
    adminId: admin.user.id,
    action: 'USER_UNBLOCKED',
    reason: motivo ?? null,
  });

  revalidatePath('/admin/trust');
  revalidatePath('/admin/utilizadores');
  return data;
}

// ============================================================================
// AUDITORIA
// ============================================================================

/**
 * Escrita interna. Não é exportada de propósito: num ficheiro 'use server'
 * cada export vira um endpoint, e o histórico de auditoria só deve ser
 * escrito pelas operações que o originam.
 */
async function gravarAuditoria(
  supabase: ReturnType<typeof createClient>,
  registo: {
    userId: string | null;
    tenantId: string;
    adminId: string;
    action: string;
    reason?: string | null;
    comment?: string | null;
    documentId?: string | null;
  },
) {
  const { error } = await supabase.from('verification_audit_log').insert({
    user_id: registo.userId,
    tenant_id: registo.tenantId,
    document_id: registo.documentId ?? null,
    admin_id: registo.adminId,
    action: registo.action,
    reason: registo.reason ?? null,
    comment: registo.comment ?? null,
  });

  // A auditoria nunca deve fazer falhar a operação que a originou.
  if (error) console.error('Falha ao gravar auditoria:', error.message);
}

export async function createAuditLog(
  userId: string,
  action: string,
  reason?: string,
  comment?: string,
  documentId?: string,
) {
  const admin = await exigirPlatformAdmin();
  const supabase = createClient();

  const { data: alvo, error: erroAlvo } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', userId)
    .single();

  if (erroAlvo || !alvo) throw new Error('Utilizador não encontrado.');

  await gravarAuditoria(supabase, {
    userId,
    tenantId: alvo.tenant_id,
    adminId: admin.user.id,
    action,
    reason,
    comment,
    documentId,
  });

  revalidatePath('/admin/trust');
  return { success: true };
}

/** Histórico recente de toda a plataforma — visão do administrador. */
export async function listarAuditoria(limite = 50): Promise<RegistoAuditoria[]> {
  await exigirPlatformAdmin();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_audit_log')
    .select(
      '*, utilizador:users!verification_audit_log_user_id_fkey(full_name), administrador:users!verification_audit_log_admin_id_fkey(full_name)',
    )
    .order('created_at', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return (data ?? []) as unknown as RegistoAuditoria[];
}

export async function getAuditLogByTenant(
  tenantId: string,
  limit = 50,
): Promise<RegistoAuditoria[]> {
  await exigirPlatformAdmin();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_audit_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as RegistoAuditoria[];
}

export async function getAuditLogByUser(
  userId: string,
  limit = 50,
): Promise<RegistoAuditoria[]> {
  await exigirPlatformAdmin();

  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_audit_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return (data ?? []) as RegistoAuditoria[];
}

// ============================================================================
// PAGAMENTOS (LEITURA)
// ============================================================================

export async function getPaymentsByTenant(tenantId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getPaymentByStatus(tenantId: string, status: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('status', status)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data ?? [];
}
