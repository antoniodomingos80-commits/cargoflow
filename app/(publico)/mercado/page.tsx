import Link from 'next/link';
import { AlertTriangle, Package, Search, X } from 'lucide-react';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Button, classesBotao } from '@/components/ui/button';
import { CartaoPublico } from '@/components/mercado/cartao-publico';
import {
  listarMercadoPublico,
  listarProvinciasPublicas,
  type FiltrosMercado,
} from '@/lib/mercado/publico';
import { CARGO_TYPE_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types';

export const metadata = {
  title: 'Cargas disponíveis em Angola',
  description:
    'Veja cargas publicadas por comerciantes em Angola: rota, tipo, peso e janela de recolha. Crie conta para negociar.',
  // Canónico sem parâmetros: os filtros produzem `/mercado?origem=Luanda` e
  // outras combinações que mostram subconjuntos da mesma página. Sem isto, cada
  // combinação seria indexada como página própria e diluiria a original.
  alternates: { canonical: '/mercado' },
};

/**
 * Página pública do mercado.
 *
 * Server Component: a consulta corre no servidor, não há fetch no browser e não
 * há duplicação de chamadas. Os filtros passam por `searchParams`, o que os
 * torna partilháveis por ligação e indexáveis — que é metade da razão de esta
 * página existir.
 *
 * Não há estado de "loading" com spinner porque não há carregamento no cliente:
 * quem trata disso é o `loading.tsx` ao lado, que o Next.js mostra enquanto o
 * servidor prepara a página.
 */
export default async function PaginaMercadoPublico({
  searchParams,
}: {
  searchParams: Promise<FiltrosMercado>;
}) {
  const filtros = await searchParams;

  const [resultado, provincias] = await Promise.all([
    listarMercadoPublico(filtros),
    listarProvinciasPublicas(),
  ]);

  const temFiltros = Boolean(
    filtros.origem || filtros.destino || filtros.tipo || filtros.veiculo || filtros.urgente,
  );

  return (
    <PageContainer>
      <PageHeader
        titulo="Cargas disponíveis"
        descricao="Cargas publicadas por comerciantes em Angola. Crie conta para ver o valor e negociar."
      />

      {/* ---------------------------------------------------------------- erro */}
      {resultado.erro !== null ? (
        <div
          role="alert"
          className="cf-card flex items-start gap-3 border-l-4 border-l-status-danger p-5"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-status-danger"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-navy-600">
              Não foi possível carregar as cargas. Tente novamente.
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              Se o problema persistir, volte dentro de alguns minutos.
            </p>
          </div>
        </div>
      ) : (
        <>
          {/* ------------------------------------------------------- filtros */}
          <form method="get" className="cf-card mb-6 p-4 sm:p-5">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Origem
                </span>
                <select
                  name="origem"
                  defaultValue={filtros.origem ?? ''}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="">Todas</option>
                  {provincias.dados.map((p) => (
                    <option key={`o-${p}`} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Destino
                </span>
                <select
                  name="destino"
                  defaultValue={filtros.destino ?? ''}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="">Todos</option>
                  {provincias.dados.map((p) => (
                    <option key={`d-${p}`} value={p}>{p}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Tipo de carga
                </span>
                <select
                  name="tipo"
                  defaultValue={filtros.tipo ?? ''}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="">Todos</option>
                  {Object.entries(CARGO_TYPE_LABELS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-xs font-medium text-muted-foreground">
                  Veículo
                </span>
                <select
                  name="veiculo"
                  defaultValue={filtros.veiculo ?? ''}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
                >
                  <option value="">Todos</option>
                  {Object.entries(VEHICLE_TYPE_LABELS).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>{rotulo}</option>
                  ))}
                </select>
              </label>

              <div className="flex items-end gap-2">
                <label className="flex h-10 flex-1 items-center gap-2 rounded-lg border border-border bg-white px-3 text-sm">
                  <input
                    type="checkbox"
                    name="urgente"
                    value="1"
                    defaultChecked={filtros.urgente === '1'}
                    className="h-4 w-4 rounded border-border"
                  />
                  Urgentes
                </label>
                <Button type="submit" size="sm" className="h-10">
                  <Search className="h-4 w-4" aria-hidden="true" />
                  <span className="sr-only sm:not-sr-only">Filtrar</span>
                </Button>
              </div>
            </div>

            {temFiltros && (
              <Link
                href="/mercado"
                className="mt-3 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-navy-600"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Limpar filtros
              </Link>
            )}
          </form>

          {/* --------------------------------------------------------- lista */}
          {resultado.dados.length === 0 ? (
            <EmptyState
              icone={Package}
              titulo={
                temFiltros
                  ? 'Nenhuma carga corresponde a estes filtros'
                  : 'Não existem cargas disponíveis neste momento.'
              }
              texto={
                temFiltros
                  ? 'Experimente alargar a pesquisa — ou volte mais tarde.'
                  : 'Assim que forem publicadas novas cargas, aparecem aqui.'
              }
              accao={temFiltros ? { href: '/mercado', rotulo: 'Ver todas' } : undefined}
            />
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                {resultado.dados.length}{' '}
                {resultado.dados.length === 1 ? 'carga disponível' : 'cargas disponíveis'}
              </p>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {resultado.dados.map((carga) => (
                  <CartaoPublico key={carga.id} carga={carga} />
                ))}
              </div>
            </>
          )}

          {/* ----------------------------------------------------------- CTA */}
          <div className="cf-card mt-10 flex flex-col items-start gap-4 border-l-4 border-l-brand-500 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-navy-600">
                Quer transportar alguma destas cargas?
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Valores, contactos e negociação estão reservados a quem tem conta.
              </p>
            </div>
            <Link href="/entrar" className={classesBotao({}, 'shrink-0')}>
              Entrar para continuar
            </Link>
          </div>
        </>
      )}
    </PageContainer>
  );
}
