'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { enviarPropostaParaViagem, type EstadoProposta } from '@/lib/propostas/actions';
import { Button } from '@/components/ui/button';
import { InputMoeda } from '@/components/ui/input-moeda';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { Send, X, CheckCircle2, AlertCircle } from 'lucide-react';

const estadoInicial: EstadoProposta = {};

function BotaoEnviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending}>
      <Send className="h-4 w-4" aria-hidden="true" />
      Enviar proposta
    </Button>
  );
}

/**
 * Envio de proposta a partir de uma viagem.
 *
 * Espelha o DialogoProposta (transportador → carga), na direção inversa:
 * o comerciante escolhe qual das suas cargas por transportar quer propor
 * para esta viagem específica.
 */
export function DialogoPropostaViagem({
  tripId,
  tripReferencia,
  precoMinimo,
  moeda,
  cargas,
}: {
  tripId: string;
  tripReferencia: string;
  precoMinimo: number | null;
  moeda: string;
  cargas: { id: string; reference: string; title: string; weight_kg: number }[];
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useActionState(enviarPropostaParaViagem, estadoInicial);

  if (estado.sucesso) {
    return (
      <div className="cf-card border-green-200 bg-green-50/60 p-5 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" aria-hidden="true" />
        <p className="mt-3 font-semibold text-navy-600">Proposta enviada</p>
        <p className="mt-1 text-sm text-slate-600">
          O transportador foi notificado. Pode falar com ele nas mensagens.
        </p>
      </div>
    );
  }

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)} disabled={cargas.length === 0}>
        <Send className="h-4 w-4" aria-hidden="true" />
        {cargas.length === 0 ? 'Sem cargas compatíveis' : 'Propor esta carga'}
      </Button>
    );
  }

  return (
    <div className="cf-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-navy-600">Propor transporte</h3>
          <p className="mt-0.5 text-xs text-slate-500">{tripReferencia}</p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-navy-600"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form action={formAction} className="mt-5 space-y-4">
        <input type="hidden" name="tripId" value={tripId} />

        {estado.erro && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{estado.erro}</span>
          </div>
        )}

        <div className="space-y-1.5">
          <label htmlFor="loadId" className="block text-sm font-medium text-navy-600">
            Que carga?
          </label>
          <select
            id="loadId"
            name="loadId"
            required
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {cargas.map((c) => (
              <option key={c.id} value={c.id}>
                {c.reference} · {c.title} ({c.weight_kg} kg)
              </option>
            ))}
          </select>
          {estado.erros?.loadId && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {estado.erros.loadId[0]}
            </p>
          )}
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Proponha um valor que reflita o orçamento real da carga — o preço mínimo do
          transportador serve apenas como referência.
        </div>

        <InputMoeda
          label="O seu preço (Kz)"
          name="amount"
          required
          placeholder="Ex.: 420 000"
          hint={
            precoMinimo
              ? `O transportador pediu no mínimo ${formatCurrency(precoMinimo, moeda)}.`
              : 'Proponha o seu valor com base no orçamento da carga.'
          }
          error={estado.erros?.amount?.[0]}
        />

        <Textarea
          label="Mensagem"
          name="message"
          maxLength={1000}
          rows={3}
          placeholder="Ex.: A carga está pronta para recolha já amanhã."
          hint="Uma mensagem pessoal aumenta muito a probabilidade de ser aceite."
          error={estado.erros?.message?.[0]}
        />

        <BotaoEnviar />
      </form>
    </div>
  );
}
