/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient, AgentExecStatus } from '@prisma/client';

export interface AgentExecutionRecord {
  id: string;
  orgId: string;
  agentId: string;
  taskId: string;
  projectId: string;
  status: AgentExecStatus;
  tool: string | null;
  model: string | null;
  output: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  startedAt: Date;
  finishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

function mapRecord(record: any): AgentExecutionRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    agentId: record.agentId,
    taskId: record.taskId,
    projectId: record.projectId,
    status: record.status,
    tool: record.tool,
    model: record.model,
    output: record.output,
    resultSummary: record.resultSummary,
    errorMessage: record.errorMessage,
    exitCode: record.exitCode,
    duration: record.duration,
    metadata: record.metadata ?? {},
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
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
    taskId: string;
    projectId: string;
    tool?: string;
    model?: string;
    startedAt: Date;
  }): Promise<AgentExecutionRecord> {
    const record = await this.client.agentExecution.create({
      data: {
        orgId: data.orgId,
        agentId: data.agentId,
        taskId: data.taskId,
        projectId: data.projectId,
        status: 'CLAIMED',
        tool: data.tool ?? null,
        model: data.model ?? null,
        startedAt: data.startedAt,
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
      metadata?: Record<string, unknown>;
    }
  ): Promise<AgentExecutionRecord> {
    const updateData: Record<string, unknown> = { status: data.status };
    if (data.output !== undefined) updateData.output = data.output;
    if (data.resultSummary !== undefined) updateData.resultSummary = data.resultSummary;
    if (data.errorMessage !== undefined) updateData.errorMessage = data.errorMessage;
    if (data.exitCode !== undefined) updateData.exitCode = data.exitCode;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.finishedAt !== undefined) updateData.finishedAt = data.finishedAt;
    if (data.metadata !== undefined) updateData.metadata = data.metadata;

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

  async markStaleAsTimeout(orgId: string, staleAfterMs: number): Promise<number> {
    const cutoff = new Date(Date.now() - staleAfterMs);
    const result = await this.client.agentExecution.updateMany({
      where: {
        orgId,
        status: 'RUNNING',
        startedAt: { lt: cutoff },
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