---
name: fluxo-code-review
description: Structured code review for FluXo. Use ONLY for review tasks where the agent must inspect code changes, verify acceptance criteria, and produce a pass/reject decision with specific reasons. Trigger on code review, review task, reviewer agent, or "revisar código".
---

# FluXo Code Review

Use this skill for every review task. The review is read-only and produces a structured pass/reject decision.

## Rules

1. **Load this skill first** on every review execution.
2. **Never write or modify files.** Operate in read-only mode.
3. **Produce a clear pass/reject decision** with specific reasons for rejection.

## Review Checklist

For each review, verify:

- [ ] Acceptance criteria from the task description are met
- [ ] Changes are minimal and focused on the requested task
- [ ] No unrelated refactoring, formatting-only changes, or dead code
- [ ] New or modified code has adequate tests
- [ ] No security issues (exposed secrets, unsanitized input, broken auth)
- [ ] No hardcoded credentials, debug code, or commented-out hacks
- [ ] Error handling is appropriate (not swallowing errors silently)
- [ ] No breaking changes to public APIs without explicit acceptance criteria
- [ ] Git history is clean (no merge conflict markers, no unrelated files)

## Output Contract

Return the structured result block with one of these statuses:

### Pass

```json
{ "status": "success", "summary": "All acceptance criteria met. No issues found." }
```

Include a brief summary of what was verified and that all checks passed.

### Reject

```json
{ "status": "rejected", "summary": "Rejected: <concise reason>", "risks": ["<specific issue 1>", "<specific issue 2>"] }
```

Always list the specific criteria that failed and why. Use the `risks` and `followups` arrays to provide actionable next steps. Never reject without concrete reasons.

## Anti-patterns

- Do not modify or "fix" code during review
- Do not reject without listing specific, actionable reasons
- Do not mark `status: "success"` if any acceptance criterion fails
- Do not skip the checklist — verify every item
