import { aceitarProposta, rejeitarProposta } from '@/lib/propostas/actions';
import { Pontuacao } from '@/components/correspondencias/pontuacao';
import { Contraproposta } from '@/components/propostas/contraproposta';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatWeight } from '@/lib/utils';
import { VEHICLE_TYPE_LABELS, type VehicleType } from '@/lib/types';
import { redirect } from 'next/navigation';
import {
  Star, ShieldCheck, RotateCcw, ArrowRight, Check, X, Clock, Snowflake, Inbox,
} from 'lucide-react';

interface Proposta {
  offer_id: string;
  amount: number;
  currency: string;
  message: string | null;
  status: string;
  created_at: string;
  expires_at: string | null;
  trip_reference: string | null;
  departure_at: string | null;
  available_weight_kg: number | null;
  is_return_trip: boolean | null;
  origin_city: string | null;
  destination_city: string | null;
  vehicle_plate: string | null;
  vehicle_type: string | null;
  has_refrigeration: boolean | null;
  proposer_name: string;
  proposer_rating: number | null;
  proposer_rating_count: number;
  proposer_verified: boolean;
  match_score: number | null;
}

const ESTADO_ROTULO: Record<string, string> = {
  PENDING: 'Pendente',
  ACCEPTED: 'Aceite',
  REJECTED: 'Recusada',
  COUNTERED: 'Contraproposta enviada',
  WITHDRAWN: 'Retirada',
  EXPIRED: 'Expirada',
};

const ESTADO_BADGE: Record<string, string> = {
  PENDING: 'cf-badge-transit',
  ACCEPTED: 'cf-badge-done',
  REJECTED: 'cf-badge-idle',
  COUNTERED: 'cf-badge-delayed',
  WITHDRAWN: 'cf-badge-idle',
  EXPIRED: 'cf-badge-idle',
};

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Propostas recebidas numa carga — vista do comerciante.
 *
 * Ordenadas por valor crescente entre as pendentes: o comerciante quer
 * comparar preços, e o mais barato aparece primeiro. Mas o preço não é tudo,
 * por isso mostra-se também reputação e compatibilidade lado a lado.
 */
