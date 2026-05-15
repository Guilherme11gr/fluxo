---
name: fluxo-runner-lifecycle
description: FluXo runner lifecycle. Use this skill whenever the user is designing, debugging, or teaching the current runner-go orchestration flow: runner registration, `claim-next`, execution leases, runtime binding, heartbeat, comments, finalize, task transitions, and end-to-end orchestration. Trigger on runner, runner-go, claim-next, runtime binding, execution lease, finalize execution, or "como funciona o runner". Do not use this for the narrower topics of agent registration, structured output schema, or handoff contract when those dedicated FluXo skills fit.
---

# FluXo Runner Lifecycle

Use this skill to explain or implement the current orchestration lifecycle used by FluXo runner-go.

## Source of truth

- `runner/runner.js`
- `runner-go/internal/runner/runner.go`
- `runner-go/internal/orchestrator/worker.go`
- `src/app/api/agent/agents/route.ts`
- `src/app/api/agent/runners/route.ts`
- `src/app/api/agent/tasks/claim-next/route.ts`
- `src/app/api/agent/executions/route.ts`
- `src/app/api/agent/executions/[id]/heartbeat/route.ts`
- `src/app/api/agent/executions/[id]/finalize/route.ts`

## Current lifecycle

1. Register or refresh the agent in `/api/agent/agents`.
2. Register the runner instance in `/api/agent/runners`.
3. Call `POST /api/agent/tasks/claim-next` with `agentId`, `runnerInstanceId`, `pickStatus`, `claimStatus`, and optional fields like `projectId`, `candidateLimit`, `leaseMs`, `tool`, `model`, and `metadata`.
4. Receive the claimed task, execution record, lease context, and runtime binding together.
5. Prepare execution using the returned runtime binding, especially repo path and git policy.
6. Post a human-readable start comment.
7. Execute the coding agent.
8. Heartbeat the execution while it is running.
9. Finalize through `POST /api/agent/executions/:id/finalize`.
10. Let finalize update task state, assignment, blocking, PR metadata, and lease cleanup.
11. Heartbeat the agent back to `ONLINE`.

## Routing details that matter

- The lightweight JS runner uses direct task patching and comments, but that is the legacy simpler path.
- The current Go orchestrator uses the atomic `claim-next` flow and should be treated as the primary lifecycle to teach.
- Agent registration and runner registration are different concerns.
- Agent heartbeat tracks agent availability.
- Execution heartbeat tracks a live task execution and renews its lease.
- `claim-next` only considers tasks already assigned to that agent via `assigneeAgentId = agentId`.
- Runtime binding comes from claim-next and can override local assumptions such as workdir, git policy, base branch, and branch prefix.
- Previous execution context can be returned and should be used to continue safely instead of restarting blindly.

## Claim guidance

- Prefer `POST /api/agent/tasks/claim-next` over manual list-then-patch flows in the current runner-go lifecycle.
- Use `pickStatus` for what the worker is allowed to take, usually `TODO`.
- Use `claimStatus` for the immediate transition, usually `DOING`.
- If claim-next returns nothing, verify that the task is already assigned to that exact agent.
- Prefer agent routing fields over generic assumptions: `assigneeAgentId` is the agent handoff field.

## Human visibility guidance

Always leave a readable trail.

- Post a start comment when work begins.
- Post a concise completion or failure comment.
- Keep comments useful to humans reading the task later.

## Finalization guidance

When execution ends, coordinate three things together:

- execution status
- task workflow status
- agent or runner availability

Avoid a lifecycle where one of these is left stale.

## Anti-patterns

- Do not describe the runner as only "poll and patch"; the Go runner also tracks executions.
- Do not teach the old list-then-patch lifecycle as the main Go runner path.
- Do not merge runner registration with agent registration.
- Do not treat heartbeat as optional when diagnosing stale executions.
- Do not skip the result comment before the final handoff.
- Do not assume claim-next will discover unassigned tasks; assignment is a precondition.
