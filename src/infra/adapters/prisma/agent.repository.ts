import { PrismaClient } from '@prisma/client';

export interface AgentRecord {
  id: string;
  orgId: string;
  name: string;
  type: string;
  status: string;
  tool: string | null;
  workdir: string | null;
  config: Record<string, unknown>;
  lastHeartbeat: Date | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

function mapRecord(record: any): AgentRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    name: record.name,
    type: record.type,
    status: record.status,
    tool: record.tool,
    workdir: record.workdir,
    config: record.config ?? {},
    lastHeartbeat: record.lastHeartbeat,
    createdBy: record.createdBy,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class AgentRepository {
  constructor(private prisma: PrismaClient) {}

  private get client() {
    return this.prisma as PrismaClient & { agent: any };
  }

  async findByOrgId(orgId: string): Promise<AgentRecord[]> {
    const records = await this.client.agent.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
    });
    return records.map(mapRecord);
  }

  async findById(id: string): Promise<AgentRecord | null> {
    const record = await this.client.agent.findUnique({ where: { id } });
    return record ? mapRecord(record) : null;
  }

  async findByName(orgId: string, name: string): Promise<AgentRecord | null> {
    const record = await this.client.agent.findUnique({
      where: { orgId_name: { orgId, name } },
    });
    return record ? mapRecord(record) : null;
  }

  async create(data: {
    orgId: string;
    name: string;
    type?: string;
    tool?: string;
    workdir?: string;
    config?: Record<string, unknown>;
    createdBy: string;
  }): Promise<AgentRecord> {
    const record = await this.client.agent.create({
      data: {
        orgId: data.orgId,
        name: data.name,
        type: data.type ?? 'RUNNER',
        tool: data.tool ?? null,
        workdir: data.workdir ?? null,
        config: data.config ?? {},
        createdBy: data.createdBy,
      },
    });
    return mapRecord(record);
  }

  async update(
    id: string,
    data: {
      name?: string;
      type?: string;
      tool?: string;
      workdir?: string;
      config?: Record<string, unknown>;
      status?: string;
    }
  ): Promise<AgentRecord> {
    const record = await this.client.agent.update({ where: { id }, data });
    return mapRecord(record);
  }

  async updateWithConfig(id: string, data: { status: string; lastHeartbeat: Date; config?: Record<string, unknown> }): Promise<AgentRecord> {
    const updateData: Record<string, unknown> = {
      status: data.status,
      lastHeartbeat: data.lastHeartbeat,
    };
    if (data.config) {
      updateData.config = data.config;
    }
    const record = await this.client.agent.update({
      where: { id },
      data: updateData,
    });
    return mapRecord(record);
  }

  async updateStatus(id: string, status: string): Promise<AgentRecord> {
    const record = await this.client.agent.update({
      where: { id },
      data: { status, lastHeartbeat: new Date() },
    });
    return mapRecord(record);
  }

  async delete(id: string): Promise<void> {
    await this.client.agent.delete({ where: { id } });
  }
}
