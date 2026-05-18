import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockFindByOrgId,
  mockExtractAuthenticatedTenant,
  mockCreateClient,
} = vi.hoisted(() => ({
  mockFindByOrgId: vi.fn(),
  mockExtractAuthenticatedTenant: vi.fn(),
  mockCreateClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: mockCreateClient,
}));

vi.mock('@/shared/http/auth.helpers', () => ({
  extractAuthenticatedTenant: mockExtractAuthenticatedTenant,
  requireRole: vi.fn(),
}));

vi.mock('@/infra/adapters/prisma', () => ({
  agentRepository: {
    findByOrgId: mockFindByOrgId,
    findByName: vi.fn(),
    create: vi.fn(),
  },
}));

import { GET } from './route';

describe('GET /api/agents', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateClient.mockResolvedValue({});
    mockExtractAuthenticatedTenant.mockResolvedValue({ tenantId: 'org-1', userId: 'user-1' });
    mockFindByOrgId.mockResolvedValue([]);
  });

  it('filters by projectId query param', async () => {
    const response = await GET(new Request('http://localhost/api/agents?projectId=11111111-1111-4111-8111-111111111111'));

    expect(response.status).toBe(200);
    expect(mockFindByOrgId).toHaveBeenCalledWith('org-1', '11111111-1111-4111-8111-111111111111');
  });
});
