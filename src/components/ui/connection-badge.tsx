'use client';

import { useRealtimeStatus } from '@/hooks/use-realtime-status';
import { Badge } from './badge';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

interface ConnectionBadgeProps {
  size?: 'sm' | 'default';
  iconOnly?: boolean;
}

/**
 * Connection status badge for real-time status
 * 
 * Shows visual indicator of WebSocket connection state:
 * - Green dot: Connected (real-time active)
 * - Yellow dot: Connecting (establishing connection)
 * - Red dot: Disconnected/Failed (fallback to manual refresh)
 * 
 * @example
 * <ConnectionBadge />
 * // or with custom size
 * <ConnectionBadge size="sm" />
 * // or icon-only for collapsed sidebar
 * <ConnectionBadge iconOnly />
 */
export function ConnectionBadge({ size = 'default', iconOnly = false }: ConnectionBadgeProps) {
  const { isConnected, isConnecting, isDisconnected, hasFailed } = useRealtimeStatus();
  
  const iconSizeClasses = iconOnly ? 'w-5 h-5' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';
  const textSizeClasses = size === 'sm' ? 'text-xs' : 'text-sm';

  // Icon-only mode for collapsed sidebar
  if (iconOnly) {
    if (isConnecting) {
      return (
        <div 
          className="h-10 w-10 flex items-center justify-center rounded-md bg-muted"
          title="Conectando..."
        >
          <Loader2 className={`animate-spin ${iconSizeClasses} text-muted-foreground`} />
        </div>
      );
    }

    if (isConnected) {
      return (
        <div 
          className="h-10 w-10 flex items-center justify-center rounded-md bg-green-500/20"
          title="Ao vivo"
        >
          <Wifi className={`${iconSizeClasses} text-green-500`} />
        </div>
      );
    }

    if (hasFailed) {
      return (
        <div 
          className="h-10 w-10 flex items-center justify-center rounded-md bg-destructive/20"
          title="Erro de conexão"
        >
          <WifiOff className={`${iconSizeClasses} text-destructive`} />
        </div>
      );
    }

    // Default: disconnected
    return (
      <div 
        className="h-10 w-10 flex items-center justify-center rounded-md bg-muted"
        title="Offline"
      >
        <WifiOff className={`${iconSizeClasses} text-muted-foreground`} />
      </div>
    );
  }

  // Full badge mode
  if (isConnecting) {
    return (
      <Badge variant="secondary" className="gap-1.5">
        <Loader2 className={`animate-spin ${iconSizeClasses}`} />
        <span className={textSizeClasses}>Conectando...</span>
      </Badge>
    );
  }

  if (isConnected) {
    return (
      <Badge variant="default" className="gap-1.5 bg-green-500 hover:bg-green-600">
        <Wifi className={iconSizeClasses} />
        <span className={textSizeClasses}>Ao vivo</span>
      </Badge>
    );
  }

  if (hasFailed) {
    return (
      <Badge variant="destructive" className="gap-1.5">
        <WifiOff className={iconSizeClasses} />
        <span className={textSizeClasses}>Erro</span>
      </Badge>
    );
  }

  // Default: disconnected
  return (
    <Badge variant="secondary" className="gap-1.5">
      <WifiOff className={iconSizeClasses} />
      <span className={textSizeClasses}>Offline</span>
    </Badge>
  );
}
