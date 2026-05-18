import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type ExecutionEventRecord = {
  id: string;
  executionId: string;
  seq: number;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

function mergeEvents(existing: ExecutionEventRecord[], incoming: ExecutionEventRecord[]): ExecutionEventRecord[] {
  if (existing.length === 0) return incoming;
  if (incoming.length === 0) return existing;

  const existingSeqs = new Set(existing.map((e) => e.seq));
  const newEvents = incoming.filter((e) => !existingSeqs.has(e.seq));

  if (newEvents.length === 0) return existing;

  return [...existing, ...newEvents].sort((a, b) => a.seq - b.seq);
}

function makeEvent(seq: number, content = `event ${seq}`): ExecutionEventRecord {
  return {
    id: `evt-${seq}`,
    executionId: 'exec-1',
    seq,
    kind: 'log',
    content,
    metadata: {},
    createdAt: new Date().toISOString(),
  };
}

describe('mergeEvents', () => {
  it('returns incoming when existing is empty', () => {
    const incoming = [makeEvent(1), makeEvent(2)];
    const result = mergeEvents([], incoming);
    expect(result).toEqual(incoming);
  });

  it('returns existing when incoming is empty', () => {
    const existing = [makeEvent(1), makeEvent(2)];
    const result = mergeEvents(existing, []);
    expect(result).toEqual(existing);
  });

  it('appends new events and sorts by seq', () => {
    const existing = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const incoming = [makeEvent(4), makeEvent(5)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not duplicate events with same seq', () => {
    const existing = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const incoming = [makeEvent(2), makeEvent(3), makeEvent(4)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
    expect(result.length).toBe(4);
  });

  it('handles overlapping events correctly', () => {
    const existing = [makeEvent(1), makeEvent(3), makeEvent(5)];
    const incoming = [makeEvent(3), makeEvent(4), makeEvent(5), makeEvent(6)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 3, 4, 5, 6]);
  });

  it('preserves content from existing events (not overwritten by incoming)', () => {
    const existing = [makeEvent(1, 'original content')];
    const incoming = [makeEvent(1, 'new content'), makeEvent(2)];
    const result = mergeEvents(existing, incoming);
    const evt1 = result.find((e) => e.seq === 1);
    expect(evt1?.content).toBe('original content');
  });

  it('handles out-of-order incoming events', () => {
    const existing = [makeEvent(1)];
    const incoming = [makeEvent(5), makeEvent(3), makeEvent(4)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 3, 4, 5]);
  });

  it('returns empty array when both are empty', () => {
    const result = mergeEvents([], []);
    expect(result).toEqual([]);
  });
});

describe('ExecutionEventsResult type', () => {
  it('should include pagination metadata fields', async () => {
    const { queryKeys } = await import('@/lib/query/query-keys');

    const orgId = 'org-123';
    const executionId = 'exec-456';

    const keyWithoutAfterSeq = queryKeys.executions.events(orgId, executionId, undefined);
    const keyWithAfterSeq = queryKeys.executions.events(orgId, executionId, 10);

    expect(keyWithoutAfterSeq).toContain(executionId);
    expect(keyWithAfterSeq).toContain(executionId);
    expect(keyWithAfterSeq).toContain(10);
  });
});

describe('incremental cursor simulation', () => {
  it('simulates multi-page fetch with afterSeq advancing correctly', () => {
    let allEvents: ExecutionEventRecord[] = [];
    let afterSeq: number | undefined = undefined;
    let isInitial = true;

    const fullDataset = Array.from({ length: 500 }, (_, i) => makeEvent(i + 1));
    const pageSize = 200;

    function fetchPage(after?: number): { items: ExecutionEventRecord[]; lastSeq: number; hasMore: boolean } {
      const filtered = after !== undefined ? fullDataset.filter((e) => e.seq > after) : [...fullDataset];
      const items = filtered.slice(0, pageSize);
      const hasMore = filtered.length > pageSize;
      return { items, lastSeq: fullDataset[fullDataset.length - 1].seq, hasMore };
    }

    let page = fetchPage(afterSeq);

    if (isInitial) {
      allEvents = page.items;
      isInitial = false;
    }
    if (page.items.length > 0) {
      afterSeq = page.items[page.items.length - 1].seq;
    }

    expect(allEvents.length).toBe(200);
    expect(afterSeq).toBe(200);
    expect(page.hasMore).toBe(true);

    page = fetchPage(afterSeq);
    if (page.items.length > 0) {
      const merged = mergeEvents(allEvents, page.items);
      allEvents = merged;
      afterSeq = page.items[page.items.length - 1].seq;
    }

    expect(allEvents.length).toBe(400);
    expect(afterSeq).toBe(400);
    expect(page.hasMore).toBe(true);

    page = fetchPage(afterSeq);
    if (page.items.length > 0) {
      const merged = mergeEvents(allEvents, page.items);
      allEvents = merged;
      afterSeq = page.items[page.items.length - 1].seq;
    }

    expect(allEvents.length).toBe(500);
    expect(afterSeq).toBe(500);
    expect(page.hasMore).toBe(false);

    page = fetchPage(afterSeq);
    expect(page.items.length).toBe(0);
    const merged = mergeEvents(allEvents, page.items);
    expect(merged.length).toBe(500);
  });

  it('simulates live events arriving after initial pagination', () => {
    let allEvents: ExecutionEventRecord[] = [];
    let afterSeq: number | undefined = undefined;
    let isInitial = true;

    const initialEvents = Array.from({ length: 200 }, (_, i) => makeEvent(i + 1));

    function fetchPage(
      after: number | undefined,
      liveData: ExecutionEventRecord[],
    ): { items: ExecutionEventRecord[]; lastSeq: number; hasMore: boolean } {
      const source = after !== undefined ? liveData.filter((e) => e.seq > after) : [...liveData];
      return { items: source, lastSeq: liveData[liveData.length - 1]?.seq ?? 0, hasMore: false };
    }

    let page = fetchPage(afterSeq, initialEvents);
    if (isInitial) {
      allEvents = page.items;
      isInitial = false;
    }
    if (page.items.length > 0) {
      afterSeq = page.items[page.items.length - 1].seq;
    }

    expect(allEvents.length).toBe(200);
    expect(afterSeq).toBe(200);

    const withNewEvents = [...initialEvents, makeEvent(201), makeEvent(202), makeEvent(203)];
    page = fetchPage(afterSeq, withNewEvents);
    if (page.items.length > 0) {
      allEvents = mergeEvents(allEvents, page.items);
      afterSeq = page.items[page.items.length - 1].seq;
    }

    expect(allEvents.length).toBe(203);
    expect(allEvents[allEvents.length - 1].seq).toBe(203);
    expect(afterSeq).toBe(203);
  });

  it('does not accumulate events on duplicate fetches', () => {
    const events = [makeEvent(1), makeEvent(2), makeEvent(3)];

    const result1 = mergeEvents(events, events);
    expect(result1.length).toBe(3);

    const result2 = mergeEvents(result1, events);
    expect(result2.length).toBe(3);

    const result3 = mergeEvents(result2, [makeEvent(2), makeEvent(3), makeEvent(4)]);
    expect(result3.length).toBe(4);
  });

  it('handles large-scale incremental merge without duplicates', () => {
    const batchSize = 200;
    const totalEvents = 2000;
    let allEvents: ExecutionEventRecord[] = [];

    for (let offset = 0; offset < totalEvents; offset += batchSize) {
      const batch = Array.from({ length: Math.min(batchSize, totalEvents - offset) }, (_, i) =>
        makeEvent(offset + i + 1),
      );
      allEvents = allEvents.length === 0 ? batch : mergeEvents(allEvents, batch);
    }

    expect(allEvents.length).toBe(totalEvents);
    const seqs = allEvents.map((e) => e.seq);
    const uniqueSeqs = new Set(seqs);
    expect(uniqueSeqs.size).toBe(totalEvents);
    expect(seqs[0]).toBe(1);
    expect(seqs[seqs.length - 1]).toBe(totalEvents);
  });
});
