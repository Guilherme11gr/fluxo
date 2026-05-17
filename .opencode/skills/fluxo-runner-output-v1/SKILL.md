---
name: fluxo-runner-output-v1
description: FluXo runner summary-first output contract v1. Use ONLY when the user needs an agent to return the runner-go final summary block plus the canonical JSON result block, including `FLUXO_SUMMARY_START`, `FLUXO_SUMMARY_END`, `FLUXO_RESULT_JSON_START`, `FLUXO_RESULT_JSON_END`, schemaVersion `v1`, checksRun, git metadata, memoryCandidates, and skillCandidates. Trigger on output contract, structured result, result json, schema v1, or "retorne no formato do runner".
---

# FluXo Runner Output V1

Use this skill when the agent must emit the summary-first output consumed by the FluXo Go runner.

## Source of truth

- `runner-go/internal/runner/prompt.go`
- `runner-go/internal/runner/result.go`

## Required markers

Return a normal concise summary block first, then include a valid JSON object between these exact markers:

```text
FLUXO_SUMMARY_START
Version: v1
Summary: ...
What changed:
- ...
Decisions:
- ...
Risks:
- ...
Followups:
- ...
FLUXO_SUMMARY_END
```

Then return the canonical JSON block:

```text
FLUXO_RESULT_JSON_START
{ ... }
FLUXO_RESULT_JSON_END
```

If the summary block is present but the JSON block is missing, the runner can now build a structured result from the summary plus runner-derived facts. If both are missing or malformed, the runner may try an internal extractor model before falling back to a weaker derived result.

## Required shape

Use schema version `v1` with these top-level fields:

- `schemaVersion`
- `status`
- `summary`
- `whatChanged`
- `decisions`
- `risks`
- `checksRun`
- `filesTouched`
- `git`
- `followups`
- `memoryCandidates`
- `skillCandidates`

Use empty arrays when unknown, and `null` for unavailable git fields.

`skillCandidates` is not a string array. Each entry must be an object with:

- `name`
- `reason`

## Status guidance

- Use `success` when the requested task completed successfully.
- Use `failed` when it did not.

## Checks guidance

Each `checksRun` entry should look like:

```json
{ "name": "typecheck", "status": "passed", "details": null }
```

Use concise factual names and statuses. Do not pretend a check ran if it did not.

## Git guidance

Set `git.mode` to the real mode used by the workflow, such as `manual` when no automated git workflow happened.

Populate these fields only when known:

- `baseBranch`
- `branch`
- `commitShas`
- `prUrl`
- `prNumber`

## Skill and memory suggestions

- Use `memoryCandidates` for durable facts the system may want to save.
- Use `skillCandidates` for follow-on automation suggestions as objects like `{ "name": "fluxo-runner-handoff", "reason": "The next step is a structured execution handoff." }`.
- Keep both lists short and justified by the task.

## Minimal example

```text
Implemented the requested change and verified the relevant checks.

FLUXO_SUMMARY_START
Version: v1
Summary: Implemented the requested change and verified the relevant checks.
What changed:
- Updated the API route to validate project membership.
Decisions:
- Kept the existing route pattern instead of refactoring the endpoint family.
Risks:
Followups:
FLUXO_SUMMARY_END

FLUXO_RESULT_JSON_START
{
  "schemaVersion": "v1",
  "status": "success",
  "summary": "Implemented the requested change and verified the relevant checks.",
  "whatChanged": ["Updated the API route to validate project membership."],
  "decisions": ["Kept the existing route pattern instead of refactoring the endpoint family."],
  "risks": [],
  "checksRun": [
    { "name": "npm run test -- src/app/api/agent/docs/route.spec.ts", "status": "passed", "details": null }
  ],
  "filesTouched": ["src/app/api/agent/docs/route.ts"],
  "git": {
    "mode": "manual",
    "baseBranch": null,
    "branch": null,
    "commitShas": [],
    "prUrl": null,
    "prNumber": null
  },
  "followups": [],
  "memoryCandidates": [],
  "skillCandidates": []
}
FLUXO_RESULT_JSON_END
```

## Anti-patterns

- Do not omit the summary markers.
- Do not omit the final JSON markers during the compatibility rollout.
- Do not use a different schema version.
- Do not output prose that contradicts the JSON summary.
- Do not fake checks, files, commits, or PRs.
- Do not rely on the extractor fallback. It exists for resilience, not as a substitute for returning the required block.
