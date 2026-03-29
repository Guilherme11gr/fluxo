import { PrismaClient } from '@prisma/client';
import type {
  Task,
  TaskWithReadableId,
  TaskStatus,
  TaskType,
  TaskPriority,
  StoryPoints,
  TaskFilterParams
} from '@/shared/types';
import { buildReadableId } from '@/shared/types/task.types';
import { ValidationError } from '@/shared/errors';

export interface CreateTaskInput {
  orgId: string;
  featureId: string;
  title: string;
  description?: string | null;
  status?: TaskStatus;
  type?: TaskType;
  priority?: TaskPriority;
  points?: StoryPoints;
  modules?: string[];
  assigneeId?: string | null;
  createdBy?: string | null;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  type?: TaskType;
  priority?: TaskPriority;
  points?: StoryPoints;
  modules?: string[];
  assigneeId?: string | null;
  blocked?: boolean;
}

export class TaskRepository {
  constructor(private prisma: PrismaClient) { }

  /**
   * Create task with auto-generated local_id
   * Trigger set_task_local_id() handles local_id generation
   */
  async create(input: CreateTaskInput): Promise<Task> {
    // Fetch feature with project data for validation
    const feature = await this.prisma.feature.findFirst({
      where: {
        id: input.featureId,
        epic: { project: { orgId: input.orgId } },
      },
      select: {
        epicId: true,
        epic: {
          select: {
            projectId: true,
            project: { select: { modules: true } }
          }
        }
      },
    });

    if (!feature) {
      throw new ValidationError(
        `Feature ${input.featureId} não encontrada ou não pertence à organização`
      );
    }

    // Validate modules exist in project (if provided)
    if (input.modules && input.modules.length > 0) {
      const projectModules = feature.epic.project.modules;
      const invalidModules = input.modules.filter(m => !projectModules.includes(m));
      if (invalidModules.length > 0) {
        throw new ValidationError(
          `Módulos inválidos: ${invalidModules.join(', ')}. Módulos válidos: ${projectModules.join(', ') || 'nenhum'}`
        );
      }
    }

    const result = await this.prisma.task.create({
      data: {
        orgId: input.orgId,
        projectId: feature.epic.projectId, // Will be verified by trigger
        featureId: input.featureId,
        // Calculate next localId (bypass missing trigger)
        localId: await this.getNextLocalId(feature.epic.projectId),
        title: input.title,
        description: input.description,
        status: input.status ?? 'BACKLOG',
        type: input.type ?? 'TASK',
        priority: input.priority ?? 'MEDIUM',
        points: input.points ?? null,
        modules: input.modules ?? [],
        assigneeId: input.assigneeId,
        createdBy: input.createdBy,
      },
    });

    // Cast points to StoryPoints type (Prisma returns number | null)
    return result as Task;
  }

