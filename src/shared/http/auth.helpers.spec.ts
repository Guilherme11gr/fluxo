import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '@/shared/errors';

const {
  mockCookies,
  mockGetUser,
  mockHeaders,
  mockQueryRaw,
} = vi.hoisted(() => ({
  mockCookies: vi.fn(),
  mockGetUser: vi.fn(),
  mockHeaders: vi.fn(),
  mockQueryRaw: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: mockCookies,
  headers: mockHeaders,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
  },
}));

import { membershipCache } from '@/shared/cache/membership-cache';
import { extractAuthenticatedTenant, requireRole } from './auth.helpers';

describe('Auth Helpers', () => {
  const mockSupabase = {
    auth: { getUser: mockGetUser },
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    membershipCache.clear();
    mockHeaders.mockResolvedValue({ get: () => null });
    mockCookies.mockResolvedValue({ get: () => undefined });
  });

  describe('extractAuthenticatedTenant', () => {
    it('should return userId and tenantId when authenticated and has membership', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      mockQueryRaw.mockResolvedValue([
        {
          orgId: 'org-456',
          role: 'ADMIN',
          isDefault: true,
          orgName: 'Main Org',
          orgSlug: 'main-org',
        },
      ]);

      const result = await extractAuthenticatedTenant(mockSupabase);

      expect(result.userId).toBe('user-123');
      expect(result.tenantId).toBe('org-456');
      expect(result.memberships).toEqual([
        {
          orgId: 'org-456',
          role: 'ADMIN',
          isDefault: true,
          orgName: 'Main Org',
          orgSlug: 'main-org',
        },
      ]);
      expect(mockQueryRaw).toHaveBeenCalled();
    });

    it('should throw UnauthorizedError when getUser fails', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: { message: 'Auth error' } });

      await expect(extractAuthenticatedTenant(mockSupabase))
        .rejects.toThrow(UnauthorizedError);
    });

    it('should throw UnauthorizedError when user is null', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null }, error: null });

      await expect(extractAuthenticatedTenant(mockSupabase))
        .rejects.toThrow(UnauthorizedError);
    });

    it('should throw ForbiddenError when user has no memberships', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'user-123' } }, error: null });
      mockQueryRaw.mockResolvedValue([]);

      await expect(extractAuthenticatedTenant(mockSupabase))
        .rejects.toThrow(ForbiddenError);
    });
  });

  describe('requireRole', () => {
    it('should resolve when user has allowed role', async () => {
      mockQueryRaw.mockResolvedValue([{ role: 'ADMIN' }]);

      await expect(requireRole(mockSupabase, 'user-123', ['ADMIN', 'OWNER'], 'org-456'))
        .resolves.not.toThrow();

      expect(mockQueryRaw).toHaveBeenCalled();
    });

    it('should throw ForbiddenError when user does not have allowed role', async () => {
      mockQueryRaw.mockResolvedValue([{ role: 'MEMBER' }]);

      await expect(requireRole(mockSupabase, 'user-123', ['ADMIN', 'OWNER'], 'org-456'))
        .rejects.toThrow(ForbiddenError);
    });

    it('should throw ForbiddenError when membership is not found', async () => {
      mockQueryRaw.mockResolvedValue([]);

      await expect(requireRole(mockSupabase, 'user-123', ['ADMIN'], 'org-456'))
        .rejects.toThrow(ForbiddenError);
    });
  });
});
