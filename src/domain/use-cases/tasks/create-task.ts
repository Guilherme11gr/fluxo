import type { Task, TaskType, TaskPriority, StoryPoints } from '@/shared/types';
import type { TaskRepository, FeatureRepository } from '@/infra/adapters/prisma';

export interface CreateTaskInput {
  orgId: string;
  projectId: string;
  featureId?: string | null;
  title: string;
  description?: string | null;
  status?: 'BACKLOG' | 'TODO' | 'DOING' | 'REVIEW' | 'QA_READY' | 'DONE';
  type?: TaskType;
  priority?: TaskPriority;
  points?: StoryPoints | null;
  modules?: string[];
  assigneeId?: string | null;
  createdBy?: string; // Quem criou a task
}

export interface CreateTaskDeps {
  taskRepository: TaskRepository;
  featureRepository: FeatureRepository;
}

/**
 * Create Task Use Case
 * 
 * Business Rules:
 * - local_id é gerado automaticamente pelo trigger do DB
 * - project_id é propagado automaticamente pelo trigger
 * - Se featureId não for informado, vincula à Feature de Sustentação (Smart Orphan)
 */
export async function createTask(
  input: CreateTaskInput,
  deps: CreateTaskDeps
): Promise<Task> {
  const { taskRepository, featureRepository } = deps;

  let { featureId } = input;

  // Magic Link: se não informou feature, usar Sustentação
  if (!featureId) {
    const sustentation = await featureRepository.findSystemFeature(input.projectId);
    if (!sustentation) {
      throw new Error('Feature de Sustentação não encontrada. O projeto pode estar corrompido.');
    }
    featureId = sustentation.id;
  }

  return await taskRepository.create({
    ...input,
    featureId,
    // createdBy já vem no input
  });
}

