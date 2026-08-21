import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { operacoesPlataforma, indicadoresPlataforma } from '@/lib/admin/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { LOAD_STATUS_LABELS, LOAD_STATUS_BADGE, type LoadStatus } from '@/lib/types';
import { formatCurrency, formatWeight, formatRelativeTime } from '@/lib/utils';
import { Package, ArrowRight, AlertTriangle, Activity } from 'lucide-react';

export const metadata = { title: 'Operações' };

export default async function PaginaOperacoes() {
  const [operacoes, indicadores] = await Promise.all([
    operacoesPlataforma(),
    indicadoresPlataforma(),
  ]);

  return (
    <PageContainer largura="larga">
      <PageHeader
        titulo="Operações"
        descricao="Todas as cargas ativas e concluídas na plataforma."
      />

      {indicadores && (
        <div className="grid gap-4 sm:grid-cols-3">
          <Cartao
            rotulo="Em curso"
            valor={indicadores.cargas_em_curso}
            icone={Activity}
          />
          <Cartao
            rotulo="Concluídas"
            valor={indicadores.cargas_concluidas}
            icone={Package}
          />
          <Cartao
            rotulo="Valor transacionado"
            valor={formatCurrency(Number(indicadores.valor_transacionado))}
            icone={Activity}
          />
        </div>
      )}

      {operacoes.length === 0 ? (
        <EmptyState
          icone={Package}
          titulo="Sem operações"
          texto="Ainda não há cargas publicadas na plataforma."
          accao={{ href: '/painel', rotulo: 'Voltar ao painel' }}
        />
      ) : (
        <div className="cf-card divide-y divide-slate-100 overflow-hidden">
          {operacoes.map((o) => {
            // Em trânsito sem posição há mais de 3 horas merece atenção
            const emTransito = ['PICKED_UP', 'IN_TRANSIT'].includes(o.status);
            const semSinal = emTransito && !o.ultima_posicao;

            return (
              <Link
                key={o.load_id}
                href={`/rastreio/${o.load_id}`}
                className="block p-5 transition-colors hover:bg-slate-50"
              >
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={LOAD_STATUS_BADGE[o.status as LoadStatus]}>
                        {LOAD_STATUS_LABELS[o.status as LoadStatus]}
                      </span>
                      {semSinal && (
                        <span className="cf-badge-delayed">
                          <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                          Sem sinal
                        </span>
                      )}
                      <span className="font-mono text-xs text-slate-400">
                        {o.reference}
                      </span>
                    </div>

                    <h2 className="mt-2 truncate font-medium text-navy-600">
                      {o.title}
                    </h2>

                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span>{o.origin_city}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>{o.destination_city}</span>
                      <span className="text-xs text-slate-400">
                        · {formatWeight(Number(o.weight_kg))}
                      </span>
                    </div>

                    <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                      <div>
                        <dt className="inline">Comerciante: </dt>
                        <dd className="inline font-medium text-navy-600">
                          {o.merchant_nome}
                        </dd>
                      </div>
                      {o.carrier_nome && (
                        <div>
                          <dt className="inline">Transportador: </dt>
                          <dd className="inline font-medium text-navy-600">
                            {o.carrier_nome}
                          </dd>
                        </div>
                      )}
                      {o.ultima_posicao && (
                        <div>
                          <dt className="inline">Última posição: </dt>
                          <dd className="inline font-medium text-navy-600">
                            {formatRelativeTime(o.ultima_posicao)}
                          </dd>
                        </div>
                      )}
                    </dl>
                  </div>

                  {o.valor && (
                    <div className="shrink-0 text-right">
                      <p className="font-bold text-brand-500">
                        {formatCurrency(Number(o.valor))}
                      </p>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}

function Cartao({
  rotulo,
  valor,
  icone: Icone,
}: {
  rotulo: string;
  valor: string | number;
  icone: any;
}) {
  return (
    <div className="cf-card p-5">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-400">
        <Icone className="h-3.5 w-3.5" aria-hidden="true" />
        {rotulo}
      </div>
      <p className="mt-2 text-2xl font-bold text-navy-600">{valor}</p>
    </div>
  );
}
