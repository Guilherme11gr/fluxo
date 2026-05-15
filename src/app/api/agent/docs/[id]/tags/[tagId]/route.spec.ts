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

import { DELETE } from './route';

function asNextRequest(request: Request): NextRequest {
  return request as NextRequest;
}

describe('DELETE /api/agent/docs/[id]/tags/[tagId]', () => {
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

  it('removes a tag from the document and returns remaining tags', async () => {
    mockFindTagsByDocId
      .mockResolvedValueOnce([
        { id: '22222222-2222-4222-8222-222222222222', name: 'spec' },
        { id: '33333333-3333-4333-8333-333333333333', name: 'runbook' },
      ])
      .mockResolvedValueOnce([
        { id: '33333333-3333-4333-8333-333333333333', name: 'runbook' },
      ]);

    const response = await DELETE(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111/tags/22222222-2222-4222-8222-222222222222', {
        method: 'DELETE',
      })),
      {
        params: Promise.resolve({
          id: '11111111-1111-4111-8111-111111111111',
          tagId: '22222222-2222-4222-8222-222222222222',
        }),
      }
    );

    expect(response.status).toBe(200);
    expect(mockUpdateDoc).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'org-1',
      {
        tagIds: ['33333333-3333-4333-8333-333333333333'],
      }
    );

    const json = await response.json();
    expect(json.data).toEqual([
      { id: '33333333-3333-4333-8333-333333333333', name: 'runbook' },
    ]);
  });

  it('returns 404 when the tag is not assigned to the document', async () => {
    mockFindTagsByDocId.mockResolvedValueOnce([
      { id: '33333333-3333-4333-8333-333333333333', name: 'runbook' },
    ]);

    const response = await DELETE(
      asNextRequest(new Request('http://localhost/api/agent/docs/11111111-1111-4111-8111-111111111111/tags/22222222-2222-4222-8222-222222222222', {
        method: 'DELETE',
      })),
      {
        params: Promise.resolve({
          id: '11111111-1111-4111-8111-111111111111',
          tagId: '22222222-2222-4222-8222-222222222222',
        }),
      }
    );

    expect(response.status).toBe(404);
    expect(mockUpdateDoc).not.toHaveBeenCalled();
  });
});
