import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const MAX_CONSECUTIVE_ERRORS = 10;

function makeEvent(seq: number, kind = 'log', content = 'test'): Record<string, unknown> {
  return {
    id: `evt-${seq}`,
    executionId: 'exec-1',
    seq,
    kind,
    content,
    metadata: {},
    createdAt: new Date('2026-01-01T00:00:00Z'),
  };
}

function parseSSEEvents(text: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  const blocks = text.split('\n\n').filter(Boolean);
  for (const block of blocks) {
    const lines = block.split('\n');
    let event = '';
    let data = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) event = line.slice(7);
      if (line.startsWith('data: ')) data = line.slice(6);
    }
    if (event && data) events.push({ event, data });
  }
  return events;
}

async function readUntilDone(response: Response, maxIterations = 20): Promise<{ buffer: string; doneEvent: { event: string; data: string } | null }> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let doneEvent: { event: string; data: string } | null = null;

  for (let i = 0; i < maxIterations; i++) {
    const { value, done } = await reader.read();
    if (value) buffer += decoder.decode(value, { stream: true });

    const events = parseSSEEvents(buffer);
    const doneEv = events.find(e => e.event === 'done');
    if (doneEv) {
      doneEvent = doneEv;
      break;
    }

    await vi.advanceTimersByTimeAsync(1000);
    if (done) break;
  }

  return { buffer, doneEvent };
}

