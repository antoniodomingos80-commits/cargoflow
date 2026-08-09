import { cn } from '@/lib/utils';

/**
 * Logótipo CargoFlow.
 *
 * O símbolo representa o fluxo logístico: a forma circular ("C") transmite
 * ciclo e conexão, a estrada indica o caminho, a seta o progresso.
 * Ver manual de marca (conceito 1 — FLOW: estrada + movimento contínuo).
 */
export function Logo({
  className,
  showWordmark = true,
  inverted = false,
}: {
  className?: string;
  showWordmark?: boolean;
  inverted?: boolean;
}) {
  return (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <svg viewBox="0 0 64 64" className="h-9 w-9 shrink-0" aria-hidden="true">
        {/* Arco "C" — ciclo operacional */}
        <path
          d="M46 16A22 22 0 1 0 46 48"
          fill="none"
          stroke={inverted ? '#FFFFFF' : '#0B3C5D'}
          strokeWidth="9"
          strokeLinecap="round"
        />
        {/* Estrada em perspetiva — o caminho */}
        <path d="M26 54 L34 24 L41 24 L33 54 Z" fill="#1E88E5" />
        <path
          d="M31 50 L33.5 40 M34.5 36 L36 29"
          stroke="#FFFFFF"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
        {/* Seta — progresso */}
        <path d="M42 12 L56 19 L42 26 L45 19 Z" fill="#FF8C42" />
      </svg>
      {showWordmark && (
        <span className="text-xl font-bold tracking-tight">
          <span className={inverted ? 'text-white' : 'text-navy-600'}>Cargo</span>
          <span className="text-brand-500">Flow</span>
        </span>
      )}
    </span>
  );
}
