import { describe, it, expect } from 'vitest';
import { RUNNER_VALIDATION_DATA } from './runner-validation-copy';

describe('RUNNER_VALIDATION_DATA', () => {
  describe('sections', () => {
    it('should have non-empty sections array', () => {
      expect(RUNNER_VALIDATION_DATA.sections.length).toBeGreaterThan(0);
    });

    it('should have at least one check per section', () => {
      for (const section of RUNNER_VALIDATION_DATA.sections) {
        expect(section.checks.length).toBeGreaterThan(0);
      }
    });

    it('should have non-empty title and description per section', () => {
      for (const section of RUNNER_VALIDATION_DATA.sections) {
        expect(section.title.length).toBeGreaterThan(0);
        expect(section.description.length).toBeGreaterThan(0);
      }
    });
  });

  describe('stable ids', () => {
    it('should have unique section ids', () => {
      const ids = RUNNER_VALIDATION_DATA.sections.map((s) => s.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('should have unique check ids across all sections', () => {
      const allCheckIds = RUNNER_VALIDATION_DATA.sections.flatMap((s) =>
        s.checks.map((c) => c.id)
      );
      const uniqueCheckIds = new Set(allCheckIds);
      expect(uniqueCheckIds.size).toBe(allCheckIds.length);
    });

    it('should have non-empty ids', () => {
      for (const section of RUNNER_VALIDATION_DATA.sections) {
        expect(section.id.length).toBeGreaterThan(0);
        for (const check of section.checks) {
          expect(check.id.length).toBeGreaterThan(0);
        }
      }
    });
  });

  describe('check commands', () => {
    it('should have at least one listed check command', () => {
      const commands = RUNNER_VALIDATION_DATA.sections.flatMap((s) =>
        s.checks.map((c) => c.command)
      );
      expect(commands.length).toBeGreaterThan(0);
    });

    it('should have non-empty command strings', () => {
      for (const section of RUNNER_VALIDATION_DATA.sections) {
        for (const check of section.checks) {
          expect(check.command.length).toBeGreaterThan(0);
        }
      }
    });

    it('should include npm run test as a command', () => {
      const commands = RUNNER_VALIDATION_DATA.sections.flatMap((s) =>
        s.checks.map((c) => c.command)
      );
      expect(commands).toContain('npm run test');
    });
  });

  describe('metadata', () => {
    it('should have a non-empty title', () => {
      expect(RUNNER_VALIDATION_DATA.title.length).toBeGreaterThan(0);
    });

    it('should have a valid lastUpdated date string', () => {
      const date = new Date(RUNNER_VALIDATION_DATA.lastUpdated);
      expect(date.toString()).not.toBe('Invalid Date');
    });
  });
});
