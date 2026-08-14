import { NextResponse } from 'next/server';
import { atualizarPagamentoInterno } from '@/lib/pagamentos/actions';

type CallbackBody = {
  referencia?: string;
  reference?: string;
  estado?: string;
  status?: string;
  transacaoId?: string;
  transactionId?: string;
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

  // Em produção, o segredo é obrigatório — sem ele, qualquer pessoa que
  // descubra este endpoint poderia marcar pagamentos como pagos. Antes
  // disto, o segredo era opcional (só validava SE estivesse definido),
  // o que era aceitável só enquanto se testava sem processador real
  // ligado. Continua opcional fora de produção, para não travar testes
  // locais/preview sem a variável configurada.
  if (process.env.NODE_ENV === 'production' && !callbackSecret) {
    console.error('MULTICAIXA_CALLBACK_SECRET não configurado em produção — a recusar callback.');
    return NextResponse.json({ error: 'Endpoint não configurado.' }, { status: 503 });
  }

  if (callbackSecret && suppliedSecret !== callbackSecret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const body = (await request.json()) as CallbackBody;
  const referencia = String(body.referencia || body.reference || '').trim();

  if (!referencia) {
    return NextResponse.json({ error: 'Referência em falta.' }, { status: 400 });
  }

  await atualizarPagamentoInterno({
    provider: 'MULTICAIXA',
    externalReference: referencia,
    externalId: String(body.transacaoId || body.transactionId || '').trim() || null,
    status: mapEstado(body.estado || body.status),
    rawPayload: body as unknown as Record<string, unknown>,
  });

  return NextResponse.json({ ok: true });
}