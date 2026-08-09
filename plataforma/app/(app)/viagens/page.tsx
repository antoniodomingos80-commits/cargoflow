import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarMinhasViagens } from '@/lib/viagens/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { TRIP_STATUS_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types';
import { formatWeight, formatCurrency } from '@/lib/utils';
import { Truck, Plus, ArrowRight, RotateCcw, Calendar } from 'lucide-react';

export const metadata = { title: 'As minhas viagens' };

const BADGE: Record<string, string> = {
  PUBLISHED: 'cf-badge-transit',
  PARTIALLY_BOOKED: 'cf-badge-transit',
  FULL: 'cf-badge-done',
  IN_PROGRESS: 'cf-badge-transit',
  COMPLETED: 'cf-badge-done',
  CANCELLED: 'cf-badge-idle',
};

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default async function PaginaMinhasViagens() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');
  if (perfil.user.role === 'MERCHANT') redirect('/mercado/viagens');

  const viagens = (await listarMinhasViagens()) as any[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-600">As minhas viagens</h1>
          <p className="mt-1 text-sm text-slate-500">
            {viagens.length === 0
              ? 'Ainda não publicou nenhuma viagem.'
              : `${viagens.length} ${viagens.length === 1 ? 'viagem' : 'viagens'}`}
          </p>
        </div>
        <Link href="/viagens/nova">
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Publicar viagem
          </Button>
        </Link>
      </header>

      {viagens.length === 0 ? (
        <EmptyState
          icone={Truck}
          titulo="Nenhuma viagem publicada"
          texto="Anuncie a sua rota e o espaço livre. O sistema procura automaticamente cargas compatíveis — incluindo para o percurso de retorno."
          accao={{ href: '/viagens/nova', rotulo: 'Publicar primeira viagem' }}
        />
      ) : (
        <div className="space-y-3">
          {viagens.map((v) => (
            <Link key={v.id} href={`/viagens/${v.id}`} className="cf-card-interactive block p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={BADGE[v.status] ?? 'cf-badge-idle'}>
                      {TRIP_STATUS_LABELS[v.status as keyof typeof TRIP_STATUS_LABELS]}
                    </span>
                    {v.is_return_trip && (
                      <span className="cf-badge-transit">
                        <RotateCcw className="h-3 w-3" aria-hidden="true" />
                        Retorno
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
                      <dd>{formatarData(v.departure_at)}</dd>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                      <dd>
                        {v.vehicle?.plate} ·{' '}
                        {v.vehicle ? VEHICLE_TYPE_LABELS[v.vehicle.type as keyof typeof VEHICLE_TYPE_LABELS] : '—'}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="shrink-0 text-right">
                  <p className="text-lg font-bold text-navy-600">
                    {formatWeight(Number(v.available_weight_kg))}
                  </p>
                  <p className="text-xs text-slate-400">espaço livre</p>
                  {v.minimum_price && (
                    <p className="mt-1 text-sm font-medium text-brand-500">
                      desde {formatCurrency(Number(v.minimum_price), v.currency)}
                    </p>
                  )}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
