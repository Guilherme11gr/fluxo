import { PrismaClient } from '@prisma/client';
import type { Feature, FeatureStatus } from '@/shared/types';

export interface CreateFeatureInput {
  orgId: string;
  epicId: string;
  title: string;
  description?: string | null;
  status?: 'BACKLOG' | 'TODO' | 'DOING' | 'DONE';
  isSystem?: boolean;
}

export interface UpdateFeatureInput {
  title?: string;
  description?: string | null;
  status?: FeatureStatus;
  technicalAnalysis?: string | null;
  analysisUpdatedAt?: Date | string;
}

export class FeatureRepository {
  constructor(private prisma: PrismaClient) { }

  async create(input: CreateFeatureInput): Promise<Feature> {
    return await this.prisma.feature.create({
      data: input,
    });
  }

  /**
   * Find features with task counts
   * NO N+1: Aggregate in single query
   */
  async findManyWithStats(
    epicId: string,
    orgId: string
  ): Promise<Array<Omit<Feature, 'tasks'> & { _count: { tasks: number }; tasks: Array<{ status: string; type: string; assignee: { user_profiles: { displayName: string; avatarUrl: string | null } | null } | null }> }>> {
    return await this.prisma.feature.findMany({
      where: { epicId, orgId },
      include: {
        _count: {
          select: { tasks: true },
        },
        tasks: {
          select: {
            status: true,
            type: true,
            assignee: {
              select: {
                user_profiles: {
                  select: {
                    displayName: true,
                    avatarUrl: true,
                  }
                }
              }
            }
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findManyInEpicWithTasks(
    epicId: string,
    orgId: string
  ) {
    return await this.prisma.feature.findMany({
      where: { epicId, orgId },
      select: {
        id: true,
        title: true,
        status: true,
        tasks: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            type: true,
            priority: true,
            updatedAt: true,
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findAll(orgId: string) {
    return await this.prisma.feature.findMany({
      where: { orgId },
      include: {
        epic: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true,
                key: true,
              },
            },
          },
        },
      },
      orderBy: { title: 'asc' },
    });
  }

  /**
   * Ligthweight list for dropdowns
   * 
   * Note: Returns epicId at root level for compatibility with task-filters.tsx
   * which expects { id, title, epicId } format
   */
  async findOptions(orgId: string) {
    return await this.prisma.feature.findMany({
      where: { orgId },
      select: {
        id: true,
        title: true,
        epicId: true, // ✅ FIX: Include epicId at root level for dropdown filtering
        epic: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                modules: true, // Needed for module filtering in tasks
              }
            }
          }
        }
      },
      orderBy: { title: 'asc' },
    });
  }

  async findById(id: string, orgId: string): Promise<Feature | null> {
    return await this.prisma.feature.findFirst({
      where: { id, orgId },
    });
  }

  /**
   * Find system feature (Sustentação) for a project
   * Used for orphan task assignment
   */
  async findSystemFeature(projectId: string): Promise<Feature | null> {
    return await this.prisma.feature.findFirst({
      where: {
        epic: { projectId },
        isSystem: true,
      },
    });
  }

  /**
   * Find feature with full breadcrumb (epic → project)
   */
  async findByIdWithBreadcrumb(
    id: string,
    orgId: string
  ): Promise<(Feature & { epic: { id: string; title: string; projectId: string } }) | null> {
    return await this.prisma.feature.findFirst({
      where: { id, orgId },
      include: {
        epic: {
          select: {
            id: true,
            title: true,
            projectId: true,
          },
        },
      },
    });
  }

  /**
   * Find feature with full relations (epic → project)
   */
  async findByIdWithRelations(
    id: string,
    orgId: string
  ) {
    return await this.prisma.feature.findFirst({
      where: { id, orgId },
      include: {
        epic: {
          select: {
            id: true,
            title: true,
            project: {
              select: {
                id: true,
                name: true,
                key: true,
              },
            },
          },
        },
      },
    });
  }

  async update(
    id: string,
    orgId: string,
    input: UpdateFeatureInput
  ): Promise<Feature> {
    // OPTIMIZED: Use updateMany with nested orgId filter, then verify count
    const result = await this.prisma.feature.updateMany({
      where: { id, orgId },
      data: input,
    });

    if (result.count === 0) {
      throw new Error('Feature not found');
    }

    // Re-fetch to return the updated object
    const updated = await this.findById(id, orgId);
    if (!updated) throw new Error('Feature not found');
    return updated;
  }


  async delete(id: string, orgId: string): Promise<boolean> {
    // Protect system features from deletion
    const feature = await this.prisma.feature.findFirst({
      where: { id, epic: { project: { orgId } } },
    });

    if (feature?.isSystem) {
      throw new Error('Feature de sistema não pode ser excluída');
    }

    const result = await this.prisma.feature.deleteMany({
      where: {
        id,
        epic: { project: { orgId } },
      },
    });
    return result.count > 0;
  }

  /**
   * Find feature with tasks and comments for AI Analysis
   * Used by generate-feature-summary use case
   */
  async findByIdWithTasksAndComments(
    id: string,
    orgId: string
  ) {
    return await this.prisma.feature.findFirst({
      where: { id, orgId },
      include: {
        epic: {
          select: {
            title: true,
            projectId: true,
          }
        },
        tasks: {
          select: {
            id: true,
            title: true,
            description: true,
            status: true,
            type: true,
            priority: true,
            updatedAt: true,
            comments: {
              take: 5,
              orderBy: { createdAt: 'desc' },
              select: {
                content: true,
                users: {
                  select: {
                    user_profiles: {
                      select: { displayName: true }
                    }
                  }
                },
                createdAt: true,
              }
            },
            createdAt: true,
          },
          orderBy: { updatedAt: 'desc' },
          take: 100
        }
      },
    });
  }
}

