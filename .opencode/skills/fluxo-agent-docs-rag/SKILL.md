---
name: fluxo-agent-docs-rag
description: Docs RAG for FluXo. Use this skill whenever the user wants an agent to search project documentation, retrieve markdown context, ground actions in docs, answer from `/api/agent/docs/search` or related doc retrieval flows, or build a documentation-aware workflow. Trigger on phrases like RAG, docs search, semantic search, knowledge lookup, project docs, markdown memory, or "busca nas docs". Do not use this as the default skill for plain doc CRUD when no search or retrieval strategy is needed.
---

# FluXo Docs RAG

Use this skill when an agent should fetch documentation context before acting.

## Source of truth

- `src/app/api/agent/docs/search/route.ts`
- `src/app/api/agent/docs/route.ts`
- `src/app/api/agent/docs/[id]/route.ts`
- `src/app/api/agent/route.ts`

## Real API access

For real FluXo documentation lookups, prefer the cloud Agent API:

- Base URL: `https://fluxo.agenda-aqui.com/api/agent`
- API key env var: `AGENT_API_KEY`

Use normal Agent API headers, especially `Authorization`, `User-Agent`, and `X-Agent-Name`.

## Retrieval strategy

Use the cheapest retrieval that still gives enough context.

1. Start with `GET /api/agent/docs/search?q=...&mode=chunks&limit=...`.
2. Add `projectId` whenever the task is project-scoped.
3. Read chunk results first. They are optimized for token economy.
4. Only call `GET /api/agent/docs/:id` when the chunk result proves a full doc is needed.
5. If the agent needs to update the knowledge base, then use `POST /api/agent/docs` or `PATCH /api/agent/docs/:id`.

## What the search route really does

- It supports `mode=chunks` and `mode=docs`.
- `chunks` is the default and best first step.
- The implementation returns chunk-sized results to reduce token usage.
- The search combines semantic and keyword signals. Treat it as hybrid search, not exact match only.

## Indexing caveat

Doc chunk indexing is asynchronous and best-effort after create or update.

- A doc written through `POST /api/agent/docs` may not appear in search immediately.
- A doc changed through `PATCH /api/agent/docs/:id` may briefly return stale search results.
- When you need read-after-write correctness, fetch the doc directly by `id` instead of assuming search is immediately consistent.

## Recommended query flow

1. Derive a focused query from the task title and problem statement.
2. Search with `mode=chunks` and `limit=3` to `5`.
3. Extract only the relevant snippets into the prompt or reasoning context.
4. If the answer still looks ambiguous, fetch one or two full docs by `id`.
5. Cite doc titles or IDs in summaries when humans may verify the grounding.

## Good usage patterns

- Ground implementation work in architecture docs before editing code.
- Ground bug triage in product or project docs before changing statuses.
- Ground agent execution prompts with a small number of highly relevant chunks.
- Write back missing durable knowledge after a task, but only if that is part of the workflow.

## Anti-patterns

- Do not fetch all docs for a project as a first step.
- Do not stuff full markdown docs into the prompt when 2-3 chunks already answer the question.
- Do not skip `projectId` when the task already tells you the project.
- Do not treat the self-documenting API route as the only source; the search route has capabilities the summary doc may lag behind.

## Example flow

1. Search: `GET /api/agent/docs/search?q=claim next task&projectId=<uuid>&mode=chunks&limit=3`
2. Pull the best snippets into context.
3. If one hit is clearly the canonical doc, read `GET /api/agent/docs/:id`.
4. Execute the task with the grounded context.
