'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { enviarProposta, type EstadoProposta } from '@/lib/propostas/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
 * Envio de proposta a partir de uma carga.
 *
 * O transportador escolhe qual das suas viagens quer usar — normalmente é
 * óbvio (vem de uma correspondência), mas pode ter mais do que uma a servir.
 */
export function DialogoProposta({
  cargaId,
  cargaReferencia,
  orcamento,
  moeda,
  viagens,
  viagemSugerida,
}: {
  cargaId: string;
  cargaReferencia: string;
  orcamento: number | null;
  moeda: string;
  viagens: { id: string; reference: string; departure_at: string }[];
  viagemSugerida?: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useFormState(enviarProposta, estadoInicial);

  if (estado.sucesso) {
    return (
      <div className="cf-card border-green-200 bg-green-50/60 p-5 text-center">
        <CheckCircle2 className="mx-auto h-8 w-8 text-green-500" aria-hidden="true" />
        <p className="mt-3 font-semibold text-navy-600">Proposta enviada</p>
        <p className="mt-1 text-sm text-slate-600">
          O comerciante foi notificado. Pode falar com ele nas mensagens.
        </p>
      </div>
    );
  }

  if (!aberto) {
    return (
      <Button onClick={() => setAberto(true)} disabled={viagens.length === 0}>
        <Send className="h-4 w-4" aria-hidden="true" />
        {viagens.length === 0 ? 'Sem viagens disponíveis' : 'Enviar proposta'}
      </Button>
    );
  }

  return (
    <div className="cf-card p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-navy-600">Propor transporte</h3>
          <p className="mt-0.5 text-xs text-slate-500">{cargaReferencia}</p>
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
        <input type="hidden" name="loadId" value={cargaId} />
        {/* A submissão seguinte confirma um valor que o servidor achou invulgar */}
        {estado.pedirConfirmacao && (
          <input type="hidden" name="confirmarValor" value="sim" />
        )}

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
          <label htmlFor="tripId" className="block text-sm font-medium text-navy-600">
            Com que viagem?
          </label>
          <select
            id="tripId"
            name="tripId"
            required
            defaultValue={viagemSugerida}
            className="w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            {viagens.map((v) => (
              <option key={v.id} value={v.id}>
                {v.reference} · parte{' '}
                {new Date(v.departure_at).toLocaleDateString('pt-AO', {
                  day: '2-digit',
                  month: 'short',
                })}
              </option>
            ))}
          </select>
          {estado.erros?.tripId && (
            <p role="alert" className="text-xs font-medium text-red-600">
              {estado.erros.tripId[0]}
            </p>
          )}
        </div>

        <Input
          label="O seu preço (Kz)"
          name="amount"
          type="number"
          min={1}
          step={1000}
          required
          defaultValue={orcamento ?? undefined}
          hint={
            orcamento
              ? `O comerciante indicou ${formatCurrency(orcamento, moeda)} como orçamento.`
              : 'O comerciante não indicou orçamento — proponha o seu valor.'
          }
          error={estado.erros?.amount?.[0]}
        />

        <Textarea
          label="Mensagem"
          name="message"
          maxLength={1000}
          rows={3}
          placeholder="Ex.: Posso recolher amanhã de manhã. Tenho experiência com este tipo de carga."
          hint="Uma mensagem pessoal aumenta muito a probabilidade de ser aceite."
          error={estado.erros?.message?.[0]}
        />

        <BotaoEnviar />
      </form>
    </div>
  );
}
