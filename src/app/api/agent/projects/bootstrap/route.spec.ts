/**
 * Agent API - Project Bootstrap Route Tests
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

const {
  mockExtractAgentAuth,
  mockProjectFindById,
  mockFeatureCreate,
  mockTaskFindMany,
  mockTaskCreate,
  mockCommentCreate,
  mockAuditLog,
  mockDocCreate,
  mockEpicFindById,
} = vi.hoisted(() => ({
  mockExtractAgentAuth: vi.fn(),
  mockProjectFindById: vi.fn(),
  mockFeatureCreate: vi.fn(),
  mockTaskFindMany: vi.fn(),
  mockTaskCreate: vi.fn(),
  mockCommentCreate: vi.fn(),
  mockAuditLog: vi.fn(),
  mockDocCreate: vi.fn(),
  mockEpicFindById: vi.fn(),
}));

vi.mock('@/shared/http/agent-auth', () => ({
  extractAgentAuth: mockExtractAgentAuth,
}));

vi.mock('@/infra/adapters/prisma', () => ({
  projectRepository: {
    findById: mockProjectFindById,
  },
  featureRepository: {
    create: mockFeatureCreate,
  },
  taskRepository: {
    findMany: mockTaskFindMany,
    create: mockTaskCreate,
  },
  commentRepository: {
    create: mockCommentCreate,
  },
  auditLogRepository: {
    log: mockAuditLog,
  },
  projectDocRepository: {
    create: mockDocCreate,
  },
  epicRepository: {
    findById: mockEpicFindById,
  },
}));

import { POST } from './route';

function asNextRequest(request: Request): NextRequest {
  return request as NextRequest;
}

const mockAuth = {
  orgId: 'org-1',
  userId: 'user-1',
  agentName: 'test-agent',
  keyPrefix: 'agk_',
  authMethod: 'api_key',
  keyId: 'key-1',
};

const validPayload = {
  projectId: '550e8400-e29b-41d4-a716-446655440000',
  epicId: '660e8400-e29b-41d4-a716-446655440000',
  manifest: {
    projectName: 'test-project',
    description: 'A test project',
    stack: ['typescript', 'nextjs'],
    primaryLanguage: 'typescript',
    readmeContent: '# Test Project\n\nThis is a test.',
    candidateDocs: [
      {
        path: 'README.md',
        title: 'README',
        content: '# Test Project\n\nThis is a test.',
        wordCount: 8,
        safe: true,
      },
    ],
    suggestedTags: ['backend', 'api'],
    suggestedSkills: ['supabase-postgres-best-practices'],
  },
  localConfig: {
    repoPath: '/home/user/projects/test-project',
    gitCommonDir: '/home/user/projects/test-project/.git',
    openCodeConfigured: true,
    claudeCodeConfigured: false,
    cliVersion: '1.0.0',
  },
  consent: {
    uploadDocs: true,
    createTags: true,
    createOnboardingTask: true,
  },
  idempotencyKey: 'bootstrap-test-001',
};

describe('POST /api/agent/projects/bootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockExtractAgentAuth.mockResolvedValue(mockAuth);
    mockProjectFindById.mockResolvedValue({ id: validPayload.projectId });
    mockEpicFindById.mockResolvedValue({ id: validPayload.epicId });
    mockFeatureCreate.mockResolvedValue({ id: 'feature-id', title: 'Bootstrap: test-project' });
    mockTaskCreate.mockResolvedValue({ id: 'task-id', localId: 1, featureId: 'feature-id' });
    mockTaskFindMany.mockResolvedValue([]);
    mockCommentCreate.mockResolvedValue({ id: 'comment-id' });
    mockDocCreate.mockResolvedValue({ id: 'doc-id' });
    mockAuditLog.mockResolvedValue(undefined);
  });

  it('should reject invalid payload', async () => {
    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ invalid: 'payload' }),
      }))
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('should reject missing projectId', async () => {
    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify({ ...validPayload, projectId: null }),
      }))
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.message).toContain('projectId is required');
  });

  it('should reject non-existent project', async () => {
    mockProjectFindById.mockResolvedValue(null);

    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      }))
    );

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.error.code).toBe('NOT_FOUND');
  });

  it('should return idempotent response for duplicate bootstrap', async () => {
    mockTaskFindMany.mockResolvedValue([{ id: 'existing-task-id', featureId: 'existing-feature-id' }]);

    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      }))
    );

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.data.idempotent).toBe(true);
    expect(json.data.onboardingTaskId).toBe('existing-task-id');
  });

  it('should create bootstrap feature, task, and docs', async () => {
    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify(validPayload),
      }))
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.mode).toBe('existing');
    expect(json.data.projectId).toBe(validPayload.projectId);
    expect(json.data.featureId).toBe('feature-id');
    expect(json.data.onboardingTaskId).toBe('task-id');
    expect(json.data.docsPublished).toBe(1);
    expect(json.data.auditCommentId).toBe('comment-id');
    expect(json.data.idempotent).toBe(false);

    expect(mockTaskCreate).toHaveBeenCalledWith(expect.objectContaining({
      title: expect.stringContaining(`[bootstrap:${validPayload.idempotencyKey}]`),
    }));
  });

  it('should skip doc upload when consent.uploadDocs is false', async () => {
    const payload = { ...validPayload, consent: { ...validPayload.consent, uploadDocs: false } };

    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify(payload),
      }))
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.docsPublished).toBe(0);
    expect(mockDocCreate).not.toHaveBeenCalled();
  });

  it('should skip onboarding task when consent.createOnboardingTask is false', async () => {
    const payload = { ...validPayload, consent: { ...validPayload.consent, createOnboardingTask: false } };

    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify(payload),
      }))
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.onboardingTaskId).toBeNull();
    expect(mockTaskCreate).not.toHaveBeenCalled();
  });

  it('should reject createOnboardingTask without epicId', async () => {
    const payload = { ...validPayload, epicId: null };

    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify(payload),
      }))
    );

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error.message).toContain('epicId is required');
  });

  it('should skip unsafe docs', async () => {
    const payload = {
      ...validPayload,
      manifest: {
        ...validPayload.manifest,
        candidateDocs: [
          { ...validPayload.manifest.candidateDocs[0], safe: false },
          {
            path: 'docs/README.md',
            title: 'Docs README',
            content: '# Docs',
            wordCount: 2,
            safe: true,
          },
        ],
      },
    };

    const response = await POST(
      asNextRequest(new Request('http://localhost/api/agent/projects/bootstrap', {
        method: 'POST',
        body: JSON.stringify(payload),
      }))
    );

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.data.docsPublished).toBe(1);
    expect(mockDocCreate).toHaveBeenCalledTimes(1);
  });
});
