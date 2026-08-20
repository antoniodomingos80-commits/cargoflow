import type { LucideIcon } from 'lucide-react';
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TomStat = 'neutro' | 'marca' | 'destaque' | 'positivo' | 'alerta';

const TONS: Record<TomStat, { fundo: string; icone: string }> = {
  neutro: { fundo: 'bg-slate-100', icone: 'text-slate-500' },
  marca: { fundo: 'bg-brand-50', icone: 'text-brand-600' },
  destaque: { fundo: 'bg-accent-50', icone: 'text-accent-600' },
  positivo: { fundo: 'bg-emerald-50', icone: 'text-emerald-600' },
  alerta: { fundo: 'bg-red-50', icone: 'text-red-600' },
};

/**
 * Indicador numérico.
 *
 * Mostra um número que já existe — nunca uma variação, percentagem ou
 * tendência inventada. O `contexto` é para uma frase curta e verdadeira
 * ("3 por publicar"), não para um "+12% vs ontem" que ninguém calculou.
 */
export function StatCard({
  rotulo,
  valor,
  contexto,
  icone: Icone,
  tom = 'neutro',
  href,
}: {
  rotulo: string;
  valor: string | number;
  contexto?: string;
  icone?: LucideIcon;
  tom?: TomStat;
  href?: string;
}) {
  const t = TONS[tom];

  const conteudo = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-400">
          {rotulo}
        </p>
        {Icone ? (
          <span
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
              t.fundo,
              t.icone,
            )}
          >
            <Icone className="h-4.5 w-4.5" aria-hidden="true" />
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-3xl font-bold leading-none tracking-tight text-navy-600">
        {valor}
      </p>

      {contexto ? <p className="mt-2 text-xs text-slate-500">{contexto}</p> : null}

      {href ? (
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand-500">
          Ver detalhe
          <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      ) : null}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="cf-card-interactive block p-5">
        {conteudo}
      </Link>
    );
  }

  return <div className="cf-card p-5">{conteudo}</div>;
}

/**
 * Fila de indicadores. Uma coluna em telemóvel, duas em tablet, e a partir
 * daí o número de colunas pedido.
 */
export function KpiRow({
  children,
  colunas = 4,
}: {
  children: React.ReactNode;
  colunas?: 2 | 3 | 4;
}) {
  return (
    <section
      className={cn(
        'grid gap-4 sm:grid-cols-2',
        colunas === 3 && 'lg:grid-cols-3',
        colunas === 4 && 'lg:grid-cols-4',
      )}
    >
      {children}
    </section>
  );
}
