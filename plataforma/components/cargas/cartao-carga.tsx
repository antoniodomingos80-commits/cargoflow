import Link from 'next/link';
import {
  LOAD_STATUS_LABELS, LOAD_STATUS_BADGE, CARGO_TYPE_LABELS, type Load,
} from '@/lib/types';
import { formatCurrency, formatWeight, formatDistance, formatRelativeTime } from '@/lib/utils';
import { ArrowRight, Package, Calendar, Zap, Snowflake } from 'lucide-react';

/**
 * Cartão de carga — usado tanto em "As minhas cargas" como no marketplace.
 * `contexto` altera o destino da ligação e o que se destaca.
 */
export function CartaoCarga({
  carga,
  contexto = 'proprio',
}: {
  carga: Load;
  contexto?: 'proprio' | 'mercado';
}) {
  const href = contexto === 'mercado' ? `/mercado/cargas/${carga.id}` : `/cargas/${carga.id}`;

  return (
    <Link href={href} className="cf-card-interactive block p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={LOAD_STATUS_BADGE[carga.status]}>
              {LOAD_STATUS_LABELS[carga.status]}
            </span>
            {carga.is_urgent && (
              <span className="cf-badge-delayed">
                <Zap className="h-3 w-3" aria-hidden="true" />
                Urgente
              </span>
            )}
            {carga.requires_refrigeration && (
              <span className="cf-badge-transit">
                <Snowflake className="h-3 w-3" aria-hidden="true" />
                Refrigerada
              </span>
            )}
            <span className="font-mono text-xs text-slate-400">{carga.reference}</span>
          </div>

          <h3 className="mt-2.5 truncate font-semibold text-navy-600">{carga.title}</h3>

          {/* Rota */}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
            <span className="font-medium">{carga.origin?.city ?? '—'}</span>
            <ArrowRight className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
            <span className="font-medium">{carga.destination?.city ?? '—'}</span>
            {carga.distance_km && (
              <span className="text-xs text-slate-400">
                · {formatDistance(Number(carga.distance_km))}
              </span>
            )}
          </div>

          {/* Detalhes */}
          <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-slate-500">
            <div className="flex items-center gap-1.5">
              <Package className="h-3.5 w-3.5" aria-hidden="true" />
              <dd>{formatWeight(Number(carga.weight_kg))}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <dd>{CARGO_TYPE_LABELS[carga.cargo_type]}</dd>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
              <dd>Recolha {formatRelativeTime(carga.pickup_from)}</dd>
            </div>
          </dl>
        </div>

        {/* Preço */}
        <div className="shrink-0 text-right">
          {carga.budget_amount ? (
            <>
              <p className="text-lg font-bold text-brand-500">
                {formatCurrency(Number(carga.budget_amount), carga.currency)}
              </p>
              <p className="text-xs text-slate-400">orçamento</p>
            </>
          ) : (
            <p className="text-sm text-slate-400">Sob proposta</p>
          )}
        </div>
      </div>
    </Link>
  );
}
