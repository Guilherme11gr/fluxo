'use client';

import { QueryClientProvider } from '@tanstack/react-query';
import { getQueryClient } from './query-client';

interface QueryProviderProps {
  children: React.ReactNode;
}

/**
 * React Query Provider
 * 
 * Wraps the app with QueryClientProvider for client-side caching.
 * Also includes devtools in development mode.
 * 
 * @example
 * // In layout.tsx
 * <QueryProvider>
 *   {children}
 * </QueryProvider>
 */
export function QueryProvider({ children }: QueryProviderProps) {
  // Get the singleton QueryClient
  const queryClient = getQueryClient();

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
