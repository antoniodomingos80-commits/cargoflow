'use client';

import { useActionState } from 'react';
import { formatCurrency } from '@/lib/utils';
import {
  gerarReferenciaMulticaixa,
  iniciarPagamentoStripe,
  type EstadoPagamento,
} from '@/lib/pagamentos/actions';

const estadoInicial: EstadoPagamento = {};

type Props = {
  agreementId: string;
  referenciaCarga: string;
  tituloCarga: string;
  referenciaViagem: string;
  valor: number;
  moeda: string;
};

export function CartaoPagamento({
  agreementId,
  referenciaCarga,
  tituloCarga,
  referenciaViagem,
  valor,
  moeda,
}: Props) {
  const [estadoMcx, formMcx] = useActionState(gerarReferenciaMulticaixa, estadoInicial);

  return (
    <article className="cf-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Acordo</p>
          <h3 className="mt-1 font-semibold text-navy-600">{referenciaCarga}</h3>
          <p className="mt-1 text-sm text-slate-600">{tituloCarga}</p>
          <p className="mt-1 text-xs text-slate-500">Viagem {referenciaViagem}</p>
        </div>

        <p className="text-xl font-bold text-brand-500">{formatCurrency(valor, moeda)}</p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <form action={iniciarPagamentoStripe}>
          <input type="hidden" name="agreementId" value={agreementId} />
          <button
            type="submit"
            className="rounded-lg bg-brand-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600"
          >
            Pagar com Stripe
          </button>
        </form>

        <form action={formMcx}>
          <input type="hidden" name="agreementId" value={agreementId} />
          <button
            type="submit"
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-navy-600 transition-colors hover:bg-slate-50"
          >
            Gerar referência Multicaixa
          </button>
        </form>
      </div>

      {estadoMcx.erro && (
        <p role="alert" className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {estadoMcx.erro}
        </p>
      )}

      {estadoMcx.referencia && (
        <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          <p className="font-semibold text-navy-600">Referência Multicaixa</p>
          <p className="mt-1">Entidade: <strong>{estadoMcx.referencia.entidade}</strong></p>
          <p>Referência: <strong>{estadoMcx.referencia.referencia}</strong></p>
          <p>Valor: <strong>{formatCurrency(estadoMcx.referencia.valor, estadoMcx.referencia.moeda)}</strong></p>
          <p className="mt-1 text-xs text-slate-500">
            Expira em {new Date(estadoMcx.referencia.expiraEm).toLocaleString('pt-AO')}.
          </p>
        </div>
      )}
    </article>
  );
}