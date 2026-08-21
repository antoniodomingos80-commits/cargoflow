'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, RotateCcw, Search, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { decidirDocumentoAvulso, type DecisaoDocumento } from '@/lib/admin/actions';

/**
 * As decisões sobre um documento.
 *
 * Aprovar e marcar em análise são reversíveis e imediatas. Rejeitar e pedir
 * nova submissão exigem um motivo escrito — é o que o utilizador vai ler, e
 * "documentação incompleta" sem mais nada não lhe diz o que corrigir. Por isso
 * abrem um campo em vez de agirem à primeira.
 */
export function DecisoesDocumento({
  documentoId,
  emAnalise,
}: {
  documentoId: string;
  emAnalise: boolean;
}) {
  const [aPedirMotivo, setAPedirMotivo] = useState<DecisaoDocumento | null>(null);
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function decidir(decisao: DecisaoDocumento, texto?: string) {
    setErro(null);
    iniciar(async () => {
      try {
        await decidirDocumentoAvulso(documentoId, decisao, texto);
        setAPedirMotivo(null);
        setMotivo('');
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível registar a decisão.');
      }
    });
  }

  if (aPedirMotivo) {
    const aRejeitar = aPedirMotivo === 'REJEITAR';
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <Textarea
          label={aRejeitar ? 'Motivo da rejeição' : 'O que precisa de ser reenviado'}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          required
          hint="Esta mensagem é mostrada ao utilizador."
          placeholder={
            aRejeitar
              ? 'Ex.: o documento apresentado não corresponde ao tipo indicado.'
              : 'Ex.: a fotografia está cortada e o número não se lê.'
          }
        />

        {erro && (
          <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {erro}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={aRejeitar ? 'danger' : 'secondary'}
            loading={pendente}
            disabled={motivo.trim().length < 5}
            onClick={() => decidir(aPedirMotivo, motivo)}
          >
            Confirmar {aRejeitar ? 'rejeição' : 'pedido'}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setAPedirMotivo(null);
              setMotivo('');
              setErro(null);
            }}
          >
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={pendente} onClick={() => decidir('APROVAR')}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Aprovar
        </Button>

        {!emAnalise && (
          <Button
            size="sm"
            variant="outline"
            loading={pendente}
            onClick={() => decidir('EM_ANALISE')}
          >
            <Search className="h-4 w-4" aria-hidden="true" />
            Marcar em análise
          </Button>
        )}

        <Button size="sm" variant="outline" onClick={() => setAPedirMotivo('REENVIAR')}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Pedir nova submissão
        </Button>

        <Button size="sm" variant="danger" onClick={() => setAPedirMotivo('REJEITAR')}>
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Rejeitar
        </Button>
      </div>

      {erro && (
        <p role="alert" className="mt-2 flex items-center gap-1.5 text-xs font-medium text-red-600">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {erro}
        </p>
      )}
    </div>
  );
}
