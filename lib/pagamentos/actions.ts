'use server';

import { randomInt } from 'node:crypto';
import { redirect } from 'next/navigation';
import Stripe from 'stripe';
import { createAdminClient, createClient, getSessionProfile } from '@/lib/supabase/server';
import { criarReferenciaExterna } from '@/lib/pagamentos/appypay';

type AcordoPagamento = {
  id: string;
  agreed_amount: number;
  platform_fee: number;
  currency: string;
  created_at: string;
  load: {
    id: string;
    reference: string;
    title: string;
    tenant_id: string;
  } | null;
  trip: {
    id: string;
    reference: string;
    tenant_id: string;
  } | null;
};

export type ReferenciaMulticaixa = {
  entidade: string;
  referencia: string;
  valor: number;
  moeda: string;
  expiraEm: string;
};

export type EstadoPagamento = {
  erro?: string;
  sucesso?: string;
  referencia?: ReferenciaMulticaixa;
};

export type EstadoKycPagamentos = {
  bloqueado: boolean;
  mensagem: string;
};

export type PagamentoHistorico = {
  id: string;
  agreement_id: string;
  provider: 'STRIPE' | 'MULTICAIXA';
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  amount: number;
  currency: string;
  external_reference: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  paid_at: string | null;
  expires_at: string | null;
};

const baseQuery = `
  id,
  agreed_amount,
  platform_fee,
  currency,
  created_at,
  load:loads!inner (id, reference, title, tenant_id),
  trip:trips!inner (id, reference, tenant_id)
`;

function valorCobranca(acordo: AcordoPagamento) {
  const fee = Number(acordo.platform_fee || 0);
  if (fee > 0) return fee;
  return Number(acordo.agreed_amount || 0);
}

export async function estadoKycPagamentos(): Promise<EstadoKycPagamentos> {
  const perfil = await getSessionProfile();
  if (!perfil) {
    return { bloqueado: true, mensagem: 'Inicie sessão para aceder aos pagamentos.' };
  }

  if (perfil.user.verification !== 'APPROVED') {
    return {
      bloqueado: true,
      mensagem: 'Complete a verificação da conta para desbloquear pagamentos.',
    };
  }

  return { bloqueado: false, mensagem: '' };
}

export async function listarAcordosParaPagamento() {
  const perfil = await getSessionProfile();
  if (!perfil || perfil.user.verification !== 'APPROVED') return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('agreements')
    .select(baseQuery)
    .order('created_at', { ascending: false })
    .limit(100);

  if (error || !data) return [];

  return (data as unknown as AcordoPagamento[]).filter((a) => {
    if (!a.load || !a.trip) return false;
    return a.load.tenant_id === perfil.tenant.id || a.trip.tenant_id === perfil.tenant.id;
  });
}

export async function listarHistoricoPagamentos(): Promise<PagamentoHistorico[]> {
  const perfil = await getSessionProfile();
  if (!perfil) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from('payments')
    .select(
      'id, agreement_id, provider, status, amount, currency, external_reference, metadata, created_at, paid_at, expires_at',
    )
    .eq('tenant_id', perfil.tenant.id)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error || !data) return [];
  return data as PagamentoHistorico[];
}

async function obterAcordoAutorizado(agreementId: string) {
  const perfil = await getSessionProfile();
  if (!perfil) return null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from('agreements')
    .select(baseQuery)
    .eq('id', agreementId)
    .single();

  if (error || !data) return null;

  const acordo = data as unknown as AcordoPagamento;
  const autorizado =
    acordo.load?.tenant_id === perfil.tenant.id || acordo.trip?.tenant_id === perfil.tenant.id;

  if (!autorizado) return null;
  return { perfil, acordo };
}

async function inserirPagamento(pagamento: {
  agreementId: string;
  tenantId: string;
  provider: 'STRIPE' | 'MULTICAIXA';
  amount: number;
  currency: string;
  status?: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  externalId?: string | null;
  externalReference?: string | null;
  meta?: Record<string, unknown>;
  expiresAt?: string | null;
}) {
  const supabase = createClient();
  const { data } = await supabase
    .from('payments')
    .insert({
      agreement_id: pagamento.agreementId,
      tenant_id: pagamento.tenantId,
      provider: pagamento.provider,
      status: pagamento.status ?? 'PENDING',
      amount: pagamento.amount,
      currency: pagamento.currency,
      external_id: pagamento.externalId ?? null,
      external_reference: pagamento.externalReference ?? null,
      metadata: pagamento.meta ?? {},
      expires_at: pagamento.expiresAt ?? null,
    })
    .select('id')
    .single();

  return data?.id ?? null;
}

export async function iniciarPagamentoStripe(formData: FormData) {
  const agreementId = String(formData.get('agreementId') || '');
  if (!agreementId) redirect('/pagamentos?erro=acordo_invalido');

  const auth = await obterAcordoAutorizado(agreementId);
  if (!auth) redirect('/pagamentos?erro=sem_permissao');

  const { perfil, acordo } = auth;
  if (perfil.user.verification !== 'APPROVED') {
    redirect('/pagamentos?erro=kyc_pendente');
  }

  const amount = valorCobranca(acordo);
  if (amount <= 0) redirect('/pagamentos?erro=valor_invalido');

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) redirect('/pagamentos?erro=stripe_nao_configurado');

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
  const stripe = new Stripe(secretKey);

  const pagamentoId = await inserirPagamento({
    agreementId: acordo.id,
    tenantId: perfil.tenant.id,
    provider: 'STRIPE',
    amount,
    currency: acordo.currency || 'AOA',
    meta: {
      load_reference: acordo.load?.reference ?? '',
      trip_reference: acordo.trip?.reference ?? '',
    },
  });

  const stripeMeta = {
    agreement_id: acordo.id,
    tenant_id: perfil.tenant.id,
    tenant_name: perfil.tenant.name,
    load_reference: acordo.load?.reference ?? '',
    trip_reference: acordo.trip?.reference ?? '',
    payment_id: pagamentoId ?? '',
    provider: 'stripe',
  };

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    success_url: `${baseUrl}/pagamentos?sucesso=stripe`,
    cancel_url: `${baseUrl}/pagamentos?cancelado=stripe`,
    customer_email: perfil.user.email ?? undefined,
    metadata: stripeMeta,
    payment_intent_data: {
      metadata: stripeMeta,
    },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: (acordo.currency || 'AOA').toLowerCase(),
          unit_amount: Math.round(amount * 100),
          product_data: {
            name: `CargoFlow · Acordo ${acordo.load?.reference ?? acordo.id}`,
            description: `Pagamento do acordo ${acordo.id}`,
          },
        },
      },
    ],
  });

  if (!session.url) redirect('/pagamentos?erro=stripe_sem_url');
  redirect(session.url);
}

