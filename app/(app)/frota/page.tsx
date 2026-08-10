import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarVeiculos } from '@/lib/frota/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { VEHICLE_TYPE_LABELS, type Vehicle } from '@/lib/types';
import { formatWeight } from '@/lib/utils';
import { Truck, Plus, CheckCircle2, Clock, Snowflake } from 'lucide-react';

export const metadata = { title: 'Frota' };

export default async function PaginaFrota({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string }>;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  if (perfil.user.role === 'MERCHANT') redirect('/painel');

  const filtros = await searchParams;

  const veiculos = (await listarVeiculos()) as unknown as Vehicle[];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-navy-600">Frota</h1>
          <p className="mt-1 text-sm text-slate-500">
            {veiculos.length === 0
              ? 'Registe os seus veículos para poder publicar viagens.'
              : `${veiculos.length} ${veiculos.length === 1 ? 'veículo' : 'veículos'}`}
          </p>
        </div>
        <Link href="/frota/novo">
          <Button>
            <Plus className="h-4 w-4" aria-hidden="true" />
            Adicionar veículo
          </Button>
        </Link>
      </header>

      {filtros.criado && (
        <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Veículo registado. Fica pendente de verificação, mas já pode ser
            usado para publicar viagens.
          </span>
        </div>
      )}

      {veiculos.length === 0 ? (
        <EmptyState
          icone={Truck}
          titulo="Nenhum veículo registado"
          texto="Sem veículo não é possível publicar viagens. Registe o seu camião — leva menos de um minuto."
          accao={{ href: '/frota/novo', rotulo: 'Registar veículo' }}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {veiculos.map((v) => (
            <article key={v.id} className="cf-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-lg font-bold text-navy-600">{v.plate}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    {VEHICLE_TYPE_LABELS[v.type]}
                  </p>
                </div>
                {v.verification === 'APPROVED' ? (
                  <span className="cf-badge-done">
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                    Verificado
                  </span>
                ) : (
                  <span className="cf-badge-idle">
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    Pendente
                  </span>
                )}
              </div>

              {(v.brand || v.model) && (
                <p className="mt-3 text-sm text-slate-600">
                  {[v.brand, v.model, v.year].filter(Boolean).join(' · ')}
                </p>
              )}

              <dl className="mt-4 flex flex-wrap gap-x-5 gap-y-1.5 border-t border-slate-100 pt-4 text-xs">
                <div>
                  <dt className="text-slate-400">Capacidade</dt>
                  <dd className="mt-0.5 font-semibold text-navy-600">
                    {formatWeight(Number(v.max_weight_kg))}
                  </dd>
                </div>
                {v.max_volume_m3 && (
                  <div>
                    <dt className="text-slate-400">Volume</dt>
                    <dd className="mt-0.5 font-semibold text-navy-600">
                      {v.max_volume_m3} m³
                    </dd>
                  </div>
                )}
                {v.has_refrigeration && (
                  <div className="flex items-end">
                    <span className="cf-badge-transit">
                      <Snowflake className="h-3 w-3" aria-hidden="true" />
                      Refrigerado
                    </span>
                  </div>
                )}
              </dl>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
