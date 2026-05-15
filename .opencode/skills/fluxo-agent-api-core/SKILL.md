---
name: fluxo-agent-api-core
description: Agent API do FluXo. Use this skill whenever the user wants an agent to read, create, update, search, comment on, assign, or move product data through `/api/agent`, especially tasks, features, epics, projects, board, tags, members, and comments. Also use when someone mentions Agent API, agent auth, bearer `agk_` keys, `extractAgentAuth()`, or asks how an external agent should integrate with FluXo. Do not prefer this skill when the task is specifically about docs RAG or docs search, runner registration, runner lifecycle, structured runner output, or execution handoff; use those narrower FluXo skills instead.
---

# FluXo Agent API Core

Use this skill to operate safely against the FluXo Agent API.

## Source of truth

- `src/app/api/agent/route.ts`
- `docs/architecture/overview.md`
- `docs/architecture/workflows.md`
- `src/shared/http/agent-auth.ts`

Prefer the real route files whenever a field in the autodoc looks incomplete.

## Core rules

- Use `Authorization: Bearer agk_...`.
- Send `X-Agent-Name` when possible so audit trails stay readable.
- In `src/app/api/agent/**`, auth is agent auth, not session auth. The repo standard is `extractAgentAuth()`.
- Most Agent API routes return the response envelope `{ success, data }` or `{ success, data, meta }`.
- Treat `QA_READY` as a real workflow state. Do not simplify it away.

`GET /api/agent` is the exception: it returns the raw documentation object, not the normal success envelope.

## Real API access

When the user asks to operate the real FluXo data, prefer the real cloud Agent API instead of a local dev server.

- Base URL: `https://fluxo.agenda-aqui.com/api/agent`
- API key env var: `AGENT_API_KEY`
- Recommended headers:
  - `Authorization: Bearer $AGENT_API_KEY`
  - `User-Agent: OpenCode-Agent/1.0`
  - `X-Agent-Name: <current agent name>`

If `AGENT_API_KEY` is missing or rejected, stop and ask for the correct key instead of assuming the local app should be started.

## Discovery workflow

1. Start at `GET /api/agent` to inspect the self-describing docs.
2. If the task touches a specific route family, read the real route file under `src/app/api/agent/**` before assuming field names.
3. Prefer the smallest endpoint that solves the task.

## High-value endpoint groups

### Planning objects

- `GET/POST /api/agent/tasks`
- `GET/PATCH/DELETE /api/agent/tasks/:id`
- `GET/POST /api/agent/features`
- `GET/PATCH /api/agent/features/:id`
- `GET /api/agent/epics`
- `GET /api/agent/epics/:id`
- `GET /api/agent/projects`

### Knowledge and docs

- `GET/POST /api/agent/docs`
- `GET/PATCH/DELETE /api/agent/docs/:id`
- `GET /api/agent/docs/search`
- `GET/POST /api/agent/tags`
- `GET/DELETE /api/agent/tags/:id`

### Collaboration

- `GET/POST /api/agent/tasks/:id/comments`
- `GET /api/agent/members`

### Personal board

- `GET /api/agent/board`
- `POST /api/agent/board/columns`
- `PATCH/DELETE /api/agent/board/columns/:id`
- `POST /api/agent/board/columns/:columnId/items`
- `PATCH/DELETE /api/agent/board/items/:id`
- `POST /api/agent/board/reorder`

### Runner and execution surface

- `GET/POST /api/agent/agents`
- `POST /api/agent/agents/:id/heartbeat`
- `POST /api/agent/runners`
- `POST /api/agent/runners/:id/heartbeat`
- `GET/POST /api/agent/executions`
- `POST /api/agent/executions/:id/heartbeat`
- `POST /api/agent/executions/:id/finalize`

Use the specialized FluXo runner skills when the task is specifically about this execution surface.

## Task mutation guidance

When patching a task, prefer explicit intent over blind field dumps.

- Use `status` for workflow transitions.
- Use `blocked` and `blockReason` when execution failed or is waiting on something external.
- Use `assigneeId` for human reassignment.
- Use `assigneeAgentId` for agent-to-agent handoff.
- Use `_metadata` to explain why the agent changed the task.
- Use `tagIds` only when intentionally replacing tag assignment.

## Comment guidance

Post comments for human readability, not just machine traces.

- Say what started or finished.
- Include concise summary and relevant evidence.
- Keep the full raw log elsewhere when it is noisy.

## Safe operating pattern

1. Read the current object first.
2. Check org-scoped ownership and IDs.
3. Apply the minimal mutation.
4. Comment if a human needs context.
5. Re-read the updated object if later steps depend on the new state.

## Anti-patterns

- Do not use web-session auth patterns inside `src/app/api/agent/**`.
- Do not invent statuses outside the real enum.
- Do not assume autodoc is complete for runner, executions, or advanced fields.
- Do not handoff to another agent using `assigneeId` when the intent is agent routing.
