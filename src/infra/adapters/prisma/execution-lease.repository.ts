/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';

export interface ExecutionLeaseRecord {
  id: string;
  orgId: string;
  projectId: string;
  executionId: string | null;
  runnerInstanceId: string;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function mapRecord(record: any): ExecutionLeaseRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    projectId: record.projectId,
    executionId: record.executionId ?? null,
    runnerInstanceId: record.runnerInstanceId,
    expiresAt: record.expiresAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ExecutionLeaseRepository {
  constructor(private prisma: PrismaClient) {}

  private get client() {
    return this.prisma as PrismaClient & { executionLease: any };
  }

  async create(data: {
    orgId: string;
    projectId: string;
    runnerInstanceId: string;
    executionId?: string | null;
    expiresAt: Date;
  }): Promise<ExecutionLeaseRecord> {
    const record = await this.client.executionLease.create({
      data: {
        orgId: data.orgId,
        projectId: data.projectId,
        runnerInstanceId: data.runnerInstanceId,
        executionId: data.executionId ?? null,
        expiresAt: data.expiresAt,
      },
    });
    return mapRecord(record);
  }

  async findByProject(orgId: string, projectId: string): Promise<ExecutionLeaseRecord | null> {
    const record = await this.client.executionLease.findUnique({
      where: {
        orgId_projectId: {
          orgId,
          projectId,
        },
      },
    });
    return record ? mapRecord(record) : null;
  }

  async attachExecution(id: string, executionId: string, expiresAt: Date): Promise<ExecutionLeaseRecord> {
    const record = await this.client.executionLease.update({
      where: { id },
      data: {
        executionId,
        expiresAt,
      },
    });
    return mapRecord(record);
  }

  async renew(id: string, expiresAt: Date): Promise<ExecutionLeaseRecord> {
    const record = await this.client.executionLease.update({
      where: { id },
      data: { expiresAt },
    });
    return mapRecord(record);
  }

  async deleteById(id: string): Promise<void> {
    await this.client.executionLease.delete({ where: { id } });
  }

  async deleteByExecutionId(executionId: string): Promise<void> {
    await this.client.executionLease.deleteMany({ where: { executionId } });
  }

  async deleteExpired(orgId: string, now = new Date()): Promise<number> {
    const result = await this.client.executionLease.deleteMany({
      where: {
        orgId,
        expiresAt: { lte: now },
      },
    });
    return result.count;
  }
}
