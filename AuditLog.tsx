import type { RegistoAuditoria } from '@/lib/trust/actions';

/** Rótulos das acções registadas (enum verification_action). */
const ACCAO_ROTULO: Record<string, string> = {
  DOCUMENT_APPROVED: 'Documento aprovado',
  DOCUMENT_REJECTED: 'Documento rejeitado',
  DOCUMENT_EXPIRED: 'Documento expirado',
  USER_BLOCKED: 'Utilizador bloqueado',
  USER_UNBLOCKED: 'Utilizador desbloqueado',
  VERIFICATION_APPROVED: 'Verificação aprovada',
  VERIFICATION_REJECTED: 'Verificação rejeitada',
  TRUST_SCORE_RECALCULATED: 'Score de confiança recalculado',
  VERIFICATION_REQUIREMENTS_UPDATED: 'Requisitos actualizados',
};

const ACCAO_COR: Record<string, string> = {
  DOCUMENT_APPROVED: 'bg-emerald-50 text-emerald-700',
  VERIFICATION_APPROVED: 'bg-emerald-50 text-emerald-700',
  USER_UNBLOCKED: 'bg-emerald-50 text-emerald-700',
  DOCUMENT_REJECTED: 'bg-red-50 text-red-700',
  VERIFICATION_REJECTED: 'bg-red-50 text-red-700',
  USER_BLOCKED: 'bg-red-50 text-red-700',
  DOCUMENT_EXPIRED: 'bg-amber-50 text-amber-700',
};

function dataLegivel(iso: string) {
  return new Date(iso).toLocaleString('pt-PT', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Histórico de decisões de confiança.
 *
 * Só regista o que a plataforma decidiu sobre contas e documentos — é a prova
 * de quem aprovou, rejeitou ou bloqueou, e porquê.
 */
export function AuditLogCard({ registos }: { registos: RegistoAuditoria[] }) {
  return (
    <section className="cf-card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold text-navy-600">Histórico de auditoria</h2>
        <span className="text-xs text-slate-500">
          {registos.length === 0 ? 'sem registos' : `últimos ${registos.length}`}
        </span>
      </div>

      {registos.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Nenhuma decisão registada ainda. Aprovações, rejeições e bloqueios passam a
          aparecer aqui automaticamente.
        </p>
      ) : (
        <ol className="max-h-[28rem] space-y-3 overflow-y-auto pr-1">
          {registos.map((registo) => (
            <li key={registo.id} className="border-b border-slate-100 pb-3 last:border-0">
              <div className="flex flex-wrap items-center gap-2">
                <span
                  className={`cf-badge ${ACCAO_COR[registo.action] ?? 'bg-slate-100 text-slate-600'}`}
                >
                  {ACCAO_ROTULO[registo.action] ?? registo.action}
                </span>
                {registo.utilizador?.full_name ? (
                  <span className="text-sm font-semibold text-navy-600">
                    {registo.utilizador.full_name}
                  </span>
                ) : null}
              </div>

              {registo.reason || registo.comment ? (
                <p className="mt-1 text-sm text-slate-600">
                  {registo.reason ?? registo.comment}
                </p>
              ) : null}

              <p className="mt-1 text-xs text-slate-400">
                {dataLegivel(registo.created_at)}
                {registo.administrador?.full_name
                  ? ` · por ${registo.administrador.full_name}`
                  : ''}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
