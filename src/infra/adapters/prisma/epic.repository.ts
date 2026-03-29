import { PrismaClient } from '@prisma/client';
import type { Epic, EpicStatus } from '@/shared/types';

export interface CreateEpicInput {
  orgId: string;
  projectId: string;
  title: string;
  description?: string | null;
  status?: 'OPEN' | 'CLOSED';
  isSystem?: boolean;
}

export interface UpdateEpicInput {
  title?: string;
  description?: string | null;
  status?: EpicStatus;
  aiSummary?: string;
  lastAnalyzedAt?: Date;
}

export class EpicRepository {
  constructor(private prisma: PrismaClient) { }

  async create(input: CreateEpicInput): Promise<Epic> {
    return await this.prisma.epic.create({
      data: input,
    });
  }

  /**
   * Find all epics in project
   * NO N+1: Include project data in single query
   */
  async findMany(projectId: string, orgId: string): Promise<Epic[]> {
    return await this.prisma.epic.findMany({
      where: { projectId, orgId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find ALL epics in organization (single query, no N+1)
   * Used by /api/epics endpoint for dropdowns
   */
  async findAllByOrg(orgId: string): Promise<Epic[]> {
    return await this.prisma.epic.findMany({
      where: { orgId },
      include: {
        project: {
          select: { id: true, name: true, key: true },
        },
        _count: {
          select: { features: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Find epic by ID with relations (for detail view)
   */
  async findById(id: string, orgId: string): Promise<Epic | null> {
    return await this.prisma.epic.findFirst({
      where: { id, orgId },
    });
  }

  async findByIdWithProject(id: string, orgId: string) {
    return await this.prisma.epic.findFirst({
      where: { id, orgId },
      include: {
        project: {
          select: { id: true, name: true, key: true }
        },
      }
    });
  }

  /**
   * Find epic with features count (for list view)
   */
  async findManyWithStats(
    projectId: string,
    orgId: string
  ): Promise<Array<Epic & { _count: { features: number } }>> {
    return await this.prisma.epic.findMany({
      where: { projectId, orgId },
      include: {
        _count: {
          select: { features: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async update(
    id: string,
    orgId: string,
    input: UpdateEpicInput
  ): Promise<Epic> {
    // OPTIMIZED: Use updateMany with nested orgId filter, then verify count
    const result = await this.prisma.epic.updateMany({
      where: { id, orgId },
      data: input,
    });

    if (result.count === 0) {
      throw new Error('Epic not found');
    }

    // Re-fetch to return the updated object
    const updated = await this.findById(id, orgId);
    if (!updated) throw new Error('Epic not found');
    return updated;
  }

  async delete(id: string, orgId: string): Promise<boolean> {
    // OPTIMIZED: Only fetch isSystem field to check protection
    const epic = await this.prisma.epic.findFirst({
      where: { id, orgId },
      select: { isSystem: true },
    });

    if (epic?.isSystem) {
      throw new Error('Épico de sistema não pode ser excluído');
    }

    const result = await this.prisma.epic.deleteMany({
      where: { id, orgId },
    });
    return result.count > 0;
  }
}
