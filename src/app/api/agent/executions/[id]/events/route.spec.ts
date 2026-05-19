import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindPageByExecutionId,
  mockCreateMany,
  mockFindById,
  mockFindTaskById,
  mockExtractAgentAuth,
} = vi.hoisted(() => ({
  mockFindPageByExecutionId: vi.fn(),
  mockCreateMany: vi.fn(),
  mockFindById: vi.fn(),
  mockFindTaskById: vi.fn(),
  mockExtractAgentAuth: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentExecutionEventRepository: {
    findPageByExecutionId: mockFindPageByExecutionId,
    createMany: mockCreateMany,
  },
  agentExecutionRepository: {
    findById: mockFindById,
  },
  taskRepository: {
    findById: mockFindTaskById,
  },
}));

import { GET, POST } from './route';

describe('GET /api/agent/executions/[id]/events', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
      userId: 'user-1',
      agentName: 'runner',
      keyPrefix: 'agk_xxx',
      authMethod: 'tenant_api_key',
      keyId: 'key-1',
    });
    mockFindById.mockResolvedValue({
      id: 'exec-1',
      orgId: 'org-1',
      taskId: 'task-1',
      status: 'RUNNING',
    });
    mockFindTaskById.mockResolvedValue({
      id: 'task-1',
      currentExecutionId: 'exec-1',
    });
    mockCreateMany.mockResolvedValue(1);
  });

  it('returns metadata in meta with lastSeq, nextAfterSeq, hasMore', async () => {
    mockFindPageByExecutionId.mockResolvedValue({
      items: [{ id: 'evt-1', seq: 1, kind: 'log', content: 'test', metadata: {}, executionId: 'exec-1', createdAt: new Date() }],
      lastSeq: 5,
      nextAfterSeq: 1,
      returnedCount: 1,
      hasMore: true,
    });

    const response = await GET(
      new Request('http://localhost/api/agent/executions/exec-1/events'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.meta).toHaveProperty('total', 1);
    expect(body.meta).toHaveProperty('lastSeq', 5);
    expect(body.meta).toHaveProperty('nextAfterSeq', 1);
    expect(body.meta).toHaveProperty('hasMore', true);
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
      new Request('http://localhost/api/agent/executions/exec-1/events?afterSeq=5'),
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
      new Request('http://localhost/api/agent/executions/exec-1/events?limit=50'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(mockFindPageByExecutionId).toHaveBeenCalledWith('exec-1', undefined, 50);
  });

  it('returns 404 when execution does not belong to org', async () => {
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-2' });

    const response = await GET(
      new Request('http://localhost/api/agent/executions/exec-1/events'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns items ordered by seq asc', async () => {
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
      new Request('http://localhost/api/agent/executions/exec-1/events'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const body = await response.json();
    expect(body.data[0].seq).toBe(1);
    expect(body.data[1].seq).toBe(2);
  });

  it('creates events when expectedExecutionId matches the active owner', async () => {
    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedExecutionId: 'exec-1',
          events: [{ seq: 1, kind: 'log', content: 'hello' }],
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(mockCreateMany).toHaveBeenCalledWith('exec-1', [{ seq: 1, kind: 'log', content: 'hello' }]);
  });

  it('rejects event append when the task is owned by another execution', async () => {
    mockFindTaskById.mockResolvedValueOnce({
      id: 'task-1',
      currentExecutionId: 'exec-other',
    });

    const response = await POST(
      new Request('http://localhost/api/agent/executions/exec-1/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedExecutionId: 'exec-1',
          events: [{ seq: 1, kind: 'log', content: 'hello' }],
        }),
      }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(409);
    expect(mockCreateMany).not.toHaveBeenCalled();
  });
});
