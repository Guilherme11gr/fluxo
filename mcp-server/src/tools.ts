/**
 * MCP Tool Definitions for JT-Kill Agent API
 * All 26 tools covering the complete API surface
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';

// ============================================================
// TASKS (9 tools)
// ============================================================

export const listTasksTool: Tool = {
  name: 'list_tasks',
  description: `List tasks with powerful filtering. Use this to find tasks by status, feature, epic, project, assignee, or search text.

Common use cases:
- Find my current work: status=DOING, assigneeId=<your-id>
- Find blocked tasks: blocked=true
- Search by ID: search=JKILL-123
- Find tasks in a feature: featureId=<uuid>`,
  inputSchema: {
    type: 'object',
    properties: {
      featureId: { type: 'string', format: 'uuid', description: 'Filter by feature UUID' },
      epicId: { type: 'string', format: 'uuid', description: 'Filter by epic UUID' },
      projectId: { type: 'string', format: 'uuid', description: 'Filter by project UUID' },
      assigneeId: { type: 'string', format: 'uuid', description: 'Filter by assignee UUID' },
      tagId: { type: 'string', format: 'uuid', description: 'Filter by tag UUID' },
      status: {
        type: 'string',
        enum: ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'],
        description: 'Filter by status'
      },
      priority: {
        type: 'string',
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        description: 'Filter by priority'
      },
      type: {
        type: 'string',
        enum: ['TASK', 'BUG'],
        description: 'Filter by type'
      },
      blocked: { type: 'boolean', description: 'Filter blocked tasks only' },
      search: { type: 'string', description: 'Search by title, description, or readable ID (e.g., JKILL-123)' },
      limit: { type: 'number', description: 'Max results (default: 50, max: 100)' },
    },
  },
};

export const getTaskTool: Tool = {
  name: 'get_task',
  description: 'Get detailed information about a specific task by UUID or readable ID (e.g., JKILL-123)',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task UUID or readable ID (e.g., JKILL-123)' },
    },
    required: ['id'],
  },
};

export const createTaskTool: Tool = {
  name: 'create_task',
  description: `Create a new task in a feature.

REQUIRED: title and featureId
OPTIONAL: description (markdown), type, priority, status, assigneeId`,
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Task title (required)' },
      featureId: { type: 'string', format: 'uuid', description: 'Feature UUID (required)' },
      description: { type: 'string', description: 'Markdown description' },
      type: { type: 'string', enum: ['TASK', 'BUG'], default: 'TASK' },
      priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
      status: { type: 'string', enum: ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'], default: 'BACKLOG' },
      assigneeId: { type: 'string', format: 'uuid', description: 'Assignee UUID' },
    },
    required: ['title', 'featureId'],
  },
};

export const updateTaskTool: Tool = {
  name: 'update_task',
  description: `Update a task. Use for:
- Moving status (TODO → DOING → REVIEW → DONE)
- Updating description with implementation details
- Assigning/unassigning
- Blocking/unblocking

IMPORTANT: When moving to DONE, ensure quality gates passed first!`,
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task UUID or readable ID' },
      title: { type: 'string' },
      description: { type: 'string', description: 'Markdown description - append implementation details!' },
      type: { type: 'string', enum: ['TASK', 'BUG'] },
      priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      status: { type: 'string', enum: ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'] },
      assigneeId: { type: ['string', 'null'], description: 'UUID or null to unassign' },
      blocked: { type: 'boolean' },
      changeReason: { type: 'string', description: 'Why are you making this change? (for audit)' },
    },
    required: ['id'],
  },
};

export const deleteTaskTool: Tool = {
  name: 'delete_task',
  description: '⚠️ DANGER: Permanently delete a task. Use with caution!',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', description: 'Task UUID or readable ID' },
    },
    required: ['id'],
  },
};

export const bulkUpdateTasksTool: Tool = {
  name: 'bulk_update_tasks',
  description: `Update multiple tasks at once. Useful for:
- Moving all tasks in a feature to a new status
- Reassigning multiple tasks
- Bulk priority changes`,
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of task UUIDs'
      },
      status: { type: 'string', enum: ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'] },
      priority: { type: 'string', enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] },
      type: { type: 'string', enum: ['TASK', 'BUG'] },
      blocked: { type: 'boolean' },
      assigneeId: { type: ['string', 'null'] },
      changeReason: { type: 'string', description: 'Why bulk update? (for audit)' },
    },
    required: ['ids'],
  },
};

export const blockTasksTool: Tool = {
  name: 'block_tasks',
  description: 'Block or unblock multiple tasks at once',
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        description: 'Array of task UUIDs'
      },
      blocked: { type: 'boolean', description: 'true to block, false to unblock' },
      changeReason: { type: 'string', description: 'Why blocking/unblocking?' },
    },
    required: ['ids', 'blocked'],
  },
};

export const addTaskCommentTool: Tool = {
  name: 'add_task_comment',
  description: 'Add a comment to a task. Use for code review notes, progress updates, questions.',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task UUID or readable ID' },
      content: { type: 'string', description: 'Comment content (markdown supported)' },
    },
    required: ['taskId', 'content'],
  },
};

export const listTaskCommentsTool: Tool = {
  name: 'list_task_comments',
  description: 'List all comments on a task',
  inputSchema: {
    type: 'object',
    properties: {
      taskId: { type: 'string', description: 'Task UUID or readable ID' },
    },
    required: ['taskId'],
  },
};

// ============================================================
// FEATURES (5 tools)
// ============================================================

export const listFeaturesTool: Tool = {
  name: 'list_features',
  description: 'List features, optionally filtered by epic or status',
  inputSchema: {
    type: 'object',
    properties: {
      epicId: { type: 'string', format: 'uuid', description: 'Filter by epic UUID' },
      status: { type: 'string', enum: ['BACKLOG', 'TODO', 'DOING', 'DONE'] },
      limit: { type: 'number', description: 'Max results (default: 50)' },
    },
  },
};

export const getFeatureTool: Tool = {
  name: 'get_feature',
  description: 'Get detailed information about a feature including its tasks',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Feature UUID' },
    },
    required: ['id'],
  },
};

export const createFeatureTool: Tool = {
  name: 'create_feature',
  description: 'Create a new feature within an epic',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Feature title (required)' },
      epicId: { type: 'string', format: 'uuid', description: 'Epic UUID (required)' },
      description: { type: 'string', description: 'Feature description' },
      status: { type: 'string', enum: ['BACKLOG', 'TODO', 'DOING', 'DONE'], default: 'BACKLOG' },
    },
    required: ['title', 'epicId'],
  },
};

export const updateFeatureTool: Tool = {
  name: 'update_feature',
  description: 'Update a feature (title, description, status)',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Feature UUID' },
      title: { type: 'string' },
      description: { type: 'string' },
      status: { type: 'string', enum: ['BACKLOG', 'TODO', 'DOING', 'DONE'] },
    },
    required: ['id'],
  },
};

export const deleteFeatureTool: Tool = {
  name: 'delete_feature',
  description: '⚠️ DANGER: Delete a feature and all its tasks',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Feature UUID' },
    },
    required: ['id'],
  },
};

// ============================================================
// EPICS (3 tools - read only)
// ============================================================

export const listEpicsTool: Tool = {
  name: 'list_epics',
  description: 'List epics, optionally filtered by project or status',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', format: 'uuid', description: 'Filter by project UUID' },
      status: { type: 'string', enum: ['OPEN', 'IN_PROGRESS', 'DONE'] },
      limit: { type: 'number', description: 'Max results (default: 50)' },
    },
  },
};

export const getEpicTool: Tool = {
  name: 'get_epic',
  description: 'Get basic epic information',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Epic UUID' },
    },
    required: ['id'],
  },
};

export const getEpicFullTool: Tool = {
  name: 'get_epic_full',
  description: `⭐ RECOMMENDED: Get complete epic context in ONE call.
Returns epic with ALL features, ALL tasks, and aggregated stats.

75% faster than making separate calls. Use this when:
- Starting work on an epic
- Need full project context
- Planning next tasks`,
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Epic UUID' },
    },
    required: ['id'],
  },
};

// ============================================================
// PROJECTS (1 tool - read only)
// ============================================================

export const listProjectsTool: Tool = {
  name: 'list_projects',
  description: 'List all projects in the organization',
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

// ============================================================
// DOCS (5 tools)
// ============================================================

export const listDocsTool: Tool = {
  name: 'list_docs',
  description: 'List project documentation',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', format: 'uuid', description: 'Project UUID (required)' },
      limit: { type: 'number', description: 'Max results (default: 50)' },
    },
    required: ['projectId'],
  },
};

export const getDocTool: Tool = {
  name: 'get_doc',
  description: 'Get a documentation page content',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Doc UUID' },
    },
    required: ['id'],
  },
};

export const createDocTool: Tool = {
  name: 'create_doc',
  description: 'Create a new documentation page',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Doc title (required)' },
      projectId: { type: 'string', format: 'uuid', description: 'Project UUID (required)' },
      content: { type: 'string', description: 'Markdown content (required)' },
    },
    required: ['title', 'projectId', 'content'],
  },
};

export const updateDocTool: Tool = {
  name: 'update_doc',
  description: 'Update a documentation page',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Doc UUID' },
      title: { type: 'string' },
      content: { type: 'string', description: 'Markdown content' },
    },
    required: ['id'],
  },
};

export const deleteDocTool: Tool = {
  name: 'delete_doc',
  description: 'Delete a documentation page',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Doc UUID' },
    },
    required: ['id'],
  },
};

export const searchDocsTool: Tool = {
  name: 'search_docs',
  description: 'Search project documentation by content. Returns matching docs with relevant snippets. Use when you need to find a doc by topic, decision, or keyword without knowing the exact title.',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string', description: 'Search query (e.g. "auth decision", "deploy pipeline")' },
      projectId: { type: 'string', format: 'uuid', description: 'Filter by project (optional)' },
      limit: { type: 'number', description: 'Max results (default: 10)' },
    },
    required: ['query'],
  },
};

// ============================================================
// TAGS (4 tools)
// ============================================================

export const listTagsTool: Tool = {
  name: 'list_tags',
  description: 'List tags in a project',
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', format: 'uuid', description: 'Project UUID (required)' },
      limit: { type: 'number', description: 'Max results (default: 50)' },
    },
    required: ['projectId'],
  },
};

export const getTagTool: Tool = {
  name: 'get_tag',
  description: 'Get tag details',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Tag UUID' },
    },
    required: ['id'],
  },
};

export const createTagTool: Tool = {
  name: 'create_tag',
  description: 'Create a new tag in a project',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Tag name (required, max 50 chars)' },
      projectId: { type: 'string', format: 'uuid', description: 'Project UUID (required)' },
    },
    required: ['name', 'projectId'],
  },
};

export const deleteTagTool: Tool = {
  name: 'delete_tag',
  description: 'Delete a tag',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Tag UUID' },
    },
    required: ['id'],
  },
};

// ============================================================
// PERSONAL BOARD (8 tools)
// ============================================================

export const getBoardTool: Tool = {
  name: 'get_board',
  description: `Get the full personal board for the authenticated user.
Returns all columns with their items (cards).
Use this to see current personal tasks and organization.`,
  inputSchema: {
    type: 'object',
    properties: {},
  },
};

export const createBoardColumnTool: Tool = {
  name: 'create_board_column',
  description: 'Create a new column on the personal board.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Column title (required, max 100 chars)' },
      color: { type: 'string', description: 'Hex color (e.g. #6366f1). Optional.' },
    },
    required: ['title'],
  },
};

export const updateBoardColumnTool: Tool = {
  name: 'update_board_column',
  description: 'Update a column title or color.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Column UUID' },
      title: { type: 'string', description: 'New title (max 100 chars)' },
      color: { type: 'string', description: 'New hex color' },
    },
    required: ['id'],
  },
};

export const deleteBoardColumnTool: Tool = {
  name: 'delete_board_column',
  description: '⚠️ DANGER: Delete a column and ALL its items (cascade). Use with caution!',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Column UUID' },
    },
    required: ['id'],
  },
};

export const createBoardItemTool: Tool = {
  name: 'create_board_item',
  description: 'Create a new item/card in a column.',
  inputSchema: {
    type: 'object',
    properties: {
      columnId: { type: 'string', format: 'uuid', description: 'Column UUID (required)' },
      title: { type: 'string', description: 'Item title (required, max 200 chars)' },
      description: { type: 'string', description: 'Item description (max 1000 chars)' },
      priority: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'urgent'], default: 'none' },
      dueDate: { type: 'string', description: 'Due date (ISO date string, e.g. 2026-05-15)' },
    },
    required: ['columnId', 'title'],
  },
};

export const updateBoardItemTool: Tool = {
  name: 'update_board_item',
  description: 'Update an item title, description, priority, or due date.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Item UUID' },
      title: { type: 'string', description: 'New title (max 200 chars)' },
      description: { type: 'string', description: 'New description (max 1000 chars)' },
      priority: { type: 'string', enum: ['none', 'low', 'medium', 'high', 'urgent'] },
      dueDate: { type: 'string', description: 'New due date (ISO date string)' },
    },
    required: ['id'],
  },
};

export const deleteBoardItemTool: Tool = {
  name: 'delete_board_item',
  description: 'Delete an item/card from the board.',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid', description: 'Item UUID' },
    },
    required: ['id'],
  },
};

export const reorderBoardTool: Tool = {
  name: 'reorder_board',
  description: `Reorder columns and/or items on the board.
Provide columns array (for column ordering), items array (for item ordering), or both.

columns: [{ id, order }]
items: [{ id, columnId, order }]`,
  inputSchema: {
    type: 'object',
    properties: {
      columns: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            order: { type: 'number', minimum: 0 },
          },
          required: ['id', 'order'],
        },
        description: 'Array of {id, order} for column reordering',
      },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            columnId: { type: 'string', format: 'uuid' },
            order: { type: 'number', minimum: 0 },
          },
          required: ['id', 'columnId', 'order'],
        },
        description: 'Array of {id, columnId, order} for item reordering',
      },
    },
  },
};

// ============================================================
// EXPORT ALL TOOLS
// ============================================================

export const ALL_TOOLS: Tool[] = [
  // Tasks (9)
  listTasksTool,
  getTaskTool,
  createTaskTool,
  updateTaskTool,
  deleteTaskTool,
  bulkUpdateTasksTool,
  blockTasksTool,
  addTaskCommentTool,
  listTaskCommentsTool,
  // Features (5)
  listFeaturesTool,
  getFeatureTool,
  createFeatureTool,
  updateFeatureTool,
  deleteFeatureTool,
  // Epics (3)
  listEpicsTool,
  getEpicTool,
  getEpicFullTool,
  // Projects (1)
  listProjectsTool,
  // Docs (6)
  listDocsTool,
  getDocTool,
  createDocTool,
  updateDocTool,
  deleteDocTool,
  searchDocsTool,
  // Tags (4)
  listTagsTool,
  getTagTool,
  createTagTool,
  deleteTagTool,
  // Personal Board (8)
  getBoardTool,
  createBoardColumnTool,
  updateBoardColumnTool,
  deleteBoardColumnTool,
  createBoardItemTool,
  updateBoardItemTool,
  deleteBoardItemTool,
  reorderBoardTool,
];
