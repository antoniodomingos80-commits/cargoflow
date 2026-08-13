'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, getSessionProfile } from '@/lib/supabase/server';

const perfilSchema = z.object({
  fullName: z.string().min(3, 'Indique o nome completo.').max(200),
  phone: z
    .string()
    .regex(/^\+?244\d{9}$/, 'Telefone inválido. Formato: +244923456789')
    .optional()
    .or(z.literal('')),
  baseCity: z.string().max(200).optional().or(z.literal('')),
});

const empresaSchema = z.object({
  name: z.string().min(3, 'Indique o nome da empresa.').max(200),
  taxId: z.string().max(50).optional().or(z.literal('')),
  defaultCurrency: z
    .string()
    .length(3, 'Moeda inválida.')
    .regex(/^[A-Z]{3}$/, 'Moeda inválida.'),
});

export type EstadoConfiguracoes = {
  erro?: string;
  erros?: Record<string, string[]>;
  sucesso?: string;
};

export async function atualizarPerfil(
  _anterior: EstadoConfiguracoes,
  formData: FormData,
): Promise<EstadoConfiguracoes> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const parsed = perfilSchema.safeParse({
    fullName: formData.get('fullName'),
    phone: formData.get('phone') || '',
    baseCity: formData.get('baseCity') || '',
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('users')
    .update({
      full_name: parsed.data.fullName,
      phone: parsed.data.phone || null,
      base_city: parsed.data.baseCity || null,
    })
    .eq('id', perfil.user.id);

  if (error) {
    return { erro: 'Não foi possível atualizar o perfil.' };
  }

  revalidatePath('/configuracoes');
  revalidatePath('/painel');
  return { sucesso: 'Perfil atualizado com sucesso.' };
}

export async function atualizarEmpresa(
  _anterior: EstadoConfiguracoes,
  formData: FormData,
): Promise<EstadoConfiguracoes> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  if (!['COMPANY_ADMIN', 'PLATFORM_ADMIN'].includes(perfil.user.role)) {
    return { erro: 'Sem permissão para editar dados da empresa.' };
  }

  const parsed = empresaSchema.safeParse({
    name: formData.get('name'),
    taxId: formData.get('taxId') || '',
    defaultCurrency: String(formData.get('defaultCurrency') || '').toUpperCase(),
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }

  const supabase = createClient();
  const { error } = await supabase
    .from('tenants')
    .update({
      name: parsed.data.name,
      tax_id: parsed.data.taxId || null,
      default_currency: parsed.data.defaultCurrency,
    })
    .eq('id', perfil.tenant.id);

  if (error) {
    return { erro: 'Não foi possível atualizar a empresa.' };
  }

  revalidatePath('/configuracoes');
  revalidatePath('/painel');
  return { sucesso: 'Dados da empresa atualizados com sucesso.' };
}

// =============================================================================
// Foto de perfil
// =============================================================================

export async function carregarAvatar(
  formData: FormData,
): Promise<EstadoConfiguracoes> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const ficheiro = formData.get('avatar');
  if (!(ficheiro instanceof File) || ficheiro.size === 0) {
    return { erro: 'Selecione uma fotografia.' };
  }
  if (ficheiro.size > 5 * 1024 * 1024) {
    return { erro: 'A fotografia não pode exceder 5 MB.' };
  }
  if (!ficheiro.type.startsWith('image/')) {
    return { erro: 'O ficheiro tem de ser uma imagem.' };
  }

  const supabase = createClient();
  const extensao = ficheiro.name.split('.').pop()?.toLowerCase() ?? 'jpg';
  // upsert:true — substitui sempre a mesma foto, sem acumular ficheiros órfãos
  const caminho = `${perfil.user.id}/avatar.${extensao}`;

  const { error: erroUpload } = await supabase.storage
    .from('avatares')
    .upload(caminho, ficheiro, { cacheControl: '3600', upsert: true });

  if (erroUpload) {
    console.error('Erro ao carregar avatar:', erroUpload.message);
    return { erro: 'Não foi possível carregar a fotografia.' };
  }

  const { data: publico } = supabase.storage.from('avatares').getPublicUrl(caminho);
  // Adiciona um parâmetro de versão para invalidar caches de browser antigos
  const urlComVersao = `${publico.publicUrl}?v=${Date.now()}`;

  const { error: erroUpdate } = await supabase
    .from('users')
    .update({ avatar_url: urlComVersao })
    .eq('id', perfil.user.id);

  if (erroUpdate) {
    return { erro: 'Fotografia carregada, mas não foi possível associá-la ao perfil.' };
  }

  revalidatePath('/configuracoes');
  revalidatePath('/painel');
  return { sucesso: 'Fotografia de perfil atualizada.' };
}
