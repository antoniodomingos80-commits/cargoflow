import { DOCUMENT_TYPE_LABELS, ROLE_LABELS, type DocumentType, type UserRole } from '@/lib/types';
import type { RequisitoVerificacao } from '@/lib/trust/actions';

function rotuloDocumento(tipo: string) {
  return DOCUMENT_TYPE_LABELS[tipo as DocumentType] ?? tipo;
}

function rotuloPerfil(perfil: string) {
  return ROLE_LABELS[perfil as UserRole] ?? perfil;
}

/**
 * Requisitos de documentação por perfil.
 *
 * Componente de servidor: os dados chegam já resolvidos pela página, sem
 * pedido extra do browser nem estado de carregamento a piscar.
 */
export function VerificationRequirementsCard({
  requisitos,
}: {
  requisitos: RequisitoVerificacao[];
}) {
  const porPerfil = requisitos.reduce<Record<string, RequisitoVerificacao[]>>((acc, req) => {
    (acc[req.role] ??= []).push(req);
    return acc;
  }, {});

  const perfis = Object.keys(porPerfil);

  return (
    <section className="cf-card p-6">
      <div className="mb-4 flex items-baseline justify-between gap-4">
        <h2 className="text-lg font-bold text-navy-600">Requisitos de verificação</h2>
        <span className="text-xs text-slate-500">
          {requisitos.length} {requisitos.length === 1 ? 'requisito' : 'requisitos'}
        </span>
      </div>

      {perfis.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-600">
          Ainda não há requisitos definidos. Enquanto a tabela estiver vazia, nenhuma
          documentação é exigida na verificação.
        </p>
      ) : (
        <div className="space-y-5">
          {perfis.map((perfil) => (
            <div key={perfil}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
                {rotuloPerfil(perfil)}
              </h3>
              <ul className="space-y-2">
                {porPerfil[perfil].map((req) => (
                  <li key={req.id} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-navy-600">
                        {rotuloDocumento(req.document_type)}
                      </span>
                      <span
                        className={
                          req.is_required
                            ? 'cf-badge bg-red-50 text-red-700'
                            : 'cf-badge bg-slate-100 text-slate-600'
                        }
                      >
                        {req.is_required ? 'Obrigatório' : 'Opcional'}
                      </span>
                      {req.renewal_frequency_months ? (
                        <span className="cf-badge bg-blue-50 text-blue-700">
                          Renova a cada {req.renewal_frequency_months} meses
                        </span>
                      ) : null}
                    </div>
                    {req.description ? (
                      <p className="mt-1 text-sm text-slate-600">{req.description}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
