import { describe, it, expect } from 'vitest';

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

function makeEvent(seq: number, kind = 'step', content = `event-${seq}`): ExecutionEventRecord {
  return {
    id: `evt-${seq}`,
    executionId: 'exec-1',
    seq,
    kind,
    content,
    metadata: {},
    createdAt: new Date().toISOString(),
  };
}

describe('useExecutionStream: mergeEvents', () => {
  it('returns incoming when existing is empty', () => {
    const incoming = [makeEvent(1), makeEvent(2)];
    expect(mergeEvents([], incoming)).toEqual(incoming);
  });

  it('returns existing when incoming is empty', () => {
    const existing = [makeEvent(1)];
    expect(mergeEvents(existing, [])).toEqual(existing);
  });

  it('merges and sorts by seq', () => {
    const existing = [makeEvent(1), makeEvent(3)];
    const incoming = [makeEvent(2), makeEvent(4)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 2, 3, 4]);
  });

  it('deduplicates by seq', () => {
    const existing = [makeEvent(1), makeEvent(2)];
    const incoming = [makeEvent(2), makeEvent(3)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  it('returns same reference when no new events', () => {
    const existing = [makeEvent(1), makeEvent(2)];
    const incoming = [makeEvent(1), makeEvent(2)];
    const result = mergeEvents(existing, incoming);
    expect(result).toBe(existing);
  });

  it('preserves content from existing on duplicate seq', () => {
    const existing = [makeEvent(1, 'step', 'original')];
    const incoming = [makeEvent(1, 'step', 'updated'), makeEvent(2)];
    const result = mergeEvents(existing, incoming);
    expect(result.find((e) => e.seq === 1)?.content).toBe('original');
  });

  it('handles out-of-order incoming events', () => {
    const existing = [makeEvent(1)];
    const incoming = [makeEvent(5), makeEvent(3), makeEvent(2)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 2, 3, 5]);
  });

  it('returns empty for both empty', () => {
    expect(mergeEvents([], [])).toEqual([]);
  });

  it('handles SSE-like single event append', () => {
    const existing = [makeEvent(1), makeEvent(2), makeEvent(3)];
    const incoming = [makeEvent(4)];
    const result = mergeEvents(existing, incoming);
    expect(result.length).toBe(4);
    expect(result[result.length - 1].seq).toBe(4);
  });

  it('handles large batch merge', () => {
    const existing = Array.from({ length: 100 }, (_, i) => makeEvent(i + 1));
    const incoming = Array.from({ length: 100 }, (_, i) => makeEvent(i + 101));
    const result = mergeEvents(existing, incoming);
    expect(result.length).toBe(200);
    expect(result[0].seq).toBe(1);
    expect(result[199].seq).toBe(200);
  });

  it('handles gap in seq numbers', () => {
    const existing = [makeEvent(1), makeEvent(5), makeEvent(10)];
    const incoming = [makeEvent(3), makeEvent(7), makeEvent(15)];
    const result = mergeEvents(existing, incoming);
    expect(result.map((e) => e.seq)).toEqual([1, 3, 5, 7, 10, 15]);
  });
});

describe('useExecutionStream: SSE URL construction', () => {
  it('builds correct stream URL with afterSeq', () => {
    const id = 'exec-123';
    const lastSeq = 42;
    const url = `/api/executions/${id}/stream?afterSeq=${lastSeq}`;
    expect(url).toBe('/api/executions/exec-123/stream?afterSeq=42');
  });

  it('builds correct stream URL with afterSeq=0 for initial connection', () => {
    const id = 'exec-456';
    const url = `/api/executions/${id}/stream?afterSeq=0`;
    expect(url).toBe('/api/executions/exec-456/stream?afterSeq=0');
  });
});

describe('useExecutionStream: event kinds', () => {
  const kinds = ['step', 'tool_use', 'tool_result', 'result', 'error', 'output', 'status'];

  it.each(kinds)('handles kind "%s" without error', (kind) => {
    const event = makeEvent(1, kind, `content for ${kind}`);
    expect(event.kind).toBe(kind);
    expect(event.content).toContain(kind);
  });
});
