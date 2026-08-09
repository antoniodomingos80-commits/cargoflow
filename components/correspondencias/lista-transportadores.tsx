import { Pontuacao, DecomposicaoPontuacao } from './pontuacao';
import { BotaoContactar } from './botao-contactar';
import { formatCurrency, formatWeight } from '@/lib/utils';
// formatWeight é usado tanto nos cartões como na explicação de incompatibilidade
import { VEHICLE_TYPE_LABELS, type VehicleType } from '@/lib/types';
import type { CorrespondenciaTransportador } from '@/lib/correspondencias/actions';
import {
  ArrowRight, Star, RotateCcw, Truck, Sparkles, Snowflake, ShieldCheck,
} from 'lucide-react';

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Transportadores compatíveis com uma carga.
 *
 * É aqui que o produto justifica a sua existência: em vez de o comerciante
 * telefonar a conhecidos, o sistema mostra quem passa naquela rota, com que
 * espaço, quando, e explica porque é uma boa correspondência.
 */
export function ListaTransportadores({
  cargaId,
  correspondencias,
  pesoCarga,
  maiorCapacidadeDisponivel,
}: {
  cargaId: string;
  correspondencias: CorrespondenciaTransportador[];
  /** Para explicar a ausência de correspondências quando o peso é o obstáculo */
  pesoCarga?: number;
  maiorCapacidadeDisponivel?: number | null;
}) {
  if (correspondencias.length === 0) {
    // Se há viagens no mercado mas nenhuma serve por capacidade, dizê-lo.
    // Um ecrã vazio sem explicação parece uma avaria.
    const limitadoPorPeso =
      pesoCarga !== undefined &&
      maiorCapacidadeDisponivel != null &&
      maiorCapacidadeDisponivel > 0 &&
      maiorCapacidadeDisponivel < pesoCarga;

    return (
      <section className="cf-card border-dashed p-8 text-center">
        <Truck className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
        <h3 className="mt-4 font-semibold text-navy-600">
          Ainda não há transportadores compatíveis
        </h3>

        {limitadoPorPeso ? (
          <>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-600">
              A sua carga pesa <strong>{formatWeight(pesoCarga!)}</strong>, mas o
              maior camião disponível no mercado tem{' '}
              <strong>{formatWeight(maiorCapacidadeDisponivel!)}</strong> livres.
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-slate-500">
              Pode dividir a carga em partes mais pequenas, ou aguardar —
              assim que aparecer um camião com espaço suficiente, é notificado.
            </p>
          </>
        ) : (
          <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
            Assim que um transportador publicar uma viagem que sirva esta carga,
            aparece aqui automaticamente e ambos são notificados.
          </p>
        )}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-500" aria-hidden="true" />
        <h2 className="font-semibold text-navy-600">
          {correspondencias.length}{' '}
          {correspondencias.length === 1
            ? 'transportador compatível'
            : 'transportadores compatíveis'}
        </h2>
      </header>

      <p className="text-xs text-slate-500">
        Ordenados por compatibilidade — rota, disponibilidade, avaliação e
        histórico conjunto.
      </p>

      <div className="space-y-3">
        {correspondencias.map((m) => (
          <article key={m.match_id} className="cf-card overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pontuacao valor={Number(m.score)} />
                    {m.is_return_trip && (
                      <span className="cf-badge-transit">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Viagem de retorno
                      </span>
                    )}
                    {m.has_refrigeration && (
                      <span className="cf-badge-transit">
                        <Snowflake className="h-3 w-3" aria-hidden="true" />
                        Refrigerado
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 flex items-center gap-2 font-semibold text-navy-600">
                    {m.carrier_name}
                    {m.carrier_verified && (
                      <ShieldCheck
                        className="h-4 w-4 text-green-500"
                        aria-label="Transportador verificado"
                      />
                    )}
                  </h3>

                  {m.carrier_rating_count > 0 && m.carrier_rating !== null ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                      <Star
                        className="h-3.5 w-3.5 fill-accent-400 text-accent-400"
                        aria-hidden="true"
                      />
                      <span className="font-medium">
                        {Number(m.carrier_rating).toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({m.carrier_rating_count}{' '}
                        {m.carrier_rating_count === 1 ? 'avaliação' : 'avaliações'})
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Ainda sem avaliações</p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="font-medium">{m.origin_city}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    <span className="font-medium">{m.destination_city}</span>
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
                    <div>
                      <dt className="inline">Parte: </dt>
                      <dd className="inline font-medium text-navy-600">
                        {formatarData(m.departure_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Espaço: </dt>
                      <dd className="inline font-medium text-navy-600">
                        {formatWeight(Number(m.available_weight_kg))}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Veículo: </dt>
                      <dd className="inline font-medium text-navy-600">
                        {VEHICLE_TYPE_LABELS[m.vehicle_type as VehicleType]} ·{' '}
                        <span className="font-mono">{m.vehicle_plate}</span>
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="shrink-0 text-right">
                  {m.minimum_price ? (
                    <>
                      <p className="text-xs text-slate-400">a partir de</p>
                      <p className="text-lg font-bold text-brand-500">
                        {formatCurrency(Number(m.minimum_price), m.currency)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Sob proposta</p>
                  )}
                  <BotaoContactar
                    cargaId={cargaId}
                    tripId={m.trip_id}
                    nomeTransportador={m.carrier_name}
                  />
                </div>
              </div>
            </div>

            {/* Transparência: explicar de onde vem a pontuação */}
            <details className="border-t border-slate-100">
              <summary className="cursor-pointer list-none px-5 py-3 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-50 hover:text-navy-600">
                Porque é uma boa correspondência?
              </summary>
              <div className="border-t border-slate-100 bg-slate-50/60 px-5 py-4">
                <DecomposicaoPontuacao breakdown={m.score_breakdown} />
              </div>
            </details>
          </article>
        ))}
      </div>
    </section>
  );
}