  /**
   * Find tasks with filters (search, pagination, sort)
   * NO N+1: Include feature, assignee in single query
   */
  async findMany(
    orgId: string,
    filters: TaskFilterParams = {}
  ): Promise<TaskWithReadableId[]> {
    const {
      page = 1,
      pageSize = 20,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = filters;

    const where = this.buildWhereClause(orgId, filters);

    const tasks = await this.prisma.task.findMany({
      where,
      select: {
        id: true,
        orgId: true,
        projectId: true,
        title: true,
        description: true,
        status: true,
        type: true,
        priority: true,
        points: true,
        modules: true,
        localId: true,
        assigneeId: true,
        featureId: true,
        createdAt: true,
        updatedAt: true,
        blocked: true,
        statusChangedAt: true,
        // Include tags to avoid N+1 when displaying
        tagAssignments: {
          select: {
            tag: {
              select: { id: true, name: true, color: true },
            },
          },
        },
        // Use direct project relation (1 JOIN instead of 3)
        project: {
          select: {
            id: true,
            key: true,
            name: true,
          },
        },
        feature: {
          select: {
            id: true,
            title: true,
            epic: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
        assignee: {
          select: {
            user_profiles: {
              select: {
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
      },
      skip: (page - 1) * pageSize,
      take: pageSize,
      orderBy: { [sortBy]: sortOrder },
    });

    // Build readable IDs using direct project.key
    const result = tasks.map((task) => ({
      ...task,
      readableId: buildReadableId(task.project.key, task.localId),
      // Transform tag assignments to flat array
      tags: task.tagAssignments.map((a) => a.tag),
      // Add nested project for compatibility with existing frontend
      feature: {
        ...task.feature,
        epic: {
          ...task.feature.epic,
          project: task.project,
        },
      },
      assignee: task.assignee?.user_profiles ? {
        displayName: task.assignee.user_profiles.displayName,
        avatarUrl: task.assignee.user_profiles.avatarUrl,
      } : undefined,
    })) as TaskWithReadableId[];

    return result;
  }

  /**
   * Find task by readable ID (e.g., "APP-123")
   * @throws ValidationError if format is invalid
   */
  async findByReadableId(
    readableId: string,
    orgId: string
  ): Promise<TaskWithReadableId | null> {
    // Validar formato: KEY-123 (key: 2-10 chars, localId: 1+)
    const match = readableId.toUpperCase().match(/^([A-Z0-9]{2,10})-(\d+)$/);
    if (!match) {
      throw new ValidationError(
        `ID inválido: "${readableId}". Formato esperado: PROJECT-123`
      );
    }

    const [_full, projectKey, localIdStr] = match;
    const localId = parseInt(localIdStr, 10);

    // localId deve ser >= 1 (trigger gera a partir de 1)
    if (localId < 1) {
      throw new ValidationError(`ID inválido: localId deve ser >= 1`);
    }

    const task = await this.prisma.task.findFirst({
      where: {
        orgId,
        localId,
        project: {
          key: projectKey.toUpperCase(),
        },
      },
      include: {
        feature: {
          select: {
            id: true,
            title: true,
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
        },
      },
    });

    if (!task) return null;

    // Cast points to StoryPoints type (Prisma returns number | null)
    return {
      ...task,
      readableId: buildReadableId(
        task.feature.epic.project.key,
        task.localId
      ),
    } as TaskWithReadableId;
  }

  async findById(id: string, orgId: string): Promise<Task | null> {
    const result = await this.prisma.task.findFirst({
      where: { id, orgId },
    });
    // Cast points to StoryPoints type (Prisma returns number | null)
    return result as Task | null;
  }

  /**
   * Find task by ID with all relations (for detail view)
   * NO N+1: Single query with all includes
   */
  async findByIdWithRelations(
    id: string,
    orgId: string
  ): Promise<TaskWithReadableId | null> {
    const task = await this.prisma.task.findFirst({
      where: { id, orgId },
      include: {
        assignee: {
          select: {
            user_profiles: {
              select: {
                displayName: true,
                avatarUrl: true,
              },
            },
          },
        },
        feature: {
          select: {
            id: true,
            title: true,
            epic: {
              select: {
                id: true,
                title: true,
                project: {
                  select: {
                    id: true,
                    name: true,
                    key: true,
                    modules: true,
                  },
                },
              },
            },
          },
        },
        comments: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true,
            content: true,
            userId: true,
            createdAt: true,
          },
        },
      },
    });

    if (!task) return null;

    return {
      ...task,
      readableId: buildReadableId(
        task.feature.epic.project.key,
        task.localId
      ),
      assignee: task.assignee?.user_profiles ? {
        displayName: task.assignee.user_profiles.displayName,
        avatarUrl: task.assignee.user_profiles.avatarUrl,
      } : undefined,
    } as TaskWithReadableId;
  }

  async update(
    id: string,
    orgId: string,
    input: UpdateTaskInput
  ): Promise<Task> {
    // OPTIMIZED: Use updateMany with orgId filter, then re-fetch if needed
    const result = await this.prisma.task.updateMany({
      where: { id, orgId },
      data: input,
    });

    if (result.count === 0) {
      throw new Error('Task not found');
    }

    const updated = await this.findById(id, orgId);
    if (!updated) throw new Error('Task not found');
    return updated;
  }

  /**
   * Bulk update tasks
   * Securely updates multiple tasks belonging to the same organization
   */
  async bulkUpdate(
    ids: string[],
    orgId: string,
    input: UpdateTaskInput
  ): Promise<number> {
    const result = await this.prisma.task.updateMany({
      where: {
        id: { in: ids },
        orgId, // Security: Ensure all tasks belong to the org
      },
      data: input,
    });
    return result.count;
  }

  /**
   * Update only status (common operation)
   * OPTIMIZED & SECURE: Uses updateMany with orgId filter
   */
  async updateStatus(
    id: string,
    orgId: string,
    status: TaskStatus
  ): Promise<Task> {
    // Use updateMany with orgId filter for tenant isolation
    const result = await this.prisma.task.updateMany({
      where: { id, orgId },
      data: { status },
    });

    if (result.count === 0) {
      throw new Error('Task not found');
    }

    // Re-fetch to return the updated object
    const updated = await this.findById(id, orgId);
    if (!updated) throw new Error('Task not found');
    return updated;
  }

  async delete(id: string, orgId: string): Promise<boolean> {
    const result = await this.prisma.task.deleteMany({
      where: { id, orgId },
    });
    return result.count > 0;
  }

  /**
   * Count tasks by filters
   */
  async count(orgId: string, filters: TaskFilterParams = {}): Promise<number> {
    const where = this.buildWhereClause(orgId, filters);
    return await this.prisma.task.count({ where });
  }

  /**
   * Build WHERE clause for task queries (DRY helper)
   * @private
   */
  private buildWhereClause(
    orgId: string,
    filters: TaskFilterParams
  ): Record<string, unknown> {
    const {
      status,
      type,
      priority,
      assigneeId,
      module,
      tagId,
      projectId,
      featureId,
      epicId,
      search,
      blocked,
    } = filters;

    const where: Record<string, unknown> = { orgId };

    if (status) {
      where.status = Array.isArray(status) ? { in: status } : status;
    }
    if (type) where.type = type;
    if (priority) where.priority = priority;
    if (assigneeId) where.assigneeId = assigneeId;
    if (module) where.modules = { has: module };
    if (projectId) where.projectId = projectId;
    if (featureId) where.featureId = featureId;
    if (blocked !== undefined) where.blocked = blocked;

    // Filter by tag (requires JOIN via tagAssignments)
    if (tagId) {
      where.tagAssignments = { some: { tagId } };
    }

    if (search) {
      // Escape caracteres especiais do LIKE (%, _) para evitar wildcard injection
      const escapedSearch = this.escapeLike(search);

      // Detectar se é busca por readableId (formato: KEY-123 ou apenas 123)
      const readableIdPattern = /^([A-Z0-9]{2,10}-)?\d+$/i;
      if (readableIdPattern.test(search.trim())) {
        // Busca por localId (suporta "36" ou "agq-36")
        const localIdMatch = search.trim().match(/(\d+)$/);
        if (localIdMatch) {
          const localId = parseInt(localIdMatch[1], 10);

          // Se tem projeto-prefix, busca por projeto também
          const projectKeyMatch = search.trim().match(/^([A-Z0-9]{2,10})-/i);
          if (projectKeyMatch) {
            where.AND = [
              { localId },
              { project: { key: { equals: projectKeyMatch[1].toUpperCase(), mode: 'insensitive' } } },
            ];
          } else {
            // Busca apenas por localId (qualquer projeto)
            where.localId = localId;
          }
        }
      } else {
        // Busca textual em title e description
        // NOTA: Para buscas com múltiplas palavras (>2 termos), considere usar:
        // Prisma.$queryRaw com to_tsvector/plainto_tsquery (idx_tasks_fulltext_search)
        // Exemplo: SELECT * FROM tasks WHERE to_tsvector('portuguese', title || ' ' || COALESCE(description, '')) 
        //          @@ plainto_tsquery('portuguese', ${search}) AND org_id = ${orgId};
        // Benefício: ~10x mais rápido para buscas textuais complexas
        where.OR = [
          { title: { contains: escapedSearch, mode: 'insensitive' } },
          { description: { contains: escapedSearch, mode: 'insensitive' } },
        ];
      }
    }

    // Filter by epic (requires JOIN)
    if (epicId) {
      where.feature = { epicId };
    }

    return where;
  }


  /**
   * Get the next localId for a project (auto-increment workaround)
   * @private
   */
  private async getNextLocalId(projectId: string): Promise<number> {
    const lastTask = await this.prisma.task.findFirst({
      where: { projectId },
      orderBy: { localId: 'desc' },
      select: { localId: true },
    });
    return (lastTask?.localId ?? 0) + 1;
  }

  /**
   * Escape LIKE special characters to prevent wildcard injection
   * @private
   */
  private escapeLike(value: string): string {
    return value.replace(/[%_]/g, (match: string) => `\\${match}`);
  }
}

