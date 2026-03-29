'use client';

/**
 * OptimisticWrapper Component
 * 
 * Applies dimmed state to content when an entity is in optimistic state.
 * Used to show visual feedback that data is being mutated.
 * 
 * @example
 * <OptimisticWrapper isOptimistic={isOptimistic}>
 *   <TaskCard>...</TaskCard>
 * </OptimisticWrapper>
 * 
 * @example with custom dimming
 * <OptimisticWrapper
 *   isOptimistic={isOptimistic}
 *   dimmedOpacity="opacity-50"
 *   showIndicator
 * >
 *   <CardContent>...</CardContent>
 * </OptimisticWrapper>
 */

import React from 'react';
import { Loader2 } from 'lucide-react';

interface OptimisticWrapperProps {
  /** Whether the entity is in optimistic state */
  isOptimistic: boolean;
  /** Content to wrap */
  children: React.ReactNode;
  /** Custom opacity class for dimmed state */
  dimmedOpacity?: string;
  /** Show loading indicator */
  showIndicator?: boolean;
  /** Additional wrapper classes */
  className?: string;
}

export function OptimisticWrapper({
  isOptimistic,
  children,
  dimmedOpacity = 'opacity-50',
  showIndicator = false,
  className = '',
}: OptimisticWrapperProps) {
  return (
    <div className={`
      transition-opacity duration-200 ease-in-out
      ${isOptimistic ? dimmedOpacity : 'opacity-100'}
      ${className}
    `}>
      {children}
      
      {showIndicator && isOptimistic && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/50 rounded-lg pointer-events-none">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
        </div>
      )}
    </div>
  );
}
