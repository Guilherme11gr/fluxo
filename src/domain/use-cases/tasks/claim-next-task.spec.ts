import { describe, expect, it } from 'vitest';
import { buildDeterministicBranchName, buildMemorySearchQuery } from './claim-next-task';

describe('claim next task helpers', () => {
  it('keeps branch building deterministic', () => {
    const name = buildDeterministicBranchName(
      '3044ff8c-73b9-40ae-b7fb-a9c6837baf1f',
      'TASK',
      'builder',
      null,
    );
    expect(name).toBe('builder/task-3044ff8c');
  });
});

describe('buildDeterministicBranchName', () => {
  it('builds a branch name from task metadata', () => {
    const name = buildDeterministicBranchName(
      '3044ff8c-73b9-40ae-b7fb-a9c6837baf1f',
      'TASK',
      'builder',
      null,
    );
    expect(name).toBe('builder/task-3044ff8c');
  });

  it('is deterministic for the same inputs', () => {
    const name1 = buildDeterministicBranchName('abc12345-xxxx', 'TASK', 'builder', null);
    const name2 = buildDeterministicBranchName('abc12345-xxxx', 'TASK', 'builder', null);
    expect(name1).toBe(name2);
  });

  it('uses allowed prefix when provided', () => {
    const name = buildDeterministicBranchName(
      'abc12345-xxxx',
      'BUG',
      'my-agent',
      'agent/',
    );
    expect(name).toBe('agent/bug-abc12345');
  });

  it('strips special characters from agent name', () => {
    const name = buildDeterministicBranchName(
      'shortid',
      'TASK',
      'FluXo@app!',
      null,
    );
    expect(name).toBe('fluxo-app/task-shortid');
  });

  it('defaults to "agent" when agent name results in empty slug', () => {
    const name = buildDeterministicBranchName(
      'shortid',
      'TASK',
      '@@@',
      null,
    );
    expect(name).toContain('agent/');
  });

  it('truncates long branch names to 128 chars', () => {
    const name = buildDeterministicBranchName(
      'a'.repeat(200),
      'TASK',
      'builder',
      null,
    );
    expect(name.length).toBeLessThanOrEqual(128);
    expect(name.endsWith('-')).toBe(false);
  });

  it('lowercases task type', () => {
    const name = buildDeterministicBranchName(
      'abc12345',
      'FEATURE',
      'dev',
      null,
    );
    expect(name).toBe('dev/feature-abc12345');
  });
});

describe('buildMemorySearchQuery', () => {
  it('joins title and description into a compact search query', () => {
    const query = buildMemorySearchQuery(
      'Deploy app na VPS',
      'Usar docker compose e validar nginx antes de reiniciar.',
    );

    expect(query).toBe('Deploy app na VPS Usar docker compose e validar nginx antes de reiniciar.');
  });

  it('returns only the title when description is empty', () => {
    expect(buildMemorySearchQuery('Planejar memory v1', null)).toBe('Planejar memory v1');
  });
});
