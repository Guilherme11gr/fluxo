'use client';

/**
 * SyncIndicator Component
 * 
 * Shows a subtle pulsing blue indicator when data is being refetched.
 * Provides visual feedback without interrupting the UI.
 * 
 * @example
 * <SyncIndicator isFetching={isFetching} />
 * 
 * @example with custom position
 * <div className="relative">
 *   <CardContent>Task content...</CardContent>
 *   <SyncIndicator isFetching={isFetching} />
 * </div>
 */

interface SyncIndicatorProps {
  /** Whether data is currently being fetched/refetched */
  isFetching: boolean;
  /** Additional CSS classes for custom positioning */
  className?: string;
}

export function SyncIndicator({ isFetching, className = '' }: SyncIndicatorProps) {
  if (!isFetching) return null;

  return (
    <span
      className={`absolute top-2 right-2 h-2 w-2 rounded-full bg-blue-500 animate-pulse ${className}`}
      aria-label="Syncing data"
      role="status"
    />
  );
}
