import { redirect } from 'next/navigation';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarDocumentos, apagarDocumento, urlDocumento } from '@/lib/documentos/actions';
import { FormularioDocumento } from './formulario';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { listarVeiculos } from '@/lib/frota/actions';
import { EstadoVerificacao } from '@/components/trust/estado-verificacao';
import { Badge } from '@/components/ui/badge';
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type VerificationStatus,
} from '@/lib/types';
import { FileText, Trash2, ExternalLink, ShieldAlert } from 'lucide-react';

export const metadata = { title: 'Documentos' };

function formatarData(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-AO', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

export default async function PaginaDocumentos() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const ehTransportador = ['CARRIER', 'COMPANY_ADMIN', 'COMPANY_STAFF'].includes(
    perfil.user.role,
  );

  const [documentos, frota] = await Promise.all([
    listarDocumentos(),
    ehTransportador
      ? (listarVeiculos() as unknown as Promise<Array<{ id: string; plate: string }>>)
      : Promise.resolve([]),
  ]);

  const porVerificar = perfil.user.verification === 'PENDING';
  const aprovados = documentos.filter((d) => d.verification === 'APPROVED').length;
  const pendentes = documentos.filter((d) =>
    ['PENDING', 'UNDER_REVIEW'].includes(d.verification),
  ).length;

  // URLs assinados para pré-visualização (o bucket é privado)
  const urls = Object.fromEntries(
    await Promise.all(
      documentos.map(async (d) => [d.id, await urlDocumento(d.file_url)] as const),
    ),
  );

  return (
    <PageContainer largura="estreita">
      <PageHeader
        titulo="Documentos"
        descricao="A verificação é o que dá confiança à outra parte do negócio."
        accoes={<FormularioDocumento perfilCarrier={ehTransportador} veiculos={frota} />}
      />

      {porVerificar && (
        <div className="cf-card flex items-start gap-4 border-accent-200 bg-accent-50/60 p-5">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-navy-600">Conta por verificar</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Carregue os documentos abaixo. Enquanto a conta não estiver
              verificada, pode explorar a plataforma mas não publicar nem negociar.
            </p>
            <ul className="mt-3 space-y-1 text-sm text-slate-600">
              <li>· Bilhete de identidade{ehTransportador && ' e carta de condução'}</li>
              {ehTransportador && <li>· Livrete e seguro de cada veículo</li>}
              {perfil.tenant.type === 'COMPANY' && (
                <li>· Certidão comercial e NIF da empresa</li>
              )}
            </ul>
          </div>
        </div>
      )}

      <div className="cf-card grid gap-4 p-5 sm:grid-cols-3">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Documentos carregados</p>
          <p className="mt-1 text-2xl font-bold text-navy-600">{documentos.length}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Aprovados</p>
          <p className="mt-1 text-2xl font-bold text-green-600">{aprovados}</p>
        </div>
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">Pendentes</p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{pendentes}</p>
        </div>
      </div>

      {documentos.length === 0 ? (
        <EmptyState
          icone={FileText}
          titulo="Nenhum documento carregado"
          texto="Carregue os seus documentos para que a equipa possa verificar a conta. A verificação demora normalmente menos de 24 horas."
        />
      ) : (
        <div className="space-y-3">
          {documentos.map((d) => {
            const expirado =
              d.expires_at &&
              d.verification !== 'EXPIRED' &&
              new Date(d.expires_at) < new Date();

            return (
              <article key={d.id} className="cf-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <EstadoVerificacao estado={d.verification as VerificationStatus} />
                      {expirado && <Badge tom="alerta">Validade ultrapassada</Badge>}
                      {d.veiculo?.plate && (
                        <Badge tom="neutro">Veículo {d.veiculo.plate}</Badge>
                      )}
                    </div>

                    <h2 className="mt-2.5 font-semibold text-navy-600">
                      {DOCUMENT_TYPE_LABELS[d.type as DocumentType]}
                    </h2>

                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      {d.document_number && (
                        <div>
                          <dt className="inline">Número: </dt>
                          <dd className="inline font-medium text-navy-600">
                            {d.document_number}
                          </dd>
                        </div>
                      )}
                      {d.expires_at && (
                        <div>
                          <dt className="inline">Válido até: </dt>
                          <dd className="inline font-medium text-navy-600">
                            {formatarData(d.expires_at)}
                          </dd>
                        </div>
                      )}
                      <div>
                        <dt className="inline">Carregado: </dt>
                        <dd className="inline font-medium text-navy-600">
                          {formatarData(d.created_at)}
                        </dd>
                      </div>
                    </dl>

                    {d.rejection_reason && (
                      <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                        {d.rejection_reason}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {urls[d.id] && (
                      <a
                        href={urls[d.id]!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-navy-600"
                        aria-label="Abrir documento"
                      >
                        <ExternalLink className="h-4 w-4" aria-hidden="true" />
                      </a>
                    )}
                    {d.verification !== 'APPROVED' && (
                      <form
                        action={async () => {
                          'use server';
                          await apagarDocumento(d.id);
                        }}
                      >
                        <button
                          type="submit"
                          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-red-50 hover:text-red-600"
                          aria-label="Remover documento"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
