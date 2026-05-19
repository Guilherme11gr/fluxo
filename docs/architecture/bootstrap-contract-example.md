# Bootstrap Contract - Example Payload

## POST /api/agent/projects/bootstrap

### Request Body

```json
{
  "projectId": "550e8400-e29b-41d4-a716-446655440000",
  "epicId": "660e8400-e29b-41d4-a716-446655440000",
  "manifest": {
    "projectName": "jt-kill",
    "description": "FluXo - Agent-powered project management platform",
    "stack": ["typescript", "nextjs", "postgres", "prisma", "tailwindcss"],
    "primaryLanguage": "typescript",
    "readmeContent": "# FluXo\n\nAgent-powered project management...",
    "candidateDocs": [
      {
        "path": "README.md",
        "title": "README",
        "content": "# FluXo\n\nAgent-powered project management platform with Next.js, Prisma, and PostgreSQL.",
        "wordCount": 12,
        "safe": true
      },
      {
        "path": "docs/architecture/overview.md",
        "title": "Architecture Overview",
        "content": "# Architecture\n\nFluXo uses a Next.js App Router backend with Prisma ORM...",
        "wordCount": 45,
        "safe": true
      }
    ],
    "suggestedTags": ["backend", "frontend", "agent-api", "runner"],
    "suggestedSkills": ["supabase-postgres-best-practices", "vercel-react-best-practices"]
  },
  "localConfig": {
    "repoPath": "/home/user/projects/jt-kill",
    "gitCommonDir": "/home/user/projects/jt-kill/.git",
    "openCodeConfigured": true,
    "claudeCodeConfigured": true,
    "cliVersion": "1.0.0"
  },
  "consent": {
    "uploadDocs": true,
    "createTags": true,
    "createOnboardingTask": true
  },
  "idempotencyKey": "bootstrap-jt-kill-20260518-001"
}
```

### Notes

- `projectId` is required (V1 does not support project creation through bootstrap)
- `epicId` is required when `consent.createOnboardingTask` is true (bootstrap creates a feature under the epic, then the onboarding task under the feature)
- `idempotencyKey` must be unique per bootstrap attempt. The route searches for an existing task with title containing `[bootstrap:<key>]` to detect duplicates
- `candidateDocs[].safe` must be `true` for docs to be uploaded — the Repo Profiler agent is responsible for running `.fluxoignore` and secret redaction before setting this flag

### Success Response (201 Created)

```json
{
  "success": true,
  "data": {
    "mode": "existing",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "featureId": "feature-uuid-here",
    "onboardingTaskId": "task-uuid-here",
    "docsPublished": 2,
    "tagsCreated": 0,
    "docIds": ["doc-uuid-1", "doc-uuid-2"],
    "tagIds": [],
    "auditCommentId": "comment-uuid-here",
    "idempotent": false
  }
}
```

### Idempotent Response (200 OK)

When the same `idempotencyKey` is used:

```json
{
  "success": true,
  "data": {
    "mode": "existing",
    "projectId": "550e8400-e29b-41d4-a716-446655440000",
    "featureId": "existing-feature-uuid",
    "onboardingTaskId": "existing-task-uuid",
    "docsPublished": 0,
    "tagsCreated": 0,
    "docIds": [],
    "tagIds": [],
    "auditCommentId": null,
    "idempotent": true
  }
}
```

### Error Responses

**400 Bad Request** - Invalid payload or missing required fields:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "projectId is required for bootstrap. Create the project first."
  }
}
```

**400 Bad Request** - Onboarding task requested without epic:
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "epicId is required when createOnboardingTask is true. Bootstrap needs an epic to create the onboarding feature and task."
  }
}
```

**404 Not Found** - Project or epic doesn't exist:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Project not found"
  }
}
```
