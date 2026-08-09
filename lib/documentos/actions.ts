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
}

export async function listarDocumentos(): Promise<Documento[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from('documents')
    .select('*')
    .order('created_at', { ascending: false });
  return (data ?? []) as Documento[];
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
    type: tipo,
    file_url: caminho,
    document_number: numero,
    expires_at: validade || null,
    verification: 'PENDING',
  });

  if (error) {
    // Não deixar ficheiros órfãos no armazenamento
    await supabase.storage.from('documentos').remove([caminho]);
    return { erro: 'Não foi possível registar o documento.' };
  }

  revalidatePath('/documentos');
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
