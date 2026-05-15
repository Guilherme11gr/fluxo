---
name: fluxo-runner-register-agent
description: FluXo runner agent registration. Use ONLY when the user needs to register, refresh, or teach how a runner-backed agent should appear in `/api/agent/agents`, including `POST /api/agent/agents`, heartbeat, and the config fields actually synced by runner-go such as `agent_type`, `role_prompt`, `operating_rules`, `output_schema_version`, `model`, `available_models`, `pick_status`, `claim_status`, `done_status`, `timeout`, and agent routing IDs. Trigger on register agent, agent registry, available models, online agent config, or "cadastrar agent".
---

# FluXo Runner Register Agent

Use this skill when the task is specifically about registering or refreshing a runner-backed agent record.

## Source of truth

- `src/app/api/agent/agents/route.ts`
- `runner/runner.js`
- `runner-go/internal/runner/runner.go`
- `runner-go/internal/config/config.go`
- `runner-go/internal/sync/sync.go`

## Registration endpoint

Use `POST /api/agent/agents`.

The core payload is:

```json
{
  "name": "backend-builder",
  "type": "RUNNER",
  "tool": "opencode",
  "workdir": "/workspace/repo",
  "projectId": "optional-project-uuid",
  "config": {
    "model": "anthropic/claude-sonnet-4-6",
    "available_models": ["anthropic/claude-sonnet-4-6"],
    "agent_type": "build",
    "role": "backend builder",
    "role_prompt": "Implement changes with minimal risk.",
    "operating_rules": ["Do not write to protected branches."],
    "output_schema_version": "v1",
    "variant": "high"
  }
}
```

## Merge semantics that matter

- If an agent with the same name already exists, the API updates it to `ONLINE` and merges `config`.
- This can act as a config refresh, but it is not a full top-level refresh.
- Preserve useful runtime config such as `available_models`.

## Refresh caveat

Same-name re-registration does not currently update top-level fields like `tool`, `workdir`, `projectId`, or `type` on the existing record. Treat it as a status-plus-config refresh unless the API implementation changes.

## Config fields worth teaching

The Go runner explicitly syncs and consumes these config-style fields:

- `model`
- `available_models`
- `agent_type`
- `role`
- `role_prompt`
- `operating_rules`
- `output_schema_version`
- `variant`

Other agent behavior the dynamic sync path reads from API config includes:

- `assignee_agent_id` or `assignee_id`
- `next_assignee_agent_id` or `next_assignee_id`
- `project_id`
- `workdir`
- `context`
- `pick_status`
- `claim_status`
- `done_status`
- `timeout`

## Important limitation

Do not teach API registration as if it controlled every runner-go field.

The current dynamic sync path does not read `git_policy`, `git_base_branch`, or `git_allowed_prefix` from agent API config. Those are static runner config concerns unless the implementation changes.

## Heartbeat guidance

After registration, keep the record fresh with `POST /api/agent/agents/:id/heartbeat`.

Use heartbeat to report:

- current agent status such as `ONLINE`, `BUSY`, or `OFFLINE`
- refreshed runtime config when relevant, especially `available_models`

## Anti-patterns

- Do not confuse agent registration with runner instance registration.
- Do not register the same logical agent under many names unless that is intentional.
- Do not drop config fields during refresh if the UI depends on them.
- Do not teach unsupported config keys as if they were first-class API contract unless the runner actually syncs them.
