import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildAgentChatSystemPrompt, buildAgentChatTools } from './tools';
import { InternalAgentApiClient } from './internal-api';

const context = {
  tenantId: 'tenant-1',
  userId: 'user-1',
  role: 'OWNER' as const,
  orgName: 'Fluxo',
  orgSlug: 'fluxo',
  userDisplayName: 'Koike',
  origin: 'https://fluxo.test',
  cookieHeader: null,
  agentRolePrompt: '',
};

function getTool(name: string) {
  const tool = buildAgentChatTools(context).find((candidate) => candidate.name === name);

  expect(tool).toBeDefined();

  return tool as {
    execute: (args: Record<string, unknown>) => Promise<unknown>;
  };
}

describe('agent-chat/tools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('includes instructions for discovery and safe tool usage', () => {
    const prompt = buildAgentChatSystemPrompt(context);

    expect(prompt).toContain('Quando o usuário não souber IDs');
    expect(prompt).toContain('list_users');
    expect(prompt).toContain('list_task_tags');
    expect(prompt).toContain('bulk_update_features');
  });

  it('ships the discovery and tagging tools needed for conversational usage', () => {
    const toolNames = buildAgentChatTools(context).map((tool) => tool.name);

    expect(toolNames).toContain('list_users');
    expect(toolNames).toContain('list_task_tags');
    expect(toolNames).toContain('get_task_tags');
    expect(toolNames).toContain('set_task_tags');
    expect(toolNames).toContain('bulk_update_features');
  });

  it('updates a feature by title when the model does not provide the id', async () => {
    const resolveFeatureId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveFeatureId')
      .mockResolvedValue('feature-123');
    const patch = vi
      .spyOn(InternalAgentApiClient.prototype, 'patch')
      .mockResolvedValue({ id: 'feature-123', status: 'DONE' });

    const updateFeature = getTool('update_feature');

    const result = await updateFeature.execute({
      featureTitle: 'Checkout v2',
      status: 'DONE',
    });

    expect(resolveFeatureId).toHaveBeenCalledWith('Checkout v2', undefined);
    expect(patch).toHaveBeenCalledWith('/api/features/feature-123', { status: 'DONE' });
    expect(result).toEqual({ id: 'feature-123', status: 'DONE' });

    resolveFeatureId.mockRestore();
    patch.mockRestore();
  });

  it('updates multiple features in bulk using titles', async () => {
    const resolveFeatureId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveFeatureId')
      .mockResolvedValueOnce('feature-1')
      .mockResolvedValueOnce('feature-2');
    const patch = vi
      .spyOn(InternalAgentApiClient.prototype, 'patch')
      .mockResolvedValueOnce({ id: 'feature-1', status: 'DONE' })
      .mockResolvedValueOnce({ id: 'feature-2', status: 'DONE' });

    const bulkUpdateFeatures = getTool('bulk_update_features');

    const result = await bulkUpdateFeatures.execute({
      items: [
        { featureTitle: 'Checkout v2' },
        { featureTitle: 'Billing API' },
      ],
      status: 'DONE',
    });

    expect(resolveFeatureId).toHaveBeenNthCalledWith(1, 'Checkout v2', undefined);
    expect(resolveFeatureId).toHaveBeenNthCalledWith(2, 'Billing API', undefined);
    expect(patch).toHaveBeenNthCalledWith(1, '/api/features/feature-1', { status: 'DONE' });
    expect(patch).toHaveBeenNthCalledWith(2, '/api/features/feature-2', { status: 'DONE' });
    expect(result).toEqual({
      count: 2,
      features: [
        { id: 'feature-1', status: 'DONE' },
        { id: 'feature-2', status: 'DONE' },
      ],
    });

    resolveFeatureId.mockRestore();
    patch.mockRestore();
  });

  it('loads an epic by title and project name when the model does not provide ids', async () => {
    const resolveProjectId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveProjectId')
      .mockResolvedValue('project-123');
    const resolveEpicId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveEpicId')
      .mockResolvedValue('epic-123');
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValueOnce({ id: 'epic-123', title: 'Growth' })
      .mockResolvedValueOnce([{ id: 'feature-1', title: 'Signup v2' }]);

    const getEpic = getTool('get_epic');

    const result = await getEpic.execute({
      epicTitle: 'Growth',
      projectName: 'Fluxo Core',
    });

    expect(resolveProjectId).toHaveBeenCalledWith('Fluxo Core');
    expect(resolveEpicId).toHaveBeenCalledWith('Growth', 'project-123');
    expect(get).toHaveBeenNthCalledWith(1, '/api/epics/epic-123');
    expect(get).toHaveBeenNthCalledWith(2, '/api/epics/epic-123/features');
    expect(result).toEqual({
      id: 'epic-123',
      title: 'Growth',
      features: [{ id: 'feature-1', title: 'Signup v2' }],
    });

    resolveProjectId.mockRestore();
    resolveEpicId.mockRestore();
    get.mockRestore();
  });

  it('creates a task using project and feature titles when ids are missing', async () => {
    const resolveProjectId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveProjectId')
      .mockResolvedValue('project-123');
    const resolveEpicId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveEpicId')
      .mockResolvedValue('epic-123');
    const resolveFeatureId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveFeatureId')
      .mockResolvedValue('feature-123');
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue({ epic: { project: { id: 'project-123' } } });
    const post = vi
      .spyOn(InternalAgentApiClient.prototype, 'post')
      .mockResolvedValue({ id: 'task-123', title: 'Corrigir fluxo' });

    const createTask = getTool('create_task');

    const result = await createTask.execute({
      title: 'Corrigir fluxo',
      featureTitle: 'Checkout v2',
      epicTitle: 'Growth',
      projectName: 'Fluxo Core',
      priority: 'HIGH',
    });

    expect(resolveProjectId).toHaveBeenCalledWith('Fluxo Core');
    expect(resolveEpicId).toHaveBeenCalledWith('Growth', 'project-123');
    expect(resolveFeatureId).toHaveBeenCalledWith('Checkout v2', 'epic-123');
    expect(get).toHaveBeenCalledWith('/api/features/feature-123');
    expect(post).toHaveBeenCalledWith('/api/tasks', {
      title: 'Corrigir fluxo',
      projectId: 'project-123',
      featureId: 'feature-123',
      priority: 'HIGH',
    });
    expect(result).toEqual({ id: 'task-123', title: 'Corrigir fluxo' });

    resolveProjectId.mockRestore();
    resolveEpicId.mockRestore();
    resolveFeatureId.mockRestore();
    get.mockRestore();
    post.mockRestore();
  });

  it('loads a document by title and project name', async () => {
    const resolveProjectId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveProjectId')
      .mockResolvedValue('project-123');
    const resolveDocId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveDocId')
      .mockResolvedValue('doc-123');
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue({ id: 'doc-123', title: 'PRD' });

    const getDoc = getTool('get_doc');

    const result = await getDoc.execute({
      docTitle: 'PRD',
      projectName: 'Fluxo Core',
    });

    expect(resolveProjectId).toHaveBeenCalledWith('Fluxo Core');
    expect(resolveDocId).toHaveBeenCalledWith('PRD', 'project-123');
    expect(get).toHaveBeenCalledWith('/api/docs/doc-123');
    expect(result).toEqual({ id: 'doc-123', title: 'PRD' });

    resolveProjectId.mockRestore();
    resolveDocId.mockRestore();
    get.mockRestore();
  });

  it('supports bulk task updates with taskIds alias', async () => {
    const resolveTaskId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskId')
      .mockResolvedValueOnce('task-1')
      .mockResolvedValueOnce('task-2');
    const patch = vi
      .spyOn(InternalAgentApiClient.prototype, 'patch')
      .mockResolvedValueOnce({ id: 'task-1', status: 'DONE' })
      .mockResolvedValueOnce({ id: 'task-2', status: 'DONE' });

    const bulkUpdateTasks = getTool('bulk_update_tasks');

    const result = await bulkUpdateTasks.execute({
      taskIds: ['JKILL-1', 'JKILL-2'],
      status: 'DONE',
    });

    expect(resolveTaskId).toHaveBeenNthCalledWith(1, 'JKILL-1');
    expect(resolveTaskId).toHaveBeenNthCalledWith(2, 'JKILL-2');
    expect(patch).toHaveBeenNthCalledWith(1, '/api/tasks/task-1', { status: 'DONE' });
    expect(patch).toHaveBeenNthCalledWith(2, '/api/tasks/task-2', { status: 'DONE' });
    expect(result).toEqual({
      count: 2,
      tasks: [
        { id: 'task-1', status: 'DONE' },
        { id: 'task-2', status: 'DONE' },
      ],
    });

    resolveTaskId.mockRestore();
    patch.mockRestore();
  });

  it('coerces comma-separated task ids in bulk updates', async () => {
    const resolveTaskId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskId')
      .mockResolvedValueOnce('task-1')
      .mockResolvedValueOnce('task-2');
    const patch = vi
      .spyOn(InternalAgentApiClient.prototype, 'patch')
      .mockResolvedValueOnce({ id: 'task-1', blocked: true })
      .mockResolvedValueOnce({ id: 'task-2', blocked: true });

    const bulkUpdateTasks = getTool('bulk_update_tasks');
    const result = await bulkUpdateTasks.execute({
      ids: 'JKILL-1, JKILL-2',
      blocked: 'true',
    });

    expect(resolveTaskId).toHaveBeenNthCalledWith(1, 'JKILL-1');
    expect(resolveTaskId).toHaveBeenNthCalledWith(2, 'JKILL-2');
    expect(patch).toHaveBeenNthCalledWith(1, '/api/tasks/task-1', { blocked: true });
    expect(patch).toHaveBeenNthCalledWith(2, '/api/tasks/task-2', { blocked: true });
    expect(result).toEqual({
      count: 2,
      tasks: [
        { id: 'task-1', blocked: true },
        { id: 'task-2', blocked: true },
      ],
    });

    resolveTaskId.mockRestore();
    patch.mockRestore();
  });

  it('coerces string boolean and JSON-string array in block_tasks', async () => {
    const resolveTaskId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskId')
      .mockResolvedValue('task-123');
    const patch = vi
      .spyOn(InternalAgentApiClient.prototype, 'patch')
      .mockResolvedValue({ id: 'task-123', blocked: false });

    const blockTasks = getTool('block_tasks');
    const result = await blockTasks.execute({
      ids: '["JKILL-9"]',
      blocked: 'false',
    });

    expect(resolveTaskId).toHaveBeenCalledWith('JKILL-9');
    expect(patch).toHaveBeenCalledWith('/api/tasks/task-123', { blocked: false });
    expect(result).toEqual({
      count: 1,
      blocked: false,
      tasks: [{ id: 'task-123', blocked: false }],
    });

    resolveTaskId.mockRestore();
    patch.mockRestore();
  });

  it('sets task tags using tag names and infers the project from the task', async () => {
    const resolveTaskId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskId')
      .mockResolvedValue('task-123');
    const getTaskProjectId = vi
      .spyOn(InternalAgentApiClient.prototype, 'getTaskProjectId')
      .mockResolvedValue('project-123');
    const resolveTaskTagId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskTagId')
      .mockResolvedValueOnce('tag-1')
      .mockResolvedValueOnce('tag-2');
    const put = vi
      .spyOn(InternalAgentApiClient.prototype, 'put')
      .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]);

    const setTaskTags = getTool('set_task_tags');

    const result = await setTaskTags.execute({
      taskId: 'JKILL-1',
      tagNames: ['blocked', 'backend'],
    });

    expect(resolveTaskId).toHaveBeenCalledWith('JKILL-1');
    expect(getTaskProjectId).toHaveBeenCalledWith('task-123');
    expect(resolveTaskTagId).toHaveBeenNthCalledWith(1, 'project-123', 'blocked');
    expect(resolveTaskTagId).toHaveBeenNthCalledWith(2, 'project-123', 'backend');
    expect(put).toHaveBeenCalledWith('/api/tasks/task-123/tags', { tagIds: ['tag-1', 'tag-2'] });
    expect(result).toEqual([{ id: 'tag-1' }, { id: 'tag-2' }]);

    resolveTaskId.mockRestore();
    getTaskProjectId.mockRestore();
    resolveTaskTagId.mockRestore();
    put.mockRestore();
  });

  it('coerces tagNames from JSON string when setting task tags', async () => {
    const resolveTaskId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskId')
      .mockResolvedValue('task-123');
    const getTaskProjectId = vi
      .spyOn(InternalAgentApiClient.prototype, 'getTaskProjectId')
      .mockResolvedValue('project-123');
    const resolveTaskTagId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskTagId')
      .mockResolvedValueOnce('tag-1')
      .mockResolvedValueOnce('tag-2');
    const put = vi
      .spyOn(InternalAgentApiClient.prototype, 'put')
      .mockResolvedValue([{ id: 'tag-1' }, { id: 'tag-2' }]);

    const setTaskTags = getTool('set_task_tags');
    const result = await setTaskTags.execute({
      readableId: 'JKILL-1',
      tagNames: '["blocked","backend"]',
    });

    expect(resolveTaskId).toHaveBeenCalledWith('JKILL-1');
    expect(getTaskProjectId).toHaveBeenCalledWith('task-123');
    expect(resolveTaskTagId).toHaveBeenNthCalledWith(1, 'project-123', 'blocked');
    expect(resolveTaskTagId).toHaveBeenNthCalledWith(2, 'project-123', 'backend');
    expect(put).toHaveBeenCalledWith('/api/tasks/task-123/tags', { tagIds: ['tag-1', 'tag-2'] });
    expect(result).toEqual([{ id: 'tag-1' }, { id: 'tag-2' }]);

    resolveTaskId.mockRestore();
    getTaskProjectId.mockRestore();
    resolveTaskTagId.mockRestore();
    put.mockRestore();
  });

  it('gets task tags using readableId alias', async () => {
    const resolveTaskId = vi
      .spyOn(InternalAgentApiClient.prototype, 'resolveTaskId')
      .mockResolvedValue('task-123');
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue([{ id: 'tag-1', name: 'blocked' }]);

    const getTaskTags = getTool('get_task_tags');

    const result = await getTaskTags.execute({
      readableId: 'JKILL-1',
    });

    expect(resolveTaskId).toHaveBeenCalledWith('JKILL-1');
    expect(get).toHaveBeenCalledWith('/api/tasks/task-123/tags');
    expect(result).toEqual([{ id: 'tag-1', name: 'blocked' }]);

    resolveTaskId.mockRestore();
    get.mockRestore();
  });

  it('lists all organization members', async () => {
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue([
        { id: 'u-1', displayName: 'Guilherme', email: 'g@test.com', role: 'OWNER' },
        { id: 'u-2', displayName: 'Gepeto', email: 'gepeto@test.com', role: 'MEMBER' },
      ]);

    const listMembers = getTool('list_members');
    const result: any = await listMembers.execute({});

    expect(get).toHaveBeenCalledWith('/api/users');
    expect(result).toHaveLength(2);
    expect(result[0].displayName).toBe('Guilherme');

    get.mockRestore();
  });

  it('searches members by partial name (case-insensitive)', async () => {
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue([
        { id: 'u-1', displayName: 'Guilherme', email: 'g@test.com' },
      ]);

    const searchMember = getTool('search_member');
    const result: any = await searchMember.execute({ name: 'gui' });

    expect(get).toHaveBeenCalledWith('/api/users', { search: 'gui' });
    expect(result.members).toHaveLength(1);
    expect(result.members[0].id).toBe('u-1');

    get.mockRestore();
  });

  it('searches members by email when name does not match', async () => {
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue([
        { id: 'u-2', displayName: 'Dev Bot', email: 'dev@fluxo.com' },
      ]);

    const searchMember = getTool('search_member');
    const result: any = await searchMember.execute({ name: 'dev@fluxo' });

    expect(get).toHaveBeenCalledWith('/api/users', { search: 'dev@fluxo' });
    expect(result.members).toHaveLength(1);
    expect(result.members[0].displayName).toBe('Dev Bot');

    get.mockRestore();
  });

  it('returns empty array when no member matches search', async () => {
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue([]);

    const searchMember = getTool('search_member');
    const result: any = await searchMember.execute({ name: 'xyz' });

    expect(get).toHaveBeenCalledWith('/api/users', { search: 'xyz' });
    expect(result.members).toHaveLength(0);
    expect(result.message).toContain('xyz');

    get.mockRestore();
  });

  it('lists tasks of the current user excluding DONE by default', async () => {
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue({ items: [{ id: 't-1', title: 'Fix bug' }], total: 1 });

    const myTasks = getTool('my_tasks');
    const result: any = await myTasks.execute({ includeDone: false, limit: 25 });

    expect(get).toHaveBeenCalledWith('/api/dashboard/my-tasks', {
      limit: 25,
      includeDone: 'false',
    });
    expect(result.items).toHaveLength(1);

    get.mockRestore();
  });

  it('includes DONE tasks when includeDone is true', async () => {
    const get = vi
      .spyOn(InternalAgentApiClient.prototype, 'get')
      .mockResolvedValue({ items: [{ id: 't-1', title: 'Old task', status: 'DONE' }], total: 1 });

    const myTasks = getTool('my_tasks');
    const result = await myTasks.execute({ includeDone: true, limit: 10 });

    expect(get).toHaveBeenCalledWith('/api/dashboard/my-tasks', {
      limit: 10,
      includeDone: 'true',
    });

    get.mockRestore();
  });
});
