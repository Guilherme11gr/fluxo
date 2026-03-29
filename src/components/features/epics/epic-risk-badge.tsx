'use client';

import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatRelativeTime } from '@/shared/utils/formatters';
import type { EpicRisk } from '@/shared/types/project.types';

const RISK_CONFIG: Record<
  EpicRisk,
  {
    icon: typeof CheckCircle2;
    variant: 'outline-success' | 'outline-warning' | 'destructive';
    label: string;
  }
> = {
  low: {
    icon: CheckCircle2,
    variant: 'outline-success',
    label: 'Baixo',
  },
  medium: {
    icon: AlertTriangle,
    variant: 'outline-warning',
    label: 'Médio',
  },
  high: {
    icon: XCircle,
    variant: 'destructive',
    label: 'Alto',
  },
};

interface EpicRiskBadgeProps {
  risk: EpicRisk;
  riskReason?: string | null;
  riskUpdatedAt?: string | Date | null;
  showLabel?: boolean;
  showTooltip?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function EpicRiskBadge({
  risk,
  riskReason,
  riskUpdatedAt,
  showLabel = true,
  showTooltip = true,
  size = 'sm',
  className,
}: EpicRiskBadgeProps) {
  const config = RISK_CONFIG[risk];
  const Icon = config.icon;

  const badge = (
    <Badge
      variant={config.variant}
      className={cn(
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm px-3 py-1',
        risk === 'high' && 'animate-pulse',
        className
      )}
      aria-label={`Epic risk: ${config.label}`}
    >
      <Icon className={cn(size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );

  // Se não tiver tooltip ou informações para mostrar, retorna badge direto
  if (!showTooltip || (!riskReason && !riskUpdatedAt)) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          {riskReason && <p className="text-xs font-medium">{riskReason}</p>}
          {riskUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Atualizado {formatRelativeTime(riskUpdatedAt)}
            </p>
          )}
          {!riskReason && !riskUpdatedAt && (
            <p className="text-xs">Atualizado recentemente</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
