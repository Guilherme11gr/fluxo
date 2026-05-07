/**
 * Agent API Documentation Endpoint
 * 
 * GET /api/agent
 * 
 * Returns self-describing JSON documentation for agents to understand
 * all available endpoints, methods, parameters, and response formats.
 * 
 * No authentication required for docs endpoint.
 */

import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const API_DOCS = {
  name: 'JT-Kill Agent API',
  version: '1.0.0',
  description: 'RESTful API for external agents and automations to interact with the task management system.',
  baseUrl: '/api/agent',

  auth: {
    type: 'bearer',
    header: 'Authorization',
    format: 'Bearer agk_xxxxxxxxxxxx',
    description: 'Tenant-scoped API key authentication. Generate the key in Settings > Acesso para Agents.',
    headers: {
      'X-Agent-Name': {
        required: false,
        description: 'Friendly name recorded in audit logs. Example: Claude Desktop',
      },
    },
  },

  responseFormat: {
    success: {
      success: true,
      data: '...',
    },
    list: {
      success: true,
      data: ['...'],
      meta: { total: 0 },
    },
    error: {
      success: false,
      error: { code: 'ERROR_CODE', message: 'Human readable message' },
    },
  },

  endpoints: [
    // ============ MEMBERS ============
    {
      method: 'GET',
      path: '/api/agent/members',
      description: 'List all organization members. Use ?search=Name to filter by name or email (case-insensitive partial match).',
      auth: true,
      query: {
        search: { type: 'string', required: false, description: 'Partial name or email to filter (case-insensitive)' },
        limit: { type: 'number', required: false, description: 'Max results (1-100, default 50)' },
      },
      response: { data: '[Member]' },
    },

    // ============ TASKS ============
    {
      method: 'GET',
      path: '/api/agent/tasks',
      description: 'List tasks with optional filters',
      auth: true,
      query: {
        featureId: { type: 'uuid', required: false, description: 'Filter by feature ID' },
        epicId: { type: 'uuid', required: false, description: 'Filter by epic ID (returns all tasks from all features in epic)' },
        projectId: { type: 'uuid', required: false, description: 'Filter by project ID' },
        status: { type: 'enum', values: ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'], required: false },
        limit: { type: 'number', default: 50, max: 100 },
      },
      response: {
        data: '[Task]',
        meta: '{ total: number }',
      },
    },
    {
      method: 'POST',
      path: '/api/agent/tasks',
      description: 'Create a new task',
      auth: true,
      body: {
        title: { type: 'string', required: true, description: 'Task title' },
        featureId: { type: 'uuid', required: true, description: 'Parent feature ID' },
        description: { type: 'string', required: false, description: 'Markdown description' },
        type: { type: 'enum', values: ['TASK', 'BUG'], default: 'TASK' },
        priority: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
        status: { type: 'enum', values: ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'], default: 'BACKLOG' },
      },
      response: { data: 'Task' },
    },
    {
      method: 'GET',
      path: '/api/agent/tasks/:id',
      description: 'Get a task by ID',
      auth: true,
      params: {
        id: { type: 'uuid', required: true },
      },
      response: { data: 'Task' },
    },
    {
      method: 'PATCH',
      path: '/api/agent/tasks/:id',
      description: 'Update a task (partial update)',
      auth: true,
      params: {
        id: { type: 'uuid', required: true },
      },
      body: {
        title: { type: 'string', required: false },
        description: { type: 'string', required: false },
        type: { type: 'enum', values: ['TASK', 'BUG'], required: false },
        priority: { type: 'enum', values: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: false },
        status: { type: 'enum', values: ['BACKLOG', 'TODO', 'DOING', 'REVIEW', 'QA_READY', 'DONE'], required: false },
      },
      response: { data: 'Task' },
    },
    {
      method: 'DELETE',
      path: '/api/agent/tasks/:id',
      description: 'Delete a task',
      auth: true,
      params: {
        id: { type: 'uuid', required: true },
      },
      response: { data: '{ deleted: true }' },
    },

    // ============ FEATURES ============
    {
      method: 'GET',
      path: '/api/agent/features',
      description: 'List features with optional filters',
      auth: true,
      query: {
        epicId: { type: 'uuid', required: false, description: 'Filter by epic ID' },
        projectId: { type: 'uuid', required: false, description: 'Filter by project ID' },
        status: { type: 'enum', values: ['BACKLOG', 'TODO', 'DOING', 'DONE'], required: false },
        limit: { type: 'number', default: 50, max: 100 },
      },
      response: { data: '[Feature]', meta: '{ total: number }' },
    },
    {
      method: 'POST',
      path: '/api/agent/features',
      description: 'Create a new feature',
      auth: true,
      body: {
        title: { type: 'string', required: true },
        epicId: { type: 'uuid', required: true },
        description: { type: 'string', required: false },
        status: { type: 'enum', values: ['BACKLOG', 'TODO', 'DOING', 'DONE'], default: 'BACKLOG' },
      },
      response: { data: 'Feature' },
    },
    {
      method: 'GET',
      path: '/api/agent/features/:id',
      description: 'Get a feature by ID',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: 'Feature' },
    },
    {
      method: 'PATCH',
      path: '/api/agent/features/:id',
      description: 'Update a feature (partial update)',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      body: {
        title: { type: 'string', required: false },
        description: { type: 'string', required: false },
        status: { type: 'enum', values: ['BACKLOG', 'TODO', 'DOING', 'DONE'], required: false },
      },
      response: { data: 'Feature' },
    },

    // ============ EPICS (Read-only) ============
    {
      method: 'GET',
      path: '/api/agent/epics',
      description: 'List epics with optional filters',
      auth: true,
      query: {
        projectId: { type: 'uuid', required: false },
        status: { type: 'enum', values: ['OPEN', 'IN_PROGRESS', 'DONE'], required: false },
        limit: { type: 'number', default: 50, max: 100 },
      },
      response: { data: '[Epic]', meta: '{ total: number }' },
    },
    {
      method: 'GET',
      path: '/api/agent/epics/:id',
      description: 'Get an epic by ID with features',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: 'Epic' },
    },

    // ============ PROJECTS (Read-only) ============
    {
      method: 'GET',
      path: '/api/agent/projects',
      description: 'List all projects',
      auth: true,
      query: {
        limit: { type: 'number', default: 50, max: 100 },
      },
      response: { data: '[Project]', meta: '{ total: number }' },
    },

    // ============ DOCS (Markdown) ============
    {
      method: 'GET',
      path: '/api/agent/docs',
      description: 'List project docs (markdown)',
      auth: true,
      query: {
        projectId: { type: 'uuid', required: true, description: 'Project ID' },
        limit: { type: 'number', default: 50, max: 100 },
      },
      response: { data: '[Doc]', meta: '{ total: number }' },
    },
    {
      method: 'POST',
      path: '/api/agent/docs',
      description: 'Create a new doc',
      auth: true,
      body: {
        title: { type: 'string', required: true },
        projectId: { type: 'uuid', required: true },
        content: { type: 'string', required: true, description: 'Markdown content' },
      },
      response: { data: 'Doc' },
    },
    {
      method: 'GET',
      path: '/api/agent/docs/:id',
      description: 'Get a doc by ID with tags',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: 'Doc' },
    },
    {
      method: 'PATCH',
      path: '/api/agent/docs/:id',
      description: 'Update a doc',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      body: {
        title: { type: 'string', required: false },
        content: { type: 'string', required: false },
      },
      response: { data: 'Doc' },
    },
    {
      method: 'DELETE',
      path: '/api/agent/docs/:id',
      description: 'Delete a doc',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: '{ deleted: true }' },
    },
    {
      method: 'GET',
      path: '/api/agent/docs/search',
      description: 'Search docs by content. Combines tsvector (Portuguese stemming) with pg_trgm (typo tolerance) in a single query. Returns ranked results with snippets.',
      auth: true,
      query: {
        q: { type: 'string', required: true, description: 'Search query (min 2 chars)' },
        projectId: { type: 'uuid', required: false, description: 'Filter by project' },
        limit: { type: 'number', default: 10, max: 50 },
      },
      response: {
        data: '[{ id, title, snippet, rank, projectId, updatedAt }]',
        meta: '{ total: number, query: string }',
      },
    },

    // ============ PERSONAL BOARD ============
    {
      method: 'GET',
      path: '/api/agent/board',
      description: 'Get full personal board with all columns and items for the authenticated user.',
      auth: true,
      response: { data: '{ columns: [BoardColumn] }' },
    },
    {
      method: 'POST',
      path: '/api/agent/board/columns',
      description: 'Create a new column on the personal board.',
      auth: true,
      body: {
        title: { type: 'string', required: true, maxLength: 100 },
        color: { type: 'string', required: false, description: 'Hex color (e.g. #6366f1)' },
      },
      response: { data: 'BoardColumn' },
    },
    {
      method: 'PATCH',
      path: '/api/agent/board/columns/:id',
      description: 'Update a column (title, color).',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      body: {
        title: { type: 'string', required: false, maxLength: 100 },
        color: { type: 'string', required: false },
      },
      response: { data: 'BoardColumn' },
    },
    {
      method: 'DELETE',
      path: '/api/agent/board/columns/:id',
      description: 'Delete a column and all its items (cascade).',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: '{ deleted: true }' },
    },
    {
      method: 'POST',
      path: '/api/agent/board/columns/:columnId/items',
      description: 'Create a new item/card in a column.',
      auth: true,
      params: { columnId: { type: 'uuid', required: true } },
      body: {
        title: { type: 'string', required: true, maxLength: 200 },
        description: { type: 'string', required: false, maxLength: 1000 },
        priority: { type: 'enum', values: ['none', 'low', 'medium', 'high', 'urgent'], default: 'none' },
        dueDate: { type: 'string', required: false, description: 'ISO date string' },
      },
      response: { data: 'BoardItem' },
    },
    {
      method: 'PATCH',
      path: '/api/agent/board/items/:id',
      description: 'Update an item (title, description, priority, dueDate).',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      body: {
        title: { type: 'string', required: false, maxLength: 200 },
        description: { type: 'string', required: false, maxLength: 1000 },
        priority: { type: 'enum', values: ['none', 'low', 'medium', 'high', 'urgent'], required: false },
        dueDate: { type: 'string', required: false },
      },
      response: { data: 'BoardItem' },
    },
    {
      method: 'DELETE',
      path: '/api/agent/board/items/:id',
      description: 'Delete an item.',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: '{ deleted: true }' },
    },
    {
      method: 'POST',
      path: '/api/agent/board/reorder',
      description: 'Reorder columns and/or items (drag-and-drop). Provide columns array, items array, or both.',
      auth: true,
      body: {
        columns: { type: 'array', required: false, items: '{ id: uuid, order: number }' },
        items: { type: 'array', required: false, items: '{ id: uuid, columnId: uuid, order: number }' },
      },
      response: { data: '{ success: true }' },
    },

    // ============ TAGS ============
    {
      method: 'GET',
      path: '/api/agent/tags',
      description: 'List tags for a project',
      auth: true,
      query: {
        projectId: { type: 'uuid', required: true },
        limit: { type: 'number', default: 50, max: 100 },
      },
      response: { data: '[Tag]', meta: '{ total: number }' },
    },
    {
      method: 'POST',
      path: '/api/agent/tags',
      description: 'Create a new tag',
      auth: true,
      body: {
        name: { type: 'string', required: true, maxLength: 50 },
        projectId: { type: 'uuid', required: true },
      },
      response: { data: 'Tag' },
    },
    {
      method: 'GET',
      path: '/api/agent/tags/:id',
      description: 'Get a tag by ID',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: 'Tag' },
    },
    {
      method: 'DELETE',
      path: '/api/agent/tags/:id',
      description: 'Delete a tag',
      auth: true,
      params: { id: { type: 'uuid', required: true } },
      response: { data: '{ deleted: true }' },
    },
  ],

  models: {
    Task: {
      id: 'uuid',
      title: 'string',
      description: 'string | null',
      status: 'BACKLOG | TODO | DOING | REVIEW | QA_READY | DONE',
      type: 'TASK | BUG',
      priority: 'LOW | MEDIUM | HIGH | CRITICAL',
      featureId: 'uuid',
      projectId: 'uuid',
      localId: 'number (project-scoped sequential ID)',
      createdAt: 'ISO 8601 datetime',
      updatedAt: 'ISO 8601 datetime',
    },
    Feature: {
      id: 'uuid',
      title: 'string',
      description: 'string | null',
      status: 'BACKLOG | TODO | DOING | DONE',
      epicId: 'uuid',
      _count: '{ tasks: number }',
      createdAt: 'ISO 8601 datetime',
      updatedAt: 'ISO 8601 datetime',
    },
    Epic: {
      id: 'uuid',
      title: 'string',
      description: 'string | null',
      status: 'OPEN | IN_PROGRESS | DONE',
      projectId: 'uuid',
      _count: '{ features: number }',
      createdAt: 'ISO 8601 datetime',
      updatedAt: 'ISO 8601 datetime',
    },
    Project: {
      id: 'uuid',
      name: 'string',
      key: 'string (short identifier)',
      description: 'string | null',
      createdAt: 'ISO 8601 datetime',
      updatedAt: 'ISO 8601 datetime',
    },
    Doc: {
      id: 'uuid',
      projectId: 'uuid',
      title: 'string',
      content: 'string (markdown)',
      tags: '[{ tag: { id, name } }]',
      createdAt: 'ISO 8601 datetime',
      updatedAt: 'ISO 8601 datetime',
    },
    Member: {
      id: 'uuid',
      email: 'string',
      displayName: 'string',
      avatarUrl: 'string | null',
      role: 'OWNER | ADMIN | MEMBER',
      createdAt: 'ISO 8601 datetime',
    },
    BoardColumn: {
      id: 'uuid',
      title: 'string',
      color: 'string (hex color)',
      order: 'number',
      items: '[BoardItem]',
      createdAt: 'ISO 8601 datetime',
      updatedAt: 'ISO 8601 datetime',
    },
    BoardItem: {
      id: 'uuid',
      columnId: 'uuid',
      title: 'string',
      description: 'string | null',
      priority: 'none | low | medium | high | urgent',
      dueDate: 'string | null (ISO date)',
      order: 'number',
      createdAt: 'ISO 8601 datetime',
      updatedAt: 'ISO 8601 datetime',
    },
    Tag: {
      id: 'uuid',
      name: 'string',
      projectId: 'uuid',
      _count: '{ assignments: number }',
      createdAt: 'ISO 8601 datetime',
    },
  },
};

export async function GET() {
  return NextResponse.json(API_DOCS, {
    headers: {
      'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
    },
  });
}
