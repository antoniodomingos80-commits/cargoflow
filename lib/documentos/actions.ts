'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import type { DocumentType } from '@/lib/types';

export interface Documento {
  id: string;
  type: DocumentType;
  file_url: string;
  document_number: string | null;
  issued_at: string | null;
  expires_at: string | null;
  verification: string;
  rejection_reason: string | null;
  created_at: string;
  vehicle_id: string | null;
  /** Matrícula do veículo associado, quando existe. */
  veiculo?: { plate: string } | null;
}

export async function listarDocumentos(): Promise<Documento[]> {
  const perfil = await getSessionProfile();
  if (!perfil) return [];

  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('*, veiculo:vehicles(plate)')
    .eq('tenant_id', perfil.tenant.id)
    .order('created_at', { ascending: false });
  return (data ?? []) as unknown as Documento[];
}

/** Tipo explícito — sem ele o TypeScript infere uma união em que `erro`
 *  pode ser `undefined`, e o formulário não compila. */
export type EstadoDocumento = { erro?: string; sucesso?: boolean };

export async function carregarDocumento(
  formData: FormData,
): Promise<EstadoDocumento> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const ficheiro = formData.get('ficheiro') as File | null;
  const tipo = formData.get('tipo') as DocumentType | null;
  const numero = (formData.get('numero') as string) || null;
  const validade = (formData.get('validade') as string) || null;
  const veiculoId = (formData.get('veiculo') as string) || null;

  if (!ficheiro || ficheiro.size === 0) {
    return { erro: 'Selecione um ficheiro.' };
  }
  if (!tipo) {
    return { erro: 'Indique o tipo de documento.' };
  }
  if (ficheiro.size > 10 * 1024 * 1024) {
    return { erro: 'O ficheiro não pode exceder 10 MB.' };
  }

  const supabase = createClient();

  // A associação a um veículo é verificada no servidor: não basta o formulário
  // ter enviado um id, esse veículo tem de ser mesmo desta empresa. Sem isto,
  // bastaria alterar o valor no browser para pendurar um documento na frota
  // de outra pessoa.
  if (veiculoId) {
    const { data: veiculo } = await supabase
      .from('vehicles')
      .select('id')
      .eq('id', veiculoId)
      .eq('tenant_id', perfil.tenant.id)
      .maybeSingle();

    if (!veiculo) {
      return { erro: 'O veículo indicado não pertence a esta empresa.' };
    }
  }

  // O caminho começa pelo id da empresa — é assim que as políticas do
  // Storage verificam a propriedade do ficheiro.
  const extensao = ficheiro.name.split('.').pop()?.toLowerCase() ?? 'pdf';
  const caminho = `${perfil.tenant.id}/${crypto.randomUUID()}.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from('documentos')
    .upload(caminho, ficheiro, { cacheControl: '3600', upsert: false });

  if (erroUpload) {
    console.error('Erro no carregamento:', erroUpload.message);
    return { erro: 'Não foi possível carregar o ficheiro.' };
  }

  const { error } = await supabase.from('documents').insert({
    tenant_id: perfil.tenant.id,
    user_id: perfil.user.id,
    vehicle_id: veiculoId || null,
    type: tipo,
    file_url: caminho,
    document_number: numero,
    expires_at: validade || null,
    // Um documento nasce sempre por verificar. O gatilho
    // `zz_proteger_campos_admin` recusa qualquer outro valor vindo daqui.
    verification: 'PENDING',
  });

  if (error) {
    // Não deixar ficheiros órfãos no armazenamento
    await supabase.storage.from('documentos').remove([caminho]);
    return { erro: 'Não foi possível registar o documento.' };
  }

  revalidatePath('/documentos');
  revalidatePath('/confianca');
  revalidatePath('/frota');
  return { sucesso: true };
}

export async function apagarDocumento(documentoId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const supabase = createClient();

  const { data: doc } = await supabase
    .from('documents')
    .select('file_url, verification')
    .eq('id', documentoId)
    .single();

  if (!doc) return;

  // Documentos já aprovados não se apagam — são o registo da verificação
  if (doc.verification === 'APPROVED') {
    throw new Error('Documentos aprovados não podem ser removidos.');
  }

  await supabase.from('documents').delete().eq('id', documentoId);
  await supabase.storage.from('documentos').remove([doc.file_url]);

  revalidatePath('/documentos');
}

/** URL assinado temporário — o bucket é privado */
export async function urlDocumento(caminho: string): Promise<string | null> {
  const supabase = createClient();
  const { data } = await supabase.storage
    .from('documentos')
    .createSignedUrl(caminho, 3600);
  return data?.signedUrl ?? null;
}
