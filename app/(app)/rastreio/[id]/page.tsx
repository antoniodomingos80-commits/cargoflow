import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { obterCarga } from '@/lib/cargas/actions';
import { obterEstadoRastreio, obterPercurso, obterEventos } from '@/lib/rastreio/actions';
import {
  obterProvaEntrega, obterAvaliacoes, urlsAssinados,
} from '@/lib/entrega/actions';
import { PartilharLocalizacao } from './partilhar-localizacao';
import { PainelEntrega } from '@/components/entrega/painel-entrega';
import { Mapa } from '@/components/mapa';
import { LOAD_STATUS_LABELS, LOAD_STATUS_BADGE, type Load } from '@/lib/types';
import { formatDistance } from '@/lib/utils';
import {
  ArrowLeft, ArrowRight, MapPin, Clock, Truck, AlertTriangle,
  Package, CheckCircle2, Navigation,
} from 'lucide-react';

export const metadata = { title: 'Acompanhar entrega' };

const EVENTO_ICONE: Record<string, any> = {
  AGREEMENT_REACHED: CheckCircle2,
  PICKED_UP: Package,
  IN_TRANSIT: Navigation,
  DELIVERED: CheckCircle2,
};

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

export default async function PaginaRastreio({ params }: { params: Promise<{ id: string }> }) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  const routeParams = await params;

  const carga = (await obterCarga(routeParams.id)) as unknown as Load | null;
  if (!carga) notFound();

  const estado = await obterEstadoRastreio(routeParams.id);
  if (!estado) notFound();

  const [percurso, eventos, prova, avaliacoes] = await Promise.all([
    estado.trip_id ? obterPercurso(estado.trip_id) : Promise.resolve([]),
    obterEventos(routeParams.id),
    obterProvaEntrega(routeParams.id),
    obterAvaliacoes(routeParams.id),
  ]);

  // Os buckets são privados — as imagens precisam de URLs assinados.
  // O tipo do fallback tem de ser explícito, senão o TypeScript infere `{}`
  // e a indexação por string deixa de compilar.
  const vazio = (): Promise<Record<string, string>> => Promise.resolve({});
  const [urlsFotos, urlsAssinatura] = await Promise.all([
    prova && prova.photo_urls.length > 0
      ? urlsAssinados('provas-entrega', prova.photo_urls)
      : vazio(),
    prova?.signature_url
      ? urlsAssinados('provas-entrega', [prova.signature_url])
      : vazio(),
  ]);

  const ehDono = carga.tenant_id === perfil.tenant.id;
  const ehTransportador = carga.assigned_trip_id !== null && !ehDono;

  // Sem sinal há mais de 90 minutos merece aviso — em estrada aberta é normal
  // ficar sem rede algum tempo, mas hora e meia já é sinal de problema.
  const semSinal =
    estado.minutos_sem_sinal !== null && Number(estado.minutos_sem_sinal) > 90;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href="/rastreio"
        className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Acompanhar
      </Link>

      {/* Cabeçalho */}
      <header className="cf-card p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={LOAD_STATUS_BADGE[carga.status]}>
                {LOAD_STATUS_LABELS[carga.status]}
              </span>
              <span className="font-mono text-xs text-slate-400">{carga.reference}</span>
            </div>
            <h1 className="mt-3 text-2xl font-bold text-navy-600">{carga.title}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
              <span className="font-medium">{estado.origin_city}</span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <span className="font-medium">{estado.destination_city}</span>
            </div>
          </div>

          {estado.veiculo_matricula && (
            <div className="text-right">
              <p className="flex items-center justify-end gap-1.5 text-xs text-slate-400">
                <Truck className="h-3.5 w-3.5" aria-hidden="true" />
                Transporte
              </p>
              <p className="mt-0.5 font-mono font-semibold text-navy-600">
                {estado.veiculo_matricula}
              </p>
              {estado.motorista_nome && (
                <p className="text-xs text-slate-500">{estado.motorista_nome}</p>
              )}
            </div>
          )}
        </div>

        {/* Progresso */}
        {estado.atual_lat !== null && (
          <div className="mt-6">
            <div className="flex items-center justify-between text-xs text-slate-500">
              <span>{estado.origin_city}</span>
              <span className="font-semibold text-brand-500">
                {estado.progresso_pct}%
              </span>
              <span>{estado.destination_city}</span>
            </div>
            <div
              className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuenow={Number(estado.progresso_pct)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Progresso da entrega"
            >
              <div
                className="h-full rounded-full bg-brand-500 transition-all"
                style={{ width: `${estado.progresso_pct}%` }}
              />
            </div>
            <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-xs text-slate-500">
              {estado.km_percorridos !== null && (
                <div>
                  <dt className="inline">Percorridos: </dt>
                  <dd className="inline font-medium text-navy-600">
                    {formatDistance(Number(estado.km_percorridos))}
                  </dd>
                </div>
              )}
              {estado.km_restantes !== null && (
                <div>
                  <dt className="inline">Faltam: </dt>
                  <dd className="inline font-medium text-navy-600">
                    {formatDistance(Number(estado.km_restantes))}
                  </dd>
                </div>
              )}
              {estado.eta && (
                <div>
                  <dt className="inline">Chegada prevista: </dt>
                  <dd className="inline font-medium text-navy-600">
                    {formatarData(estado.eta)}
                  </dd>
                </div>
              )}
            </dl>
          </div>
        )}
      </header>

      {/* Aviso honesto quando não há sinal */}
      {semSinal && (
        <div className="cf-card flex items-start gap-3 border-accent-200 bg-accent-50/60 p-5">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-accent-600" aria-hidden="true" />
          <div>
            <h2 className="font-semibold text-navy-600">Sem sinal há algum tempo</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              A última posição foi registada há{' '}
              {Math.round(Number(estado.minutos_sem_sinal) / 60)} horas. É comum
              perder cobertura em certos troços — as posições ficam guardadas no
              telemóvel do motorista e aparecem quando o sinal voltar.
            </p>
          </div>
        </div>
      )}

      {/* Mapa */}
      <section>
        <Mapa
          altura={420}
          dados={{
            origem: {
              lat: estado.origin_lat,
              lng: estado.origin_lng,
              nome: estado.origin_city,
            },
            destino: {
              lat: estado.destination_lat,
              lng: estado.destination_lng,
              nome: estado.destination_city,
            },
            atual:
              estado.atual_lat !== null && estado.atual_lng !== null
                ? {
                    lat: estado.atual_lat,
                    lng: estado.atual_lng,
                    quando: estado.atual_em!,
                  }
                : null,
            percurso,
          }}
        />
        {estado.atual_em && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
            <Clock className="h-3 w-3" aria-hidden="true" />
            Última posição: {formatarData(estado.atual_em)}
            {estado.velocidade_kmh && ` · ${Math.round(Number(estado.velocidade_kmh))} km/h`}
          </p>
        )}
      </section>

      {/* Controlo do motorista — só enquanto a carga está a caminho */}
      {ehTransportador &&
        estado.trip_id &&
        ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(carga.status) && (
          <PartilharLocalizacao
            cargaId={carga.id}
            viagemId={estado.trip_id}
            kmAoDestino={estado.km_restantes !== null ? Number(estado.km_restantes) : null}
            estadoCarga={carga.status}
          />
        )}

      {/* Fecho da operação: prova de entrega, confirmação e avaliações */}
      <PainelEntrega
        cargaId={carga.id}
        estadoCarga={carga.status}
        ehTransportador={ehTransportador}
        ehDono={ehDono}
        prova={prova}
        avaliacoes={avaliacoes}
        urlsFotos={urlsFotos}
        urlAssinatura={
          prova?.signature_url ? (urlsAssinatura[prova.signature_url] ?? null) : null
        }
        contraparte={
          ehDono
            ? (estado.motorista_nome ?? 'o transportador')
            : 'o comerciante'
        }
      />

      {/* Linha temporal */}
      <section className="cf-card p-6">
        <h2 className="font-semibold text-navy-600">Histórico</h2>
        {eventos.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">Ainda não há eventos registados.</p>
        ) : (
          <ol className="mt-5 space-y-5">
            {eventos.map((e: any, i: number) => {
              const Icone = EVENTO_ICONE[e.event_type] ?? MapPin;
              return (
                <li key={e.id} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <span
                      className={
                        i === 0
                          ? 'flex h-9 w-9 items-center justify-center rounded-full bg-brand-500 text-white'
                          : 'flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-400'
                      }
                    >
                      <Icone className="h-4 w-4" aria-hidden="true" />
                    </span>
                    {i < eventos.length - 1 && (
                      <span className="mt-1 w-px flex-1 bg-slate-200" />
                    )}
                  </div>
                  <div className="flex-1 pb-1">
                    <p className="text-sm font-medium text-navy-600">{e.description}</p>
                    <p className="mt-0.5 text-xs text-slate-400">
                      {formatarData(e.occurred_at)}
                      {e.location_name && ` · ${e.location_name}`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
