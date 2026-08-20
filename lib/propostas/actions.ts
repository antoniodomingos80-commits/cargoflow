'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient, getSessionProfile } from '@/lib/supabase/server';
import { garantirContaAtiva } from '@/lib/seguranca/conta';
import { traduzirErro } from '@/lib/erros';
import { parseAmount } from '@/lib/utils';

const propostaSchema = z.object({
  loadId: z.string().uuid(),
  tripId: z.string().uuid('Selecione a viagem.'),
  amount: z.coerce
    .number({ invalid_type_error: 'Indique o valor.' })
    .positive('O valor tem de ser maior que zero.')
    .max(1_000_000_000),
  message: z.string().max(1000).optional().or(z.literal('')),
});

export type EstadoProposta = {
  erro?: string;
  erros?: Record<string, string[]>;
  sucesso?: boolean;
  /** O valor é invulgar; a próxima submissão confirma-o */
  pedirConfirmacao?: boolean;
};

// =============================================================================
// Enviar proposta (transportador → carga)
// =============================================================================

export async function enviarProposta(
  _anterior: EstadoProposta,
  formData: FormData,
): Promise<EstadoProposta> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  if (perfil.user.verification !== 'APPROVED') {
    return {
      erro:
        'Só pode enviar propostas com a conta verificada. ' +
        'É o que dá confiança à outra parte.',
    };
  }

  const amountValue = parseAmount(formData.get('amount')) ?? formData.get('amount');

  const parsed = propostaSchema.safeParse({
    loadId: formData.get('loadId'),
    tripId: formData.get('tripId'),
    amount: amountValue,
    message: formData.get('message') || '',
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const supabase = createClient();

  // A viagem tem de ser desta empresa — o RLS impediria a inserção, mas
  // assim damos uma mensagem clara em vez de um erro genérico.
  const { data: viagem } = await supabase
    .from('trips')
    .select('id, tenant_id, available_weight_kg, minimum_price, status')
    .eq('id', d.tripId)
    .single();

  if (!viagem || viagem.tenant_id !== perfil.tenant.id) {
    return { erro: 'Viagem inválida.' };
  }
  if (!['PUBLISHED', 'PARTIALLY_BOOKED'].includes(viagem.status)) {
    return { erro: 'Esta viagem já não está disponível.' };
  }

  // NOTA: o preco minimo e so referencia (assim o diz o proprio formulario) -- ja nao bloqueia o envio.


  // A primeira palavra deve ser do transportador. O orçamento do comerciante
  // pode servir como referência para contexto, mas não deve ditar o preço
  // final nem forçar uma primeira proposta artificialmente baixa.
  const { data: carga } = await supabase
    .from('loads')
    .select('budget_amount')
    .eq('id', d.loadId)
    .single();

  // Mantém-se apenas para contexto, sem bloquear a proposta por estar acima
  // do orçamento indicado pelo comerciante.
  void carga;

  // Evitar propostas duplicadas pendentes para a mesma carga/viagem
  const { data: existente } = await supabase
    .from('offers')
    .select('id')
    .eq('load_id', d.loadId)
    .eq('trip_id', d.tripId)
    .eq('status', 'PENDING')
    .maybeSingle();

  if (existente) {
    return { erro: 'Já tem uma proposta pendente para esta carga.' };
  }

  const { error } = await supabase.from('offers').insert({
    load_id: d.loadId,
    trip_id: d.tripId,
    offered_by: perfil.user.id,
    amount: d.amount,
    currency: perfil.tenant.default_currency,
    message: d.message || null,
    status: 'PENDING',
    // 72h para responder — evita propostas eternamente pendentes que
    // bloqueiam capacidade de planeamento de ambos os lados.
    expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  });

  if (error) {
    return { erro: traduzirErro(error, 'enviar a proposta') };
  }

  revalidatePath(`/cargas/${d.loadId}`);
  return { sucesso: true };
}

// =============================================================================
// Enviar proposta (comerciante → viagem)
//
// Direção inversa da anterior: aqui é o comerciante que já viu uma viagem
// publicada no mercado (`/mercado/viagens/[id]`) e escolhe uma das suas
// próprias cargas para propor a essa viagem específica. As validações
// espelham as de enviarProposta, mas trocadas: aqui é a CARGA que tem de
// pertencer à empresa de quem submete, não a viagem.
// =============================================================================

export async function enviarPropostaParaViagem(
  _anterior: EstadoProposta,
  formData: FormData,
): Promise<EstadoProposta> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  if (perfil.user.verification !== 'APPROVED') {
    return {
      erro:
        'Só pode enviar propostas com a conta verificada. ' +
        'É o que dá confiança à outra parte.',
    };
  }

  const amountValue = parseAmount(formData.get('amount')) ?? formData.get('amount');

  const parsed = propostaSchema.safeParse({
    loadId: formData.get('loadId'),
    tripId: formData.get('tripId'),
    amount: amountValue,
    message: formData.get('message') || '',
  });

  if (!parsed.success) {
    return { erros: parsed.error.flatten().fieldErrors };
  }
  const d = parsed.data;

  const supabase = createClient();

  // Aqui é a CARGA que tem de ser desta empresa — o inverso de enviarProposta.
  const { data: carga } = await supabase
    .from('loads')
    .select('id, tenant_id, weight_kg, status')
    .eq('id', d.loadId)
    .single();

  if (!carga || carga.tenant_id !== perfil.tenant.id) {
    return { erro: 'Carga inválida.' };
  }
  if (!['PUBLISHED', 'NEGOTIATING'].includes(carga.status)) {
    return { erro: 'Esta carga já não está disponível para propostas.' };
  }

  const { data: viagem } = await supabase
    .from('trips')
    .select('id, available_weight_kg, minimum_price, status')
    .eq('id', d.tripId)
    .single();

  if (!viagem) return { erro: 'Viagem inválida.' };
  if (!['PUBLISHED', 'PARTIALLY_BOOKED'].includes(viagem.status)) {
    return { erro: 'Esta viagem já não está disponível.' };
  }
  if (Number(carga.weight_kg) > Number(viagem.available_weight_kg)) {
    return {
      erro: 'Esta viagem já não tem capacidade suficiente para esta carga.',
    };
  }
  // NOTA: idem -- so referencia, nao bloqueia o envio.


  // Evitar propostas duplicadas pendentes para a mesma carga/viagem
  const { data: existente } = await supabase
    .from('offers')
    .select('id')
    .eq('load_id', d.loadId)
    .eq('trip_id', d.tripId)
    .eq('status', 'PENDING')
    .maybeSingle();

  if (existente) {
    return { erro: 'Já tem uma proposta pendente para esta viagem.' };
  }

  const { error } = await supabase.from('offers').insert({
    load_id: d.loadId,
    trip_id: d.tripId,
    offered_by: perfil.user.id,
    amount: d.amount,
    currency: perfil.tenant.default_currency,
    message: d.message || null,
    status: 'PENDING',
    expires_at: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
  });

  if (error) {
    return { erro: traduzirErro(error, 'enviar a proposta') };
  }

  revalidatePath(`/mercado/viagens/${d.tripId}`);
  revalidatePath('/cargas');
  return { sucesso: true };
}

