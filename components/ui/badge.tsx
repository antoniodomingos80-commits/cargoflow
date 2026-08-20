import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

export type TomBadge =
  | 'neutro'
  | 'marca'
  | 'destaque'
  | 'positivo'
  | 'alerta'
  | 'perigo';

const TONS: Record<TomBadge, string> = {
  neutro: 'bg-slate-100 text-slate-600',
  marca: 'bg-brand-50 text-brand-700',
  destaque: 'bg-accent-50 text-accent-700',
  positivo: 'bg-emerald-50 text-emerald-700',
  alerta: 'bg-amber-50 text-amber-700',
  perigo: 'bg-red-50 text-red-700',
};

/**
 * Etiqueta de estado.
 *
 * Assenta na classe `cf-badge` que já existia em globals.css — os tons aqui
 * são os mesmos que estavam espalhados por 20 ficheiros, agora com um nome.
 */
export function Badge({
  children,
  tom = 'neutro',
  className,
}: {
  children: ReactNode;
  tom?: TomBadge;
  className?: string;
}) {
  return <span className={cn('cf-badge', TONS[tom], className)}>{children}</span>;
}

const PONTOS: Record<TomBadge, string> = {
  neutro: 'bg-slate-400',
  marca: 'bg-brand-500',
  destaque: 'bg-accent-500',
  positivo: 'bg-emerald-500',
  alerta: 'bg-amber-500',
  perigo: 'bg-red-500',
};

/**
 * Ponto de estado com legenda — o padrão "● Em movimento" da referência.
 */
export function StatusIndicator({
  rotulo,
  tom = 'neutro',
  pulsar = false,
  className,
}: {
  rotulo: string;
  tom?: TomBadge;
  /** Só para estados verdadeiramente em curso (a decorrer agora). */
  pulsar?: boolean;
  className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-sm text-slate-600', className)}>
      <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
        {pulsar ? (
          <span
            className={cn(
              'absolute inline-flex h-full w-full animate-ping rounded-full opacity-60',
              PONTOS[tom],
            )}
          />
        ) : null}
        <span className={cn('relative inline-flex h-2 w-2 rounded-full', PONTOS[tom])} />
      </span>
      {rotulo}
    </span>
  );
}
