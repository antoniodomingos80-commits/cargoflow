import Link from 'next/link';
import { Calendar, MapPin, Package, Snowflake, Truck, Zap } from 'lucide-react';
import { CARGO_TYPE_LABELS, VEHICLE_TYPE_LABELS } from '@/lib/types';
import { formatDistance, formatWeight } from '@/lib/utils';
import type { CargaPublica } from '@/lib/mercado/publico';

/**
 * Cartão de carga da superfície PÚBLICA.
 *
 * Não se reutiliza `components/cargas/cartao-carga.tsx` de propósito, e não é
 * duplicação: aquele exige o tipo `Load` inteiro — `status`, `currency`,
 * `is_return_trip`, `budget_amount` — campos que a vista pública não publica e
 * não deve publicar. Adaptá-lo obrigaria a inventar valores para os campos em
 * falta ou a alargar a vista; qualquer dos dois desfazia a decisão da FASE 12.
 *
 * O que se reutiliza é o sistema de desenho: `cf-card-interactive`, os badges,
 * os mesmos ícones e os mesmos formatadores. Visualmente é a mesma plataforma.
 */
export function CartaoPublico({ carga }: { carga: CargaPublica }) {
  const rota = [carga.origem_cidade, carga.destino_cidade].filter(Boolean).join(' → ');
  const tipo = CARGO_TYPE_LABELS[carga.cargo_type as keyof typeof CARGO_TYPE_LABELS]
    ?? carga.cargo_type;
  const veiculo = carga.required_vehicle_type
    ? VEHICLE_TYPE_LABELS[carga.required_vehicle_type as keyof typeof VEHICLE_TYPE_LABELS]
      ?? carga.required_vehicle_type
    : null;

  return (
    <Link href={`/mercado/carga/${carga.id}`} className="cf-card-interactive block p-5">
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

      <h3 className="mt-3 truncate text-base font-semibold text-navy-600">{carga.title}</h3>

      <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
        <MapPin className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{rota || 'Rota por indicar'}</span>
        {carga.distance_km != null && (
          <span className="shrink-0 text-muted-foreground/80">
            · {formatDistance(carga.distance_km)}
          </span>
        )}
      </p>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm sm:grid-cols-3">
        <div>
          <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" aria-hidden="true" /> Tipo
          </dt>
          <dd className="truncate font-medium text-navy-600">{tipo}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Peso</dt>
          <dd className="font-medium text-navy-600">
            {carga.weight_kg != null ? formatWeight(carga.weight_kg) : '—'}
          </dd>
        </div>
        {veiculo && (
          <div>
            <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Truck className="h-3.5 w-3.5" aria-hidden="true" /> Veículo
            </dt>
            <dd className="truncate font-medium text-navy-600">{veiculo}</dd>
          </div>
        )}
      </dl>

      {carga.pickup_from && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Recolha a partir de{' '}
          {new Date(carga.pickup_from).toLocaleDateString('pt-PT', {
            day: '2-digit', month: 'short', year: 'numeric',
          })}
        </p>
      )}
    </Link>
  );
}
