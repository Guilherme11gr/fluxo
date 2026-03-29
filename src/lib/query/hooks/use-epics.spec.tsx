import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import type { JSX } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useCreateEpic, useUpdateEpic, useDeleteEpic } from './use-epics';
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

describe('use-epics: Cache Invalidation', () => {
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

  describe('useCreateEpic', () => {
    it('should invalidate project-specific epic list after creation', async () => {
      const projectId = 'project-123';
      const newEpic = {
        id: 'epic-456',
        title: 'New Epic',
        status: 'OPEN',
        projectId,
        _count: { features: 0 },
      };

      // Mock successful API response
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: newEpic }),
      });

      // Setup spy on invalidateQueries
      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      // Render hook
      const { result } = renderHook(() => useCreateEpic(), { wrapper });

      // Execute mutation
      result.current.mutate({
        title: 'New Epic',
        projectId,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate project-specific epic list
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.list(orgId, projectId),
      });
    });

    it('should invalidate all-epics list after creation', async () => {
      const projectId = 'project-123';
      const newEpic = {
        id: 'epic-456',
        title: 'New Epic',
        status: 'OPEN',
        projectId,
        _count: { features: 0 },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: newEpic }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateEpic(), { wrapper });

      result.current.mutate({
        title: 'New Epic',
        projectId,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate all-epics list
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.allList(orgId),
      });
    });

    it('should invalidate project detail to update counters', async () => {
      const projectId = 'project-123';
      const newEpic = {
        id: 'epic-456',
        title: 'New Epic',
        status: 'OPEN',
        projectId,
        _count: { features: 0 },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: newEpic }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useCreateEpic(), { wrapper });

      result.current.mutate({
        title: 'New Epic',
        projectId,
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate project detail
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.projects.detail(orgId, projectId),
      });
    });
  });

  describe('useUpdateEpic', () => {
    it('should invalidate epic detail after update', async () => {
      const epicId = 'epic-123';
      const updatedEpic = {
        id: epicId,
        title: 'Updated Epic',
        status: 'CLOSED',
        projectId: 'project-456',
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedEpic }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateEpic(), { wrapper });

      result.current.mutate({
        id: epicId,
        data: { title: 'Updated Epic', status: 'CLOSED' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate epic detail
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.detail(orgId, epicId),
      });
    });

    it('should invalidate epic lists after update', async () => {
      const epicId = 'epic-123';
      const updatedEpic = {
        id: epicId,
        title: 'Updated Epic',
        status: 'OPEN',
        projectId: 'project-456',
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedEpic }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateEpic(), { wrapper });

      result.current.mutate({
        id: epicId,
        data: { title: 'Updated Epic' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate lists
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.lists(orgId),
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.allList(orgId),
      });
    });

    it('should invalidate features list of the epic after update', async () => {
      const epicId = 'epic-123';
      const updatedEpic = {
        id: epicId,
        title: 'Updated Epic',
        status: 'OPEN',
        projectId: 'project-456',
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedEpic }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateEpic(), { wrapper });

      result.current.mutate({
        id: epicId,
        data: { title: 'Updated Epic' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate features of this epic
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.list(orgId, epicId),
      });
    });

    it('should invalidate project detail after epic update', async () => {
      const epicId = 'epic-123';
      const projectId = 'project-456';
      const updatedEpic = {
        id: epicId,
        title: 'Updated Epic',
        status: 'CLOSED',
        projectId,
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: updatedEpic }),
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useUpdateEpic(), { wrapper });

      result.current.mutate({
        id: epicId,
        data: { status: 'CLOSED' },
      });

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate project detail
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.projects.detail(orgId, projectId),
      });
    });
  });

  describe('useDeleteEpic', () => {
    it('should invalidate all epics after deletion', async () => {
      const epicId = 'epic-123';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      const { result } = renderHook(() => useDeleteEpic(), { wrapper });

      result.current.mutate(epicId);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should invalidate all epic queries
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.all(orgId),
      });
    });

    it('should remove epic detail and features from cache after deletion', async () => {
      const epicId = 'epic-123';

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        ok: true,
      });

      const removeSpy = vi.spyOn(queryClient, 'removeQueries');

      const { result } = renderHook(() => useDeleteEpic(), { wrapper });

      result.current.mutate(epicId);

      await waitFor(() => expect(result.current.isSuccess).toBe(true));

      // Assert: should remove orphaned queries
      expect(removeSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.epics.detail(orgId, epicId),
      });
      expect(removeSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.features.list(orgId, epicId),
      });
    });
  });
});
