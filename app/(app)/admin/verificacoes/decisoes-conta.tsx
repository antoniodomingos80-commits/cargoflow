'use client';

import { useState, useTransition } from 'react';
import { AlertCircle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { decidirVerificacao } from '@/lib/admin/actions';

/**
 * Aprovar ou rejeitar uma conta.
 *
 * Aprovar pede confirmação porque abre a plataforma inteira a essa conta e não
 * se desfaz com um clique. Rejeitar exige motivo escrito, pelo mesmo princípio
 * das decisões sobre documentos: o utilizador tem de saber o que corrigir.
 */
export function DecisoesConta({
  utilizadorId,
  nome,
  documentosPendentes,
}: {
  utilizadorId: string;
  nome: string;
  documentosPendentes: string[];
}) {
  const [modo, setModo] = useState<'nada' | 'confirmar' | 'rejeitar'>('nada');
  const [motivo, setMotivo] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pendente, iniciar] = useTransition();

  function decidir(aprovar: boolean, texto?: string) {
    setErro(null);
    iniciar(async () => {
      try {
        await decidirVerificacao(utilizadorId, aprovar, texto, documentosPendentes);
        setModo('nada');
        setMotivo('');
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Não foi possível registar a decisão.');
      }
    });
  }

  const aviso = erro ? (
    <p role="alert" className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600">
      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {erro}
    </p>
  ) : null;

  if (modo === 'confirmar') {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <p className="text-sm leading-relaxed text-slate-600">
          Aprovar <span className="font-semibold text-navy-600">{nome}</span> dá
          acesso a publicar, negociar e transacionar.{' '}
          {documentosPendentes.length > 0
            ? `Serão aprovados ${documentosPendentes.length} documento${documentosPendentes.length === 1 ? '' : 's'} pendente${documentosPendentes.length === 1 ? '' : 's'}.`
            : 'Nenhum documento é abrangido por esta decisão.'}
        </p>
        {aviso}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button size="sm" loading={pendente} onClick={() => decidir(true)}>
            Confirmar aprovação
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setModo('nada')}>
            Cancelar
          </Button>
        </div>
      </div>
    );
  }

  if (modo === 'rejeitar') {
    return (
      <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
        <Textarea
          label="Motivo da rejeição"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          rows={3}
          required
          hint="Esta mensagem é mostrada ao utilizador."
          placeholder="Ex.: o bilhete de identidade está ilegível e o NIF não corresponde ao da empresa."
        />
        {aviso}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="danger"
            loading={pendente}
            disabled={motivo.trim().length < 5}
            onClick={() => decidir(false, motivo)}
          >
            Confirmar rejeição
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              setModo('nada');
              setMotivo('');
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
        <Button size="sm" onClick={() => setModo('confirmar')}>
          <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
          Aprovar
        </Button>
        <Button size="sm" variant="danger" onClick={() => setModo('rejeitar')}>
          <XCircle className="h-4 w-4" aria-hidden="true" />
          Rejeitar
        </Button>
      </div>
      {aviso}
    </div>
  );
}
