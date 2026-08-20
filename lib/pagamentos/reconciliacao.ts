/**
 * Reconciliação de pagamentos — NÃO é uma Server Action.
 *
 * Vive fora de `lib/pagamentos/actions.ts` de propósito. Nesse ficheiro existe
 * `'use server'`, e aí cada export torna-se um endpoint HTTP invocável pelo
 * browser — o que significava que esta função, que aceita `status: 'PAID'` e
 * escreve com a chave de serviço (ignorando RLS), estava exposta ao cliente
 * sem qualquer autenticação. Qualquer pessoa podia marcar um pagamento como
 * pago.
 *
 * Ao viver num módulo simples, só é alcançável a partir de código de servidor:
 * os dois route handlers de webhook, que autenticam a origem por assinatura
 * (Stripe) e por `x-callback-secret` (Multicaixa).
 *
 * Nunca importar isto de um componente com `'use client'`.
 */

import { createAdminClient } from '@/lib/supabase/server';

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
