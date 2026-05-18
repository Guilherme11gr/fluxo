/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';

export interface AgentExecutionEventRecord {
  id: string;
  executionId: string;
  seq: number;
  kind: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

function mapRecord(record: any): AgentExecutionEventRecord {
  return {
    id: record.id,
    executionId: record.executionId,
    seq: record.seq,
    kind: record.kind,
    content: record.content,
    metadata: record.metadata ?? {},
    createdAt: record.createdAt,
  };
}

export interface ExecutionEventsPage {
  items: AgentExecutionEventRecord[];
  lastSeq: number;
  nextAfterSeq: number;
  returnedCount: number;
  hasMore: boolean;
}

export class AgentExecutionEventRepository {
  constructor(private prisma: PrismaClient) {}

  private get client() {
    return this.prisma as PrismaClient & { agentExecutionEvent: any };
  }

  async createMany(
    executionId: string,
    events: Array<{
      seq: number;
      kind: string;
      content: string;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<number> {
    if (events.length === 0) return 0;

    const result = await this.client.agentExecutionEvent.createMany({
      data: events.map((event) => ({
        executionId,
        seq: event.seq,
        kind: event.kind,
        content: event.content,
        metadata: event.metadata ?? {},
      })),
      skipDuplicates: true,
    });

    return result.count;
  }

  async findByExecutionId(
    executionId: string,
    afterSeq?: number,
    limit = 200
  ): Promise<AgentExecutionEventRecord[]> {
    const page = await this.findPageByExecutionId(executionId, afterSeq, limit);
    return page.items;
  }

  async findPageByExecutionId(
    executionId: string,
    afterSeq?: number,
    limit = 200
  ): Promise<ExecutionEventsPage> {
    const fetchLimit = limit + 1;
    const records = await this.client.agentExecutionEvent.findMany({
      where: {
        executionId,
        ...(afterSeq !== undefined ? { seq: { gt: afterSeq } } : {}),
      },
      orderBy: { seq: 'asc' },
      take: fetchLimit,
    });

    const hasMore = records.length > limit;
    const items = records.slice(0, limit).map(mapRecord);
    const returnedCount = items.length;

    const lastSeqInResult = items.length > 0 ? items[items.length - 1].seq : 0;
    const lastSeqOverall = await this.getLastSeq(executionId);

    return {
      items,
      lastSeq: lastSeqOverall,
      nextAfterSeq: lastSeqInResult,
      returnedCount,
      hasMore,
    };
  }

  async getLastSeq(executionId: string): Promise<number> {
    const record = await this.client.agentExecutionEvent.findFirst({
      where: { executionId },
      orderBy: { seq: 'desc' },
      select: { seq: true },
    });
    return record?.seq ?? 0;
  }
}
