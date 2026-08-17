'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

// ============================================================================
// VERIFICATION REQUIREMENTS
// ============================================================================

export async function getVerificationRequirements() {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_requirements')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getVerificationRequirementsByRole(role: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_requirements')
    .select('*')
    .eq('role', role);

  if (error) throw error;
  return data || [];
}

// ============================================================================
// USER BLOCKLIST
// ============================================================================

export async function getUserBlocklist(tenantId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('user_blocklist')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('blocked_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function blockUser(
  userId: string,
  tenantId: string,
  reason: string,
  reasonCode?: string
) {
  const supabase = createClient();
  
  // Get current user (admin)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get admin user id from users table
  const { data: adminUser, error: adminError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (adminError) throw adminError;

  // Insert block record
  const { data, error } = await supabase
    .from('user_blocklist')
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      reason,
      reason_code: reasonCode,
      blocked_by: adminUser.id,
      is_active: true,
    })
    .select();

  if (error) throw error;
  revalidatePath('/admin');
  return data;
}

export async function unblockUser(blockId: string) {
  const supabase = createClient();

  // Get current user (admin)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get admin user id
  const { data: adminUser, error: adminError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (adminError) throw adminError;

  // Update block record
  const { data, error } = await supabase
    .from('user_blocklist')
    .update({
      is_active: false,
      unblocked_at: new Date().toISOString(),
      unblocked_by: adminUser.id,
    })
    .eq('id', blockId)
    .select();

  if (error) throw error;
  revalidatePath('/admin');
  return data;
}

// ============================================================================
// VERIFICATION AUDIT LOG
// ============================================================================

export async function createAuditLog(
  userId: string,
  tenantId: string,
  action: string,
  reason?: string,
  comment?: string,
  documentId?: string
) {
  const supabase = createClient();

  // Get current user (admin)
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  // Get admin user id
  const { data: adminUser, error: adminError } = await supabase
    .from('users')
    .select('id')
    .eq('auth_user_id', user.id)
    .single();

  if (adminError) throw adminError;

  // Get client IP (server context)
  const { data, error } = await supabase
    .from('verification_audit_log')
    .insert({
      user_id: userId,
      tenant_id: tenantId,
      document_id: documentId,
      admin_id: adminUser.id,
      action,
      reason,
      comment,
    })
    .select();

  if (error) throw error;
  return data;
}

export async function getAuditLogByTenant(tenantId: string, limit = 50) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_audit_log')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

export async function getAuditLogByUser(userId: string, limit = 50) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('verification_audit_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data || [];
}

// ============================================================================
// PAYMENTS (READ)
// ============================================================================

export async function getPaymentsByTenant(tenantId: string) {
  const supabase = createClient();
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
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
  return data || [];
}