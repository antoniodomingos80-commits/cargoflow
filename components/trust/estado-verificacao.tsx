import { CheckCircle2, Clock, Search, XCircle, CalendarX } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Badge, type TomBadge } from '@/components/ui/badge';
import {
  COMPLIANCE_LABELS,
  VERIFICATION_STATUS_LABELS,
  type EstadoCompliance,
  type VerificationStatus,
} from '@/lib/types';

/**
 * Um estado de verificação, sempre com o mesmo aspeto.
 *
 * Antes disto, cada página escrevia o seu próprio mapa de estados — a página
 * de documentos tinha um, a de administração outro, e nenhuma delas conhecia
 * `UNDER_REVIEW`. Passa a haver um só sítio a decidir cor e palavra.
 */
const ESTADOS: Record<VerificationStatus, { tom: TomBadge; icone: LucideIcon }> = {
  PENDING: { tom: 'alerta', icone: Clock },
  UNDER_REVIEW: { tom: 'marca', icone: Search },
  APPROVED: { tom: 'positivo', icone: CheckCircle2 },
  REJECTED: { tom: 'perigo', icone: XCircle },
  EXPIRED: { tom: 'perigo', icone: CalendarX },
};

export function EstadoVerificacao({
  estado,
  className,
}: {
  estado: VerificationStatus;
  className?: string;
}) {
  const e = ESTADOS[estado] ?? ESTADOS.PENDING;
  const Icone = e.icone;
  return (
    <Badge tom={e.tom} className={className}>
      <Icone className="h-3 w-3" aria-hidden="true" />
      {VERIFICATION_STATUS_LABELS[estado] ?? estado}
    </Badge>
  );
}

const COMPLIANCE: Record<EstadoCompliance, TomBadge> = {
  compliant: 'positivo',
  pending: 'alerta',
  non_compliant: 'perigo',
  expired: 'perigo',
};

export function EstadoComplianceBadge({
  estado,
  className,
}: {
  estado: EstadoCompliance;
  className?: string;
}) {
  return (
    <Badge tom={COMPLIANCE[estado] ?? 'neutro'} className={className}>
      {COMPLIANCE_LABELS[estado] ?? estado}
    </Badge>
  );
}
