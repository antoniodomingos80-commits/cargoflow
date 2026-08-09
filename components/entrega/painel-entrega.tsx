import { confirmarRececao } from '@/lib/entrega/actions';
import { Avaliar, Estrelas } from './avaliar';
import { FormularioEntrega } from './formulario-entrega';
import { Button } from '@/components/ui/button';
import type { ProvaEntrega, Avaliacao } from '@/lib/entrega/actions';
import {
  PackageCheck, AlertTriangle, MapPin, PenLine, CheckCircle2, Camera,
} from 'lucide-react';

function formatarData(iso: string) {
  return new Date(iso).toLocaleString('pt-AO', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Fecho da operação: prova de entrega → confirmação → avaliação mútua.
 *
 * O que se mostra depende de quem está a ver e do estado da carga, para que
 * cada parte veja apenas a ação que lhe compete a seguir.
 */
export function PainelEntrega({
  cargaId,
  estadoCarga,
  ehTransportador,
  ehDono,
  prova,
  avaliacoes,
  urlsFotos,
  urlAssinatura,
  contraparte,
}: {
  cargaId: string;
  estadoCarga: string;
  ehTransportador: boolean;
  ehDono: boolean;
  prova: ProvaEntrega | null;
  avaliacoes: Avaliacao[];
  urlsFotos: Record<string, string>;
  urlAssinatura: string | null;
  contraparte: string;
}) {
  const jaAvaliei = avaliacoes.some((a) => a.sou_eu);
  const podeRegistarEntrega =
    ehTransportador && ['PICKED_UP', 'IN_TRANSIT'].includes(estadoCarga);
  const podeConfirmar = ehDono && estadoCarga === 'DELIVERED';
  const podeAvaliar = estadoCarga === 'CONFIRMED' && !jaAvaliei;

  return (
    <>
      {podeRegistarEntrega && <FormularioEntrega cargaId={cargaId} />}

      {/* Prova de entrega registada */}
      {prova && (
        <section className="cf-card p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <h2 className="flex items-center gap-2 font-semibold text-navy-600">
              <PackageCheck className="h-4 w-4 text-brand-500" aria-hidden="true" />
              Prova de entrega
            </h2>
            {prova.confirmed_at ? (
              <span className="cf-badge-done">
                <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                Confirmada
              </span>
            ) : (
              <span className="cf-badge-delayed">Por confirmar</span>
            )}
          </div>

          <dl className="mt-5 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Recebido por</dt>
              <dd className="text-right font-medium text-navy-600">
                {prova.received_by_name}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Entregue em</dt>
              <dd className="text-right font-medium text-navy-600">
                {formatarData(prova.delivered_at)}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-slate-500">Por</dt>
              <dd className="text-right font-medium text-navy-600">
                {prova.entregue_por}
              </dd>
            </div>
            {prova.lat !== null && (
              <div className="flex justify-between gap-4">
                <dt className="text-slate-500">Localização</dt>
                <dd className="flex items-center gap-1.5 text-right font-medium text-navy-600">
                  <MapPin className="h-3.5 w-3.5 text-green-500" aria-hidden="true" />
                  Registada
                </dd>
              </div>
            )}
          </dl>

          {prova.has_damage && (
            <div className="mt-5 flex items-start gap-3 rounded-lg bg-accent-50 px-4 py-3">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-accent-600"
                aria-hidden="true"
              />
              <div>
                <p className="text-sm font-medium text-navy-600">Danos registados</p>
                <p className="mt-1 text-sm text-slate-600">
                  {prova.damage_description}
                </p>
              </div>
            </div>
          )}

          {prova.notes && (
            <p className="mt-4 rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              {prova.notes}
            </p>
          )}

          {/* Fotografias */}
          {prova.photo_urls.length > 0 && (
            <div className="mt-5">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                <Camera className="h-3.5 w-3.5" aria-hidden="true" />
                Fotografias
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                {prova.photo_urls.map((caminho) =>
                  urlsFotos[caminho] ? (
                    <a
                      key={caminho}
                      href={urlsFotos[caminho]}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={urlsFotos[caminho]}
                        alt="Fotografia da entrega"
                        className="h-24 w-24 rounded-lg object-cover transition-opacity hover:opacity-80"
                      />
                    </a>
                  ) : null,
                )}
              </div>
            </div>
          )}

          {/* Assinatura */}
          {urlAssinatura && (
            <div className="mt-5">
              <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">
                <PenLine className="h-3.5 w-3.5" aria-hidden="true" />
                Assinatura
              </p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={urlAssinatura}
                alt="Assinatura de quem recebeu"
                className="mt-2 h-24 rounded-lg border border-slate-200 bg-white p-2"
              />
            </div>
          )}

          {podeConfirmar && (
            <form
              action={async () => {
                'use server';
                await confirmarRececao(cargaId);
              }}
              className="mt-6 border-t border-slate-100 pt-5"
            >
              <p className="mb-3 text-sm text-slate-600">
                Confirme que recebeu a mercadoria conforme o registado acima.
              </p>
              <Button type="submit">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                Confirmar receção
              </Button>
            </form>
          )}
        </section>
      )}

      {/* Avaliação */}
      {podeAvaliar && <Avaliar cargaId={cargaId} quemAvalio={contraparte} />}

      {/* Avaliações já feitas */}
      {avaliacoes.length > 0 && (
        <section className="cf-card p-6">
          <h2 className="font-semibold text-navy-600">Avaliações</h2>
          <div className="mt-5 space-y-5">
            {avaliacoes.map((a) => (
              <article key={a.review_id} className="border-b border-slate-100 pb-5 last:border-0 last:pb-0">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-medium text-navy-600">
                      {a.sou_eu ? 'A sua avaliação' : a.autor_nome}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatarData(a.created_at)}
                    </p>
                  </div>
                  <Estrelas valor={a.rating} tamanho="sm" rotuloAria="Classificação" />
                </div>
                {a.comment && (
                  <p className="mt-3 text-sm leading-relaxed text-slate-600">
                    “{a.comment}”
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
