import { describe, it, expect } from 'vitest';
import { 
  jsonSuccess, 
  jsonList, 
  jsonError, 
  jsonNotFound, 
  jsonUnauthorized, 
  jsonForbidden, 
  jsonValidationError 
} from './responses';

describe('Response Helpers', () => {
  describe('jsonSuccess', () => {
    it('should return success response with default options', async () => {
      const data = { foo: 'bar' };
      const response = jsonSuccess(data);
      
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json).toEqual({ data });
      expect(response.headers.get('Cache-Control')).toBe('no-store, no-cache, must-revalidate');
    });

    it('should return success response with custom status and cache', async () => {
      const data = { foo: 'bar' };
      const response = jsonSuccess(data, { status: 201, cache: 'short' });
      
      expect(response.status).toBe(201);
      expect(response.headers.get('Cache-Control')).toBe('public, max-age=60, stale-while-revalidate=30');
    });

    it('should return success response with private cache', async () => {
      const data = { foo: 'bar' };
      const response = jsonSuccess(data, { private: true });
      
      expect(response.headers.get('Cache-Control')).toBe('private, max-age=0, must-revalidate');
    });
  });

  describe('jsonList', () => {
    it('should return list response', async () => {
      const items = [{ id: 1 }, { id: 2 }];
      const response = jsonList(items, 10, 1, 2);
      
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.data).toEqual({
        items,
        total: 10,
        page: 1,
        pageSize: 2,
        hasMore: true,
      });
    });

    it('should calculate hasMore correctly', async () => {
      const items = [{ id: 1 }];
      const response = jsonList(items, 1, 1, 10);
      
      const json = await response.json();
      expect(json.data.hasMore).toBe(false);
    });
  });

  describe('jsonError', () => {
    it('should return error response', async () => {
      const response = jsonError('ERR_CODE', 'Error message', 418, { detail: 'info' });
      
      expect(response.status).toBe(418);
      const json = await response.json();
      expect(json).toEqual({
        error: {
          code: 'ERR_CODE',
          message: 'Error message',
          details: { detail: 'info' },
        },
      });
    });
  });

  describe('Standard Errors', () => {
    it('jsonNotFound should return 404', async () => {
      const response = jsonNotFound('User');
      expect(response.status).toBe(404);
      const json = await response.json();
      expect(json.error.code).toBe('NOT_FOUND');
      expect(json.error.message).toContain('User');
    });

    it('jsonUnauthorized should return 401', async () => {
      const response = jsonUnauthorized();
      expect(response.status).toBe(401);
      const json = await response.json();
      expect(json.error.code).toBe('UNAUTHORIZED');
    });

    it('jsonForbidden should return 403', async () => {
      const response = jsonForbidden();
      expect(response.status).toBe(403);
      const json = await response.json();
      expect(json.error.code).toBe('FORBIDDEN');
    });

    it('jsonValidationError should return 400 with details', async () => {
      const details = { field: ['Required'] };
      const response = jsonValidationError(details);
      
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.error.code).toBe('VALIDATION_ERROR');
      expect(json.error.details).toEqual(details);
    });
  });
});
