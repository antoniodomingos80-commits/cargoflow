import { decidirDocumentoAvulso, documentosPendentesAvulsos } from '@/lib/admin/actions';
import { urlDocumento } from '@/lib/documentos/actions';
import { DOCUMENT_TYPE_LABELS, type DocumentType } from '@/lib/types';

export const metadata = { title: 'Documentos' };

export default async function AdminDocumentosPage() {
  const documentos = await documentosPendentesAvulsos();

  const documentosComUrl = await Promise.all(
    documentos.map(async (d) => ({
      ...d,
      url: await urlDocumento(d.file_url),
    })),
  );

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-navy-600">Documentos</h1>
        <p className="mt-1 text-sm text-slate-500">
          Documentos carregados por contas já aprovadas — não estão ligados a uma
          verificação inicial de utilizador, por isso precisam de ser revistos aqui.
        </p>
      </div>

      <div className="mb-6 rounded border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm text-blue-900">
          <span className="text-lg font-bold">{documentos.length}</span> documentos pendentes
        </p>
      </div>

      {documentosComUrl.length === 0 ? (
        <div className="rounded bg-gray-50 py-12 text-center">
          <p className="font-semibold text-gray-600">Nenhum documento pendente.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {documentosComUrl.map((doc) => (
            <article key={doc.id} className="rounded-lg border bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-navy-600">
                    {DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type}
                  </p>
                  <p className="text-sm text-slate-600">
                    {doc.utilizador_nome ?? 'Sem nome'} · {doc.tenant_nome}
                  </p>
                  {doc.document_number && (
                    <p className="mt-0.5 text-xs text-slate-500">Nº {doc.document_number}</p>
                  )}
                  {doc.expires_at && (
                    <p className="text-xs text-slate-500">
                      Válido até {new Date(doc.expires_at).toLocaleDateString('pt-AO')}
                    </p>
                  )}
                  <p className="mt-1 text-xs text-slate-400">
                    Carregado em{' '}
                    {new Date(doc.created_at).toLocaleDateString('pt-AO')}
                  </p>
                </div>

                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm font-medium text-blue-600 hover:underline"
                  >
                    Ver documento
                  </a>
                )}
              </div>

              <div className="mt-4 flex gap-2">
                <form
                  action={async () => {
                    'use server';
                    await decidirDocumentoAvulso(doc.id, true);
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
                    await decidirDocumentoAvulso(
                      doc.id,
                      false,
                      'Documentação incompleta ou não legível',
                    );
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
