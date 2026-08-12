'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createAdminClient, createClient, getSessionProfile } from '@/lib/supabase/server';

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

export interface ResumoAdministrativo {
  verificacoes_pendentes: number;
  pagamentos_pendentes: number;
  documentos_pendentes: number;
}

/** Barreira aplicada em todas as páginas de administração */
async function exigirAdmin() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  if (perfil.user.role !== 'PLATFORM_ADMIN') redirect('/painel');
  return perfil;
}

function getAdminSupabase() {
  try {
    return createAdminClient();
  } catch {
    return createClient();
  }
}

export async function verificacoesPendentes(): Promise<VerificacaoPendente[]> {
  await exigirAdmin();
  const supabase = getAdminSupabase();

  const { data: utilizadores, error: erroUtilizadores } = await supabase
    .from('users')
    .select('id, full_name, email, phone, role, created_at, tenant_id, tenant:tenants(id, name, type, tax_id)')
    .eq('verification', 'PENDING')
    .order('created_at', { ascending: false });

  if (erroUtilizadores) {
    console.error('Erro ao carregar verificações pendentes:', erroUtilizadores.message);
    return [];
  }

  const tenantIds = [...new Set((utilizadores ?? []).map((u: any) => u.tenant_id).filter(Boolean))];

  const { data: documentos } = tenantIds.length
    ? await supabase.from('documents').select('tenant_id, id').in('tenant_id', tenantIds)
    : { data: [] as any[] };

  const { data: veiculos } = tenantIds.length
    ? await supabase.from('vehicles').select('tenant_id, id').in('tenant_id', tenantIds)
    : { data: [] as any[] };

  const contagemDocumentos = new Map<string, number>();
  (documentos ?? []).forEach((doc: any) => {
    contagemDocumentos.set(doc.tenant_id, (contagemDocumentos.get(doc.tenant_id) ?? 0) + 1);
  });

  const contagemVeiculos = new Map<string, number>();
  (veiculos ?? []).forEach((veiculo: any) => {
    contagemVeiculos.set(veiculo.tenant_id, (contagemVeiculos.get(veiculo.tenant_id) ?? 0) + 1);
  });

  return (utilizadores ?? []).map((utilizador: any) => ({
    user_id: utilizador.id,
    full_name: utilizador.full_name,
    email: utilizador.email,
    phone: utilizador.phone,
    role: utilizador.role,
    criado_em: utilizador.created_at,
    tenant_id: utilizador.tenant_id,
    tenant_nome: utilizador.tenant?.name ?? 'Sem nome',
    tenant_tipo: utilizador.tenant?.type ?? 'INDIVIDUAL',
    tax_id: utilizador.tenant?.tax_id ?? null,
    n_documentos: contagemDocumentos.get(utilizador.tenant_id) ?? 0,
    n_veiculos: contagemVeiculos.get(utilizador.tenant_id) ?? 0,
  })) as VerificacaoPendente[];
}

export async function indicadoresPlataforma(): Promise<IndicadoresPlataforma | null> {
  await exigirAdmin();
  const supabase = getAdminSupabase();
  const { data } = await supabase.rpc('cf_admin_indicadores');
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha ?? null) as IndicadoresPlataforma | null;
}

export async function operacoesPlataforma() {
  await exigirAdmin();
  const supabase = getAdminSupabase();
  const { data } = await supabase.rpc('cf_admin_operacoes');
  return (data ?? []) as any[];
}

export async function resumoAdministrativo(): Promise<ResumoAdministrativo> {
  await exigirAdmin();
  const supabase = getAdminSupabase();

  const [verificacoes, pagamentos, documentos] = await Promise.all([
    supabase
      .from('users')
      .select('*', { count: 'exact', head: true })
      .eq('verification', 'PENDING'),
    supabase
      .from('payments')
      .select('*', { count: 'exact', head: true })
      .in('status', ['PENDING', 'EXPIRED']),
    supabase
      .from('documents')
      .select('*', { count: 'exact', head: true })
      .eq('verification', 'PENDING'),
  ]);

  return {
    verificacoes_pendentes: verificacoes.count ?? 0,
    pagamentos_pendentes: pagamentos.count ?? 0,
    documentos_pendentes: documentos.count ?? 0,
  };
}

