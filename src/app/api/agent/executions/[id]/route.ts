/**
 * Agent API - Single Execution
 *
 * PATCH /api/agent/executions/[id] - Update execution status/results
 * GET  /api/agent/executions/[id] - Get execution detail
 */

import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import { agentExecutionRepository } from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

const updateSchema = z.object({
  status: z.enum(['CLAIMED', 'RUNNING', 'SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED']).optional(),
  output: z.string().optional(),
  resultSummary: z.string().optional(),
  errorMessage: z.string().optional(),
  exitCode: z.number().int().optional(),
  duration: z.number().int().positive().optional(),
  finishedAt: z.string().datetime().optional(),
  lastHeartbeatAt: z.string().datetime().optional(),
  workspaceMode: z.string().max(50).optional(),
  workspaceRef: z.string().nullable().optional(),
  workspacePath: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;

    const execution = await agentExecutionRepository.findById(id);
    if (!execution || execution.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Execution not found', 404);
    }

    return agentSuccess(execution);
  } catch (error) {
    return handleAgentError(error);
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await extractAgentAuth();
    const { id } = await params;

    const execution = await agentExecutionRepository.findById(id);
    if (!execution || execution.orgId !== auth.orgId) {
      return agentError('NOT_FOUND', 'Execution not found', 404);
    }

    const body = await request.json();
    const data = updateSchema.parse(body);

    const updated = await agentExecutionRepository.updateStatus(id, {
      status: data.status || execution.status,
      output: data.output,
      resultSummary: data.resultSummary,
      errorMessage: data.errorMessage,
      exitCode: data.exitCode,
      duration: data.duration,
      lastHeartbeatAt: data.lastHeartbeatAt ? new Date(data.lastHeartbeatAt) : undefined,
      finishedAt: data.finishedAt ? new Date(data.finishedAt) : (data.status === 'SUCCESS' || data.status === 'FAILED' || data.status === 'TIMEOUT' || data.status === 'CANCELLED' ? new Date() : undefined),
      workspaceMode: data.workspaceMode,
      workspaceRef: data.workspaceRef,
      workspacePath: data.workspacePath,
      metadata: data.metadata,
    });

    return agentSuccess(updated);
  } catch (error) {
    return handleAgentError(error);
  }
}
