import type { TaskWithReadableId, TaskFilterParams } from '@/shared/types';
import type { TaskRepository } from '@/infra/adapters/prisma';

export interface SearchTasksDeps {
  taskRepository: TaskRepository;
}

export interface SearchTasksResult {
  items: TaskWithReadableId[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  nextCursor: string | null;
}

export async function searchTasks(
  orgId: string,
  filters: TaskFilterParams,
  deps: SearchTasksDeps
): Promise<SearchTasksResult> {
  const { taskRepository } = deps;
  const { page = 1, pageSize = 20, skipCount = false, cursor } = filters;

  if (skipCount) {
    const items = await taskRepository.findMany(orgId, filters);
    return {
      items,
      total: -1,
      page,
      pageSize,
      totalPages: -1,
      nextCursor: null,
    };
  }

  if (cursor) {
    const items = await taskRepository.findMany(orgId, filters);
    const nextCursor = items.length === pageSize
      ? items[items.length - 1].createdAt.toISOString()
      : null;

    return {
      items,
      total: -1,
      page: 1,
      pageSize,
      totalPages: -1,
      nextCursor,
    };
  }

  const [items, total] = await Promise.all([
    taskRepository.findMany(orgId, filters),
    taskRepository.count(orgId, filters),
  ]);

  return {
    items,
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
    nextCursor: null,
  };
}
