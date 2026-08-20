import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Bloco de conteúdo com cabeçalho.
 *
 * Substitui o padrão `<section className="cf-card p-6">` com um `<h2>` solto
 * que aparecia dezenas de vezes, cada uma com o seu espaçamento.
 */
export function SectionCard({
  titulo,
  descricao,
  accao,
  children,
  className,
  semPadding = false,
}: {
  titulo?: string;
  descricao?: string;
  accao?: { href: string; rotulo: string };
  children: ReactNode;
  className?: string;
  /** Para tabelas, que gerem o seu próprio espaçamento interno. */
  semPadding?: boolean;
}) {
  return (
    <section className={cn('cf-card', semPadding ? 'overflow-hidden' : 'p-6', className)}>
      {titulo ? (
        <div
          className={cn(
            'flex flex-wrap items-start justify-between gap-3',
            semPadding && 'px-6 pt-6',
            children ? 'mb-5' : '',
          )}
        >
          <div className="min-w-0">
            <h2 className="font-semibold text-navy-600">{titulo}</h2>
            {descricao ? (
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{descricao}</p>
            ) : null}
          </div>
          {accao ? (
            <Link
              href={accao.href}
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-brand-500 hover:underline"
            >
              {accao.rotulo}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}
