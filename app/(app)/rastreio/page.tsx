import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarEmTransito } from '@/lib/rastreio/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { LOAD_STATUS_LABELS, LOAD_STATUS_BADGE, type LoadStatus } from '@/lib/types';
import { formatWeight } from '@/lib/utils';
import { MapPin, ArrowRight, Package, Clock } from 'lucide-react';

export const metadata = { title: 'Acompanhar' };

function formatarData(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default async function PaginaRastreioLista() {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const cargas = (await listarEmTransito()) as any[];
  const ehTransportador = ['CARRIER', 'COMPANY_ADMIN', 'COMPANY_STAFF'].includes(
    perfil.user.role,
  );

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-bold text-navy-600">
          {ehTransportador ? 'Entregas' : 'Acompanhar'}
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          {cargas.length === 0
            ? 'Nenhuma carga em curso neste momento.'
            : `${cargas.length} ${cargas.length === 1 ? 'operação em curso' : 'operações em curso'}`}
        </p>
      </header>

      {cargas.length === 0 ? (
        <EmptyState
          icone={MapPin}
          titulo="Nada em curso"
          texto={
            ehTransportador
              ? 'Quando uma proposta sua for aceite, a entrega aparece aqui para poder partilhar a localização.'
              : 'Quando aceitar uma proposta, poderá acompanhar aqui o transporte em tempo real.'
          }
          accao={{
            href: ehTransportador ? '/mercado/cargas' : '/cargas',
            rotulo: ehTransportador ? 'Procurar carga' : 'As minhas cargas',
          }}
        />
      ) : (
        <div className="space-y-3">
          {cargas.map((c) => (
            <Link
              key={c.id}
              href={`/rastreio/${c.id}`}
              className="cf-card-interactive block p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={LOAD_STATUS_BADGE[c.status as LoadStatus]}>
                      {LOAD_STATUS_LABELS[c.status as LoadStatus]}
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      {c.reference}
                    </span>
                  </div>

                  <h2 className="mt-2.5 truncate font-semibold text-navy-600">
                    {c.title}
                  </h2>

                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                    <span>{c.origin?.city}</span>
                    <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                    <span>{c.destination?.city}</span>
                  </div>

                  <dl className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" aria-hidden="true" />
                      <dd>{formatWeight(Number(c.weight_kg))}</dd>
                    </div>
                    {c.delivery_deadline && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        <dd>Entrega até {formatarData(c.delivery_deadline)}</dd>
                      </div>
                    )}
                  </dl>
                </div>

                <span className="shrink-0 self-center text-sm font-medium text-brand-500">
                  Ver no mapa →
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
