import {
  documentosDoTenant,
  historicoDeDecisoes,
  verificacoesPendentes,
} from '@/lib/admin/actions';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { ShieldCheck, ExternalLink } from 'lucide-react';
import { urlDocumento } from '@/lib/documentos/actions';
import { EstadoVerificacao } from '@/components/trust/estado-verificacao';
import { HistoricoDecisoes } from '@/components/trust/historico-decisoes';
import {
  DOCUMENT_TYPE_LABELS,
  ROLE_LABELS,
  type DocumentType,
  type UserRole,
  type VerificationStatus,
} from '@/lib/types';
import { DecisoesConta } from './decisoes-conta';

export const metadata = { title: 'Verificações' };

export default async function VerificacoesPage() {
  const usuarios = await verificacoesPendentes();

  const usuariosComDocumentos = await Promise.all(
    usuarios.map(async (u) => {
      const [documentos, historico] = await Promise.all([
        documentosDoTenant(u.tenant_id),
        historicoDeDecisoes(u.user_id, 8),
      ]);

      const urls = Object.fromEntries(
        await Promise.all(
          documentos.map(async (doc) => [doc.id, await urlDocumento(doc.file_url)] as const),
        ),
      );

      return { ...u, documentos, urls, historico };
    }),
  );

  return (
    <PageContainer largura="larga">
      <PageHeader
        titulo="Verificações"
        descricao="Revê a identidade, a documentação e o histórico da conta antes de aprovar ou rejeitar."
        accoes={
          <Badge tom={usuarios.length > 0 ? 'destaque' : 'positivo'}>
            {usuarios.length} {usuarios.length === 1 ? 'pendente' : 'pendentes'}
          </Badge>
        }
      />

      {usuariosComDocumentos.length === 0 ? (
        <EmptyState
          icone={ShieldCheck}
          titulo="Nada pendente"
          texto="Não há contas à espera de verificação neste momento."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {usuariosComDocumentos.map((u) => {
            const pendentes = u.documentos.filter((d) => d.verification === 'PENDING');

            return (
              <article key={u.user_id} className="cf-card p-5">
                <header className="min-w-0">
                  <h2 className="font-semibold text-navy-600">{u.full_name || 'Sem nome'}</h2>
                  <p className="truncate text-sm text-slate-600">{u.email ?? 'Sem email'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {u.tenant_nome} · {ROLE_LABELS[u.role as UserRole] ?? u.role}
                  </p>
                </header>

                <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg bg-slate-50 p-3">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Documentos</dt>
                    <dd className="mt-1 font-semibold text-navy-600">{u.n_documentos}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">Veículos</dt>
                    <dd className="mt-1 font-semibold text-navy-600">{u.n_veiculos}</dd>
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <dt className="text-xs uppercase tracking-wide text-slate-400">NIF</dt>
                    <dd className="mt-1 truncate font-semibold text-navy-600">
                      {u.tax_id ?? '—'}
                    </dd>
                  </div>
                </dl>

                <section className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Documentos para rever
                  </h3>

                  {u.documentos.length === 0 ? (
                    <p className="mt-2 text-sm text-slate-600">
                      Ainda não foram carregados documentos desta conta.
                    </p>
                  ) : (
                    <>
                      <ul className="mt-3 space-y-2">
                        {u.documentos.map((doc) => (
                          <li
                            key={doc.id}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white px-3 py-2"
                          >
                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                              <span className="truncate text-sm text-slate-600">
                                {DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type}
                              </span>
                              {doc.document_number && (
                                <span className="text-xs text-slate-400">
                                  Nº {doc.document_number}
                                </span>
                              )}
                              {u.urls[doc.id] ? (
                                <a
                                  href={u.urls[doc.id] ?? '#'}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-brand-500 hover:underline"
                                >
                                  Ver
                                  <ExternalLink className="h-3 w-3" aria-hidden="true" />
                                </a>
                              ) : null}
                            </div>
                            <EstadoVerificacao
                              estado={doc.verification as VerificationStatus}
                            />
                          </li>
                        ))}
                      </ul>
                      <p className="mt-2.5 text-xs text-slate-500">
                        A decisão abrange apenas os {pendentes.length} documento
                        {pendentes.length === 1 ? '' : 's'} por verificar.
                      </p>
                    </>
                  )}
                </section>

                <details className="mt-4 rounded-lg border border-slate-200 p-4">
                  <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Histórico de decisões ({u.historico.length})
                  </summary>
                  <div className="mt-3">
                    <HistoricoDecisoes registos={u.historico} />
                  </div>
                </details>

                <DecisoesConta
                  utilizadorId={u.user_id}
                  nome={u.full_name || 'esta conta'}
                  documentosPendentes={pendentes.map((d) => d.id)}
                />
              </article>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
