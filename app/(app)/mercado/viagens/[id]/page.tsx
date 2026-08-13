import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { obterViagem } from '@/lib/viagens/actions';
import { listarMinhasCargas } from '@/lib/cargas/actions';
import { DialogoPropostaViagem } from '@/components/propostas/dialogo-proposta-viagem';
import { VEHICLE_TYPE_LABELS } from '@/lib/types';
import { formatCurrency, formatWeight } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, Truck, Snowflake, RotateCcw, AlertTriangle,
  Phone, MapPin, ShieldCheck, User,
} from 'lucide-react';

export const metadata = { title: 'Viagem disponível' };

function formatarData(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Vista de uma viagem do ponto de vista do COMERCIANTE.
 *
 * Espelha `/mercado/cargas/[id]` (vista do transportador sobre uma carga),
 * na direção inversa: aqui é o comerciante que escolhe propor uma das suas
 * cargas a esta viagem. Antes desta página existir, não havia nenhuma forma
 * de negociar a partir de `/mercado/viagens` — os cartões eram informativos
 * mas não clicáveis.
 */
export default async function PaginaViagemMercado({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const routeParams = await params;

  const viagem = (await obterViagem(routeParams.id)) as any;
  if (!viagem) notFound();

  // Se for a própria viagem, enviar para a vista de dono
  if (viagem.tenant_id === perfil.tenant.id) {
    redirect(`/viagens/${viagem.id}`);
  }

  const disponivel = ['PUBLISHED', 'PARTIALLY_BOOKED'].includes(viagem.status);
  const verificado = perfil.user.verification === 'APPROVED';

  const todasCargas = (await listarMinhasCargas()) as any[];

  const cargasAtivas = todasCargas.filter((c) =>
    ['PUBLISHED', 'NEGOTIATING'].includes(c.status),
  );

  const cargasCompativeis = cargasAtivas.filter(
    (c) => Number(c.weight_kg) <= Number(viagem.available_weight_kg),
  );

  const maiorPeso = cargasAtivas.reduce(
    (max, c) => Math.max(max, Number(c.weight_kg)),
    0,
  );
  const temCargasPublicadas = todasCargas.some((c) =>
    ['PUBLISHED', 'NEGOTIATING'].includes(c.status),
  );

  const motivoIncompatibilidade =
    cargasCompativeis.length > 0
      ? null
      : cargasAtivas.length === 0
        ? temCargasPublicadas
          ? 'ja-adjudicadas'
          : 'sem-cargas'
        : 'capacidade';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/mercado/viagens"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Transporte disponível
      </Link>

      <header className="cf-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          {viagem.is_return_trip && (
            <span className="cf-badge-transit">
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              Viagem de retorno
            </span>
          )}
          {viagem.vehicle?.has_refrigeration && (
            <span className="cf-badge-transit">
              <Snowflake className="h-3 w-3" aria-hidden="true" />
              Refrigerado
            </span>
          )}
          <span className="font-mono text-xs text-slate-400">{viagem.reference}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Sai de</p>
            <p className="mt-0.5 font-semibold text-navy-600">{viagem.origin?.city}</p>
            <p className="text-xs text-slate-500">{viagem.origin?.province}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-300" aria-hidden="true" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Vai para</p>
            <p className="mt-0.5 font-semibold text-navy-600">{viagem.destination?.city}</p>
            <p className="text-xs text-slate-500">{viagem.destination?.province}</p>
          </div>
        </div>
      </header>

      <section className="cf-card p-6">
        <h2 className="mb-4 font-semibold text-navy-600">Transportador</h2>
        <div className="flex items-center gap-4">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full bg-brand-100">
            {viagem.motorista?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={viagem.motorista.avatar_url}
                alt={viagem.motorista.full_name}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center">
                <User className="h-6 w-6 text-brand-400" aria-hidden="true" />
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-navy-600">
                {viagem.motorista?.full_name ?? viagem.tenant?.name ?? 'Transportador'}
              </p>
              {viagem.tenant?.verification === 'APPROVED' && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600">
                  <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                  Verificado
                </span>
              )}
            </div>
            {viagem.tenant?.name && viagem.tenant.name !== viagem.motorista?.full_name && (
              <p className="text-sm text-slate-500">{viagem.tenant.name}</p>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
              {viagem.motorista?.base_city && (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
                  {viagem.motorista.base_city}
                </span>
              )}
              {viagem.motorista?.phone && (
                <a
                  href={`tel:${viagem.motorista.phone}`}
                  className="inline-flex items-center gap-1 text-brand-500 hover:underline"
                >
                  <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                  {viagem.motorista.phone}
                </a>
              )}
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="cf-card p-6">
          <h2 className="font-semibold text-navy-600">Espaço disponível</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="Capacidade" valor={formatWeight(Number(viagem.available_weight_kg))} />
            {viagem.available_volume_m3 && (
              <Linha rotulo="Volume" valor={`${viagem.available_volume_m3} m³`} />
            )}
            <Linha
              rotulo="Veículo"
              valor={
                viagem.vehicle
                  ? VEHICLE_TYPE_LABELS[viagem.vehicle.type as keyof typeof VEHICLE_TYPE_LABELS]
                  : '—'
              }
            />
          </dl>
        </section>

        <section className="cf-card p-6">
          <h2 className="font-semibold text-navy-600">Datas</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="Parte em" valor={formatarData(viagem.departure_at)} />
            {viagem.estimated_arrival && (
              <Linha rotulo="Chegada prevista" valor={formatarData(viagem.estimated_arrival)} />
            )}
          </dl>
        </section>
      </div>

      <section className="cf-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Preço mínimo do transportador
            </p>
            <p className="mt-1 text-2xl font-bold text-brand-500">
              {viagem.minimum_price
                ? formatCurrency(Number(viagem.minimum_price), viagem.currency)
                : 'Sob proposta'}
            </p>
          </div>

          {verificado && disponivel && cargasCompativeis.length > 0 && (
            <DialogoPropostaViagem
              tripId={viagem.id}
              tripReferencia={viagem.reference}
              precoMinimo={viagem.minimum_price ? Number(viagem.minimum_price) : null}
              moeda={viagem.currency}
              cargas={cargasCompativeis}
            />
          )}
        </div>

        {!verificado && (
          <p className="mt-4 rounded-lg bg-accent-50 px-4 py-3 text-xs text-accent-800">
            Só pode enviar propostas com a conta verificada.{' '}
            <Link href="/documentos" className="font-semibold underline">
              Carregar documentos
            </Link>
          </p>
        )}

        {verificado && disponivel && motivoIncompatibilidade === 'capacidade' && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-accent-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
            <p className="text-xs text-accent-800">
              Nenhuma das suas cargas cabe no espaço restante desta viagem
              ({formatWeight(Number(viagem.available_weight_kg))}). A maior que tem é de{' '}
              {formatWeight(maiorPeso)}.
            </p>
          </div>
        )}

        {verificado && disponivel && motivoIncompatibilidade === 'sem-cargas' && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-accent-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
            <p className="text-xs text-accent-800">
              Ainda não tem nenhuma carga publicada.{' '}
              <Link href="/cargas/nova" className="font-semibold underline">
                Publicar carga
              </Link>
            </p>
          </div>
        )}

        {verificado && disponivel && motivoIncompatibilidade === 'ja-adjudicadas' && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-accent-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-600" aria-hidden="true" />
            <p className="text-xs text-accent-800">
              As suas cargas publicadas já têm transporte adjudicado ou não estão
              disponíveis para novas propostas.
            </p>
          </div>
        )}

        {!disponivel && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" aria-hidden="true" />
            <p className="text-xs text-slate-600">Esta viagem já não está disponível.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-slate-500">{rotulo}</dt>
      <dd className="font-medium text-navy-600">{valor}</dd>
    </div>
  );
}