export async function decidirVerificacao(
  utilizadorId: string,
  aprovar: boolean,
  motivo?: string,
) {
  await exigirAdmin();
  const supabase = getAdminSupabase();

  const { data: utilizador, error: erroUser } = await supabase
    .from('users')
    .select('tenant_id')
    .eq('id', utilizadorId)
    .single();

  if (erroUser || !utilizador) {
    throw new Error(erroUser?.message ?? 'Utilizador não encontrado.');
  }

  const status = aprovar ? 'APPROVED' : 'REJECTED';

  const { error: erroUsers } = await supabase
    .from('users')
    .update({
      verification: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', utilizadorId);

  if (erroUsers) throw new Error(erroUsers.message);

  const { error: erroTenant } = await supabase
    .from('tenants')
    .update({
      verification: status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', utilizador.tenant_id);

  if (erroTenant) throw new Error(erroTenant.message);

  const { error: erroDocumentos } = await supabase
    .from('documents')
    .update({
      verification: status,
      rejection_reason: aprovar ? null : (motivo ?? 'Rejeitado pela equipa CargoFlow'),
      updated_at: new Date().toISOString(),
    })
    .eq('tenant_id', utilizador.tenant_id);

  if (erroDocumentos) throw new Error(erroDocumentos.message);

  revalidatePath('/admin/verificacoes');
  revalidatePath('/painel');
}

/** Documentos carregados por uma empresa, para o administrador rever */
export async function documentosDoTenant(tenantId: string) {
  await exigirAdmin();
  const supabase = getAdminSupabase();
  const { data } = await supabase
    .from('documents')
    .select('id, type, file_url, document_number, issued_at, expires_at, verification')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return data ?? [];
}
// =============================================================================
// Documentos avulsos — carregados por contas JÁ aprovadas
//
// A aprovação inicial de um utilizador (decidirVerificacao) já aprova, de
// uma só vez, todos os documentos que existiam nesse momento. Mas nada
// impede um utilizador já aprovado de carregar um documento NOVO mais
// tarde (ex.: renovar uma carta de condução caducada) — e esse documento
// nunca aparecia em lado nenhum para revisão, porque só ficava visível na
// lista de "verificações pendentes", que só mostra utilizadores por
// aprovar. Esta função e a página /admin/documentos preenchem esse buraco.
// =============================================================================

export interface DocumentoPendente {
  id: string;
  type: string;
  file_url: string;
  document_number: string | null;
  expires_at: string | null;
  created_at: string;
  tenant_id: string;
  tenant_nome: string;
  utilizador_nome: string | null;
}

export async function documentosPendentesAvulsos(): Promise<DocumentoPendente[]> {
  await exigirAdmin();
  const supabase = getAdminSupabase();

  const { data, error } = await supabase
    .from('documents')
    .select(
      'id, type, file_url, document_number, expires_at, created_at, tenant_id, ' +
        'tenant:tenants(name), utilizador:users(full_name)',
    )
    .eq('verification', 'PENDING')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Erro ao carregar documentos pendentes:', error.message);
    return [];
  }

  return (data ?? []).map((d: any) => ({
    id: d.id,
    type: d.type,
    file_url: d.file_url,
    document_number: d.document_number,
    expires_at: d.expires_at,
    created_at: d.created_at,
    tenant_id: d.tenant_id,
    tenant_nome: d.tenant?.name ?? 'Sem nome',
    utilizador_nome: d.utilizador?.full_name ?? null,
  })) as DocumentoPendente[];
}

export async function decidirDocumentoAvulso(
  documentoId: string,
  aprovar: boolean,
  motivo?: string,
) {
  const perfil = await exigirAdmin();
  const supabase = getAdminSupabase();

  const status = aprovar ? 'APPROVED' : 'REJECTED';

  const { error } = await supabase
    .from('documents')
    .update({
      verification: status,
      verified_by: perfil.user.id,
      verified_at: new Date().toISOString(),
      rejection_reason: aprovar ? null : (motivo ?? 'Documentação incompleta ou não legível'),
      updated_at: new Date().toISOString(),
    })
    .eq('id', documentoId);

  if (error) throw new Error(error.message);

  revalidatePath('/admin/documentos');
}
