import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarMercadoViagens } from '@/lib/viagens/actions';
import { listarLocalidades } from '@/lib/cargas/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { VEHICLE_TYPE_LABELS, type CFLocation } from '@/lib/types';
import { formatWeight, formatCurrency } from '@/lib/utils';
import {
  Search, SlidersHorizontal, X, ArrowRight, RotateCcw, Truck, Calendar, Snowflake,
} from 'lucide-react';

export const metadata = { title: 'Transporte disponível' };

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default async function PaginaMercadoViagens({
  searchParams,
}: {
  searchParams: { origem?: string; destino?: string; pesoMin?: string };
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const [viagensRaw, localidadesRaw] = await Promise.all([
    listarMercadoViagens(searchParams),
    listarLocalidades(),
  ]);
  const viagens = viagensRaw as any[];
  const localidades = localidadesRaw as unknown as CFLocation[];

  const temFiltros = Boolean(
    searchParams.origem || searchParams.destino || searchParams.pesoMin,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">Transporte disponível</h1>
        <p className="mt-1 text-sm text-slate-500">
          Camiões com espaço livre nas próximas viagens.
        </p>
      </header>

      <form className="cf-card p-5">
        <div className="flex items-center gap-2 text-sm font-medium text-navy-600">
          <SlidersHorizontal className="h-4 w-4" aria-hidden="true" />
          Filtrar
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <select
            name="origem"
            defaultValue={searchParams.origem ?? ''}
            aria-label="Origem"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Qualquer origem</option>
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <select
            name="destino"
            defaultValue={searchParams.destino ?? ''}
            aria-label="Destino"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          >
            <option value="">Qualquer destino</option>
            {localidades.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>

          <input
            name="pesoMin"
            type="number"
            min={0}
            step={100}
            defaultValue={searchParams.pesoMin ?? ''}
            placeholder="Espaço mín. (kg)"
            aria-label="Espaço mínimo necessário em quilogramas"
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-brand-500"
          />
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" size="sm">
            <Search className="h-4 w-4" aria-hidden="true" />
            Procurar
          </Button>
          {temFiltros && (
            <Link
              href="/mercado/viagens"
              className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-navy-600"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Limpar
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-slate-500">
        {viagens.length === 0
          ? 'Nenhuma viagem corresponde aos critérios.'
          : `${viagens.length} ${viagens.length === 1 ? 'viagem disponível' : 'viagens disponíveis'}`}
      </p>

      {viagens.length === 0 ? (
        <EmptyState
          icone={Truck}
          titulo={temFiltros ? 'Sem resultados' : 'Ainda não há viagens publicadas'}
          texto={
            temFiltros
              ? 'Experimente alargar os critérios — por exemplo, remover o filtro de destino.'
              : 'Publique a sua carga: assim que um transportador anunciar uma viagem compatível, é notificado automaticamente.'
          }
          accao={
            temFiltros
              ? { href: '/mercado/viagens', rotulo: 'Limpar filtros' }
              : { href: '/cargas/nova', rotulo: 'Publicar carga' }
          }
        />
      ) : (
        <div className="space-y-3">
          {viagens.map((v) => (
            <article key={v.id} className="cf-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {v.is_return_trip && (
                      <span className="cf-badge-transit">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Viagem de retorno
                      </span>
                    )}
                    {v.vehicle?.has_refrigeration && (
                      <span className="cf-badge-transit">
                        <Snowflake className="h-3 w-3" aria-hidden="true" />
                        Refrigerado
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-400">{v.reference}</span>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-semibold text-navy-600">{v.origin?.city}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    <span className="font-semibold text-navy-600">{v.destination?.city}</span>
                  </div>

                  <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
                      <dd>Parte {formatarData(v.departure_at)}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                      <dd>
                        {v.vehicle
                          ? VEHICLE_TYPE_LABELS[v.vehicle.type as keyof typeof VEHICLE_TYPE_LABELS]
                          : '—'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-brand-500">
                    {formatWeight(Number(v.available_weight_kg))}
                  </p>
                  <p className="text-xs text-slate-400">disponível</p>
                  {v.minimum_price && (
                    <p className="mt-1 text-sm font-medium text-navy-600">
                      desde {formatCurrency(Number(v.minimum_price), v.currency)}
                    </p>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