export function ListaPropostas({
  propostas,
  podeResponder,
}: {
  propostas: Proposta[];
  podeResponder: boolean;
}) {
  if (propostas.length === 0) {
    return (
      <section className="cf-card border-dashed p-8 text-center">
        <Inbox className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
        <h3 className="mt-4 font-semibold text-navy-600">Ainda não há propostas</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
          Os transportadores compatíveis foram notificados. As propostas
          aparecem aqui assim que chegarem.
        </p>
      </section>
    );
  }

  const pendentes = propostas.filter((p) => p.status === 'PENDING');

  return (
    <section className="space-y-4">
      <header>
        <h2 className="font-semibold text-navy-600">
          {propostas.length} {propostas.length === 1 ? 'proposta' : 'propostas'}
          {pendentes.length > 0 && (
            <span className="ml-2 text-sm font-normal text-slate-500">
              ({pendentes.length} por responder)
            </span>
          )}
        </h2>
        {pendentes.length > 1 && (
          <p className="mt-1 text-xs text-slate-500">
            Ordenadas do valor mais baixo para o mais alto.
          </p>
        )}
      </header>

      <div className="space-y-3">
        {propostas.map((p) => {
          const pendente = p.status === 'PENDING';
          const valorEhCompetitivo = pendente && p.amount !== null && p.amount <= 2000;
          const temBoaCompatibilidade = p.match_score !== null && Number(p.match_score) >= 70;
          const temBoaReputacao = p.proposer_rating_count > 0 && p.proposer_rating !== null && Number(p.proposer_rating) >= 4.5;
          const sinais = [
            valorEhCompetitivo ? 'Valor competitivo' : null,
            temBoaCompatibilidade ? 'Boa compatibilidade' : null,
            p.is_return_trip ? 'Retorno' : null,
            temBoaReputacao ? 'Reputação forte' : null,
            p.has_refrigeration ? 'Refrigerado' : null,
          ].filter(Boolean) as string[];
          return (
            <article
              key={p.offer_id}
              className={
                pendente
                  ? 'cf-card p-5 ring-1 ring-brand-100'
                  : 'cf-card p-5 opacity-70'
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={ESTADO_BADGE[p.status] ?? 'cf-badge-idle'}>
                      {ESTADO_ROTULO[p.status] ?? p.status}
                    </span>
                    {p.match_score !== null && (
                      <Pontuacao valor={Number(p.match_score)} tamanho="sm" />
                    )}
                    {p.is_return_trip && (
                      <span className="cf-badge-transit">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Retorno
                      </span>
                    )}
                    {p.has_refrigeration && (
                      <span className="cf-badge-transit">
                        <Snowflake className="h-3 w-3" aria-hidden="true" />
                        Refrigerado
                      </span>
                    )}
                  </div>

                  <h3 className="mt-3 flex items-center gap-2 font-semibold text-navy-600">
                    {p.proposer_name}
                    {p.proposer_verified && (
                      <ShieldCheck
                        className="h-4 w-4 text-green-500"
                        aria-label="Verificado"
                      />
                    )}
                  </h3>

                  {p.proposer_rating_count > 0 && p.proposer_rating !== null ? (
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
                      <Star
                        className="h-3.5 w-3.5 fill-accent-400 text-accent-400"
                        aria-hidden="true"
                      />
                      <span className="font-medium">
                        {Number(p.proposer_rating).toFixed(1)}
                      </span>
                      <span className="text-xs text-slate-400">
                        ({p.proposer_rating_count})
                      </span>
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-400">Ainda sem avaliações</p>
                  )}

                  {p.origin_city && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                      <span>{p.origin_city}</span>
                      <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      <span>{p.destination_city}</span>
                    </div>
                  )}

                  <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
                    {p.departure_at && (
                      <div>
                        <dt className="inline">Parte: </dt>
                        <dd className="inline font-medium text-navy-600">
                          {formatarData(p.departure_at)}
                        </dd>
                      </div>
                    )}
                    {p.vehicle_type && (
                      <div>
                        <dt className="inline">Veículo: </dt>
                        <dd className="inline font-medium text-navy-600">
                          {VEHICLE_TYPE_LABELS[p.vehicle_type as VehicleType]} ·{' '}
                          <span className="font-mono">{p.vehicle_plate}</span>
                        </dd>
                      </div>
                    )}
                  </dl>

                  {sinais.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {sinais.map((sinal) => (
                        <span
                          key={sinal}
                          className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600"
                        >
                          {sinal}
                        </span>
                      ))}
                    </div>
                  )}

                  {p.message && (
                    <blockquote className="mt-3 rounded-lg bg-slate-50 px-4 py-3 text-sm italic leading-relaxed text-slate-600">
                      “{p.message}”
                    </blockquote>
                  )}

                  {pendente && p.expires_at && (
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
                      <Clock className="h-3 w-3" aria-hidden="true" />
                      Válida até {formatarData(p.expires_at)}
                    </p>
                  )}
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-2xl font-bold text-brand-500">
                    {formatCurrency(Number(p.amount), p.currency)}
                  </p>

                  {pendente && podeResponder && (
                    <div className="mt-4 flex flex-col gap-2">
                      <form
                        action={async () => {
                          'use server';
                          const r = await aceitarProposta(p.offer_id);
                          redirect(`/mensagens/${r.conversation_id}?acordo=1`);
                        }}
                      >
                        <Button type="submit" size="sm" block>
                          <Check className="h-3.5 w-3.5" aria-hidden="true" />
                          Aceitar
                        </Button>
                      </form>
                      <Contraproposta propostaId={p.offer_id} moeda={p.currency} valorAtual={Number(p.amount)} />
                      <form
                        action={async () => {
                          'use server';
                          await rejeitarProposta(p.offer_id);
                        }}
                      >
                        <Button type="submit" size="sm" variant="ghost" block>
                          <X className="h-3.5 w-3.5" aria-hidden="true" />
                          Recusar
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
