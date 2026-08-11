import { decidirVerificacao, documentosDoTenant, verificacoesPendentes } from '@/lib/admin/actions';
import { urlDocumento } from '@/lib/documentos/actions';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/types';

export const metadata = { title: 'Verificações' };

export default async function VerificacoesPage() {
  const usuarios = await verificacoesPendentes();
  const usuariosComDocumentos = await Promise.all(
    usuarios.map(async (u) => {
      const documentos = await documentosDoTenant(u.tenant_id);
      const urls = Object.fromEntries(
        await Promise.all(
          documentos.map(async (doc) => [doc.id, await urlDocumento(doc.file_url)] as const),
        ),
      );

      return {
        ...u,
        documentos,
        urls,
      };
    }),
  );

  return (
    <div className="mx-auto max-w-6xl p-6">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-navy-600">Verificações</h1>
          <p className="mt-1 text-sm text-slate-500">
            Revisa a identidade, a documentação e o estado do utilizador antes de aprovar ou rejeitar.
          </p>
        </div>
      </div>

      <div className="mb-6 rounded border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <span className="text-lg font-bold">{usuarios.length}</span> utilizadores pendentes
        </p>
      </div>

      {usuariosComDocumentos.length === 0 ? (
        <div className="rounded bg-gray-50 py-12 text-center">
          <p className="font-semibold text-gray-600">Nenhum pendente.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {usuariosComDocumentos.map((u) => (
            <article key={u.user_id} className="rounded-lg border bg-white p-4 shadow-sm">
              <p className="font-semibold text-navy-600">{u.full_name || 'Sem nome'}</p>
              <p className="text-sm text-slate-600">{u.email ?? 'Sem email'}</p>
              <p className="mt-1 text-xs text-slate-500">{u.tenant_nome} • {u.role}</p>

              <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Documentos</p>
                  <p className="mt-1 font-semibold text-navy-600">{u.n_documentos}</p>
                </div>
                <div className="rounded bg-slate-50 p-2">
                  <p className="text-xs uppercase tracking-wide text-slate-400">Veículos</p>
                  <p className="mt-1 font-semibold text-navy-600">{u.n_veiculos}</p>
                </div>
                {u.tax_id && (
                  <div className="rounded bg-slate-50 p-2 sm:col-span-2">
                    <p className="text-xs uppercase tracking-wide text-slate-400">Identificador fiscal</p>
                    <p className="mt-1 font-semibold text-navy-600">{u.tax_id}</p>
                  </div>
                )}
              </div>

              <div className="mt-3 rounded border border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Documentos para rever
                </p>
                {u.documentos.length === 0 ? (
                  <p className="text-sm text-slate-600">Ainda não foram carregados documentos desta conta.</p>
                ) : (
                  <ul className="space-y-1.5 text-sm text-slate-600">
                    {u.documentos.slice(0, 4).map((doc) => (
                      <li key={doc.id} className="flex items-center justify-between gap-3 rounded bg-white px-2 py-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="truncate">{DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type}</span>
                            {u.urls[doc.id] ? (
                              <a
                                href={u.urls[doc.id] ?? '#'}
                                target="_blank"
                                rel="noreferrer"
                                className="text-xs font-medium text-blue-600 hover:underline"
                              >
                                Ver
                              </a>
                            ) : null}
                          </div>
                          {doc.document_number && (
                            <p className="text-[11px] text-slate-500">Nº {doc.document_number}</p>
                          )}
                        </div>
                        <span className="text-xs text-slate-500">
                          {doc.verification === 'PENDING' ? 'Pendente' : doc.verification}
                        </span>
                      </li>
                    ))}
                    {u.documentos.length > 4 && (
                      <li className="text-xs text-slate-500">+{u.documentos.length - 4} documentos adicionais</li>
                    )}
                  </ul>
                )}
              </div>

              <div className="mt-3 flex gap-2">
                <form
                  action={async () => {
                    'use server';
                    await decidirVerificacao(u.user_id, true);
                  }}
                  className="flex-1"
                >
                  <button
                    type="submit"
                    className="w-full rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white hover:bg-green-700"
                  >
                    Aprovar
                  </button>
                </form>

                <form
                  action={async () => {
                    'use server';
                    await decidirVerificacao(u.user_id, false, 'Documentação incompleta ou não legível');
                  }}
                  className="flex-1"
                >
                  <button
                    type="submit"
                    className="w-full rounded bg-red-600 px-3 py-2 text-sm font-semibold text-white hover:bg-red-700"
                  >
                    Rejeitar
                  </button>
                </form>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}