import { NextResponse } from 'next/server';
import { atualizarPagamentoInterno } from '@/lib/pagamentos/actions';

type CallbackBody = {
  referencia?: string;
  estado?: string;
  transacaoId?: string;
};

function mapEstado(estado?: string): 'PENDING' | 'PAID' | 'FAILED' | 'CANCELLED' | 'EXPIRED' {
  const normalizado = String(estado || '').toUpperCase();
  if (['PAID', 'PAGO', 'SUCCESS', 'SUCESSO'].includes(normalizado)) return 'PAID';
  if (['FAILED', 'FALHOU', 'ERRO'].includes(normalizado)) return 'FAILED';
  if (['CANCELLED', 'CANCELADO'].includes(normalizado)) return 'CANCELLED';
  if (['EXPIRED', 'EXPIRADO'].includes(normalizado)) return 'EXPIRED';
  return 'PENDING';
}

export async function POST(request: Request) {
  const callbackSecret = process.env.MULTICAIXA_CALLBACK_SECRET;
  const suppliedSecret = request.headers.get('x-callback-secret');

  if (callbackSecret && suppliedSecret !== callbackSecret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const body = (await request.json()) as CallbackBody;
  const referencia = body.referencia;

  if (!referencia) {
    return NextResponse.json({ error: 'Referência em falta.' }, { status: 400 });
  }

  await atualizarPagamentoInterno({
    provider: 'MULTICAIXA',
    externalReference: referencia,
    externalId: body.transacaoId || null,
    status: mapEstado(body.estado),
    rawPayload: body as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}