export async function rejeitarProposta(propostaId: string, motivo?: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  const supabase = createClient();
  const { error } = await supabase.rpc('cf_rejeitar_proposta', {
    p_offer_id: propostaId,
    p_motivo: motivo || null,
  });

  if (error) {
    throw new Error(error.message ?? 'Não foi possível rejeitar a proposta.');
  }

  revalidatePath('/cargas');
}

// =============================================================================
// Aceitar — chama a função atómica na base de dados
// =============================================================================

export async function aceitarProposta(propostaId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_aceitar_proposta', {
    p_offer_id: propostaId,
  });

  if (error) {
    // As mensagens da função são escritas para o utilizador final
    throw new Error(error.message ?? 'Não foi possível aceitar a proposta.');
  }

  revalidatePath('/cargas');
  revalidatePath('/viagens');
  revalidatePath('/mensagens');

  const resultado = Array.isArray(data) ? data[0] : data;
  return resultado as { agreement_id: string; conversation_id: string };
}

// =============================================================================
// Rejeitar / retirar
// =============================================================================

export async function retirarProposta(propostaId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  const supabase = createClient();
  const { error } = await supabase
    .from('offers')
    .update({ status: 'WITHDRAWN', responded_at: new Date().toISOString() })
    .eq('id', propostaId)
    .eq('offered_by', perfil.user.id)
    .eq('status', 'PENDING');

  if (error) throw new Error('Não foi possível retirar a proposta.');
  revalidatePath('/viagens');
}

// =============================================================================
// Contraproposta — o comerciante responde com outro valor
// =============================================================================

export async function contrapropor(
 _anterior: EstadoProposta,
  formData: FormData,
): Promise<EstadoProposta> {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  garantirContaAtiva(perfil);

  if (perfil.user.verification !== 'APPROVED') {
    return {
      erro: 'Só pode responder com contraproposta quando a conta estiver verificada.',
    };
  }

  const propostaId = formData.get('propostaId') as string;
  const valor = parseAmount(formData.get('amount')) ?? Number(formData.get('amount'));
  const mensagem = (formData.get('message') as string) || '';

  if (!propostaId || !valor || valor <= 0) {
    return { erro: 'Indique um valor válido.' };
  }

  const supabase = createClient();
  const { error } = await supabase.rpc('cf_contrapropor_proposta', {
    p_offer_id: propostaId,
    p_novo_valor: valor,
    p_mensagem: mensagem || null,
  });

  if (error) {
    return { erro: error.message ?? 'Não foi possível enviar a contraproposta.' };
  }

  revalidatePath('/cargas');
  revalidatePath('/viagens');
  revalidatePath('/mensagens');
  return { sucesso: true };
}



// =============================================================================
// Consultas
// =============================================================================

/** Propostas recebidas numa carga (vista do comerciante) */
export async function propostasDaCarga(cargaId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('cf_propostas_da_carga', {
    p_load_id: cargaId,
  });
  if (error) {
    console.error('Erro ao obter propostas:', error.message);
    return [];
  }
  return data ?? [];
}

/** Propostas enviadas pela empresa (vista do transportador) */
export async function minhasPropostas() {
  const supabase = createClient();
  const { data } = await supabase
    .from('offers')
    .select(`
      id, amount, currency, message, status, created_at, expires_at,
      load:loads (
        id, reference, title, weight_kg, pickup_from, pickup_until, status,
        origin:locations!loads_origin_id_fkey (city),
        destination:locations!loads_destination_id_fkey (city)
      )
    `)
    .order('created_at', { ascending: false })
    .limit(50);
  return data ?? [];
}
