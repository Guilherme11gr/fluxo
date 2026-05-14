/**
 * Agent API - Executions
 *
 * GET  /api/agent/executions - List executions for org with filters
 * POST /api/agent/executions - Create a new execution (CLAIMED)
 */

import { AgentExecStatus } from '@prisma/client';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentList, agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { agentExecutionRepository, agentRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  agentId: z.string().optional(),
  runnerInstanceId: z.string().uuid().optional(),
  taskId: z.string().min(1),
  projectId: z.string().min(1),
  tool: z.string().max(50).optional(),
  model: z.string().max(100).optional(),
  workspaceMode: z.string().max(50).optional(),
  workspaceRef: z.string().optional(),
  workspacePath: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  startedAt: z.string().datetime().optional(),
});

const listSchema = z.object({
  status: z.enum(['CLAIMED', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED']).optional(),
  agentId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  limit: z.coerce.number().min(1).max(100).default(20),
  page: z.coerce.number().min(1).default(1),
});

export async function GET(request: Request) {
  try {
    const auth = await extractAgentAuth();
    const { searchParams } = new URL(request.url);
    const query = listSchema.parse({
      status: searchParams.get('status') || undefined,
      agentId: searchParams.get('agentId') || undefined,
      projectId: searchParams.get('projectId') || undefined,
      limit: searchParams.get('limit') || 20,
      page: searchParams.get('page') || 1,
    });

    const result = await agentExecutionRepository.findByOrgId(
      auth.orgId,
      {
        status: query.status as AgentExecStatus | undefined,
        agentId: query.agentId,
        projectId: query.projectId,
      },
      query.page,
      query.limit
    );

    return agentList(result.items, result.total);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await extractAgentAuth();
    const body = await request.json();
    const data = createSchema.parse(body);

    const agentId = data.agentId;
    if (!agentId) {
      return agentError('VALIDATION_ERROR', 'agentId is required', 400);
    }

    const agent = await agentRepository.findById(agentId);
    if (!agent || agent.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Agent not found', 404);
    }

    const execution = await agentExecutionRepository.create({
      orgId: auth.orgId,
      agentId,
      runnerInstanceId: data.runnerInstanceId,
      taskId: data.taskId,
      projectId: data.projectId,
      tool: data.tool,
      model: data.model,
      workspaceMode: data.workspaceMode,
      workspaceRef: data.workspaceRef,
      workspacePath: data.workspacePath,
      metadata: data.metadata,
      startedAt: data.startedAt ? new Date(data.startedAt) : new Date(),
    });

    return agentSuccess(execution, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}
