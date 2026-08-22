import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle, ArrowLeft, Calendar, MapPin, Package, Snowflake, Truck, Zap,
} from 'lucide-react';
import { PageContainer } from '@/components/ui/page-header';
import { classesBotao } from '@/components/ui/button';
import { obterCargaPublica } from '@/lib/mercado/publico';
import { CARGO_TYPE_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types';
import { formatDistance, formatWeight } from '@/lib/utils';

/**
 * Detalhe público de uma carga.
 *
 * PORQUE ESTA ROTA NÃO É `/mercado/cargas/[id]`
 *
 * Esse endereço já existe e é privado: `app/(app)/mercado/cargas/[id]/page.tsx`,
 * dentro do grupo autenticado. Criar um segundo ficheiro para o mesmo caminho
 * noutro grupo de rotas é uma colisão — o Next.js recusa. Daí o singular:
 * `/mercado/carga/[id]`. As duas superfícies ficam separadas por endereço, sem
 * ambiguidade e sem tocar na rota privada.
 *
 * Fonte única: `public.mercado_publico`. Nada aqui lê `loads`, `users`,
 * `tenants`, `offers`, `matches`, `documents` ou `payments`.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { dados } = await obterCargaPublica(id);
  if (!dados) return { title: 'Carga não encontrada' };

  const rota = [dados.origem_cidade, dados.destino_cidade].filter(Boolean).join(' → ');

  // `title`, `description` e `canonical` saem exclusivamente de campos da vista
  // pública. Nada aqui toca em `description` da carga (texto livre, onde
  // aparecem telefones), em preços ou em identificadores internos — o que sai
  // para os motores de busca é o mesmo que sai para o ecrã.
  return {
    title: `${dados.title} — ${rota}`,
    description: `Carga ${dados.reference}: ${rota}. Crie conta no CargoFlow para negociar.`,
    alternates: { canonical: `/mercado/carga/${dados.id}` },
  };
}

export default async function PaginaCargaPublica({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { dados: carga, erro } = await obterCargaPublica(id);

  // Erro de infraestrutura e "não existe" são coisas diferentes e dizem-se de
  // maneira diferente. Confundi-las mostraria "não encontrado" a quem apenas
  // apanhou a base de dados indisponível.
  if (erro !== null) {
    return (
      <PageContainer largura="estreita">
        <div
          role="alert"
          className="cf-card mt-8 flex items-start gap-3 border-l-4 border-l-status-danger p-5"
        >
          <AlertTriangle
            className="mt-0.5 h-5 w-5 shrink-0 text-status-danger"
            aria-hidden="true"
          />
          <div>
            <p className="font-medium text-navy-600">
              Não foi possível carregar as cargas. Tente novamente.
            </p>
            <Link
              href="/mercado"
              className="mt-3 inline-flex items-center gap-1.5 text-sm text-brand-500 hover:underline"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Voltar ao mercado
            </Link>
          </div>
        </div>
      </PageContainer>
    );
  }

  // Fora da superfície pública: pode nunca ter existido, já ter sido atribuída,
  // ou ter passado a janela de recolha. De fora são indistinguíveis — e é assim
  // que deve ser, porque distinguir contaria algo sobre uma carga que o
  // visitante não tem direito a ver.
  if (!carga) notFound();

  const tipo = CARGO_TYPE_LABELS[carga.cargo_type as keyof typeof CARGO_TYPE_LABELS]
    ?? carga.cargo_type;
  const veiculo = carga.required_vehicle_type
    ? VEHICLE_TYPE_LABELS[carga.required_vehicle_type as keyof typeof VEHICLE_TYPE_LABELS]
      ?? carga.required_vehicle_type
    : null;

  const data = (v: string | null) =>
    v
      ? new Date(v).toLocaleDateString('pt-PT', {
          day: '2-digit', month: 'long', year: 'numeric',
        })
      : '—';

  return (
    <PageContainer largura="estreita">
      <Link
        href="/mercado"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-navy-600"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Todas as cargas
      </Link>

      <div className="cf-card p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className="cf-badge-idle">{carga.reference}</span>
          {carga.is_urgent && (
            <span className="cf-badge-delayed">
              <Zap className="h-3 w-3" aria-hidden="true" />
              Urgente
            </span>
          )}
          {carga.requires_refrigeration && (
            <span className="cf-badge-transit">
              <Snowflake className="h-3 w-3" aria-hidden="true" />
              Refrigeração
            </span>
          )}
        </div>

        <h1 className="mt-4 text-2xl font-semibold text-navy-600">{carga.title}</h1>

        <div className="mt-6 grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Origem
            </h2>
            <p className="mt-1 font-medium text-navy-600">{carga.origem_cidade ?? '—'}</p>
            {carga.origem_provincia && (
              <p className="text-sm text-muted-foreground">{carga.origem_provincia}</p>
            )}
          </section>

          <section>
            <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden="true" /> Destino
            </h2>
            <p className="mt-1 font-medium text-navy-600">{carga.destino_cidade ?? '—'}</p>
            {carga.destino_provincia && (
              <p className="text-sm text-muted-foreground">{carga.destino_provincia}</p>
            )}
          </section>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-5 border-t border-border pt-6 sm:grid-cols-3">
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Package className="h-3.5 w-3.5" aria-hidden="true" /> Tipo de carga
            </dt>
            <dd className="mt-1 font-medium text-navy-600">{tipo}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Peso</dt>
            <dd className="mt-1 font-medium text-navy-600">
              {carga.weight_kg != null ? formatWeight(carga.weight_kg) : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Volume</dt>
            <dd className="mt-1 font-medium text-navy-600">
              {carga.volume_m3 != null ? `${carga.volume_m3} m³` : '—'}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Distância</dt>
            <dd className="mt-1 font-medium text-navy-600">
              {carga.distance_km != null ? formatDistance(carga.distance_km) : '—'}
            </dd>
          </div>
          {veiculo && (
            <div>
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Veículo necessário
              </dt>
              <dd className="mt-1 font-medium text-navy-600">{veiculo}</dd>
            </div>
          )}
          <div>
            <dt className="text-xs text-muted-foreground">Refrigeração</dt>
            <dd className="mt-1 font-medium text-navy-600">
              {carga.requires_refrigeration ? 'Necessária' : 'Não necessária'}
            </dd>
          </div>
        </dl>

        <div className="mt-8 grid gap-5 border-t border-border pt-6 sm:grid-cols-2">
          <div>
            <h2 className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> Janela de recolha
            </h2>
            <p className="mt-1 text-sm text-navy-600">
              De <strong>{data(carga.pickup_from)}</strong> até{' '}
              <strong>{data(carga.pickup_until)}</strong>
            </p>
          </div>
          <div>
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Publicada
            </h2>
            <p className="mt-1 text-sm text-navy-600">{data(carga.published_at)}</p>
          </div>
        </div>
      </div>

      {/* CTA — tudo o resto está atrás de sessão */}
      <div className="cf-card mt-6 border-l-4 border-l-brand-500 p-6">
        <h2 className="text-lg font-semibold text-navy-600">
          Interessado nesta carga?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          O valor, o contacto do comerciante e a negociação estão reservados a
          utilizadores com conta. Entrar leva menos de um minuto.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <Link href="/entrar" className={classesBotao({})}>
            Entrar para continuar
          </Link>
          <Link href="/registo" className={classesBotao({ variant: 'outline' })}>
            Criar conta
          </Link>
        </div>
      </div>
    </PageContainer>
  );
}
