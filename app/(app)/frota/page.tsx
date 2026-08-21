import Link from 'next/link';
import { PageContainer, PageHeader } from '@/components/ui/page-header';
import { redirect } from 'next/navigation';
import { getSessionProfile } from '@/lib/supabase/server';
import { listarVeiculos } from '@/lib/frota/actions';
import { EmptyState } from '@/components/ui/empty-state';
import { Button } from '@/components/ui/button';
import { listarComplianceFrota } from '@/lib/frota/compliance';
import {
  EstadoComplianceBadge,
  EstadoVerificacao,
} from '@/components/trust/estado-verificacao';
import {
  DOCUMENT_TYPE_LABELS,
  VEHICLE_TYPE_LABELS,
  type DocumentType,
  type Vehicle,
  type VerificationStatus,
} from '@/lib/types';
import { formatWeight } from '@/lib/utils';
import { Truck, Plus, CheckCircle2, Snowflake, AlertTriangle } from 'lucide-react';

export const metadata = { title: 'Frota' };

/** A partir de quantos dias antes se avisa que uma validade está a acabar. */
const DIAS_DE_AVISO = 30;

function diasAte(data: string): number {
  const alvo = new Date(`${data}T00:00:00Z`).getTime();
  const hoje = new Date().setUTCHours(0, 0, 0, 0);
  return Math.round((alvo - hoje) / 86_400_000);
}

export default async function PaginaFrota({
  searchParams,
}: {
  searchParams: Promise<{ criado?: string }>;
}) {
  const perfil = await getSessionProfile();
  if (!perfil) redirect('/entrar');

  if (perfil.user.role === 'MERCHANT') redirect('/painel');

  const filtros = await searchParams;

  const [veiculos, compliance] = await Promise.all([
    listarVeiculos() as unknown as Promise<Vehicle[]>,
    listarComplianceFrota(),
  ]);

  const naoConformes = Object.values(compliance).filter(
    (c) => c.estado_compliance !== 'compliant',
  ).length;

  return (
    <PageContainer>
      <PageHeader
        titulo="Frota"
        descricao={
          veiculos.length === 0
            ? 'Registe os seus veículos para poder publicar viagens.'
            : `${veiculos.length} ${veiculos.length === 1 ? 'veículo' : 'veículos'}`
        }
        accoes={
          <Link href="/frota/novo">
            <Button>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar veículo
            </Button>
          </Link>
        }
      />

      {filtros.criado && (
        <div className="flex items-start gap-3 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-800">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            Veículo registado. Fica pendente de verificação, mas já pode ser
            usado para publicar viagens.
          </span>
        </div>
      )}

      {naoConformes > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 px-4 py-3 text-sm text-slate-600">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
          <span>
            {naoConformes === 1
              ? '1 veículo não está conforme.'
              : `${naoConformes} veículos não estão conformes.`}{' '}
            Um veículo só fica conforme com livrete, seguro e inspeção
            aprovados e dentro da validade.
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
          {veiculos.map((v) => {
            const c = compliance[v.id];
            const dias = c?.valido_ate ? diasAte(c.valido_ate) : null;
            const aExpirar = dias !== null && dias >= 0 && dias <= DIAS_DE_AVISO;

            return (
              <article key={v.id} className="cf-card p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-lg font-bold text-navy-600">{v.plate}</p>
                    <p className="mt-0.5 text-sm text-slate-500">
                      {VEHICLE_TYPE_LABELS[v.type]}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    <EstadoVerificacao estado={v.verification as VerificationStatus} />
                    {c ? <EstadoComplianceBadge estado={c.estado_compliance} /> : null}
                  </div>
                </div>

                {(v.brand || v.model) && (
                  <p className="mt-3 text-sm text-slate-600">
                    {[v.brand, v.model, v.year].filter(Boolean).join(' · ')}
                  </p>
                )}

                {c && c.tipos_em_falta.length > 0 ? (
                  <p className="mt-3 text-xs leading-relaxed text-amber-700">
                    Em falta:{' '}
                    {c.tipos_em_falta
                      .map((t) => DOCUMENT_TYPE_LABELS[t as DocumentType] ?? t)
                      .join(', ')}
                    .
                  </p>
                ) : null}

                {aExpirar ? (
                  <p className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    {dias === 0
                      ? 'Uma validade termina hoje.'
                      : dias === 1
                        ? 'Uma validade termina amanhã.'
                        : `Uma validade termina dentro de ${dias} dias.`}
                  </p>
                ) : null}

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
                  {c ? (
                    <div>
                      <dt className="text-slate-400">Documentos</dt>
                      <dd className="mt-0.5 font-semibold text-navy-600">
                        {c.docs_aprovados} de 3 aprovados
                      </dd>
                    </div>
                  ) : null}
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
            );
          })}
        </div>
      )}
    </PageContainer>
  );
}
