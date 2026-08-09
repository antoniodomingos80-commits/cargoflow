﻿'use server';
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
export async function listarPendentes() {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, full_name, verification_status')
    .eq('verification_status', 'PENDENTE');
  if (error) throw error;
  return data || [];
}
export async function aprovarUtilizador(id: string) {
  const { error } = await supabase
    .from('users')
    .update({ verification_status: 'APPROVED', verified_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return { success: true };
}
export async function rejeitarUtilizador(id: string, motivo: string) {
  const { error } = await supabase
    .from('users')
    .update({ verification_status: 'REJECTED', rejection_reason: motivo, rejected_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
  return { success: true };
}
