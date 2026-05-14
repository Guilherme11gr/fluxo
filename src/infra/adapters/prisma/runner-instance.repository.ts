/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';

export interface RunnerInstanceRecord {
  id: string;
  orgId: string;
  hostname: string | null;
  pid: number | null;
  version: string | null;
  status: string;
  capabilities: Record<string, unknown>;
  metadata: Record<string, unknown>;
  startedAt: Date;
  lastHeartbeatAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

function mapRecord(record: any): RunnerInstanceRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    hostname: record.hostname,
    pid: record.pid,
    version: record.version,
    status: record.status,
    capabilities: record.capabilities ?? {},
    metadata: record.metadata ?? {},
    startedAt: record.startedAt,
    lastHeartbeatAt: record.lastHeartbeatAt,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class RunnerInstanceRepository {
  constructor(private prisma: PrismaClient) {}

  private get client() {
    return this.prisma as PrismaClient & { runnerInstance: any };
  }

  async create(data: {
    orgId: string;
    hostname?: string | null;
    pid?: number | null;
    version?: string | null;
    status?: string;
    capabilities?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }): Promise<RunnerInstanceRecord> {
    const record = await this.client.runnerInstance.create({
      data: {
        orgId: data.orgId,
        hostname: data.hostname ?? null,
        pid: data.pid ?? null,
        version: data.version ?? null,
        status: data.status ?? 'ONLINE',
        capabilities: data.capabilities ?? {},
        metadata: data.metadata ?? {},
      },
    });
    return mapRecord(record);
  }

  async findById(id: string): Promise<RunnerInstanceRecord | null> {
    const record = await this.client.runnerInstance.findUnique({ where: { id } });
    return record ? mapRecord(record) : null;
  }

  async findByOrgId(orgId: string): Promise<RunnerInstanceRecord[]> {
    const records = await this.client.runnerInstance.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapRecord);
  }

  async updateHeartbeat(
    id: string,
    data: {
      status?: string;
      capabilities?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    }
  ): Promise<RunnerInstanceRecord> {
    const record = await this.client.runnerInstance.update({
      where: { id },
      data: {
        status: data.status,
        capabilities: data.capabilities,
        metadata: data.metadata,
        lastHeartbeatAt: new Date(),
      },
    });
    return mapRecord(record);
  }

  async updateStatus(id: string, status: string): Promise<RunnerInstanceRecord> {
    const record = await this.client.runnerInstance.update({
      where: { id },
      data: {
        status,
        lastHeartbeatAt: new Date(),
      },
    });
    return mapRecord(record);
  }
}