export async function gerarReferenciaMulticaixa(
  _estadoAnterior: EstadoPagamento,
  formData: FormData,
): Promise<EstadoPagamento> {
  const agreementId = String(formData.get('agreementId') || '');
  if (!agreementId) return { erro: 'Acordo inválido.' };

  const auth = await obterAcordoAutorizado(agreementId);
  if (!auth) return { erro: 'Sem permissão para este acordo.' };

  const { perfil, acordo } = auth;
  if (perfil.user.verification !== 'APPROVED') {
    return { erro: 'Complete a verificação da conta para desbloquear pagamentos.' };
  }

  const valor = valorCobranca(acordo);
  if (valor <= 0) return { erro: 'Este acordo não tem valor para cobrança.' };

  const expira = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
  const referenciaInterna = `CF-${acordo.load?.reference ?? acordo.id}`;

  // Tenta sempre criar a referência a sério junto do processador (AppyPay)
  // primeiro — é a única forma de a referência funcionar de facto quando
  // um cliente tentar pagá-la num ATM/app real. Só cai para geração
  // local (aleatória, "de teste") quando a AppyPay não está configurada
  // — é o que acontece hoje, e é o que mantém o resto da aplicação
  // testável sem depender de credenciais reais.
  const externa = await criarReferenciaExterna(
    Number(valor.toFixed(2)),
    referenciaInterna,
    `Acordo ${acordo.load?.reference ?? acordo.id}`,
  );

  const entidade = externa?.entidade ?? process.env.MULTICAIXA_ENTITY ?? '11333';
  const referencia = externa?.referencia ?? String(randomInt(100000000, 999999999));
  const modoTeste = !externa;

  await inserirPagamento({
    agreementId: acordo.id,
    tenantId: perfil.tenant.id,
    provider: 'MULTICAIXA',
    amount: Number(valor.toFixed(2)),
    currency: acordo.currency || 'AOA',
    externalId: externa?.idExterno ?? null,
    externalReference: referencia,
    expiresAt: expira,
    meta: {
      entidade,
      modo_teste: modoTeste,
      load_reference: acordo.load?.reference ?? '',
      trip_reference: acordo.trip?.reference ?? '',
    },
  });

  return {
    sucesso: modoTeste
      ? 'Referência de teste gerada (processador ainda não ligado). Pode simular a confirmação, mas não é válida num ATM real.'
      : 'Referência gerada. Pode pagar no Multicaixa Express ou ATM.',
    referencia: {
      entidade,
      referencia,
      valor: Number(valor.toFixed(2)),
      moeda: acordo.currency || 'AOA',
      expiraEm: expira,
    },
  };
}

export async function atualizarPagamentoInterno(params: {
  paymentId?: string | null;
  provider: 'STRIPE' | 'MULTICAIXA';
  externalId?: string | null;
  externalReference?: string | null;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED';
  rawPayload?: Record<string, unknown>;
}) {
  const admin = createAdminClient();
  const agora = new Date().toISOString();

  let lookup = admin
    .from('payments')
    .select('id, metadata, paid_at, external_id')
    .eq('provider', params.provider)
    .order('created_at', { ascending: false })
    .limit(1);

  if (params.paymentId) lookup = lookup.eq('id', params.paymentId);
  else if (params.externalReference) lookup = lookup.eq('external_reference', params.externalReference);
  else if (params.externalId) lookup = lookup.eq('external_id', params.externalId);
  else return;

  const { data: rows, error: lookupError } = await lookup;
  if (lookupError || !rows || rows.length === 0) {
    if (lookupError) console.error('Erro ao procurar pagamento:', lookupError.message);
    return;
  }

  const atual = rows[0] as {
    id: string;
    metadata: Record<string, unknown> | null;
    paid_at: string | null;
    external_id: string | null;
  };

  const metadataAtual =
    atual.metadata && typeof atual.metadata === 'object' && !Array.isArray(atual.metadata)
      ? atual.metadata
      : {};

  const metadata = {
    ...metadataAtual,
    reconciliation: {
      provider: params.provider,
      status: params.status,
      updated_at: agora,
      external_id: params.externalId ?? atual.external_id,
    },
    ...(params.rawPayload
      ? {
          provider_payload: {
            ...((metadataAtual.provider_payload as Record<string, unknown> | undefined) ?? {}),
            [agora]: params.rawPayload,
          },
        }
      : {}),
  };

  const { error } = await admin
    .from('payments')
    .update({
      status: params.status,
      external_id: params.externalId ?? atual.external_id,
      metadata,
      paid_at: params.status === 'PAID' ? agora : atual.paid_at,
      updated_at: agora,
    })
    .eq('id', atual.id);

  if (error) console.error('Erro ao atualizar pagamento:', error.message);
}