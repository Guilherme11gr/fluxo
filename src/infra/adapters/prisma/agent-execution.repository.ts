/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient, AgentExecStatus } from '@prisma/client';

export interface AgentExecutionRecord {
  id: string;
  orgId: string;
  agentId: string;
  runnerInstanceId: string | null;
  taskId: string;
  projectId: string;
  status: AgentExecStatus;
  tool: string | null;
  model: string | null;
  workspaceMode: string | null;
  workspaceRef: string | null;
  workspacePath: string | null;
  output: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  startedAt: Date;
  lastHeartbeatAt: Date | null;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface PreviousTaskExecutionRecord {
  id: string;
  status: AgentExecStatus;
  resultSummary: string | null;
  errorMessage: string | null;
  output: string | null;
  exitCode: number | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  startedAt: Date;
  finishedAt: Date | null;
}

function mapRecord(record: any): AgentExecutionRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    agentId: record.agentId,
    runnerInstanceId: record.runnerInstanceId ?? null,
    taskId: record.taskId,
    projectId: record.projectId,
    status: record.status,
    tool: record.tool,
    model: record.model,
    workspaceMode: record.workspaceMode ?? null,
    workspaceRef: record.workspaceRef ?? null,
    workspacePath: record.workspacePath ?? null,
    output: record.output,
    resultSummary: record.resultSummary,
    errorMessage: record.errorMessage,
    exitCode: record.exitCode,
    duration: record.duration,
    metadata: record.metadata ?? {},
    startedAt: record.startedAt,
    lastHeartbeatAt: record.lastHeartbeatAt ?? null,
    finishedAt: record.finishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
	};
}

function mergeMetadata(
	existing: Record<string, unknown> | undefined,
	patch: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
	if (!patch) {
		return existing;
	}
	return {
		...(existing ?? {}),
		...patch,
	};
}

export class AgentExecutionRepository {
  constructor(private prisma: PrismaClient) {}

  private get client() {
    return this.prisma as PrismaClient & { agentExecution: any };
  }

  async create(data: {
    orgId: string;
    agentId: string;
    runnerInstanceId?: string | null;
    taskId: string;
    projectId: string;
    tool?: string;
    model?: string;
    workspaceMode?: string;
    workspaceRef?: string | null;
    workspacePath?: string | null;
    metadata?: Record<string, unknown>;
    startedAt: Date;
  }): Promise<AgentExecutionRecord> {
    const record = await this.client.agentExecution.create({
      data: {
        orgId: data.orgId,
        agentId: data.agentId,
        runnerInstanceId: data.runnerInstanceId ?? null,
        taskId: data.taskId,
        projectId: data.projectId,
        status: 'CLAIMED',
        tool: data.tool ?? null,
        model: data.model ?? null,
        workspaceMode: data.workspaceMode ?? null,
        workspaceRef: data.workspaceRef ?? null,
        workspacePath: data.workspacePath ?? null,
        metadata: data.metadata ?? {},
        startedAt: data.startedAt,
        lastHeartbeatAt: data.startedAt,
      },
    });
    return mapRecord(record);
  }

	async updateStatus(
		id: string,
		data: {
      status: AgentExecStatus;
      output?: string;
      resultSummary?: string;
      errorMessage?: string;
      exitCode?: number;
      duration?: number;
      finishedAt?: Date;
      lastHeartbeatAt?: Date;
      workspaceMode?: string;
      workspaceRef?: string | null;
      workspacePath?: string | null;
      metadata?: Record<string, unknown>;
    }
	): Promise<AgentExecutionRecord> {
		const existing = await this.findById(id);
		const updateData: Record<string, unknown> = { status: data.status };
    if (data.output !== undefined) updateData.output = data.output;
    if (data.resultSummary !== undefined) updateData.resultSummary = data.resultSummary;
    if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;
    if (data.exitCode !== undefined) updateData.exitCode = data.exitCode;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.finishedAt !== undefined) updateData.finishedAt = data.finishedAt;
    if (data.lastHeartbeatAt !== undefined) updateData.lastHeartbeatAt = data.lastHeartbeatAt;
    if (data.workspaceMode !== undefined) updateData.workspaceMode = data.workspaceMode;
    if (data.workspaceRef !== undefined) updateData.workspaceRef = data.workspaceRef;
    if (data.workspacePath !== undefined) updateData.workspacePath = data.workspacePath;
		if (data.metadata !== undefined) updateData.metadata = mergeMetadata(existing?.metadata, data.metadata);

