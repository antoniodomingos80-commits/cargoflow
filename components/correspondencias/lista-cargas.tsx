import Link from 'next/link';
import { Pontuacao, DecomposicaoPontuacao } from './pontuacao';
import { Button, classesBotao } from '@/components/ui/button';
import { formatCurrency, formatWeight, formatDistance } from '@/lib/utils';
import { CARGO_TYPE_LABELS, type CargoType } from '@/lib/types';
import type { CorrespondenciaCarga } from '@/lib/correspondencias/actions';
import {
  ArrowRight, Zap, Snowflake, Package, Send, Sparkles, Star,
} from 'lucide-react';

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Cargas compatíveis com uma viagem — vista do transportador.
 * Responde numa olhadela a "compensa-me levar isto?".
 */
export function ListaCargas({
  correspondencias,
  viagemId,
}: {
  correspondencias: CorrespondenciaCarga[];
  /**
   * Viagem a partir da qual estas correspondências foram calculadas. Segue
   * para o diálogo de proposta, que a pré-selecciona — quem vem de uma
   * correspondência não deve ter de voltar a escolher aquilo de onde veio.
   */
  viagemId?: string;
}) {
  if (correspondencias.length === 0) {
    return (
      <section className="cf-card border-dashed p-8 text-center">
        <Package className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
        <h3 className="mt-4 font-semibold text-navy-600">
          Ainda não há cargas compatíveis
        </h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
          Assim que for publicada uma carga que sirva esta viagem, aparece aqui
          e recebe notificação.
        </p>
        <Link href="/mercado/cargas" className="mt-5 inline-block">
          <Button variant="outline" size="sm">
            Ver todas as cargas disponíveis
          </Button>
        </Link>
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <header className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-brand-500" aria-hidden="true" />
        <h2 className="font-semibold text-navy-600">
          {correspondencias.length}{' '}
          {correspondencias.length === 1 ? 'carga compatível' : 'cargas compatíveis'}
        </h2>
      </header>

      <div className="space-y-3">
        {correspondencias.map((m) => (
          <article key={m.match_id} className="cf-card overflow-hidden">
            <div className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Pontuacao valor={Number(m.score)} />
                    {m.is_urgent && (
                      <span className="cf-badge-delayed">
                        <Zap className="h-3 w-3" aria-hidden="true" />
                        Urgente
                      </span>
                    )}
                    {m.requires_refrigeration && (
                      <span className="cf-badge-transit">
                        <Snowflake className="h-3 w-3" aria-hidden="true" />
                        Refrigerada
                      </span>
                    )}
                    <span className="font-mono text-xs text-slate-400">
                      {m.load_reference}
                    </span>
                  </div>

                  <h3 className="mt-3 font-semibold text-navy-600">{m.title}</h3>

                  <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                    <span>{m.merchant_name}</span>
                    {m.merchant_rating_count > 0 && m.merchant_rating !== null && (
                      <>
                        <Star
                          className="h-3.5 w-3.5 fill-accent-400 text-accent-400"
                          aria-hidden="true"
                        />
                        <span className="text-xs">
                          {Number(m.merchant_rating).toFixed(1)}
                        </span>
                      </>
                    )}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span className="font-medium">{m.origin_city}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    <span className="font-medium">{m.destination_city}</span>
                    {m.distance_km && (
                      <span className="text-xs text-slate-400">
                        · {formatDistance(Number(m.distance_km))}
                      </span>
                    )}
                  </div>

                  <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
                    <div>
                      <dt className="inline">Peso: </dt>
                      <dd className="inline font-medium text-navy-600">
                        {formatWeight(Number(m.weight_kg))}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Tipo: </dt>
                      <dd className="inline font-medium text-navy-600">
                        {CARGO_TYPE_LABELS[m.cargo_type as CargoType]}
                      </dd>
                    </div>
                    <div>
                      <dt className="inline">Recolha até: </dt>
                      <dd className="inline font-medium text-navy-600">
                        {formatarData(m.pickup_until)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="shrink-0 text-right">
                  {m.budget_amount ? (
                    <>
                      <p className="text-xs text-slate-400">orçamento</p>
                      <p className="text-lg font-bold text-brand-500">
                        {formatCurrency(Number(m.budget_amount), m.currency)}
                      </p>
                    </>
                  ) : (
                    <p className="text-sm text-slate-400">Sob proposta</p>
                  )}
                  {/*
                    Este botão esteve `disabled` desde sempre: aparecia, ficava
                    cinzento e não fazia nada. O camionista via a carga certa à
                    frente e não tinha por onde avançar — enquanto o cartão
                    equivalente do lado do comerciante já tinha acção.

                    Leva agora à página da carga no mercado, que é onde o
                    diálogo de proposta vive, com a viagem já escolhida.
                  */}
                  <Link
                    href={
                      viagemId
                        ? `/mercado/cargas/${m.load_id}?viagem=${viagemId}`
                        : `/mercado/cargas/${m.load_id}`
                    }
                    className={classesBotao({ size: 'sm' }, 'mt-3')}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden="true" />
                    Propor
                  </Link>
                </div>
              </div>
            </div>

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
