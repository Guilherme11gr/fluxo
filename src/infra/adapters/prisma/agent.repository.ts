import type { PrismaClient } from '@prisma/client';

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

export interface CreateAgentInput {
  orgId: string;
  name: string;
  type?: string;
  tool?: string;
  workdir?: string;
  config?: Record<string, unknown>;
  createdBy: string;
}

export interface UpdateAgentInput {
  name?: string;
  type?: string;
  tool?: string;
  workdir?: string;
  config?: Record<string, unknown>;
  status?: string;
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
    lastHeartbeat: record.lastHeartbeat ?? record.last_heartbeat ?? null,
    createdBy: record.createdBy ?? record.created_by,
    createdAt: record.createdAt ?? record.created_at,
    updatedAt: record.updatedAt ?? record.updated_at,
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
    const client = this.prisma as PrismaClient & { agent: any };
    const record = await client.agent.findFirst({
      where: { orgId, name },
    });
    return record ? mapRecord(record) : null;
  }

  async create(input: CreateAgentInput): Promise<AgentRecord> {
    const record = await this.client.agent.create({
      data: {
        orgId: input.orgId,
        name: input.name,
        type: input.type ?? 'RUNNER',
        tool: input.tool ?? null,
        workdir: input.workdir ?? null,
        config: input.config ?? {},
        createdBy: input.createdBy,
      },
    });
    return mapRecord(record);
  }

  async update(id: string, data: UpdateAgentInput): Promise<AgentRecord> {
    const record = await this.client.agent.update({
      where: { id },
      data,
    });
    return mapRecord(record);
  }

  async updateStatus(id: string, status: string): Promise<AgentRecord> {
    const record = await this.client.agent.update({
      where: { id },
      data: {
        status,
        lastHeartbeat: new Date(),
        updatedAt: new Date(),
      },
    });
    return mapRecord(record);
  }

  async delete(id: string): Promise<void> {
    await this.client.agent.delete({ where: { id } });
  }
}
