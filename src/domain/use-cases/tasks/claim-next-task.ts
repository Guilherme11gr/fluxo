import { Prisma } from '@prisma/client';
import { prisma, agentRepository, runnerInstanceRepository, auditLogRepository } from '@/infra/adapters/prisma';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';

const DEFAULT_LEASE_MS = 90 * 1000;
const DEFAULT_CANDIDATE_LIMIT = 10;

export interface ClaimNextTaskInput {
  orgId: string;
  userId: string;
  agentName: string;
  keyId?: string;
  agentId: string;
  runnerInstanceId: string;
  pickStatus: 'BACKLOG' | 'TODO' | 'DOING' | 'REVIEW' | 'QA_READY' | 'DONE';
  claimStatus: 'BACKLOG' | 'TODO' | 'DOING' | 'REVIEW' | 'QA_READY' | 'DONE';
  projectId?: string;
  candidateLimit?: number;
  leaseMs?: number;
  tool?: string;
  model?: string;
  workspaceMode?: string;
  workspaceRef?: string | null;
  workspacePath?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ClaimedTaskResult {
  task: {
    id: string;
    orgId: string;
    projectId: string;
    featureId: string;
    localId: number;
    title: string;
    description: string | null;
    status: string;
    type: string;
    priority: string;
    assigneeAgentId: string | null;
    blocked: boolean;
    createdAt: Date;
    updatedAt: Date;
  };
  execution: {
    id: string;
    orgId: string;
    taskId: string;
    projectId: string;
    agentId: string;
    runnerInstanceId: string | null;
    status: string;
    tool: string | null;
    model: string | null;
    metadata: Record<string, unknown>;
    startedAt: Date;
  };
  lease: {
    id: string;
    projectId: string;
    executionId: string | null;
    expiresAt: Date;
  };
}

type CandidateRow = {
  id: string;
  orgId: string;
  projectId: string;
  featureId: string;
  localId: number;
  title: string;
  description: string | null;
  status: string;
  type: string;
  priority: string;
  assigneeAgentId: string | null;
  blocked: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type LockedTaskRow = CandidateRow;

export async function claimNextTask(input: ClaimNextTaskInput): Promise<ClaimedTaskResult | null> {
  const agent = await agentRepository.findById(input.agentId);
  if (!agent || agent.orgId !== input.orgId) {
    throw new NotFoundError('Agent', input.agentId);
  }

  const runner = await runnerInstanceRepository.findById(input.runnerInstanceId);
  if (!runner || runner.orgId !== input.orgId) {
    throw new NotFoundError('RunnerInstance', input.runnerInstanceId);
  }

  if (agent.projectId && input.projectId && agent.projectId !== input.projectId) {
    throw new ValidationError('Agent não pertence ao projeto solicitado');
  }

  const effectiveProjectId = input.projectId ?? agent.projectId ?? undefined;
  const candidateLimit = Math.min(Math.max(input.candidateLimit ?? DEFAULT_CANDIDATE_LIMIT, 1), 50);
  const leaseMs = Math.min(Math.max(input.leaseMs ?? DEFAULT_LEASE_MS, 15_000), 15 * 60 * 1000);

  const candidates = await prisma.task.findMany({
    where: {
      orgId: input.orgId,
      status: input.pickStatus,
      assigneeAgentId: input.agentId,
      blocked: false,
      ...(effectiveProjectId ? { projectId: effectiveProjectId } : {}),
      feature: {
        status: { in: ['TODO', 'DOING'] },
        epic: { status: { not: 'CLOSED' } },
      },
    },
    select: {
      id: true,
      orgId: true,
      projectId: true,
      featureId: true,
      localId: true,
      title: true,
      description: true,
      status: true,
      type: true,
      priority: true,
      assigneeAgentId: true,
      blocked: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: [
      { createdAt: 'asc' },
      { id: 'asc' },
    ],
    take: candidateLimit,
  });

  for (const candidate of candidates as CandidateRow[]) {
    const claimed = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        DELETE FROM public.execution_leases
        WHERE org_id = ${input.orgId}::uuid
          AND project_id = ${candidate.projectId}::uuid
          AND expires_at <= now()
      `;

      const lockedTask = await tx.$queryRaw<LockedTaskRow[]>`
        SELECT
          t.id,
          t.org_id AS "orgId",
          t.project_id AS "projectId",
          t.feature_id AS "featureId",
          t.local_id AS "localId",
          t.title,
          t.description,
          t.status,
          t.type,
          t.priority,
          t.assignee_agent_id AS "assigneeAgentId",
          t.blocked,
          t.created_at AS "createdAt",
          t.updated_at AS "updatedAt"
        FROM public.tasks t
        INNER JOIN public.features f ON f.id = t.feature_id
        INNER JOIN public.epics e ON e.id = f.epic_id
        WHERE t.id = ${candidate.id}::uuid
          AND t.org_id = ${input.orgId}::uuid
          AND t.status = ${input.pickStatus}::public.task_status
          AND t.assignee_agent_id = ${input.agentId}::uuid
          AND t.blocked = false
          AND f.status IN ('TODO', 'DOING')
          AND e.status <> 'CLOSED'
        FOR UPDATE SKIP LOCKED
      `;

      if (lockedTask.length === 0) {
        return null;
      }

      const leaseRows = await tx.$queryRaw<Array<{ id: string; projectId: string; executionId: string | null; expiresAt: Date }>>`
        INSERT INTO public.execution_leases (
          org_id,
          project_id,
          runner_instance_id,
          expires_at
        )
        VALUES (
          ${input.orgId}::uuid,
          ${candidate.projectId}::uuid,
          ${input.runnerInstanceId}::uuid,
          ${new Date(Date.now() + leaseMs)}::timestamptz
        )
        ON CONFLICT (org_id, project_id) DO NOTHING
        RETURNING id, project_id AS "projectId", execution_id AS "executionId", expires_at AS "expiresAt"
      `;

      if (leaseRows.length === 0) {
        return null;
      }

      const execution = await tx.agentExecution.create({
        data: {
          orgId: input.orgId,
          taskId: candidate.id,
          projectId: candidate.projectId,
          agentId: input.agentId,
          runnerInstanceId: input.runnerInstanceId,
          status: 'CLAIMED',
          tool: input.tool ?? null,
          model: input.model ?? null,
          workspaceMode: input.workspaceMode ?? 'shared_project',
          workspaceRef: input.workspaceRef ?? null,
          workspacePath: input.workspacePath ?? null,
          metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
          startedAt: new Date(),
          lastHeartbeatAt: new Date(),
        },
      });

      await tx.executionLease.update({
        where: { id: leaseRows[0].id },
        data: { executionId: execution.id },
      });

      await tx.task.update({
        where: { id: candidate.id },
        data: {
          status: input.claimStatus,
          blocked: false,
          updatedAt: new Date(),
        },
      });

      return {
        task: {
          ...lockedTask[0],
          status: input.claimStatus,
          blocked: false,
          updatedAt: new Date(),
        },
        execution: {
          id: execution.id,
          orgId: execution.orgId,
          taskId: execution.taskId,
          projectId: execution.projectId,
          agentId: execution.agentId,
          runnerInstanceId: execution.runnerInstanceId,
          status: execution.status,
          tool: execution.tool,
          model: execution.model,
          metadata: (execution.metadata ?? {}) as Record<string, unknown>,
          startedAt: execution.startedAt,
        },
        lease: {
          id: leaseRows[0].id,
          projectId: leaseRows[0].projectId,
          executionId: execution.id,
          expiresAt: leaseRows[0].expiresAt,
        },
      } satisfies ClaimedTaskResult;
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
    }).catch((error) => {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        return null;
      }

      throw error;
    });

    if (claimed) {
      await auditLogRepository.log({
        orgId: input.orgId,
        userId: input.userId,
        action: 'task.claimed',
        targetType: 'task',
        targetId: claimed.task.id,
        actorType: 'agent',
        clientId: input.keyId,
        metadata: {
          source: 'agent',
          agentName: input.agentName,
          agentId: input.agentId,
          runnerInstanceId: input.runnerInstanceId,
          executionId: claimed.execution.id,
          fromStatus: input.pickStatus,
          toStatus: input.claimStatus,
        },
      }).catch(() => {});

      return claimed;
    }
  }

  return null;
}

export function assertClaimedTask(result: ClaimedTaskResult | null): ClaimedTaskResult {
  if (!result) {
    throw new ConflictError('Nenhuma task elegível disponível para claim');
  }
  return result;
}
