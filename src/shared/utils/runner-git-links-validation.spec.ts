import { describe, it, expect } from 'vitest';
import {
  buildBranchName,
  buildCompareLink,
  buildCommitLink,
  buildPRLink,
  buildArtifactLink,
  getValidationCards,
  validateCards,
  GIT_POLICIES,
  RESULT_MARKERS,
  BRANCH_NAME_MAX_LENGTH,
  BRANCH_SHORT_ID_LENGTH,
  COMMIT_MSG_TITLE_MAX_LENGTH,
} from './runner-git-links-validation';

describe('runner-git-links-validation', () => {
  describe('getValidationCards', () => {
    it('should return cards with unique ids', () => {
      const cards = getValidationCards();
      const ids = cards.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should return cards with non-empty labels', () => {
      const cards = getValidationCards();
      for (const card of cards) {
        expect(card.label.trim().length).toBeGreaterThan(0);
      }
    });

    it('should include expected link kinds', () => {
      const cards = getValidationCards();
      const kinds = new Set(cards.map((c) => c.kind));
      expect(kinds.has('branch_naming')).toBe(true);
      expect(kinds.has('artifact_link')).toBe(true);
      expect(kinds.has('compare_link')).toBe(true);
      expect(kinds.has('commit_link')).toBe(true);
    });

    it('should have all cards marked as validated', () => {
      const cards = getValidationCards();
      for (const card of cards) {
        expect(card.validated).toBe(true);
      }
    });

    it('should have non-empty descriptions', () => {
      const cards = getValidationCards();
      for (const card of cards) {
        expect(card.description.trim().length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty sourceFile references', () => {
      const cards = getValidationCards();
      for (const card of cards) {
        expect(card.sourceFile.trim().length).toBeGreaterThan(0);
      }
    });
  });

  describe('validateCards', () => {
    it('should return allValid true for correct card set', () => {
      const cards = getValidationCards();
      const result = validateCards(cards);
      expect(result.allValid).toBe(true);
    });

    it('should detect duplicate ids', () => {
      const cards = getValidationCards();
      cards[0].id = cards[1].id;
      const result = validateCards(cards);
      expect(result.uniqueIds).toBe(false);
    });

    it('should detect empty labels', () => {
      const cards = getValidationCards();
      cards[0].label = '';
      const result = validateCards(cards);
      expect(result.nonEmptyLabels).toBe(false);
    });

    it('should report missing kinds', () => {
      const cards = getValidationCards().filter((c) => c.kind !== 'marker');
      const result = validateCards(cards);
      expect(result.missingKinds).toContain('marker');
    });
  });

  describe('buildBranchName', () => {
    it('should build a branch name with agent slug, type, and short task id', () => {
      const name = buildBranchName('182955ed-12c6-44ee-8391-00a24949529a', 'task', 'codex');
      expect(name).toBe('codex/task-182955ed');
    });

    it('should truncate task id to 8 chars', () => {
      const name = buildBranchName('abcdef12-3456-7890-abcd-ef1234567890', 'bug', 'my-agent');
      expect(name).toBe('my-agent/bug-abcdef12');
    });

    it('should include execution id when provided', () => {
      const name = buildBranchName(
        '182955ed-12c6-44ee-8391-00a24949529a',
        'task',
        'codex',
        '',
        '2f034b28-a21c-4d05-8b50-539d76bac7fa'
      );
      expect(name).toBe('codex/task-182955ed-2f034b28');
    });

    it('should use allowed prefix instead of agent slug', () => {
      const name = buildBranchName(
        '182955ed-12c6-44ee-8391-00a24949529a',
        'task',
        'codex',
        'agent/codex'
      );
      expect(name).toBe('agent/codex/task-182955ed');
    });

    it('should sanitize special characters to hyphens', () => {
      const name = buildBranchName('abc123', 'task', 'My Agent!@#');
      expect(name).toBe('my-agent/task-abc123');
    });

    it('should truncate to 128 chars max', () => {
      const longTaskId = 'a'.repeat(200);
      const name = buildBranchName(longTaskId, 'task', 'agent');
      expect(name.length).toBeLessThanOrEqual(BRANCH_NAME_MAX_LENGTH);
    });

    it('should default type to "task" when empty', () => {
      const name = buildBranchName('abc123', '', 'agent');
      expect(name).toBe('agent/task-abc123');
    });
  });

  describe('buildCompareLink', () => {
    it('should build a GitHub compare URL', () => {
      const link = buildCompareLink('https://github.com/org/repo', 'main', 'feature-branch');
      expect(link).toBe('https://github.com/org/repo/compare/main...feature-branch');
    });

    it('should handle trailing slash in repo url', () => {
      const link = buildCompareLink('https://github.com/org/repo/', 'main', 'feature-branch');
      expect(link).toBe('https://github.com/org/repo/compare/main...feature-branch');
    });

    it('should encode branch names with special chars', () => {
      const link = buildCompareLink('https://github.com/org/repo', 'main', 'agent/task-abc/fix');
      expect(link).toBe('https://github.com/org/repo/compare/main...agent%2Ftask-abc%2Ffix');
    });
  });

  describe('buildCommitLink', () => {
    it('should build a GitHub commit URL', () => {
      const link = buildCommitLink(
        'https://github.com/org/repo',
        '0b6c5af8c223f64d5021fa06319cec06d6b8e343'
      );
      expect(link).toBe(
        'https://github.com/org/repo/commit/0b6c5af8c223f64d5021fa06319cec06d6b8e343'
      );
    });
  });

  describe('buildPRLink', () => {
    it('should build a GitHub PR URL', () => {
      const link = buildPRLink('https://github.com/org/repo', 42);
      expect(link).toBe('https://github.com/org/repo/pull/42');
    });
  });

  describe('buildArtifactLink', () => {
    it('should build a GitHub blob URL', () => {
      const link = buildArtifactLink(
        'https://github.com/org/repo',
        'main',
        'src/utils/file.ts'
      );
      expect(link).toBe('https://github.com/org/repo/blob/main/src/utils/file.ts');
    });
  });

  describe('constants', () => {
    it('should have correct git policies', () => {
      expect(GIT_POLICIES).toContain('no_write');
      expect(GIT_POLICIES).toContain('branch_only');
      expect(GIT_POLICIES).toContain('branch_commit_pr');
      expect(GIT_POLICIES.length).toBe(3);
    });

    it('should have correct result markers', () => {
      expect(RESULT_MARKERS.summaryStart).toBe('FLUXO_SUMMARY_START');
      expect(RESULT_MARKERS.summaryEnd).toBe('FLUXO_SUMMARY_END');
      expect(RESULT_MARKERS.resultStart).toBe('FLUXO_RESULT_JSON_START');
      expect(RESULT_MARKERS.resultEnd).toBe('FLUXO_RESULT_JSON_END');
    });

    it('should have correct branch name max length', () => {
      expect(BRANCH_NAME_MAX_LENGTH).toBe(128);
    });

    it('should have correct short id length', () => {
      expect(BRANCH_SHORT_ID_LENGTH).toBe(8);
    });

    it('should have correct commit msg title max length', () => {
      expect(COMMIT_MSG_TITLE_MAX_LENGTH).toBe(72);
    });
  });
});
