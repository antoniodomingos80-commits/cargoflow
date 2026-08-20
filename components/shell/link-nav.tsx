'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Ligação da navegação, com estado activo.
 *
 * É cliente apenas por causa do `usePathname` — o ícone e o rótulo chegam
 * como `children` já renderizados no servidor, portanto o `Record` de
 * navegação continua a viver no layout, com os componentes de ícone
 * intactos, e nada de não-serializável atravessa a fronteira.
 */
export function LinkNav({ href, children }: { href: string; children: ReactNode }) {
  const pathname = usePathname();

  // `/cargas` fica activo em `/cargas/nova`, mas `/` não fica activo em tudo.
  const activo = pathname === href || (href !== '/' && pathname.startsWith(`${href}/`));

  return (
    <Link
      href={href}
      aria-current={activo ? 'page' : undefined}
      className={cn(
        'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
        activo
          ? 'bg-brand-50 text-brand-700'
          : 'text-slate-600 hover:bg-slate-50 hover:text-navy-600',
      )}
    >
      {children}
    </Link>
  );
}
