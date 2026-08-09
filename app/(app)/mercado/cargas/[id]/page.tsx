import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { obterCarga } from '@/lib/cargas/actions';
import { listarMinhasViagens } from '@/lib/viagens/actions';
import { DialogoProposta } from '@/components/propostas/dialogo-proposta';
import { Button } from '@/components/ui/button';
import {
  LOAD_STATUS_LABELS, LOAD_STATUS_BADGE, CARGO_TYPE_LABELS,
  VEHICLE_TYPE_LABELS, type Load,
} from '@/lib/types';
import { formatCurrency, formatWeight, formatDistance } from '@/lib/utils';
import { ArrowLeft, ArrowRight, Zap, Snowflake, Send, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Carga disponível' };

function formatarData(iso: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Vista de uma carga do ponto de vista do TRANSPORTADOR.
 *
 * Mostra a informação necessária para decidir se compensa, sem expor dados
 * do comerciante que só devem aparecer depois de haver acordo (contactos
 * diretos, morada exata de recolha).
 */
export default async function PaginaCargaMercado({
  params,
}: {
  params: { id: string };
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const carga = (await obterCarga(params.id)) as unknown as Load | null;
  if (!carga) notFound();

  // Se for a própria carga, enviar para a vista de dono
  if (carga.tenant_id === perfil.tenant.id) {
    redirect(`/cargas/${carga.id}`);
  }

  const disponivel = ['PUBLISHED', 'NEGOTIATING'].includes(carga.status);
  const verificado = perfil.user.verification === 'APPROVED';

  const todasViagens = (await listarMinhasViagens()) as any[];

  // Viagens ainda por partir, independentemente de servirem para esta carga
  const viagensAtivas = todasViagens.filter(
    (v) =>
      ['PUBLISHED', 'PARTIALLY_BOOKED'].includes(v.status) &&
      new Date(v.departure_at) >= new Date(),
  );

  const viagensCompativeis = viagensAtivas.filter(
    (v) => Number(v.available_weight_kg) >= Number(carga.weight_kg),
  );

  /**
   * Quando não há viagem compatível, é preciso dizer PORQUÊ.
   * Não mostrar o botão sem explicação faz parecer que o produto está
   * avariado, quando na verdade está a impedir um transporte impossível.
   */
  const maiorCapacidade = viagensAtivas.reduce(
    (max, v) => Math.max(max, Number(v.available_weight_kg)),
    0,
  );
  // Ter viagens publicadas mas todas já partidas é uma situação diferente de
  // não ter nenhuma. Dizer "publique uma viagem" a quem tem duas publicadas
  // faz o produto parecer avariado.
  const temViagensPublicadas = todasViagens.some((v) =>
    ['PUBLISHED', 'PARTIALLY_BOOKED'].includes(v.status),
  );

  const motivoIncompatibilidade =
    viagensCompativeis.length > 0
      ? null
      : viagensAtivas.length === 0
        ? temViagensPublicadas
          ? 'ja-partiram'
          : 'sem-viagens'
        : 'capacidade';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/mercado/cargas"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Cargas disponíveis
      </Link>

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

        {/* Rota em destaque */}
        <div className="mt-6 flex flex-wrap items-center gap-4 rounded-xl bg-slate-50 p-5">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Recolher em</p>
            <p className="mt-0.5 font-semibold text-navy-600">{carga.origin?.city}</p>
            <p className="text-xs text-slate-500">{carga.origin?.province}</p>
          </div>
          <ArrowRight className="h-5 w-5 text-slate-300" aria-hidden="true" />
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">Entregar em</p>
            <p className="mt-0.5 font-semibold text-navy-600">{carga.destination?.city}</p>
            <p className="text-xs text-slate-500">{carga.destination?.province}</p>
          </div>
          {carga.distance_km && (
            <div className="ml-auto text-right">
              <p className="text-xl font-bold text-navy-600">
                {formatDistance(Number(carga.distance_km))}
              </p>
              <p className="text-xs text-slate-500">estimados</p>
            </div>
          )}
        </div>
      </header>

      <div className="grid gap-6 sm:grid-cols-2">
        <section className="cf-card p-6">
          <h2 className="font-semibold text-navy-600">O que transportar</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="Tipo" valor={CARGO_TYPE_LABELS[carga.cargo_type]} />
            <Linha rotulo="Peso" valor={formatWeight(Number(carga.weight_kg))} />
            {carga.volume_m3 && <Linha rotulo="Volume" valor={`${carga.volume_m3} m³`} />}
            {carga.required_vehicle_type && (
              <Linha
                rotulo="Veículo exigido"
                valor={VEHICLE_TYPE_LABELS[carga.required_vehicle_type]}
              />
            )}
          </dl>
        </section>

        <section className="cf-card p-6">
          <h2 className="font-semibold text-navy-600">Janela de recolha</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <Linha rotulo="A partir de" valor={formatarData(carga.pickup_from)} />
            <Linha rotulo="Até" valor={formatarData(carga.pickup_until)} />
            {carga.delivery_deadline && (
              <Linha rotulo="Entrega até" valor={formatarData(carga.delivery_deadline)} />
            )}
          </dl>
        </section>
      </div>

      {/* Ação */}
      <section className="cf-card p-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-400">
              Orçamento do comerciante
            </p>
            <p className="mt-1 text-2xl font-bold text-brand-500">
              {carga.budget_amount
                ? formatCurrency(Number(carga.budget_amount), carga.currency)
                : 'Sob proposta'}
            </p>
          </div>

          {verificado && disponivel && viagensCompativeis.length > 0 && (
            <DialogoProposta
              cargaId={carga.id}
              cargaReferencia={carga.reference}
              orcamento={carga.budget_amount ? Number(carga.budget_amount) : null}
              moeda={carga.currency}
              viagens={viagensCompativeis}
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

        {/* Explicar sempre porque não é possível propor */}
        {verificado && disponivel && motivoIncompatibilidade === 'capacidade' && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-accent-50 px-4 py-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
              aria-hidden="true"
            />
            <div className="text-sm">
              <p className="font-medium text-navy-600">
                Esta carga não cabe nas suas viagens
              </p>
              <p className="mt-1 text-slate-600">
                A carga pesa <strong>{formatWeight(Number(carga.weight_kg))}</strong>,
                mas a viagem sua com mais espaço tem apenas{' '}
                <strong>{formatWeight(maiorCapacidade)}</strong> disponíveis.
              </p>
              <p className="mt-2 text-xs text-slate-500">
                Precisa de um veículo com maior capacidade, ou de uma viagem
                onde ainda não tenha aceite outras cargas.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/frota/novo"
                  className="text-xs font-semibold text-brand-500 underline"
                >
                  Registar veículo maior
                </Link>
                <Link
                  href="/mercado/cargas"
                  className="text-xs font-semibold text-brand-500 underline"
                >
                  Ver outras cargas
                </Link>
              </div>
            </div>
          </div>
        )}

        {verificado && disponivel && motivoIncompatibilidade === 'ja-partiram' && (
          <div className="mt-4 flex items-start gap-3 rounded-lg bg-accent-50 px-4 py-3">
            <AlertTriangle
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
              aria-hidden="true"
            />
            <div className="text-sm">
              <p className="font-medium text-navy-600">
                As suas viagens já partiram
              </p>
              <p className="mt-1 text-slate-600">
                Um camião que já saiu não pode aceitar carga nova. Se a data de
                partida ficou desatualizada, corrija-a; caso contrário publique
                a próxima viagem.
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link
                  href="/viagens"
                  className="text-xs font-semibold text-brand-500 underline"
                >
                  Rever as minhas viagens
                </Link>
                <Link
                  href="/viagens/nova"
                  className="text-xs font-semibold text-brand-500 underline"
                >
                  Publicar nova viagem
                </Link>
              </div>
            </div>
          </div>
        )}

        {verificado && disponivel && motivoIncompatibilidade === 'sem-viagens' && (
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
            Ainda não tem viagens publicadas.{' '}
            <Link href="/viagens/nova" className="font-semibold text-brand-500 underline">
              Publique uma viagem
            </Link>{' '}
            para poder propor transporte.
          </p>
        )}

        {!disponivel && (
          <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-xs text-slate-600">
            Esta carga já não está a receber propostas.
          </p>
        )}
      </section>
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
