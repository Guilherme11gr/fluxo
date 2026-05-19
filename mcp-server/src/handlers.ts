/**
 * MCP Tool Handlers - Execute API calls for each tool
 */

import { apiRequest, formatResponse, formatError, ApiError, resolveTaskId } from './api-client.js';

type ToolArgs = Record<string, unknown>;

// Helper to extract changeReason for _metadata
function extractMetadata(args: ToolArgs): { changeReason?: string } {
  const { changeReason } = args;
  if (changeReason && typeof changeReason === 'string') {
    return { changeReason };
  }
  return {};
}

// ============================================================
// TASKS HANDLERS
// ============================================================

export async function handleListTasks(args: ToolArgs): Promise<string> {
  try {
    const response = await apiRequest('GET', '/tasks', undefined, {
      featureId: args.featureId as string,
      epicId: args.epicId as string,
      projectId: args.projectId as string,
      assigneeId: args.assigneeId as string,
      tagId: args.tagId as string,
      status: args.status as string,
      priority: args.priority as string,
      type: args.type as string,
      blocked: args.blocked as boolean,
      search: args.search as string,
      limit: args.limit as number,
    });

    const tasks = response.data as Array<{ readableId: string; title: string; status: string }>;
    const summary = `✅ Found ${response.meta?.total || tasks.length} tasks`;
    return formatResponse(response.data, summary);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleGetTask(args: ToolArgs): Promise<string> {
  try {
    const id = await resolveTaskId(args.id as string);
    const response = await apiRequest('GET', `/tasks/${id}`);
    const task = response.data as { readableId: string; title: string; status: string };
    return formatResponse(response.data, `✅ Task ${task.readableId}: "${task.title}" (${task.status})`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleCreateTask(args: ToolArgs): Promise<string> {
  try {
    const body = {
      title: args.title,
      featureId: args.featureId,
      description: args.description,
      type: args.type,
      priority: args.priority,
      status: args.status,
      assigneeId: args.assigneeId,
      _metadata: { changeReason: 'Created via MCP' },
    };
    const response = await apiRequest('POST', '/tasks', body);
    const task = response.data as { readableId?: string; localId?: number; title: string };
    const taskId = task.readableId || `#${task.localId}` || 'new task';
    return formatResponse(response.data, `✅ Task ${taskId} created: "${task.title}"`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleUpdateTask(args: ToolArgs): Promise<string> {
  try {
    const id = await resolveTaskId(args.id as string);
    const { changeReason, ...updateFields } = args;
    delete updateFields.id;

    const body = {
      ...updateFields,
      _metadata: { changeReason: changeReason || 'Updated via MCP' },
    };

    const response = await apiRequest('PATCH', `/tasks/${id}`, body);
    const task = response.data as { readableId: string; title: string; status: string };
    return formatResponse(response.data, `✅ Task ${task.readableId} updated: "${task.title}" → ${task.status}`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleDeleteTask(args: ToolArgs): Promise<string> {
  try {
    const id = await resolveTaskId(args.id as string);
    const taskResponse = await apiRequest<{ readableId: string }>('GET', `/tasks/${id}`);
    const readableId = taskResponse.data?.readableId || id;
    await apiRequest('DELETE', `/tasks/${id}`);
    return `✅ Task ${readableId} deleted permanently`;
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleBulkUpdateTasks(args: ToolArgs): Promise<string> {
  try {
    const { ids, changeReason, ...updateFields } = args;
    const body = {
      ids,
      update: updateFields,
      _metadata: { changeReason: changeReason || 'Bulk update via MCP' },
    };
    const response = await apiRequest('PATCH', '/tasks/bulk', body);
    return formatResponse(response.data, `✅ ${(ids as string[]).length} tasks updated`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleBlockTasks(args: ToolArgs): Promise<string> {
  try {
    const body = {
      ids: args.ids,
      blocked: args.blocked,
      _metadata: { changeReason: args.changeReason || (args.blocked ? 'Blocked via MCP' : 'Unblocked via MCP') },
    };
    const response = await apiRequest('PATCH', '/tasks/block', body);
    const action = args.blocked ? 'blocked' : 'unblocked';
    return formatResponse(response.data, `✅ ${(args.ids as string[]).length} tasks ${action}`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleAddTaskComment(args: ToolArgs): Promise<string> {
  try {
    const taskId = await resolveTaskId(args.taskId as string);
    const body = {
      content: args.content,
    };
    const response = await apiRequest('POST', `/tasks/${taskId}/comments`, body);
    return formatResponse(response.data, '✅ Comment added');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleListTaskComments(args: ToolArgs): Promise<string> {
  try {
    const taskId = await resolveTaskId(args.taskId as string);
    const response = await apiRequest('GET', `/tasks/${taskId}/comments`);
    const comments = response.data as unknown[];
    return formatResponse(response.data, `✅ Found ${comments.length} comments`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

// ============================================================
// FEATURES HANDLERS
// ============================================================

export async function handleListFeatures(args: ToolArgs): Promise<string> {
  try {
    const response = await apiRequest('GET', '/features', undefined, {
      epicId: args.epicId as string,
      status: args.status as string,
      limit: args.limit as number,
    });
    const features = response.data as unknown[];
    return formatResponse(response.data, `✅ Found ${features.length} features`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleGetFeature(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const response = await apiRequest('GET', `/features/${id}`);
    return formatResponse(response.data, '✅ Feature details:');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleCreateFeature(args: ToolArgs): Promise<string> {
  try {
    const body = {
      title: args.title,
      epicId: args.epicId,
      description: args.description,
      status: args.status,
      _metadata: { changeReason: 'Created via MCP' },
    };
    const response = await apiRequest('POST', '/features', body);
    const feature = response.data as { title: string };
    return formatResponse(response.data, `✅ Feature created: "${feature.title}"`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleUpdateFeature(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const { id: _, ...updateFields } = args;
    const body = {
      ...updateFields,
      _metadata: { changeReason: 'Updated via MCP' },
    };
    const response = await apiRequest('PATCH', `/features/${id}`, body);
    return formatResponse(response.data, '✅ Feature updated');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleDeleteFeature(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    await apiRequest('DELETE', `/features/${id}`);
    return `✅ Feature ${id} deleted permanently`;
  } catch (error) {
    return formatError(error as ApiError);
  }
}

// ============================================================
// EPICS HANDLERS
// ============================================================

export async function handleListEpics(args: ToolArgs): Promise<string> {
  try {
    const response = await apiRequest('GET', '/epics', undefined, {
      projectId: args.projectId as string,
      status: args.status as string,
      limit: args.limit as number,
    });
    const epics = response.data as unknown[];
    return formatResponse(response.data, `✅ Found ${epics.length} epics`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleGetEpic(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const response = await apiRequest('GET', `/epics/${id}`);
    return formatResponse(response.data, '✅ Epic details:');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleGetEpicFull(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const response = await apiRequest('GET', `/epics/${id}/full`);
    const data = response.data as { stats: { totalFeatures: number; totalTasks: number } };
    return formatResponse(response.data, `✅ Epic full context (${data.stats.totalFeatures} features, ${data.stats.totalTasks} tasks):`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

// ============================================================
// PROJECTS HANDLERS
// ============================================================

export async function handleListProjects(): Promise<string> {
  try {
    const response = await apiRequest('GET', '/projects');
    const projects = response.data as unknown[];
    return formatResponse(response.data, `✅ Found ${projects.length} projects`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

// ============================================================
// DOCS HANDLERS
// ============================================================

export async function handleListDocs(args: ToolArgs): Promise<string> {
  try {
    const response = await apiRequest('GET', '/docs', undefined, {
      projectId: args.projectId as string,
      limit: args.limit as number,
    });
    const docs = response.data as unknown[];
    return formatResponse(response.data, `✅ Found ${docs.length} docs`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleGetDoc(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const response = await apiRequest('GET', `/docs/${id}`);
    return formatResponse(response.data, '✅ Doc content:');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleCreateDoc(args: ToolArgs): Promise<string> {
  try {
    const body = {
      title: args.title,
      projectId: args.projectId,
      content: args.content,
      _metadata: { changeReason: 'Created via MCP' },
    };
    const response = await apiRequest('POST', '/docs', body);
    const doc = response.data as { title: string };
    return formatResponse(response.data, `✅ Doc created: "${doc.title}"`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleUpdateDoc(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const { id: _, ...updateFields } = args;
    const body = {
      ...updateFields,
      _metadata: { changeReason: 'Updated via MCP' },
    };
    const response = await apiRequest('PATCH', `/docs/${id}`, body);
    return formatResponse(response.data, '✅ Doc updated');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleDeleteDoc(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    await apiRequest('DELETE', `/docs/${id}`);
    return `✅ Doc ${id} deleted`;
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleSearchDocs(args: ToolArgs): Promise<string> {
  try {
    const response = await apiRequest('GET', '/docs/search', undefined, {
      q: args.query as string,
      projectId: args.projectId as string,
      limit: args.limit as number,
    });
    const results = response.data as Array<{ title: string; snippet: string; rank: number }>;
    if (results.length === 0) {
      return `No docs found for "${args.query}"`;
    }
    const summary = results
      .map((r, i) => `${i + 1}. ${r.title} (rank: ${r.rank.toFixed(2)})\n   ${r.snippet}`)
      .join('\n\n');
    return `Found ${results.length} docs for "${args.query}":\n\n${summary}`;
  } catch (error) {
    return formatError(error as ApiError);
  }
}

// ============================================================
// TAGS HANDLERS
// ============================================================

export async function handleListTags(args: ToolArgs): Promise<string> {
  try {
    const response = await apiRequest('GET', '/tags', undefined, {
      projectId: args.projectId as string,
      limit: args.limit as number,
    });
    const tags = response.data as unknown[];
    return formatResponse(response.data, `✅ Found ${tags.length} tags`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleGetTag(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const response = await apiRequest('GET', `/tags/${id}`);
    return formatResponse(response.data, '✅ Tag details:');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleCreateTag(args: ToolArgs): Promise<string> {
  try {
    const body = {
      name: args.name,
      projectId: args.projectId,
      _metadata: { changeReason: 'Created via MCP' },
    };
    const response = await apiRequest('POST', '/tags', body);
    const tag = response.data as { name: string };
    return formatResponse(response.data, `✅ Tag created: "${tag.name}"`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleDeleteTag(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    await apiRequest('DELETE', `/tags/${id}`);
    return `✅ Tag ${id} deleted`;
  } catch (error) {
    return formatError(error as ApiError);
  }
}

// ============================================================
// PERSONAL BOARD HANDLERS
// ============================================================

export async function handleGetBoard(): Promise<string> {
  try {
    const response = await apiRequest('GET', '/board');
    const data = response.data as { columns: unknown[] };
    const columns = data?.columns || [];
    return formatResponse(response.data, `✅ Board loaded (${columns.length} columns)`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleCreateBoardColumn(args: ToolArgs): Promise<string> {
  try {
    const body = {
      title: args.title,
      color: args.color,
    };
    const response = await apiRequest('POST', '/board/columns', body);
    const column = response.data as { title: string };
    return formatResponse(response.data, `✅ Column created: "${column.title}"`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleUpdateBoardColumn(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const { id: _, ...updateFields } = args;
    const response = await apiRequest('PATCH', `/board/columns/${id}`, updateFields);
    return formatResponse(response.data, '✅ Column updated');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleDeleteBoardColumn(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    await apiRequest('DELETE', `/board/columns/${id}`);
    return `✅ Column ${id} deleted (cascade)`;
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleCreateBoardItem(args: ToolArgs): Promise<string> {
  try {
    const columnId = args.columnId as string;
    const body = {
      title: args.title,
      description: args.description,
      priority: args.priority,
      dueDate: args.dueDate,
    };
    const response = await apiRequest('POST', `/board/columns/${columnId}/items`, body);
    const item = response.data as { title: string };
    return formatResponse(response.data, `✅ Item created: "${item.title}"`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleUpdateBoardItem(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    const { id: _, ...updateFields } = args;
    const response = await apiRequest('PATCH', `/board/items/${id}`, updateFields);
    return formatResponse(response.data, '✅ Item updated');
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleDeleteBoardItem(args: ToolArgs): Promise<string> {
  try {
    const id = args.id as string;
    await apiRequest('DELETE', `/board/items/${id}`);
    return `✅ Item ${id} deleted`;
  } catch (error) {
    return formatError(error as ApiError);
  }
}

export async function handleReorderBoard(args: ToolArgs): Promise<string> {
  try {
    const body = {
      columns: args.columns,
      items: args.items,
    };
    const response = await apiRequest('POST', '/board/reorder', body);
    const cols = (args.columns as unknown[])?.length || 0;
    const items = (args.items as unknown[])?.length || 0;
    return formatResponse(response.data, `✅ Board reordered (${cols} columns, ${items} items)`);
  } catch (error) {
    return formatError(error as ApiError);
  }
}

// ============================================================
// ROUTER - Maps tool names to handlers
// ============================================================

type Handler = (args: ToolArgs) => Promise<string>;

export const TOOL_HANDLERS: Record<string, Handler> = {
  // Tasks
  list_tasks: handleListTasks,
  get_task: handleGetTask,
  create_task: handleCreateTask,
  update_task: handleUpdateTask,
  delete_task: handleDeleteTask,
  bulk_update_tasks: handleBulkUpdateTasks,
  block_tasks: handleBlockTasks,
  add_task_comment: handleAddTaskComment,
  list_task_comments: handleListTaskComments,
  // Features
  list_features: handleListFeatures,
  get_feature: handleGetFeature,
  create_feature: handleCreateFeature,
  update_feature: handleUpdateFeature,
  delete_feature: handleDeleteFeature,
  // Epics
  list_epics: handleListEpics,
  get_epic: handleGetEpic,
  get_epic_full: handleGetEpicFull,
  // Projects
  list_projects: handleListProjects,
  // Docs
  list_docs: handleListDocs,
  get_doc: handleGetDoc,
  create_doc: handleCreateDoc,
  update_doc: handleUpdateDoc,
  delete_doc: handleDeleteDoc,
  search_docs: handleSearchDocs,
  // Tags
  list_tags: handleListTags,
  get_tag: handleGetTag,
  create_tag: handleCreateTag,
  delete_tag: handleDeleteTag,
  // Personal Board
  get_board: handleGetBoard,
  create_board_column: handleCreateBoardColumn,
  update_board_column: handleUpdateBoardColumn,
  delete_board_column: handleDeleteBoardColumn,
  create_board_item: handleCreateBoardItem,
  update_board_item: handleUpdateBoardItem,
  delete_board_item: handleDeleteBoardItem,
  reorder_board: handleReorderBoard,
};
