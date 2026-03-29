import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateFeature, useUpdateFeature, useDeleteFeature } from './use-features';
import { queryKeys } from '../query-keys';
import type { ReactNode } from 'react';

// Mock fetch globally
global.fetch = vi.fn();

// Mock toast
vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('use-features: Cache Invalidation', () => {
  let queryClient: QueryClient;
  let wrapper: ({ children }: { children: ReactNode }) => JSX.Element;
  const orgId = 'org-123';

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();
    (global.fetch as ReturnType<typeof vi.fn>).mockReset();

    // Create a fresh QueryClient for each test
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Wrapper component for React Query
    wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
  });

  describe('useCreateFeature', () => {
    it('should invalidate epic-specific feature list after creation', async () => {
      const epicId = 'epic-123';
      const newFeature = {
        id: 'feature-456',
        title: 'New Feature',
        status: 'BACKLOG',
        epicId,
      };

      // Mock successful API response
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: newFeature }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateFeature(), { wrapper });

      result.current.mutate({
        title: 'New Feature',
        epicId,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate epic-specific feature list
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.list(orgId, epicId),
      });
    });

    it('should invalidate all-features list after creation', async () => {
      const epicId = 'epic-123';
      const newFeature = {
        id: 'feature-456',
        title: 'New Feature',
        status: 'BACKLOG',
        epicId,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: newFeature }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateFeature(), { wrapper });

      result.current.mutate({
        title: 'New Feature',
        epicId,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate all-features list
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.list(orgId),
      });
    });

    it('should invalidate epic detail to update feature counters', async () => {
      const epicId = 'epic-123';
      const newFeature = {
        id: 'feature-456',
        title: 'New Feature',
        status: 'BACKLOG',
        epicId,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: newFeature }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateFeature(), { wrapper });

      result.current.mutate({
        title: 'New Feature',
        epicId,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate epic detail
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.detail(orgId, epicId),
      });
    });
  });

  describe('useUpdateFeature', () => {
    it('should invalidate feature detail after update', async () => {
      const featureId = 'feature-123';
      const updatedFeature = {
        id: featureId,
        title: 'Updated Feature',
        status: 'DOING',
        epicId: 'epic-456',
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedFeature }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateFeature(), { wrapper });

      result.current.mutate({
        id: featureId,
        data: { title: 'Updated Feature', status: 'DOING' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate feature detail
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.detail(orgId, featureId),
      });
    });

    it('should invalidate feature lists after update', async () => {
      const featureId = 'feature-123';
      const updatedFeature = {
        id: featureId,
        title: 'Updated Feature',
        status: 'TODO',
        epicId: 'epic-456',
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedFeature }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateFeature(), { wrapper });

      result.current.mutate({
        id: featureId,
        data: { title: 'Updated Feature' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate lists
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.lists(orgId),
      });
    });

    it('should invalidate epic detail after feature update', async () => {
      const featureId = 'feature-123';
      const epicId = 'epic-456';
      const updatedFeature = {
        id: featureId,
        title: 'Updated Feature',
        status: 'DONE',
        epicId,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedFeature }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateFeature(), { wrapper });

      result.current.mutate({
        id: featureId,
        data: { status: 'DONE' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate epic detail
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.detail(orgId, epicId),
      });
    });

    it('should invalidate tasks list when feature status changes', async () => {
      const featureId = 'feature-123';
      const updatedFeature = {
        id: featureId,
        title: 'Updated Feature',
        status: 'DONE',
        epicId: 'epic-456',
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedFeature }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateFeature(), { wrapper });

      result.current.mutate({
        id: featureId,
        data: { status: 'DONE' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate tasks (they depend on feature.status)
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.tasks.lists(orgId),
      });
    });
  });

  describe('useDeleteFeature', () => {
    it('should invalidate all features after deletion', async () => {
      const featureId = 'feature-123';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteFeature(), { wrapper });

      result.current.mutate(featureId);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate all feature queries
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.all(orgId),
      });
    });

    it('should remove feature detail and tasks from cache after deletion', async () => {
      const featureId = 'feature-123';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const removeSpy = vi.spyOn(queryClient, 'removeQueries');

      const { result } = renderHook(() => useDeleteFeature(), { wrapper });

      result.current.mutate(featureId);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      const orgId = 'org-123';

      expect(removeSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.detail(orgId, featureId),
      });
      expect(removeSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.tasks.list(orgId, { featureId }),
      });
    });

    it('should invalidate epics after feature deletion', async () => {
      const featureId = 'feature-123';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteFeature(), { wrapper });

      result.current.mutate(featureId);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate epics to update counters
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.all,
      });
    });
  });
});
