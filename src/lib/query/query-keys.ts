import type { TaskFiltersState } from '@/components/features/tasks';

/**
 * Query Keys Factory
 * 
 * Centralized, type-safe query key definitions.
 * ALL keys include orgId as first element for multi-org isolation.
 * 
 * IMPORTANT: Always pass currentOrgId to prevent cross-org data leakage.
 * 
 * @example
 * // List with filters
 * queryKeys.tasks.list(orgId, { status: 'DOING' })
 * // => ['org', orgId, 'tasks', 'list', { status: 'DOING' }]
 * 
 * // Detail by ID
 * queryKeys.tasks.detail(orgId, 'uuid-123')
 * // => ['org', orgId, 'tasks', 'detail', 'uuid-123']
 */

// Helper to create org-scoped key
const orgKey = (orgId: string) => ['org', orgId] as const;

export const queryKeys = {
  // ============ TASKS ============
  tasks: {
    all: (orgId: string) => [...orgKey(orgId), 'tasks'] as const,
    lists: (orgId: string) => [...queryKeys.tasks.all(orgId), 'list'] as const,
    list: (orgId: string, filters?: Partial<TaskFiltersState>) =>
      [...queryKeys.tasks.lists(orgId), filters ?? {}] as const,
    details: (orgId: string) => [...queryKeys.tasks.all(orgId), 'detail'] as const,
    detail: (orgId: string, id: string) => [...queryKeys.tasks.details(orgId), id] as const,
  },

  // ============ PROJECTS ============
  projects: {
    all: (orgId: string) => [...orgKey(orgId), 'projects'] as const,
    lists: (orgId: string) => [...queryKeys.projects.all(orgId), 'list'] as const,
    list: (orgId: string) => [...queryKeys.projects.lists(orgId)] as const,
    details: (orgId: string) => [...queryKeys.projects.all(orgId), 'detail'] as const,
    detail: (orgId: string, id: string) => [...queryKeys.projects.details(orgId), id] as const,
  },

  // ============ EPICS ============
  epics: {
    all: (orgId: string) => [...orgKey(orgId), 'epics'] as const,
    lists: (orgId: string) => [...queryKeys.epics.all(orgId), 'list'] as const,
    list: (orgId: string, projectId: string) => [...queryKeys.epics.lists(orgId), projectId] as const,
    allList: (orgId: string) => [...queryKeys.epics.all(orgId), 'all'] as const,
    details: (orgId: string) => [...queryKeys.epics.all(orgId), 'detail'] as const,
    detail: (orgId: string, id: string) => [...queryKeys.epics.details(orgId), id] as const,
  },

  // ============ FEATURES ============
  features: {
    all: (orgId: string) => [...orgKey(orgId), 'features'] as const,
    lists: (orgId: string) => [...queryKeys.features.all(orgId), 'list'] as const,
    list: (orgId: string, epicId?: string) => [...queryKeys.features.lists(orgId), epicId] as const,
    allList: (orgId: string) => [...queryKeys.features.all(orgId), 'all'] as const,
    details: (orgId: string) => [...queryKeys.features.all(orgId), 'detail'] as const,
    detail: (orgId: string, id: string) => [...queryKeys.features.details(orgId), id] as const,
  },

  // ============ COMMENTS ============
  comments: {
    all: (orgId: string) => [...orgKey(orgId), 'comments'] as const,
    lists: (orgId: string) => [...queryKeys.comments.all(orgId), 'list'] as const,
    list: (orgId: string, taskId: string) => [...queryKeys.comments.lists(orgId), taskId] as const,
  },

  // ============ PROJECT DOCS ============
  projectDocs: {
    all: (orgId: string) => [...orgKey(orgId), 'projectDocs'] as const,
    lists: (orgId: string) => [...queryKeys.projectDocs.all(orgId), 'list'] as const,
    list: (orgId: string, projectId: string) => [...queryKeys.projectDocs.lists(orgId), projectId] as const,
    details: (orgId: string) => [...queryKeys.projectDocs.all(orgId), 'detail'] as const,
    detail: (orgId: string, id: string) => [...queryKeys.projectDocs.details(orgId), id] as const,
  },

  // ============ DOC TAGS ============
  docTags: {
    all: (orgId: string) => [...orgKey(orgId), 'docTags'] as const,
    lists: (orgId: string) => [...queryKeys.docTags.all(orgId), 'list'] as const,
    list: (orgId: string, projectId: string) => [...queryKeys.docTags.lists(orgId), projectId] as const,
    forDoc: (orgId: string, docId: string) => [...queryKeys.docTags.all(orgId), 'doc', docId] as const,
  },

  // ============ PROJECT NOTES ============
  projectNotes: {
    all: (orgId: string) => [...orgKey(orgId), 'projectNotes'] as const,
    lists: (orgId: string) => [...queryKeys.projectNotes.all(orgId), 'list'] as const,
    list: (orgId: string, projectId: string, status?: string) =>
      [...queryKeys.projectNotes.lists(orgId), projectId, status ?? 'all'] as const,
    details: (orgId: string) => [...queryKeys.projectNotes.all(orgId), 'detail'] as const,
    detail: (orgId: string, id: string) => [...queryKeys.projectNotes.details(orgId), id] as const,
  },

  // ============ USERS ============
  users: {
    all: (orgId: string) => [...orgKey(orgId), 'users'] as const,
    list: (orgId: string) => [...queryKeys.users.all(orgId), 'list'] as const,
    current: () => ['users', 'current'] as const, // Global - no org scope needed
  },

  // ============ DASHBOARD ============
  dashboard: {
    all: (orgId: string) => [...orgKey(orgId), 'dashboard'] as const,
    myTasks: (orgId: string, includeDone?: boolean, teamView?: boolean) =>
      [...queryKeys.dashboard.all(orgId), 'myTasks', includeDone ?? false, teamView ?? false] as const,
    activeProjects: (orgId: string) => [...queryKeys.dashboard.all(orgId), 'activeProjects'] as const,
    activity: (orgId: string, hours?: number) =>
      [...queryKeys.dashboard.all(orgId), 'activity', hours ?? 24] as const,
  },

  // ============ TASK TAGS ============
  taskTags: {
    all: (orgId: string) => [...orgKey(orgId), 'taskTags'] as const,
    list: (orgId: string) => [...queryKeys.taskTags.all(orgId), 'list'] as const,
  },

  // ============ AI ============
  ai: {
    all: (orgId: string) => [...orgKey(orgId), 'ai'] as const,
    summary: (orgId: string, projectId: string) => [...queryKeys.ai.all(orgId), 'summary', projectId] as const,
  },

  // ============ INVITES ============
  invites: {
    all: (orgId: string) => [...orgKey(orgId), 'invites'] as const,
    list: (orgId: string) => [...queryKeys.invites.all(orgId), 'list'] as const,
  },
} as const;

// Type helper for extracting query key types
export type QueryKeys = typeof queryKeys;

