import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/**
 * Cabeçalho de página.
 *
 * Existe porque o mesmo bloco — título, subtítulo e ações à direita — estava
 * reescrito à mão em 31 páginas, com sete larguras diferentes e três tamanhos
 * de título. A partir daqui há um só.
 */
export function PageHeader({
  titulo,
  descricao,
  accoes,
  className,
}: {
  titulo: string;
  descricao?: string;
  accoes?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-navy-600 sm:text-[1.75rem]">
          {titulo}
        </h1>
        {descricao ? (
          <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{descricao}</p>
        ) : null}
      </div>
      {accoes ? <div className="flex shrink-0 flex-wrap gap-2">{accoes}</div> : null}
    </header>
  );
}

/**
 * Contentor de página com largura consistente.
 *
 * `largura` cobre os três casos reais: formulários (estreito), listagens
 * (padrão) e painéis com grelhas densas (largo).
 */
export function PageContainer({
  children,
  largura = 'padrao',
  className,
}: {
  children: ReactNode;
  largura?: 'estreita' | 'padrao' | 'larga';
  className?: string;
}) {
  return (
    <div
      className={cn(
        'mx-auto w-full space-y-6',
        largura === 'estreita' && 'max-w-3xl',
        largura === 'padrao' && 'max-w-5xl',
        largura === 'larga' && 'max-w-7xl',
        className,
      )}
    >
      {children}
    </div>
  );
}
