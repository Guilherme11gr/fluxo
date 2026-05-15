import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  mockExtractAgentAuth,
  mockFindDocById,
  mockUpdateDoc,
  mockFindTagsByDocId,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindDocById: vi.fn(),
  mockUpdateDoc: vi.fn(),
  mockFindTagsByDocId: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  projectDocRepository: {
    findById: mockFindDocById,
    update: mockUpdateDoc,
  },
  docTagRepository: {
    findTagsByDocId: mockFindTagsByDocId,
  },
  auditLogRepository: {
    log: mockAuditLog,
  },
}));

import { GET, POST, PUT } from './route';

function asNextRequest(request: Request): NextRequest {
  return request as NextRequest;
}

describe('Agent doc tags route', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
      userId: 'user-1',
      agentName: 'builder',
      keyPrefix: 'agk_xxx',
      authMethod: 'tenant_api_key',
      keyId: 'key-1',
    });

    mockFindDocById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      projectId: 'project-1',
      title: 'Doc',
      content: 'Body',
      createdAt: new Date('2026-05-15T00:00:00Z'),
      updatedAt: new Date('2026-05-15T00:00:00Z'),
    });

    mockUpdateDoc.mockResolvedValue({ id: '11111111-1111-4111-8111-111111111111' });
    mockAuditLog.mockResolvedValue(undefined);
  });

  it('returns tags for a document', async () => {
    mockFindTagsByDocId.mockResolvedValueOnce([
      { id: '22222222-2222-4222-8222-222222222222', name: 'spec' },
    ]);

    const response = await GET(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111/tags')),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    );

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.data).toEqual([
      { id: '22222222-2222-4222-8222-222222222222', name: 'spec' },
    ]);
  });

  it('appends tags without duplicating existing ones', async () => {
    mockFindTagsByDocId
      .mockResolvedValueOnce([
        { id: '22222222-2222-4222-8222-222222222222', name: 'spec' },
      ])
      .mockResolvedValueOnce([
        { id: '22222222-2222-4222-8222-222222222222', name: 'spec' },
        { id: '33333333-3333-4333-8333-333333333333', name: 'business-rule' },
      ]);

    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tagIds: [
            '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333',
          ],
        }),
      })),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'org-1',
      {
        tagIds: [
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ],
      }
    );

    const json = await response.json();
    expect(json.data).toHaveLength(2);
  });

  it('replaces tags when using PUT', async () => {
    mockFindTagsByDocId.mockResolvedValueOnce([]);

    const response = await PUT(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111/tags', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tagIds: [] }),
      })),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'org-1',
      { tagIds: [] }
    );
  });

  it('returns 404 when the doc does not exist', async () => {
    mockFindDocById.mockResolvedValueOnce(null);

    const response = await GET(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111/tags')),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    );

    expect(response.status).toBe(404);
  });
});