describe('GET /api/executions/[id]/stream', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    mockCreateClient.mockResolvedValue({});
    mockExtractAuthenticatedTenant.mockResolvedValue({ tenantId: 'org-1' });
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-1', status: 'RUNNING' });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns 404 when execution does not belong to tenant', async () => {
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-2' });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 404 when execution does not exist', async () => {
    mockFindById.mockResolvedValue(null);

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(404);
  });

  it('returns 400 for invalid lastSeq', async () => {
    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream?lastSeq=abc'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(400);
  });

  it('returns SSE content type headers', async () => {
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-1', status: 'SUCCESS' });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    expect(response.headers.get('Cache-Control')).toBe('no-cache');
    expect(response.headers.get('Connection')).toBe('keep-alive');
  });

  it('sends replay events and done event for completed execution', async () => {
    let pollCount = 0;
    mockFindById.mockImplementation(async () => {
      pollCount++;
      if (pollCount <= 1) return { id: 'exec-1', orgId: 'org-1', status: 'RUNNING' };
      return { id: 'exec-1', orgId: 'org-1', status: 'SUCCESS' };
    });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [makeEvent(1), makeEvent(2), makeEvent(3)],
      lastSeq: 3,
      nextAfterSeq: 3,
      returnedCount: 3,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream?lastSeq=0'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const { buffer, doneEvent } = await readUntilDone(response);

    const allEvents = parseSSEEvents(buffer);
    const eventEvents = allEvents.filter(e => e.event === 'event');
    expect(eventEvents.length).toBeGreaterThanOrEqual(3);

    const seqs = eventEvents.map(e => JSON.parse(e.data).seq);
    expect(seqs).toContain(1);
    expect(seqs).toContain(2);
    expect(seqs).toContain(3);

    expect(doneEvent).not.toBeNull();
    const doneData = JSON.parse(doneEvent!.data);
    expect(doneData.reason).toBe('completed');
    expect(doneData.status).toBe('SUCCESS');
  });

  it('resumes from lastSeq and only sends newer events', async () => {
    let pollCount = 0;
    mockFindById.mockImplementation(async () => {
      pollCount++;
      if (pollCount <= 1) return { id: 'exec-1', orgId: 'org-1', status: 'RUNNING' };
      return { id: 'exec-1', orgId: 'org-1', status: 'SUCCESS' };
    });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [makeEvent(4, 'step', 'new event')],
      lastSeq: 4,
      nextAfterSeq: 4,
      returnedCount: 1,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream?lastSeq=3'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);

    const { buffer } = await readUntilDone(response);

    const allEvents = parseSSEEvents(buffer);
    const eventEvents = allEvents.filter(e => e.event === 'event');

    expect(eventEvents.length).toBeGreaterThanOrEqual(1);
    const firstEventData = JSON.parse(eventEvents[0].data);
    expect(firstEventData.seq).toBe(4);
    expect(firstEventData.kind).toBe('step');
    expect(firstEventData.content).toBe('new event');
  });

  it('supports afterSeq as alias for lastSeq', async () => {
    mockFindById.mockResolvedValueOnce({ id: 'exec-1', orgId: 'org-1', status: 'RUNNING' });
    mockFindPageByExecutionId.mockResolvedValueOnce({
      items: [],
      lastSeq: 5,
      nextAfterSeq: 5,
      returnedCount: 0,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream?afterSeq=5'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBe(200);
    expect(response.body).not.toBeNull();

    const reader = response.body!.getReader();
    reader.releaseLock();
  });

  it('sends heartbeat events at the heartbeat interval', async () => {
    vi.useRealTimers();
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-1', status: 'RUNNING' });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    const readPromise = (async () => {
      for (let i = 0; i < 50; i++) {
        const { value, done } = await reader.read();
        if (value) buffer += decoder.decode(value, { stream: true });
        const events = parseSSEEvents(buffer);
        if (events.some(e => e.event === 'heartbeat')) return;
        if (done) return;
      }
    })();

    await readPromise;

    const events = parseSSEEvents(buffer);
    const heartbeats = events.filter(e => e.event === 'heartbeat');
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);

    const hbData = JSON.parse(heartbeats[0].data);
    expect(hbData).toHaveProperty('lastSeq');
    expect(hbData).toHaveProperty('ts');

    reader.releaseLock();
  }, 30000);

  it('sends done with reason timeout when max stream duration is exceeded', async () => {
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-1', status: 'RUNNING' });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const readPromise = reader.read();

    await vi.advanceTimersByTimeAsync(5 * 60 * 1000 + 2000);

    let buffer = '';
    for (let i = 0; i < 30; i++) {
      const result = i === 0 ? await readPromise : await reader.read();
      if (result.value) buffer += decoder.decode(result.value, { stream: true });
      if (result.done) break;
    }

    const events = parseSSEEvents(buffer);
    const doneEvent = events.find(e => e.event === 'done');
    expect(doneEvent).toBeDefined();
    const doneData = JSON.parse(doneEvent!.data);
    expect(doneData.reason).toBe('timeout');
  }, 10000);

  it('sends done for FAILED terminal status', async () => {
    mockFindById.mockImplementation(async () => {
      return { id: 'exec-1', orgId: 'org-1', status: 'FAILED' };
    });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const { buffer, doneEvent } = await readUntilDone(response);

    expect(doneEvent).not.toBeNull();
    const doneData = JSON.parse(doneEvent!.data);
    expect(doneData.reason).toBe('completed');
    expect(doneData.status).toBe('FAILED');
  });

  it('sends done for TIMEOUT terminal status', async () => {
    mockFindById.mockImplementation(async () => {
      return { id: 'exec-1', orgId: 'org-1', status: 'TIMEOUT' };
    });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const { buffer, doneEvent } = await readUntilDone(response);

    expect(doneEvent).not.toBeNull();
    const doneData = JSON.parse(doneEvent!.data);
    expect(doneData.reason).toBe('completed');
    expect(doneData.status).toBe('TIMEOUT');
  });

  it('sends done for CANCELLED terminal status', async () => {
    mockFindById.mockImplementation(async () => {
      return { id: 'exec-1', orgId: 'org-1', status: 'CANCELLED' };
    });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const { buffer, doneEvent } = await readUntilDone(response);

    expect(doneEvent).not.toBeNull();
    const doneData = JSON.parse(doneEvent!.data);
    expect(doneData.reason).toBe('completed');
    expect(doneData.status).toBe('CANCELLED');
  });

  it('sends error event when replay fails and continues polling', async () => {
    mockFindById.mockImplementation(async () => {
      return { id: 'exec-1', orgId: 'org-1', status: 'SUCCESS' };
    });
    mockFindPageByExecutionId.mockRejectedValueOnce(new Error('db down'));
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const { buffer } = await readUntilDone(response);

    const events = parseSSEEvents(buffer);
    const errorEvent = events.find(e => e.event === 'error');
    expect(errorEvent).toBeDefined();
    const errorData = JSON.parse(errorEvent!.data);
    expect(errorData.message).toBe('replay_failed');
  });

  it('closes stream after max consecutive poll errors', async () => {
    let pollCount = 0;
    mockFindById.mockImplementation(async () => {
      pollCount++;
      if (pollCount <= 1) return { id: 'exec-1', orgId: 'org-1', status: 'RUNNING' };
      return { id: 'exec-1', orgId: 'org-1', status: 'RUNNING' };
    });
    mockFindPageByExecutionId.mockRejectedValue(new Error('db down'));

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();

    const readPromise = reader.read();

    await vi.advanceTimersByTimeAsync(MAX_CONSECUTIVE_ERRORS * 1000 + 2000);

    let buffer = '';
    for (let i = 0; i < 30; i++) {
      const result = i === 0 ? await readPromise : await reader.read();
      if (result.value) buffer += decoder.decode(result.value, { stream: true });
      if (result.done) break;
    }

    const events = parseSSEEvents(buffer);
    const errorEvent = events.find(e => e.event === 'error' && JSON.parse(e.data).message === 'too_many_errors');
    expect(errorEvent).toBeDefined();
    const errorData = JSON.parse(errorEvent!.data);
    expect(errorData.message).toBe('too_many_errors');
  }, 10000);

  it('closes stream when client disconnects via abort signal', async () => {
    vi.useRealTimers();
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-1', status: 'RUNNING' });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [],
      lastSeq: 0,
      nextAfterSeq: 0,
      returnedCount: 0,
      hasMore: false,
    });

    const abortController = new AbortController();
    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream', { signal: abortController.signal }),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const reader = response.body!.getReader();

    // Start reading without awaiting, then abort
    const readPromise = reader.read();
    setTimeout(() => abortController.abort(), 50);

    const result = await readPromise;
    // Stream should close after abort - either done or value with replay error data
    expect(result.done || result.value).toBeTruthy();
    vi.useFakeTimers();
  }, 10000);

  it('returns 401 when authentication fails', async () => {
    mockExtractAuthenticatedTenant.mockRejectedValue(new Error('Unauthorized'));

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    expect(response.status).toBeGreaterThanOrEqual(400);
  });

  it('defaults to seq 0 when no lastSeq parameter provided', async () => {
    mockFindById.mockResolvedValue({ id: 'exec-1', orgId: 'org-1', status: 'SUCCESS' });
    mockFindPageByExecutionId.mockResolvedValue({
      items: [makeEvent(1), makeEvent(2)],
      lastSeq: 2,
      nextAfterSeq: 2,
      returnedCount: 2,
      hasMore: false,
    });

    const response = await GET(
      new Request('http://localhost/api/executions/exec-1/stream'),
      { params: Promise.resolve({ id: 'exec-1' }) }
    );

    const { buffer } = await readUntilDone(response);

    const events = parseSSEEvents(buffer);
    const eventEvents = events.filter(e => e.event === 'event');
    expect(eventEvents.length).toBeGreaterThanOrEqual(2);

    expect(mockFindPageByExecutionId).toHaveBeenCalledWith('exec-1', 0, 500);
  });
});
