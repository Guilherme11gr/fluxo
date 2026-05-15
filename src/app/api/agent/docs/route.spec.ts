import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  mockExtractAgentAuth,
  mockFindByProjectId,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockFindByProjectId: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  projectDocRepository: {
    findByProjectId: mockFindByProjectId,
  },
  projectRepository: {},
  auditLogRepository: {},
  docChunksRepository: {},
}));

import { GET } from './route';

function asNextRequest(request: Request): NextRequest {
  return request as NextRequest;
}

describe('GET /api/agent/docs', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue({
      orgId: 'org-1',
    });
  });

  it('filters docs by tagId when provided', async () => {
    mockFindByProjectId.mockResolvedValue([
      {
        id: 'doc-1',
        projectId: 'project-1',
        title: 'Spec',
        createdAt: new Date('2026-05-15T00:00:00Z'),
        updatedAt: new Date('2026-05-15T00:00:00Z'),
        tags: [{ tag: { id: '11111111-1111-4111-8111-111111111111', name: 'spec' } }],
      },
      {
        id: 'doc-2',
        projectId: 'project-1',
        title: 'Runbook',
        createdAt: new Date('2026-05-15T00:00:00Z'),
        updatedAt: new Date('2026-05-15T00:00:00Z'),
        tags: [{ tag: { id: '22222222-2222-4222-8222-222222222222', name: 'runbook' } }],
      },
    ]);

    const response = await GET(
      asNextRequest(new Request('http://localhost/api/agent/docs?projectId=33333333-3333-4333-8333-333333333333&tagId=11111111-1111-4111-8111-111111111111'))
    );

    expect(response.status).toBe(200);

    const json = await response.json();
    expect(json.meta.total).toBe(1);
    expect(json.data).toHaveLength(1);
    expect(json.data[0].id).toBe('doc-1');
  });

  it('returns zod validation message for invalid tagId', async () => {
    const response = await GET(
      asNextRequest(new Request('http://localhost/api/agent/docs?projectId=33333333-3333-4333-8333-333333333333&tagId=invalid'))
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
    expect(json.error.message).toBe('Invalid UUID');
  });
});
