import { describe, expect, it } from 'vitest';
import { extractStructuredResult } from '@/shared/types/execution.types';

describe('extractStructuredResult', () => {
  it('returns null when metadata is empty', () => {
    expect(extractStructuredResult({})).toBeNull();
  });

  it('returns null when metadata.result is missing', () => {
    expect(extractStructuredResult({ other: 123 })).toBeNull();
  });

  it('returns null when schemaVersion is not v1', () => {
    expect(extractStructuredResult({ result: { schemaVersion: 'v2', status: 'success', summary: 'ok' } })).toBeNull();
  });

  it('returns null when result is not an object', () => {
    expect(extractStructuredResult({ result: 'string' })).toBeNull();
  });

  it('returns structured result when schemaVersion is v1', () => {
    const result = extractStructuredResult({
      result: {
        schemaVersion: 'v1',
        status: 'success',
        summary: 'Implemented feature X.',
        whatChanged: ['Added component A', 'Updated component B'],
        decisions: ['Used CSS modules'],
        risks: ['May affect layout on mobile'],
        checksRun: [
          { name: 'lint', status: 'passed', details: null },
          { name: 'test', status: 'failed', details: '2 tests failed' },
        ],
        filesTouched: ['src/a.ts', 'src/b.ts'],
        git: { branch: 'feat/x', prUrl: 'https://github.com/org/repo/pull/42', prNumber: 42 },
        followups: ['Add e2e test for feature X'],
      },
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe('v1');
    expect(result!.status).toBe('success');
    expect(result!.summary).toBe('Implemented feature X.');
    expect(result!.whatChanged).toEqual(['Added component A', 'Updated component B']);
    expect(result!.decisions).toEqual(['Used CSS modules']);
    expect(result!.risks).toEqual(['May affect layout on mobile']);
    expect(result!.checksRun).toHaveLength(2);
    expect(result!.checksRun![0].status).toBe('passed');
    expect(result!.checksRun![1].status).toBe('failed');
    expect(result!.filesTouched).toEqual(['src/a.ts', 'src/b.ts']);
    expect(result!.git?.branch).toBe('feat/x');
    expect(result!.git?.prUrl).toBe('https://github.com/org/repo/pull/42');
    expect(result!.followups).toEqual(['Add e2e test for feature X']);
  });

  it('returns structured result with minimal fields', () => {
    const result = extractStructuredResult({
      result: { schemaVersion: 'v1', status: 'failed', summary: 'Something went wrong.' },
    });

    expect(result).not.toBeNull();
    expect(result!.schemaVersion).toBe('v1');
    expect(result!.status).toBe('failed');
    expect(result!.summary).toBe('Something went wrong.');
    expect(result!.whatChanged).toBeUndefined();
    expect(result!.checksRun).toBeUndefined();
    expect(result!.git).toBeUndefined();
  });

  it('handles metadata with memoryIngestion field alongside result', () => {
    const result = extractStructuredResult({
      result: { schemaVersion: 'v1', status: 'success', summary: 'Done' },
      memoryIngestion: { status: 'pending', updatedAt: '2026-05-16T00:00:00.000Z' },
    });

    expect(result).not.toBeNull();
    expect(result!.summary).toBe('Done');
  });
});