import { z } from 'zod';

// UUID validator
export const uuidSchema = z.string().uuid('ID inválido');

// Slug validator (URL-friendly)
export const slugSchema = z
  .string()
  .min(2, 'Mínimo 2 caracteres')
  .max(50, 'Máximo 50 caracteres')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Apenas letras minúsculas, números e hífens');

// Project key validator (e.g., APP, SDK)
export const projectKeySchema = z
  .string()
  .min(2, 'Mínimo 2 caracteres')
  .max(10, 'Máximo 10 caracteres')
  .regex(/^[A-Z0-9]+$/, 'Apenas letras maiúsculas e números');

// Pagination validator
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

// Task status validator
export const taskStatusSchema = z.enum([
  'BACKLOG',
  'TODO',
  'DOING',
  'REVIEW',
  'QA_READY',
  'DONE',
]);

// Task type validator
export const taskTypeSchema = z.enum(['TASK', 'BUG']);

// Task priority validator
export const taskPrioritySchema = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// Story points validator (Fibonacci) - handles string inputs from forms
export const storyPointsSchema = z.preprocess(
  (val) => {
    if (typeof val === 'string') {
      if (val === 'Sem estimativa' || val === '') return null;
      const num = Number(val);
      return isNaN(num) ? null : num;
    }
    return val;
  },
  z.union([
    z.literal(0),
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(5),
    z.literal(8),
    z.literal(13),
    z.literal(21),
  ]).nullable()
);

// Create task input validator
// projectId is required, featureId is optional (auto-assigned to Sustentation if empty)
export const createTaskSchema = z.object({
  projectId: uuidSchema,
  featureId: uuidSchema.nullable().optional(),
  title: z.string().min(3, 'Mínimo 3 caracteres').max(200, 'Máximo 200 caracteres'),
  description: z.string().max(10000).nullable().optional(),
  status: taskStatusSchema.default('BACKLOG'),
  type: taskTypeSchema.default('TASK'),
  priority: taskPrioritySchema.default('MEDIUM'),
  points: storyPointsSchema.optional(),
  modules: z.array(z.string().max(50)).max(10).optional().default([]),
  assigneeId: uuidSchema.nullable().optional(),
});

// Update task input validator
// IMPORTANTE: NÃO usar .partial() em createTaskSchema pois os defaults seriam aplicados
// Ex: enviar { status: 'TODO' } resultaria em { type: 'TASK', priority: 'MEDIUM', status: 'TODO' }
// Isso causaria sobrescrita indesejada de campos (bug crítico no Kanban drag-drop)
export const updateTaskSchema = z.object({
  title: z.string().min(3, 'Mínimo 3 caracteres').max(200, 'Máximo 200 caracteres').optional(),
  description: z.string().max(10000).nullable().optional(),
  type: taskTypeSchema.optional(),
  priority: taskPrioritySchema.optional(),
  points: storyPointsSchema.optional(),
  modules: z.array(z.string().max(50)).max(10).optional(),
  assigneeId: uuidSchema.nullable().optional(),
  featureId: uuidSchema.nullable().optional(),
  projectId: uuidSchema.optional(),
  status: taskStatusSchema.optional(),
  blocked: z.boolean().optional(),
  blockReason: z.string().trim().min(10, 'Motivo deve ter no mínimo 10 caracteres').max(500, 'Motivo muito longo').optional().nullable(),
});

// Create comment validator
export const createCommentSchema = z.object({
  taskId: uuidSchema,
  content: z.string().min(1, 'Comentário não pode ser vazio').max(10000),
});

// Helper to parse with error handling
export function safeParse<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  return result;
}
