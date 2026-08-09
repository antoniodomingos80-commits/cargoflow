'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useFormState, useFormStatus } from 'react-dom';
import {
  convidarTransportador,
  type EstadoConvite,
} from '@/lib/correspondencias/actions';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Send, X, CheckCircle2, AlertCircle, MessageSquare } from 'lucide-react';

const estadoInicial: EstadoConvite = {};

function BotaoEnviar() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" block loading={pending}>
      <Send className="h-3.5 w-3.5" aria-hidden="true" />
      Enviar contacto
    </Button>
  );
}

/**
 * Contacto do comerciante a um transportador sugerido.
 *
 * Não é uma proposta com valor — é um convite. Quem tem o camião conhece os
 * seus custos e é quem deve pôr o preço; o comerciante limita-se a dizer
 * "tenho isto, tem interesse?". Também evita a situação incómoda de o
 * comerciante ancorar um valor baixo antes de a outra parte ter falado.
 */
export function BotaoContactar({
  cargaId,
  tripId,
  nomeTransportador,
}: {
  cargaId: string;
  tripId: string;
  nomeTransportador: string;
}) {
  const [aberto, setAberto] = useState(false);
  const [estado, formAction] = useFormState(convidarTransportador, estadoInicial);

  if (estado.sucesso) {
    return (
      <div className="mt-3 text-right">
        <p className="flex items-center justify-end gap-1.5 text-xs font-medium text-green-700">
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          Contacto enviado
        </p>
        <Link
          href="/mensagens"
          className="mt-1 inline-flex items-center gap-1 text-xs text-brand-600 hover:underline"
        >
          <MessageSquare className="h-3 w-3" aria-hidden="true" />
          Ver conversa
        </Link>
      </div>
    );
  }

  if (!aberto) {
    return (
      <Button size="sm" className="mt-3" onClick={() => setAberto(true)}>
        <Send className="h-3.5 w-3.5" aria-hidden="true" />
        Contactar
      </Button>
    );
  }

  return (
    <form action={formAction} className="mt-3 w-72 space-y-3 text-left">
      <input type="hidden" name="loadId" value={cargaId} />
      <input type="hidden" name="tripId" value={tripId} />

      <div className="flex items-start justify-between gap-2">
        <p className="text-xs text-slate-500">
          Mensagem para <span className="font-medium text-navy-600">{nomeTransportador}</span>
        </p>
        <button
          type="button"
          onClick={() => setAberto(false)}
          className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-navy-600"
          aria-label="Cancelar"
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>

      {estado.erro && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>{estado.erro}</span>
        </p>
      )}

      <Textarea
        name="message"
        rows={3}
        maxLength={1000}
        placeholder="Ex.: A carga está pronta a partir de segunda. Consegue passar por Benguela?"
        hint="Deixe em branco para enviar uma mensagem padrão. O preço é proposto por ele."
      />

      <BotaoEnviar />
    </form>
  );
}
