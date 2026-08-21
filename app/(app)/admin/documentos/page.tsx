import Link from 'next/link';
import { documentosPendentesAvulsos } from '@/lib/admin/actions';
import { cn } from '@/lib/utils';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { EstadoVerificacao } from '@/components/trust/estado-verificacao';
import { urlDocumento } from '@/lib/documentos/actions';
import {
  DOCUMENT_TYPE_LABELS,
  type DocumentType,
  type VerificationStatus,
} from '@/lib/types';
import { FileCheck2, ExternalLink } from 'lucide-react';
import { DecisoesDocumento } from './decisoes';

export const metadata = { title: 'Documentos' };

function data(iso: string) {
  return new Date(iso).toLocaleDateString('pt-AO', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

type Estado = 'todos' | 'PENDING' | 'UNDER_REVIEW';

const FILTROS: Array<{ chave: Estado; rotulo: string }> = [
  { chave: 'todos', rotulo: 'Todos' },
  { chave: 'PENDING', rotulo: 'Por abrir' },
  { chave: 'UNDER_REVIEW', rotulo: 'Em análise' },
];

export default async function AdminDocumentosPage({
  searchParams,
}: {
  searchParams: Promise<{ estado?: string }>;
}) {
  const { estado } = await searchParams;
  const filtro: Estado =
    estado === 'PENDING' || estado === 'UNDER_REVIEW' ? estado : 'todos';

  const todos = await documentosPendentesAvulsos();
  const documentos = filtro === 'todos' ? todos : todos.filter((d) => d.verification === filtro);

  const documentosComUrl = await Promise.all(
    documentos.map(async (d) => ({
      ...d,
      url: await urlDocumento(d.file_url),
    })),
  );

  const porDecidir = todos.filter((d) => d.verification === 'PENDING').length;
  const emAnalise = todos.filter((d) => d.verification === 'UNDER_REVIEW').length;
  const contagem: Record<Estado, number> = {
    todos: todos.length,
    PENDING: porDecidir,
    UNDER_REVIEW: emAnalise,
  };

  return (
    <PageContainer largura="larga">
      <PageHeader
        titulo="Documentos"
        descricao="Documentos carregados por contas já aprovadas — não estão ligados a uma verificação inicial de utilizador, por isso precisam de ser revistos aqui."
        accoes={
          <>
            <Badge tom={porDecidir > 0 ? 'destaque' : 'neutro'}>
              {porDecidir} por abrir
            </Badge>
            {emAnalise > 0 ? <Badge tom="marca">{emAnalise} em análise</Badge> : null}
          </>
        }
      />

      <nav aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {FILTROS.map((f) => {
          const activo = f.chave === filtro;
          return (
            <Link
              key={f.chave}
              href={f.chave === 'todos' ? '/admin/documentos' : `/admin/documentos?estado=${f.chave}`}
              aria-current={activo ? 'page' : undefined}
              className={cn(
                'rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors',
                activo
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
              )}
            >
              {f.rotulo}
              <span className="ml-1.5 text-xs tabular-nums text-slate-400">
                {contagem[f.chave]}
              </span>
            </Link>
          );
        })}
      </nav>

      {documentosComUrl.length === 0 ? (
        <EmptyState
          icone={FileCheck2}
          titulo={filtro === 'todos' ? 'Nada por rever' : 'Nada neste estado'}
          texto={
            filtro === 'todos'
              ? 'Não há documentos à espera de decisão. Quando alguém carregar um documento novo, aparece aqui.'
              : 'Nenhum documento está neste estado neste momento. Experimente outro filtro.'
          }
        />
      ) : (
        <div className="space-y-4">
          {documentosComUrl.map((doc) => (
            <article key={doc.id} className="cf-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <EstadoVerificacao estado={doc.verification as VerificationStatus} />
                    {doc.veiculo ? <Badge tom="neutro">Veículo {doc.veiculo}</Badge> : null}
                  </div>

                  <h2 className="mt-2.5 font-semibold text-navy-600">
                    {DOCUMENT_TYPE_LABELS[doc.type as DocumentType] ?? doc.type}
                  </h2>

                  <p className="mt-0.5 text-sm text-slate-600">
                    {doc.utilizador_nome ?? 'Sem nome'} · {doc.tenant_nome}
                  </p>

                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                    {doc.document_number && (
                      <div>
                        <dt className="inline">Nº </dt>
                        <dd className="inline font-medium text-navy-600">
                          {doc.document_number}
                        </dd>
                      </div>
                    )}
                    {doc.expires_at && (
                      <div>
                        <dt className="inline">Válido até </dt>
                        <dd className="inline font-medium text-navy-600">
                          {data(doc.expires_at)}
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt className="inline">Carregado </dt>
                      <dd className="inline font-medium text-navy-600">
                        {data(doc.created_at)}
                      </dd>
                    </div>
                  </dl>
                </div>

                {doc.url && (
                  <a
                    href={doc.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1.5 text-sm font-semibold text-brand-500 hover:underline"
                  >
                    Ver documento
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                  </a>
                )}
              </div>

              <DecisoesDocumento
                documentoId={doc.id}
                emAnalise={doc.verification === 'UNDER_REVIEW'}
              />
            </article>
          ))}
        </div>
      )}
    </PageContainer>
  );
}