    const record = await this.client.agentExecution.update({
      where: { id },
      data: updateData,
    });
    return mapRecord(record);
  }

  async findByOrgId(
    orgId: string,
    filters?: { status?: AgentExecStatus; agentId?: string; projectId?: string },
    page = 1,
    limit = 20
  ): Promise<{ items: AgentExecutionRecord[]; total: number }> {
    const where: Record<string, unknown> = { orgId };
    if (filters?.status) where.status = filters.status;
    if (filters?.agentId) where.agentId = filters.agentId;
    if (filters?.projectId) where.projectId = filters.projectId;

    const [items, total] = await Promise.all([
      this.client.agentExecution.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.client.agentExecution.count({ where }),
    ]);

    return { items: items.map(mapRecord), total };
  }

  async findByTaskId(taskId: string, orgId: string): Promise<AgentExecutionRecord[]> {
    const records = await this.client.agentExecution.findMany({
      where: { taskId, orgId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapRecord);
  }

  async findLatestCompletedByTaskId(taskId: string, orgId: string, excludeId?: string): Promise<PreviousTaskExecutionRecord | null> {
    const record = await this.client.agentExecution.findFirst({
      where: {
        taskId,
        orgId,
        status: { in: ['SUCCESS', 'FAILED', 'TIMEOUT', 'CANCELLED'] },
        ...(excludeId ? { id: { not: excludeId } } : {}),
      },
      orderBy: [
        { finishedAt: 'desc' },
        { createdAt: 'desc' },
      ],
      select: {
        id: true,
        status: true,
        resultSummary: true,
        errorMessage: true,
        output: true,
        exitCode: true,
        duration: true,
        metadata: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    if (!record) {
      return null;
    }

    return {
      id: record.id,
      status: record.status,
      resultSummary: record.resultSummary,
      errorMessage: record.errorMessage,
      output: record.output,
      exitCode: record.exitCode,
      duration: record.duration,
      metadata: (record.metadata ?? {}) as Record<string, unknown>,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
    };
  }

  async findByAgentId(agentId: string, orgId: string, limit = 10): Promise<AgentExecutionRecord[]> {
    const records = await this.client.agentExecution.findMany({
      where: { agentId, orgId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return records.map(mapRecord);
  }

  async countByStatus(orgId: string, since?: Date): Promise<Record<string, number>> {
    const where: Record<string, unknown> = { orgId };
    if (since) where.createdAt = { gte: since };

    const groups = await this.client.agentExecution.groupBy({
      by: ['status'],
      where,
      _count: { status: true },
    });

    const result: Record<string, number> = {};
    for (const g of groups) {
      result[g.status as string] = g._count.status;
    }
    return result;
  }

  async findById(id: string): Promise<AgentExecutionRecord | null> {
    const record = await this.client.agentExecution.findUnique({ where: { id } });
    return record ? mapRecord(record) : null;
  }

  async findActiveByRunnerInstance(runnerInstanceId: string): Promise<AgentExecutionRecord[]> {
    const records = await this.client.agentExecution.findMany({
      where: {
        runnerInstanceId,
        status: { in: ['CLAIMED', 'RUNNING'] },
      },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapRecord);
  }

  async heartbeat(id: string): Promise<AgentExecutionRecord> {
    const record = await this.client.agentExecution.update({
      where: { id },
      data: { lastHeartbeatAt: new Date() },
    });
    return mapRecord(record);
  }

  async findActiveByOrg(orgId: string, staleBefore?: Date): Promise<AgentExecutionRecord[]> {
    const records = await this.client.agentExecution.findMany({
      where: {
        orgId,
        status: { in: ['CLAIMED', 'RUNNING'] },
        ...(staleBefore ? { lastHeartbeatAt: { lt: staleBefore } } : {}),
      },
      orderBy: { startedAt: 'asc' },
    });
    return records.map(mapRecord);
  }

  async markStaleAsTimeout(orgId: string, staleAfterMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMs);
    const result = await this.client.agentExecution.updateMany({
      where: {
        orgId,
        status: { in: ['CLAIMED', 'RUNNING'] },
        OR: [
          { lastHeartbeatAt: { lt: cutoff } },
          { lastHeartbeatAt: null, startedAt: { lt: cutoff } },
        ],
      },
      data: {
        status: 'TIMEOUT',
        errorMessage: 'Execution timed out (stale)',
        finishedAt: new Date(),
      },
    });
    return result.count;
  }
}
