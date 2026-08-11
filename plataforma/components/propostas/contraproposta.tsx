'use client';

import { useState } from 'react';
import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { contrapropor, type EstadoProposta } from '@/lib/propostas/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/utils';
import { AlertCircle, CheckCircle2, Send, X } from 'lucide-react';

const estadoInicial: EstadoProposta = {};

function BotaoEnviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" block loading={pending}>
      <Send className="h-4 w-4" aria-hidden="true" />
      Enviar contraproposta
    </Button>
  );
}

export function Contraproposta({
  propostaId,
  moeda,
  valorAtual,
}: {
  propostaId: string;
  moeda: string;
  valorAtual: number;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useActionState(contrapropor, estadoInicial);

  if (estado.sucesso) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          <span>Contraproposta enviada.</span>
        </div>
      </div>
    );
  }

  if (!aberto) {
    return (
      <Button type="button" variant="outline" size="sm" block onClick={() => setAberto(true)}>
        Propor novo preco
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-navy-600">Propor novo preco</p>
          <p className="text-xs text-slate-500">
            O transportador recebe uma nova proposta com o valor que quiser.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded-lg p-1.5 text-slate-400 hover:bg-white hover:text-navy-600"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <form action={formAction} className="mt-3 space-y-3">
        <input type="hidden" name="propostaId" value={propostaId} />

        {estado.erro && (
          <div role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{estado.erro}</span>
          </div>
        )}

        <Input
          label="Novo preco (Kz)"
          name="amount"
          type="number"
          min={1000}
          step={1000}
          defaultValue={valorAtual}
          required
          hint={`A proposta atual esta em ${formatCurrency(valorAtual, moeda)}.`}
          error={estado.erros?.amount?.[0]}
        />

        <Textarea
          label="Mensagem"
          name="message"
          rows={3}
          maxLength={1000}
          placeholder="Explique por que valor esta a ajustar a oferta."
          error={estado.erros?.message?.[0]}
        />

        <BotaoEnviar />
      </form>
    </div>
  );
}
