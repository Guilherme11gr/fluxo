---
name: fluxo-runner-handoff
description: FluXo runner handoff and task finalization. Use ONLY when the user needs an agent to finalize work, move the task to the next workflow state, reassign to another agent, block a failed execution, add the right comment, or explain the correct handoff contract for `/api/agent/tasks/:id` and `/api/agent/executions/:id/finalize`. Trigger on handoff, next assignee, reassign agent, nextStatus, blocked execution, or "como passar a task adiante". Do not use this for generic Agent API usage or for the broader runner lifecycle unless the question is specifically about the final handoff step.
---

# FluXo Runner Handoff

Use this skill for the final step of an agent execution: summarize, finalize, and route the task correctly.

## Source of truth

- `src/app/api/agent/tasks/[id]/route.ts`
- `src/app/api/agent/tasks/[id]/comments/route.ts`
- `src/app/api/agent/executions/[id]/finalize/route.ts`
- `runner-go/internal/runner/runner.go`

## Handoff principle

A good handoff updates both machine state and human understanding.

That usually means:

1. post a concise result comment
2. update task or execution state
3. reassign to the next agent when needed

## Preferred path when execution tracking exists

Use `POST /api/agent/executions/:id/finalize`.

Important fields:

- `status`: `SUCCESS | FAILED | TIMEOUT | CANCELLED`
- `resultSummary`
- `result`
- `errorMessage`
- `duration`
- `nextStatus`
- `nextAssigneeAgentId`
- `blockReason`
- `comment`
- `metadata`

This route can update the execution, optionally update the task, release the lease, and avoid duplicate comments.

## Preferred task patch semantics

When mutating the task directly via `PATCH /api/agent/tasks/:id`:

- use `status` for workflow state
- use `assigneeAgentId` for agent-to-agent routing
- use `blocked=true` and a clear `blockReason` on failure
- attach `_metadata.changeReason` so audit history stays understandable

## Success handoff guidance

- Default the next status to the real workflow target for that agent, often `REVIEW` or `QA_READY`, not automatically `DONE`.
- Reassign with `assigneeAgentId` if another agent should take over.
- Include a concise result comment before or as part of finalize.
- If the task previously had a failure reason, clear or overwrite that context explicitly when the recovery flow requires it; a successful finalize clears `blocked` but does not automatically clear an old `blockReason`.

## Failure handoff guidance

- Keep the task in a recoverable workflow state.
- Mark `blocked=true` when execution failed.
- Set `blockReason` with concrete recovery context.
- Include the useful failure summary in the comment or `errorMessage`.

## PR and git metadata guidance

If the execution produced git metadata, propagate it through `result.git` or `metadata.git` so finalize can persist PR information onto the task.

## Anti-patterns

- Do not handoff silently with no comment.
- Do not route to another agent using `assigneeId` when the intent is agent routing.
- Do not invent unsupported statuses.
- Do not mark success while leaving `blocked=true`.
- Do not default every successful run to `DONE`; choose the next real workflow state.
