import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { obterViagem, cancelarViagem } from '@/lib/viagens/actions';
import { correspondenciasDaViagem } from '@/lib/correspondencias/actions';
import { ListaCargas } from '@/components/correspondencias/lista-cargas';
import { Button, classesBotao } from '@/components/ui/button';
import { TRIP_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types';
import { formatWeight, formatCurrency } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, CheckCircle2, RotateCcw, Truck, Calendar, Snowflake,
  Pencil,
} from 'lucide-react';

export const metadata = { title: 'Detalhe da viagem' };

const BADGE: Record<string, string> = {
  PUBLISHED: 'cf-badge-transit',
  PARTIALLY_BOOKED: 'cf-badge-transit',
  FULL: 'cf-badge-done',
  IN_PROGRESS: 'cf-badge-transit',
  COMPLETED: 'cf-badge-done',
  CANCELLED: 'cf-badge-idle',
};

function formatarData(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function PaginaDetalheViagem({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ criada?: string; guardada?: string }>;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const routeParams = await params;

  const viagem = (await obterViagem(routeParams.id)) as any;
  if (!viagem) notFound();

  const filtros = await searchParams;

  const ehDono = viagem.tenant_id === perfil.tenant.id;
  const correspondencias = ehDono ? await correspondenciasDaViagem(viagem.id) : [];
  const podeCancelar = ehDono && ['PUBLISHED', 'PARTIALLY_BOOKED'].includes(viagem.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/viagens"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        As minhas viagens
      </Link>

      {filtros.criada && (
        <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Viagem publicada. As cargas compatíveis aparecem abaixo — a procura
            é automática e contínua.
          </span>
        </div>
      )}

      {filtros.guardada && (
        <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Alterações guardadas. As correspondências são recalculadas com as
            novas condições.
          </span>
        </div>
      )}

      <header className="cf-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={BADGE[viagem.status] ?? 'cf-badge-idle'}>
            {TRIP_STATUS_LABELS[viagem.status as keyof typeof TRIP_STATUS_LABELS]}
          </span>
          {viagem.is_return_trip && (
            <span className="cf-badge-transit">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Viagem de retorno
            </span>
          )}
          <span className="font-mono text-xs text-slate-400">{viagem.reference}</span>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Parte de</p>
            <p className="mt-0.5 text-lg font-bold text-navy-600">{viagem.origin?.city}</p>
            <p className="text-xs text-slate-500">{viagem.origin?.province}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-300" aria-hidden="true" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Vai para</p>
            <p className="mt-0.5 text-lg font-bold text-navy-600">{viagem.destination?.city}</p>
            <p className="text-xs text-slate-500">{viagem.destination?.province}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xl font-bold text-brand-500">
              {formatWeight(Number(viagem.available_weight_kg))}
            </p>
            <p className="text-xs text-slate-500">espaço livre</p>
          </div>
        </div>

        {podeCancelar && (
          <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-slate-100 pt-5">
            <Link
              href={`/viagens/${viagem.id}/editar`}
              className={classesBotao({ variant: 'outline', size: 'sm' })}
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Editar
            </Link>

            <form
              action={async () => {
                'use server';
                await cancelarViagem(viagem.id);
              }}
            >
              <Button type="submit" variant="outline" size="sm">
                Cancelar viagem
              </Button>
            </form>
          </div>
        )}
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="cf-card p-6">
          <h2 className="flex items-center gap-2 font-semibold text-navy-600">
            <Truck className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Veículo
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="Matrícula" valor={viagem.vehicle?.plate ?? '—'} />
            <Linha
              rotulo="Tipo"
              valor={
                viagem.vehicle
                  ? VEHICLE_TYPE_LABELS[viagem.vehicle.type as keyof typeof VEHICLE_TYPE_LABELS]
                  : '—'
              }
            />
            <Linha
              rotulo="Capacidade total"
              valor={
                viagem.vehicle
                  ? formatWeight(Number(viagem.vehicle.max_weight_kg))
                  : '—'
              }
            />
            {viagem.vehicle?.has_refrigeration && (
              <div className="pt-1">
                <span className="cf-badge-transit">
                  <Snowflake className="h-3 w-3" aria-hidden="true" />
                  Refrigerado
                </span>
              </div>
            )}
          </dl>
        </section>

        <section className="cf-card p-6">
          <h2 className="flex items-center gap-2 font-semibold text-navy-600">
            <Calendar className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Datas
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="Partida" valor={formatarData(viagem.departure_at)} />
            <Linha rotulo="Chegada prevista" valor={formatarData(viagem.estimated_arrival)} />
            {viagem.minimum_price && (
              <Linha
                rotulo="Valor mínimo"
                valor={formatCurrency(Number(viagem.minimum_price), viagem.currency)}
              />
            )}
          </dl>
        </section>
      </div>

      {/* Correspondências — cargas que servem esta viagem */}
      {ehDono && ['PUBLISHED', 'PARTIALLY_BOOKED'].includes(viagem.status) && (
        <ListaCargas correspondencias={correspondencias} viagemId={viagem.id} />
      )}
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="text-right font-medium text-navy-600">{valor}</dd>
    </div>
  );
}
