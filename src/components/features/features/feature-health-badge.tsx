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
import type { FeatureHealth } from '@/shared/types/project.types';

const HEALTH_CONFIG: Record<
  FeatureHealth,
  {
    icon: typeof CheckCircle2;
    variant: 'outline-success' | 'outline-warning' | 'destructive';
    label: string;
  }
> = {
  healthy: {
    icon: CheckCircle2,
    variant: 'outline-success',
    label: 'Saudável',
  },
  warning: {
    icon: AlertTriangle,
    variant: 'outline-warning',
    label: 'Atenção',
  },
  critical: {
    icon: XCircle,
    variant: 'destructive',
    label: 'Crítico',
  },
};

interface FeatureHealthBadgeProps {
  health: FeatureHealth;
  healthReason?: string | null;
  healthUpdatedAt?: string | Date | null;
  showLabel?: boolean;
  showTooltip?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}

export function FeatureHealthBadge({
  health,
  healthReason,
  healthUpdatedAt,
  showLabel = true,
  showTooltip = true,
  size = 'sm',
  className,
}: FeatureHealthBadgeProps) {
  const config = HEALTH_CONFIG[health];
  const Icon = config.icon;

  const badge = (
    <Badge
      variant={config.variant}
      className={cn(
        size === 'sm' && 'text-xs',
        size === 'md' && 'text-sm px-3 py-1',
        health === 'critical' && 'animate-pulse',
        className
      )}
      aria-label={`Feature health: ${config.label}`}
    >
      <Icon className={cn(size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5')} />
      {showLabel && <span>{config.label}</span>}
    </Badge>
  );

  // Se não tiver tooltip ou informações para mostrar, retorna badge direto
  if (!showTooltip || (!healthReason && !healthUpdatedAt)) {
    return badge;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{badge}</TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1">
          {healthReason && (
            <p className="text-xs font-medium">{healthReason}</p>
          )}
          {healthUpdatedAt && (
            <p className="text-xs text-muted-foreground">
              Atualizado {formatRelativeTime(healthUpdatedAt)}
            </p>
          )}
          {!healthReason && !healthUpdatedAt && (
            <p className="text-xs">Atualizado recentemente</p>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
