import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Tabela com scroll horizontal contido.
 *
 * O projecto tinha 4 tabelas e apenas 4 `overflow-x-auto` no total: pelo menos
 * uma transbordava e empurrava a página inteira para o lado em ecrã pequeno.
 * O scroll passa a viver dentro do contentor, nunca no `body`.
 */
export function DataTable({
  cabecalho,
  children,
  vazio,
  className,
}: {
  cabecalho: ReactNode[];
  children: ReactNode;
  /** Mostrado no lugar da tabela quando não há linhas. */
  vazio?: ReactNode;
  className?: string;
}) {
  if (vazio) return <>{vazio}</>;

  return (
    <div className={cn('-mx-6 overflow-x-auto px-6', className)}>
      <table className="w-full min-w-[38rem] border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-200">
            {cabecalho.map((celula, i) => (
              <th
                key={i}
                scope="col"
                className="whitespace-nowrap px-3 pb-3 text-left text-xs font-medium uppercase tracking-wider text-slate-400 first:pl-0 last:pr-0"
              >
                {celula}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">{children}</tbody>
      </table>
    </div>
  );
}

export function TableRow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return <tr className={cn('transition-colors hover:bg-slate-50/70', className)}>{children}</tr>;
}

export function TableCell({
  children,
  className,
  alinhamento = 'left',
}: {
  children: ReactNode;
  className?: string;
  alinhamento?: 'left' | 'right';
}) {
  return (
    <td
      className={cn(
        'px-3 py-3.5 align-middle text-slate-600 first:pl-0 last:pr-0',
        alinhamento === 'right' && 'text-right',
        className,
      )}
    >
      {children}
    </td>
  );
}
