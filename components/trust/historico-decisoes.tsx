import { Bot } from 'lucide-react';
import { Badge, type TomBadge } from '@/components/ui/badge';
import type { DecisaoRegistada } from '@/lib/admin/actions';
import { VERIFICATION_STATUS_LABELS, type VerificationStatus } from '@/lib/types';

/**
 * Histórico de decisões sobre uma conta.
 *
 * Mostra o antes e o depois de cada decisão, quem a tomou e porquê. Quando não
 * há administrador, a decisão foi do sistema — tipicamente uma expiração por
 * validade — e isso é dito, não escondido atrás de um nome inventado.
 */
const ACCOES: Record<string, { rotulo: string; tom: TomBadge }> = {
  DOCUMENT_APPROVED: { rotulo: 'Documento aprovado', tom: 'positivo' },
  DOCUMENT_REJECTED: { rotulo: 'Documento rejeitado', tom: 'perigo' },
  DOCUMENT_EXPIRED: { rotulo: 'Documento expirado', tom: 'alerta' },
  VERIFICATION_APPROVED: { rotulo: 'Conta aprovada', tom: 'positivo' },
  VERIFICATION_REJECTED: { rotulo: 'Conta rejeitada', tom: 'perigo' },
  USER_BLOCKED: { rotulo: 'Conta bloqueada', tom: 'perigo' },
  USER_UNBLOCKED: { rotulo: 'Bloqueio levantado', tom: 'positivo' },
  TRUST_SCORE_RECALCULATED: { rotulo: 'Pontuação recalculada', tom: 'neutro' },
  VERIFICATION_REQUIREMENTS_UPDATED: { rotulo: 'Requisitos alterados', tom: 'neutro' },
};

function estado(valor: string | null) {
  if (!valor) return null;
  return VERIFICATION_STATUS_LABELS[valor as VerificationStatus] ?? valor;
}

function quando(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function HistoricoDecisoes({ registos }: { registos: DecisaoRegistada[] }) {
  if (registos.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Ainda não há decisões registadas sobre esta conta.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {registos.map((r) => {
        const a = ACCOES[r.action] ?? { rotulo: r.action, tom: 'neutro' as TomBadge };
        const antes = estado(r.estado_anterior);
        const depois = estado(r.estado_novo);

        return (
          <li key={r.id} className="border-l-2 border-slate-200 pl-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tom={a.tom}>{a.rotulo}</Badge>
              {antes && depois ? (
                <span className="text-xs text-slate-500">
                  {antes} → <span className="font-medium text-navy-600">{depois}</span>
                </span>
              ) : null}
            </div>

            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {r.administrador ? (
                <span className="font-medium text-slate-600">{r.administrador}</span>
              ) : (
                <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                  <Bot className="h-3 w-3" aria-hidden="true" />
                  Sistema
                </span>
              )}
              · {quando(r.created_at)}
            </p>

            {r.reason ? (
              <p className="mt-1.5 text-xs leading-relaxed text-slate-600">{r.reason}</p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
