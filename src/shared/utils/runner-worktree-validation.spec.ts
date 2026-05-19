import { describe, it, expect } from 'vitest';
import { worktreeValidationRows, getWorktreeValidationRow } from './runner-worktree-validation';

describe('runner-worktree-validation', () => {
  describe('worktreeValidationRows', () => {
    it('should have at least three rows', () => {
      expect(worktreeValidationRows.length).toBeGreaterThanOrEqual(3);
    });

    it('should have unique ids', () => {
      const ids = worktreeValidationRows.map((row) => row.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have non-empty labels', () => {
      for (const row of worktreeValidationRows) {
        expect(row.label.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty commands', () => {
      for (const row of worktreeValidationRows) {
        expect(row.command.length).toBeGreaterThan(0);
      }
    });

    it('should have at least one command mentioning git status', () => {
      const hasGitStatus = worktreeValidationRows.some((row) =>
        row.command.includes('git status')
      );
      expect(hasGitStatus).toBe(true);
    });

    it('should have non-empty expected patterns', () => {
      for (const row of worktreeValidationRows) {
        expect(row.expectedPattern.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty descriptions', () => {
      for (const row of worktreeValidationRows) {
        expect(row.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('getWorktreeValidationRow', () => {
    it('should return the row for a valid id', () => {
      const row = getWorktreeValidationRow('wt-001');
      expect(row).toBeDefined();
      expect(row?.label).toBe('Worktree path check');
    });

    it('should return undefined for an invalid id', () => {
      const row = getWorktreeValidationRow('invalid-id');
      expect(row).toBeUndefined();
    });
  });
});
