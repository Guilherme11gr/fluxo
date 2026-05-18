import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindPageByExecutionId,
  mockFindById,
  mockExtractAuthenticatedTenant,
  mockCreateClient,
} = vi.hoisted(() => ({
  mockFindPageByExecutionId: vi.fn(),
  mockFindById: vi.fn(),
  mockExtractAuthenticatedTenant: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}));

vi.mock('@/shared/http/auth.helpers', () => ({
  extractAuthenticatedTenant: mockExtractAuthenticatedTenant,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentExecutionEventRepository: {
    findPageByExecutionId: mockFindPageByExecutionId,
  },
  agentExecutionRepository: {
    findById: mockFindById,
  },
}));

import { GET } from './route';

describe('GET /api/executions/[id]/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockCreateClient.mockResolvedValue({});
    mockExtractAuthenticatedTenant.mockResolvedValue({ tenantId: 'org-1' });
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-1' });
  });

  it('returns metadata with lastSeq, nextAfterSeq, returnedCount, hasMore', async () => {
    mockFindPageByExecutionId.mockResolvedValue({
      items: [{ id: 'evt-1', seq: 1, kind: 'log', content: 'test', metadata: {}, executionId: 'exec-1', createdAt: new Date() }],
      lastSeq: 5,
      nextAfterSeq: 1,
      returnedCount: 1,
      hasMore: true,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/events'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.data).toHaveProperty('items');
    expect(body.data).toHaveProperty('lastSeq', 5);
    expect(body.data).toHaveProperty('nextAfterSeq', 1);
    expect(body.data).toHaveProperty('returnedCount', 1);
    expect(body.data).toHaveProperty('hasMore', true);
  });

  it('passes afterSeq from query params to repository', async () => {
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 10,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    await GET(
      new Request('http://localhost/api/executions/exec-1/events?afterSeq=5'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(mockFindPageByExecutionId).toHaveBeenCalledWith('exec-1', 5, 200);
  });

  it('passes limit from query params to repository', async () => {
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    await GET(
      new Request('http://localhost/api/executions/exec-1/events?limit=50'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(mockFindPageByExecutionId).toHaveBeenCalledWith('exec-1', undefined, 50);
  });

  it('caps limit to maximum of 500', async () => {
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    await GET(
      new Request('http://localhost/api/executions/exec-1/events?limit=9999'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(mockFindPageByExecutionId).toHaveBeenCalledWith('exec-1', undefined, 500);
  });

  it('returns 404 when execution does not belong to tenant', async () => {
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-2' });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/events'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns items ordered by seq asc in the response', async () => {
    mockFindPageByExecutionId.mockResolvedValue({
      items: [
        { id: 'evt-1', seq: 1, kind: 'log', content: 'first', metadata: {}, executionId: 'exec-1', createdAt: new Date() },
        { id: 'evt-2', seq: 2, kind: 'log', content: 'second', metadata: {}, executionId: 'exec-1', createdAt: new Date() },
      ],
      lastSeq: 2,
      nextAfterSeq: 2,
      returnedCount: 2,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/events'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const body = await response.json();
    expect(body.data.items[0].seq).toBe(1);
    expect(body.data.items[1].seq).toBe(2);
  });
});
