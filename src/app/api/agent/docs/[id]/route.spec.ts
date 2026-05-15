import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  mockExtractAgentAuth,
  mockFindById,
  mockFindByIdWithTags,
  mockUpdate,
  mockDelete,
  mockIndexDoc,
  mockAuditLog,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindById: vi.fn(),
  mockFindByIdWithTags: vi.fn(),
  mockUpdate: vi.fn(),
  mockDelete: vi.fn(),
  mockIndexDoc: vi.fn(),
  mockAuditLog: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  projectDocRepository: {
    findById: mockFindById,
    findByIdWithTags: mockFindByIdWithTags,
    update: mockUpdate,
    delete: mockDelete,
  },
  auditLogRepository: {
    log: mockAuditLog,
  },
  docChunksRepository: {
    indexDoc: mockIndexDoc,
  },
}));

import { DELETE, GET, PATCH } from './route';

function asNextRequest(request: Request): NextRequest {
  return request as NextRequest;
}

describe('Agent doc by id route', () => {
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

    mockFindById.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      projectId: 'project-1',
      title: 'Doc',
      content: 'Body',
      createdAt: new Date('2026-05-15T00:00:00Z'),
      updatedAt: new Date('2026-05-15T00:00:00Z'),
    });

    mockFindByIdWithTags.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      projectId: 'project-1',
      title: 'Doc',
      content: 'Body',
      tags: [{ tag: { id: '22222222-2222-4222-8222-222222222222', name: 'spec' } }],
    });

    mockUpdate.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Updated Doc',
    });

    mockDelete.mockResolvedValue(undefined);
    mockIndexDoc.mockResolvedValue(undefined);
    mockAuditLog.mockResolvedValue(undefined);
  });

  it('returns a doc with tags', async () => {
    const response = await GET(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111')),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.tags).toHaveLength(1);
  });

  it('updates a doc and reindexes when content changes', async () => {
    const response = await PATCH(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: 'Updated body',
          tagIds: [
            '22222222-2222-4222-8222-222222222222',
            '33333333-3333-4333-8333-333333333333',
          ],
        }),
      })),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    );

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'org-1',
      {
        content: 'Updated body',
        tagIds: [
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
        ],
      }
    );
    expect(mockIndexDoc).toHaveBeenCalled();
  });

  it('deletes a doc', async () => {
    const response = await DELETE(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111', {
        method: 'DELETE',
      })),
      { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) }
    );

    expect(response.status).toBe(200);
    expect(mockDelete).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111', 'org-1');
  });
});
