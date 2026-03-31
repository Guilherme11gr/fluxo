import { describe, it, expect } from 'vitest';
import {
  uuidSchema,
  slugSchema,
  projectKeySchema,
  paginationSchema,
  createTaskSchema,
  updateTaskSchema,
  storyPointsSchema,
  safeParse,
} from './validators';

describe('validators', () => {
  describe('uuidSchema', () => {
    it('should validate correct UUID', () => {
      const uuid = '123e4567-e89b-12d3-a456-426614174000';
      expect(uuidSchema.safeParse(uuid).success).toBe(true);
    });

    it('should reject invalid UUID', () => {
      expect(uuidSchema.safeParse('invalid-uuid').success).toBe(false);
    });
  });

  describe('slugSchema', () => {
    it('should validate correct slug', () => {
      expect(slugSchema.safeParse('my-slug-123').success).toBe(true);
    });

    it('should reject uppercase', () => {
      expect(slugSchema.safeParse('My-Slug').success).toBe(false);
    });

    it('should reject special chars', () => {
      expect(slugSchema.safeParse('slug!').success).toBe(false);
    });

    it('should enforce min/max length', () => {
      expect(slugSchema.safeParse('a').success).toBe(false);
      expect(slugSchema.safeParse('a'.repeat(51)).success).toBe(false);
    });
  });

  describe('projectKeySchema', () => {
    it('should validate correct key', () => {
      expect(projectKeySchema.safeParse('PROJ1').success).toBe(true);
    });

    it('should reject lowercase', () => {
      expect(projectKeySchema.safeParse('proj').success).toBe(false);
    });

    it('should enforce min/max length', () => {
      expect(projectKeySchema.safeParse('A').success).toBe(false);
      expect(projectKeySchema.safeParse('A'.repeat(11)).success).toBe(false);
    });
  });

  describe('paginationSchema', () => {
    it('should use defaults', () => {
      const result = paginationSchema.parse({});
      expect(result).toEqual({ page: 1, pageSize: 20 });
    });

    it('should validate inputs', () => {
      const result = paginationSchema.parse({ page: '2', pageSize: '50' });
      expect(result).toEqual({ page: 2, pageSize: 50 });
    });

    it('should enforce limits', () => {
      expect(paginationSchema.safeParse({ page: 0 }).success).toBe(false);
      expect(paginationSchema.safeParse({ pageSize: 101 }).success).toBe(false);
    });
  });

  describe('storyPointsSchema', () => {
    it('should accept Fibonacci numbers', () => {
      expect(storyPointsSchema.safeParse(1).success).toBe(true);
      expect(storyPointsSchema.safeParse(3).success).toBe(true);
      expect(storyPointsSchema.safeParse(8).success).toBe(true);
    });

    it('should reject non-Fibonacci numbers', () => {
      expect(storyPointsSchema.safeParse(4).success).toBe(false);
      expect(storyPointsSchema.safeParse(10).success).toBe(false);
    });

    it('should accept null', () => {
      expect(storyPointsSchema.safeParse(null).success).toBe(true);
    });
  });

  describe('createTaskSchema', () => {
    it('should validate valid task', () => {
      const input = {
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        featureId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'Valid Task',
        type: 'TASK',
        priority: 'MEDIUM',
        assigneeId: '123e4567-e89b-12d3-a456-426614174099',
      };
      expect(createTaskSchema.safeParse(input).success).toBe(true);
    });

    it('should reject task without assigneeId', () => {
      const input = {
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Task without assignee',
      };
      expect(createTaskSchema.safeParse(input).success).toBe(false);
    });

    it('should reject short title', () => {
      const input = {
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        featureId: '123e4567-e89b-12d3-a456-426614174001',
        title: 'No',
        assigneeId: '123e4567-e89b-12d3-a456-426614174099',
      };
      expect(createTaskSchema.safeParse(input).success).toBe(false);
    });

    it('should include status field and preserve custom values', () => {
      // CRITICAL: This test ensures status is passed through to the backend
      // When creating a task with status TODO, it should NOT default to BACKLOG
      const input = {
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Bug with custom status',
        type: 'BUG',
        priority: 'CRITICAL',
        status: 'TODO',
        assigneeId: '123e4567-e89b-12d3-a456-426614174099',
      };
      const result = createTaskSchema.safeParse(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('TODO');
        expect(result.data.type).toBe('BUG');
        expect(result.data.priority).toBe('CRITICAL');
      }
    });

    it('should use default BACKLOG when status not provided', () => {
      const input = {
        projectId: '123e4567-e89b-12d3-a456-426614174000',
        title: 'Task without explicit status',
        assigneeId: '123e4567-e89b-12d3-a456-426614174099',
      };
      const result = createTaskSchema.safeParse(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('BACKLOG');
      }
    });
  });

  describe('updateTaskSchema', () => {
    it('should accept partial updates without applying defaults', () => {
      // CRITICAL: This test ensures the Kanban drag-drop bug doesn't regress
      // When moving a task, we only send { status: 'TODO' }
      // The schema must NOT apply defaults for type/priority
      const input = { status: 'TODO' };
      const result = updateTaskSchema.safeParse(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toEqual({ status: 'TODO' });
        // Explicitly verify no defaults were applied
        expect(result.data.type).toBeUndefined();
        expect(result.data.priority).toBeUndefined();
      }
    });

    it('should preserve all fields when explicitly provided', () => {
      const input = {
        status: 'DOING',
        type: 'BUG',
        priority: 'CRITICAL',
        title: 'Fix critical issue',
      };
      const result = updateTaskSchema.safeParse(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.status).toBe('DOING');
        expect(result.data.type).toBe('BUG');
        expect(result.data.priority).toBe('CRITICAL');
        expect(result.data.title).toBe('Fix critical issue');
      }
    });

    it('should allow updating only status (Kanban use case)', () => {
      // Simulating what happens during Kanban drag-drop
      const bugTaskUpdate = { status: 'REVIEW' as const };
      const result = updateTaskSchema.safeParse(bugTaskUpdate);
      
      expect(result.success).toBe(true);
      if (result.success) {
        // Only status should be in the result, nothing else
        expect(Object.keys(result.data)).toEqual(['status']);
      }
    });

    it('should allow updating blocked status only', () => {
      const input = { blocked: true };
      const result = updateTaskSchema.safeParse(input);
      
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.blocked).toBe(true);
        expect(result.data.type).toBeUndefined();
        expect(result.data.priority).toBeUndefined();
      }
    });
  });

  describe('safeParse', () => {
    it('should return success object', () => {
      const result = safeParse(slugSchema, 'valid-slug');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('valid-slug');
      }
    });

    it('should return error object', () => {
      const result = safeParse(slugSchema, 'INVALID');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBeDefined();
      }
    });
  });
});
