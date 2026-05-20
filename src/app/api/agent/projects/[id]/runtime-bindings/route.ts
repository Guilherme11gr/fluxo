/**
 * Agent API - Project Runtime Bindings
 *
 * GET   /api/agent/projects/[id]/runtime-bindings
 * PATCH /api/agent/projects/[id]/runtime-bindings
 */

import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentError, agentList, agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import {
  auditLogRepository,
  projectRepository,
  projectRuntimeBindingRepository,
} from '@/infra/adapters/prisma';
import type {
  ProjectRuntimeBindingRecord,
  UpdateProjectRuntimeBindingInput,
} from '@/infra/adapters/prisma/project-runtime-binding.repository';

export const dynamic = 'force-dynamic';

const paramsSchema = z.object({
  id: z.string().uuid(),
});

const listQuerySchema = z.object({
  runnerProfile: z.string().min(1).max(100).optional(),
  hostOs: z.string().min(1).max(20).optional(),
});

const patchSchema = z.object({
  runnerProfile: z.string().min(1).max(100),
  hostOs: z.string().min(1).max(20),
  defaultBaseBranch: z.string().min(1).max(100).optional(),
  allowedBranchPrefix: z.string().max(100).nullable().optional(),
  executionMode: z.enum(['shared_project', 'branch_per_task', 'local']).optional(),
  gitProvider: z.enum(['github']).nullable().optional(),
  prPolicy: z.enum(['disabled', 'draft', 'ready']).optional(),
  gitPolicy: z.enum(['no_write', 'branch_only', 'branch_commit_pr']).optional(),
  reason: z.string().min(3).max(500),
}).refine((data) => {
  return [
    'defaultBaseBranch',
    'allowedBranchPrefix',
    'executionMode',
    'gitProvider',
    'prPolicy',
    'gitPolicy',
  ].some((key) => Object.prototype.hasOwnProperty.call(data, key));
}, {
  message: 'At least one runtime binding field must be provided',
});

function normalizeNullableString(value: string | null | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function policySnapshot(binding: ProjectRuntimeBindingRecord) {
  return {
    runnerProfile: binding.runnerProfile,
    hostOs: binding.hostOs,
    defaultBaseBranch: binding.defaultBaseBranch,
    allowedBranchPrefix: binding.allowedBranchPrefix,
    executionMode: binding.executionMode,
    gitProvider: binding.gitProvider,
    prPolicy: binding.prPolicy,
    gitPolicy: binding.gitPolicy,
  };
}

async function assertProjectExists(projectId: string, orgId: string) {
  const project = await projectRepository.findById(projectId, orgId);
  if (!project) {
    return agentError('NOT_FOUND', 'Project not found', 404);
  }
  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await extractAgentAuth();
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return agentError('VALIDATION_ERROR', 'Invalid project id', 400);
    }

    const projectError = await assertProjectExists(parsedParams.data.id, auth.orgId);
    if (projectError) {
      return projectError;
    }

    const { searchParams } = new URL(request.url);
    const query = listQuerySchema.safeParse({
      runnerProfile: searchParams.get('runnerProfile') ?? undefined,
      hostOs: searchParams.get('hostOs') ?? undefined,
    });
    if (!query.success) {
      return agentError('VALIDATION_ERROR', 'Invalid query parameters', 400);
    }

    const bindings = await projectRuntimeBindingRepository.findByProject(
      parsedParams.data.id,
      auth.orgId,
    );
    const filtered = bindings.filter((binding) => {
      if (query.data.runnerProfile && binding.runnerProfile !== query.data.runnerProfile) {
        return false;
      }
      if (query.data.hostOs && binding.hostOs !== query.data.hostOs) {
        return false;
      }
      return true;
    });

    return agentList(filtered, filtered.length);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await extractAgentAuth();
    const parsedParams = paramsSchema.safeParse(await params);
    if (!parsedParams.success) {
      return agentError('VALIDATION_ERROR', 'Invalid project id', 400);
    }

    const projectError = await assertProjectExists(parsedParams.data.id, auth.orgId);
    if (projectError) {
      return projectError;
    }

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const binding = await projectRuntimeBindingRepository.findBySelector({
      orgId: auth.orgId,
      projectId: parsedParams.data.id,
      runnerProfile: parsed.data.runnerProfile,
      hostOs: parsed.data.hostOs,
    });
    if (!binding) {
      return agentError('NOT_FOUND', 'Runtime binding not found', 404);
    }

    const updateData: UpdateProjectRuntimeBindingInput = {
      defaultBaseBranch: parsed.data.defaultBaseBranch?.trim(),
      allowedBranchPrefix: normalizeNullableString(parsed.data.allowedBranchPrefix),
      executionMode: parsed.data.executionMode,
      gitProvider: parsed.data.gitProvider,
      prPolicy: parsed.data.prPolicy,
      gitPolicy: parsed.data.gitPolicy,
    };

    const updated = await projectRuntimeBindingRepository.update(binding.id, updateData);
    const changedFields = Object.entries(updateData)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);

    await auditLogRepository.log({
      orgId: auth.orgId,
      userId: auth.userId,
      action: 'project.runtime_binding.updated',
      targetType: 'project_runtime_binding',
      targetId: binding.id,
      actorType: 'agent',
      clientId: auth.keyId,
      metadata: {
        source: 'agent',
        agentName: auth.agentName,
        keyPrefix: auth.keyPrefix,
        authMethod: auth.authMethod,
        projectId: parsedParams.data.id,
        reason: parsed.data.reason,
        changedFields,
        previous: policySnapshot(binding),
        next: policySnapshot(updated),
      },
    }).catch(() => {});

    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}
