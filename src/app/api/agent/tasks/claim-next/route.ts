import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, handleAgentError } from '@/shared/http/agent-responses';
import { claimNextTask } from '@/domain/use-cases/tasks/claim-next-task';

export const dynamic = 'force-dynamic';

const claimSchema = z.object({
  agentId: z.string().uuid(),
  runnerInstanceId: z.string().uuid(),
  pickStatus: z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']).default('TODO'),
  claimStatus: z.enum(['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE']).default('DOING'),
  projectId: z.string().uuid().optional(),
  candidateLimit: z.number().int().min(1).max(50).optional(),
  leaseMs: z.number().int().positive().optional(),
  tool: z.string().max(50).optional(),
  model: z.string().max(100).optional(),
  workspaceMode: z.string().max(50).optional(),
  workspaceRef: z.string().nullable().optional(),
  workspacePath: z.string().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export async function POST(request: Request) {
  try {
    const auth = await extractAgentAuth();
    const body = await request.json();
    const data = claimSchema.parse(body);

    const claimed = await claimNextTask({
      orgId: auth.orgId,
      userId: auth.userId,
      agentName: auth.agentName,
      keyId: auth.keyId,
      agentId: data.agentId,
      runnerInstanceId: data.runnerInstanceId,
      pickStatus: data.pickStatus,
      claimStatus: data.claimStatus,
      projectId: data.projectId,
      candidateLimit: data.candidateLimit,
      leaseMs: data.leaseMs,
      tool: data.tool,
      model: data.model,
      workspaceMode: data.workspaceMode,
      workspaceRef: data.workspaceRef,
      workspacePath: data.workspacePath,
      metadata: data.metadata,
    });

    return agentSuccess(claimed);
  } catch (error) {
    return handleAgentError(error);
  }
}
