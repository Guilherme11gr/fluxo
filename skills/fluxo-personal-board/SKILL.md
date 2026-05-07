---
name: fluxo-personal-board
description: Manage your personal board in FluXo via Agent API. Use when you need to create columns, add items/cards, move items between columns, reorder the board, or check what's on your board.
---

# FluXo Personal Board — Agent API

## Overview

Your personal board is a kanban-style board with columns and items. Only you (the authenticated user) can see it. Use the Agent API to manage it programmatically.

## Auth

All requests require:
```
Authorization: Bearer <FLUXO_AGENT_KEY>
```

## Endpoints

### Get your board

```bash
curl -s -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  "$FLUXO_AGENT_API_URL/board"
```

Returns all columns with their items nested inside.

### Create a column

```bash
curl -s -X POST -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Hoje", "color": "#6366f1"}' \
  "$FLUXO_AGENT_API_URL/board/columns"
```

Body: `title` (required, max 100), `color` (optional, hex).

### Update a column

```bash
curl -s -X PATCH -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Em progresso", "color": "#f59e0b"}' \
  "$FLUXO_AGENT_API_URL/board/columns/<column-id>"
```

Both fields optional.

### Delete a column

```bash
curl -s -X DELETE -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  "$FLUXO_AGENT_API_URL/board/columns/<column-id>"
```

Deletes the column and all its items (cascade).

### Create an item in a column

```bash
curl -s -X POST -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "Revisar PR do auth",
    "description": "Checar edge cases do refresh token",
    "priority": "high",
    "dueDate": "2026-05-10"
  }' \
  "$FLUXO_AGENT_API_URL/board/columns/<column-id>/items"
```

Body:
- `title` (required, max 200)
- `description` (optional, max 1000)
- `priority` (optional): `none` | `low` | `medium` | `high` | `urgent`
- `dueDate` (optional): ISO date string

### Update an item

```bash
curl -s -X PATCH -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"priority": "urgent", "title": "Revisar PR do auth URGENTE"}' \
  "$FLUXO_AGENT_API_URL/board/items/<item-id>"
```

All fields optional.

### Delete an item

```bash
curl -s -X DELETE -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  "$FLUXO_AGENT_API_URL/board/items/<item-id>"
```

### Reorder columns and/or items

```bash
curl -s -X POST -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "columns": [
      {"id": "<col-1>", "order": 0},
      {"id": "<col-2>", "order": 1}
    ],
    "items": [
      {"id": "<item-1>", "columnId": "<col-1>", "order": 0},
      {"id": "<item-2>", "columnId": "<col-1>", "order": 1}
    ]
  }' \
  "$FLUXO_AGENT_API_URL/board/reorder"
```

Provide `columns`, `items`, or both. Each entry needs `id` and `order` (0-based). Items also need `columnId` (to move between columns).

## Data Models

**BoardColumn:**
- `id` (uuid), `title`, `color` (hex), `order`, `items[]`, `createdAt`, `updatedAt`

**BoardItem:**
- `id` (uuid), `columnId`, `title`, `description?`, `priority` (none/low/medium/high/urgent), `dueDate?`, `order`, `createdAt`, `updatedAt`

## Common Patterns

**Add a quick capture item:**
```bash
# Get board, find the first column, add an item
COLUMN_ID=$(curl -s -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  "$FLUXO_AGENT_API_URL/board" | jq -r '.data.columns[0].id')

curl -s -X POST -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"title": "Nova tarefa capturada via agent"}' \
  "$FLUXO_AGENT_API_URL/board/columns/$COLUMN_ID/items"
```

**Move item to another column:**
```bash
curl -s -X POST -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"id": "<item-id>", "columnId": "<target-column-id>", "order": 0}]}' \
  "$FLUXO_AGENT_API_URL/board/reorder"
```
