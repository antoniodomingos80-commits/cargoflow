'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getSessionProfile } from '@/lib/supabase/server';

export interface VerificacaoPendente {
  user_id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role: string;
  criado_em: string;
  tenant_id: string;
  tenant_nome: string;
  tenant_tipo: string;
  tax_id: string | null;
  n_documentos: number;
  n_veiculos: number;
}

export interface IndicadoresPlataforma {
  utilizadores_total: number;
  utilizadores_pendentes: number;
  empresas: number;
  veiculos: number;
  cargas_publicadas: number;
  cargas_em_curso: number;
  cargas_concluidas: number;
  viagens_ativas: number;
  correspondencias: number;
  propostas_pendentes: number;
  acordos: number;
  valor_transacionado: number;
  avaliacao_media: number | null;
}

/** Barreira aplicada em todas as páginas de administração */
async function exigirAdmin() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  if (perfil.user.role !== 'PLATFORM_ADMIN') redirect('/painel');
  return perfil;
}

export async function verificacoesPendentes(): Promise<VerificacaoPendente[]> {
  await exigirAdmin();
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_admin_verificacoes_pendentes');
  if (error) {
    console.error('Erro nas verificações pendentes:', error.message);
    return [];
  }
  return (data ?? []) as VerificacaoPendente[];
}

export async function indicadoresPlataforma(): Promise<IndicadoresPlataforma | null> {
  await exigirAdmin();
  const supabase = createClient();
  const { data } = await supabase.rpc('cf_admin_indicadores');
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as IndicadoresPlataforma | null;
}

export async function operacoesPlataforma() {
  await exigirAdmin();
  const supabase = createClient();
  const { data } = await supabase.rpc('cf_admin_operacoes');
  return (data ?? []) as any[];
}

export async function decidirVerificacao(
  utilizadorId: string,
  aprovar: boolean,
  motivo?: string,
) {
  await exigirAdmin();
  const supabase = createClient();
  const { error } = await supabase.rpc('cf_admin_decidir_verificacao', {
    p_user_id: utilizadorId,
    p_aprovar: aprovar,
    p_motivo: motivo ?? null,
  });
  if (error) throw new Error(error.message);

  revalidatePath('/admin/verificacoes');
  revalidatePath('/painel');
}

/** Documentos carregados por uma empresa, para o administrador rever */
export async function documentosDoTenant(tenantId: string) {
  await exigirAdmin();
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('id, type, file_url, document_number, issued_at, expires_at, verification')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return data ?? [];
}
