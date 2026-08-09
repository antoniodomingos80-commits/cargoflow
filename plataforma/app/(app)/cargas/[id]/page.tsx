import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile, createClient } from '@/lib/supabase/server';
import { obterCarga, publicarCarga, cancelarCarga } from '@/lib/cargas/actions';
import { correspondenciasDaCarga } from '@/lib/correspondencias/actions';
import { propostasDaCarga } from '@/lib/propostas/actions';
import { ListaTransportadores } from '@/components/correspondencias/lista-transportadores';
import { ListaPropostas } from '@/components/propostas/lista-propostas';
import { Button, classesBotao } from '@/components/ui/button';
import {
  LOAD_STATUS_LABELS, LOAD_STATUS_BADGE, CARGO_TYPE_LABELS,
  VEHICLE_TYPE_LABELS, type Load,
} from '@/lib/types';
import { formatCurrency, formatWeight, formatDistance } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, CheckCircle2, Zap, Snowflake, MapPin, Calendar,
  Pencil,
} from 'lucide-react';

export const metadata = { title: 'Detalhe da carga' };

function formatarData(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default async function PaginaDetalheCarga({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { criada?: string; guardada?: string };
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const carga = (await obterCarga(params.id)) as unknown as Load | null;
  if (!carga) notFound();

  const ehDono = carga.tenant_id === perfil.tenant.id;

  // Correspondências só para cargas ainda por adjudicar; propostas sempre
  // que haja alguma, para manter o histórico da negociação visível.
  const [correspondencias, propostas] = await Promise.all([
    ehDono && ['PUBLISHED', 'NEGOTIATING'].includes(carga.status)
      ? correspondenciasDaCarga(carga.id)
      : Promise.resolve([]),
    ehDono ? propostasDaCarga(carga.id) : Promise.resolve([]),
  ]);

  // Quando não há correspondências, saber qual é o maior camião disponível
  // permite explicar ao comerciante se o obstáculo é o peso da carga.
  let maiorCapacidadeMercado: number | null = null;
  if (
    ehDono &&
    correspondencias.length === 0 &&
    ['PUBLISHED', 'NEGOTIATING'].includes(carga.status)
  ) {
    const { data } = await createClient()
      .from('trips')
      .select('available_weight_kg')
      .in('status', ['PUBLISHED', 'PARTIALLY_BOOKED'])
      .gte('departure_at', new Date().toISOString())
      .order('available_weight_kg', { ascending: false })
      .limit(1)
      .maybeSingle();
    maiorCapacidadeMercado = data ? Number(data.available_weight_kg) : null;
  }
  const podePublicar = ehDono && carga.status === 'DRAFT';
  const podeCancelar =
    ehDono && ['DRAFT', 'PUBLISHED', 'NEGOTIATING'].includes(carga.status);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/cargas"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        As minhas cargas
      </Link>

      {searchParams.criada && (
        <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            {carga.status === 'PUBLISHED'
              ? 'Carga publicada. Os transportadores compatíveis vão ser notificados.'
              : 'Rascunho guardado. Publique quando estiver pronto.'}
          </span>
        </div>
      )}

      {searchParams.guardada && (
        <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Alterações guardadas. Os transportadores compatíveis foram
            recalculados com as novas condições.
          </span>
        </div>
      )}

      {/* Cabeçalho */}
      <header className="cf-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={LOAD_STATUS_BADGE[carga.status]}>
            {LOAD_STATUS_LABELS[carga.status]}
          </span>
          {carga.is_urgent && (
            <span className="cf-badge-delayed">
              <Zap className="h-3 w-3" aria-hidden="true" />
              Urgente
            </span>
          )}
          {carga.requires_refrigeration && (
            <span className="cf-badge-transit">
              <Snowflake className="h-3 w-3" aria-hidden="true" />
              Refrigerada
            </span>
          )}
          <span className="font-mono text-xs text-slate-400">{carga.reference}</span>
        </div>

        <h1 className="mt-3 text-2xl font-bold text-navy-600">{carga.title}</h1>

        {carga.description && (
          <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-600">
            {carga.description}
          </p>
        )}

        {(podePublicar || podeCancelar) && (
          <div className="mt-6 flex flex-wrap gap-3 border-t border-slate-100 pt-5">
            {podePublicar && (
              <form
                action={async () => {
                  'use server';
                  await publicarCarga(carga.id);
                }}
              >
                <Button type="submit">Publicar no marketplace</Button>
              </form>
            )}
            {podeCancelar && (
              <>
                <Link
                  href={`/cargas/${carga.id}/editar`}
                  className={classesBotao({ variant: 'outline' })}
                >
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                  Editar
                </Link>
                <form
                  action={async () => {
                    'use server';
                    await cancelarCarga(carga.id);
                  }}
                >
                  <Button type="submit" variant="outline">
                    Cancelar carga
                  </Button>
                </form>
              </>
            )}
          </div>
        )}
      </header>

      {/* Rota */}
      <section className="cf-card p-6">
        <h2 className="flex items-center gap-2 font-semibold text-navy-600">
          <MapPin className="h-4 w-4 text-brand-500" aria-hidden="true" />
          Rota
        </h2>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Origem</p>
            <p className="mt-0.5 font-semibold text-navy-600">{carga.origin?.name}</p>
            <p className="text-xs text-slate-500">{carga.origin?.province}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-300" aria-hidden="true" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Destino</p>
            <p className="mt-0.5 font-semibold text-navy-600">{carga.destination?.name}</p>
            <p className="text-xs text-slate-500">{carga.destination?.province}</p>
          </div>
          {carga.distance_km && (
            <div className="ml-auto rounded-lg bg-slate-50 px-4 py-2 text-center">
              <p className="text-lg font-bold text-navy-600">
                {formatDistance(Number(carga.distance_km))}
              </p>
              <p className="text-xs text-slate-500">distância estimada</p>
            </div>
          )}
        </div>
      </section>

      {/* Carga e datas */}
      <div className="grid gap-6 sm:grid-cols-2">
        <section className="cf-card p-6">
          <h2 className="font-semibold text-navy-600">Carga</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="Tipo" valor={CARGO_TYPE_LABELS[carga.cargo_type]} />
            <Linha rotulo="Peso" valor={formatWeight(Number(carga.weight_kg))} />
            {carga.volume_m3 && (
              <Linha rotulo="Volume" valor={`${carga.volume_m3} m³`} />
            )}
            {carga.required_vehicle_type && (
              <Linha
                rotulo="Veículo exigido"
                valor={VEHICLE_TYPE_LABELS[carga.required_vehicle_type]}
              />
            )}
          </dl>
        </section>

        <section className="cf-card p-6">
          <h2 className="flex items-center gap-2 font-semibold text-navy-600">
            <Calendar className="h-4 w-4 text-brand-500" aria-hidden="true" />
            Datas
          </h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="Recolha a partir de" valor={formatarData(carga.pickup_from)} />
            <Linha rotulo="Recolha até" valor={formatarData(carga.pickup_until)} />
            {carga.delivery_deadline && (
              <Linha rotulo="Entrega até" valor={formatarData(carga.delivery_deadline)} />
            )}
          </dl>
        </section>
      </div>

      {/* Preço */}
      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Valor</h2>
        <p className="mt-3 text-2xl font-bold text-brand-500">
          {carga.budget_amount
            ? formatCurrency(Number(carga.budget_amount), carga.currency)
            : 'Sob proposta'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          {carga.budget_amount
            ? 'Orçamento indicativo — sujeito a negociação.'
            : 'Os transportadores enviam propostas de preço.'}
        </p>
      </section>

      {/* Propostas recebidas — vêm primeiro porque exigem decisão */}
      {ehDono && propostas.length > 0 && (
        <ListaPropostas
          propostas={propostas as any}
          podeResponder={['PUBLISHED', 'NEGOTIATING'].includes(carga.status)}
        />
      )}

      {/* Correspondências — quem ainda pode vir a propor */}
      {ehDono && ['PUBLISHED', 'NEGOTIATING'].includes(carga.status) && (
        <ListaTransportadores
          cargaId={carga.id}
          correspondencias={correspondencias}
          pesoCarga={Number(carga.weight_kg)}
          maiorCapacidadeDisponivel={maiorCapacidadeMercado}
        />
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
