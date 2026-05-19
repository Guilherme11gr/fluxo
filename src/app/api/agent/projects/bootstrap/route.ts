/**
 * Agent API - Project Bootstrap
 *
 * POST /api/agent/projects/bootstrap
 *
 * Initiates an enterprise project bootstrap from `fluxo-runner init`.
 * Creates an onboarding task, publishes minimal docs, suggests tags,
 * and leaves an auditable trail for humans in the UI.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { extractAgentAuth } from '@/shared/http/agent-auth';
import { agentSuccess, agentError, handleAgentError } from '@/shared/http/agent-responses';
import {
  projectRepository,
  featureRepository,
  taskRepository,
  commentRepository,
  auditLogRepository,
  epicRepository,
  projectDocRepository,
} from '@/infra/adapters/prisma';

export const dynamic = 'force-dynamic';

// ============ POST - Bootstrap Project ============

const consentSchema = z.object({
  uploadDocs: z.boolean(),
  createTags: z.boolean(),
  createOnboardingTask: z.boolean(),
});

const docCandidateSchema = z.object({
  path: z.string(),
  title: z.string(),
  content: z.string(),
  wordCount: z.number(),
  safe: z.boolean(),
});

const manifestSchema = z.object({
  projectName: z.string().min(1),
  description: z.string().nullable(),
  stack: z.array(z.string()),
  primaryLanguage: z.string(),
  readmeContent: z.string().nullable(),
  candidateDocs: z.array(docCandidateSchema),
  suggestedTags: z.array(z.string()),
  suggestedSkills: z.array(z.string()),
});

const localConfigSchema = z.object({
  repoPath: z.string(),
  gitCommonDir: z.string(),
  openCodeConfigured: z.boolean(),
  claudeCodeConfigured: z.boolean(),
  cliVersion: z.string(),
});

const bootstrapSchema = z.object({
  projectId: z.string().uuid().nullable(),
  epicId: z.string().uuid().nullable(),
  manifest: manifestSchema,
  localConfig: localConfigSchema,
  consent: consentSchema,
  idempotencyKey: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const { orgId, userId, agentName, keyPrefix, authMethod, keyId } = await extractAgentAuth();

    const body = await request.json();
    const parsed = bootstrapSchema.safeParse(body);

    if (!parsed.success) {
      return agentError('VALIDATION_ERROR', parsed.error.issues[0].message, 400);
    }

    const { projectId, epicId, manifest, localConfig, consent, idempotencyKey } = parsed.data;

    // Check idempotency - search by the exact task title pattern
    if (projectId) {
      const existingTasks = await taskRepository.findMany(orgId, {
        projectId,
        search: `[bootstrap:${idempotencyKey}]`,
      });
      if (existingTasks.length > 0) {
        const existingTask = existingTasks[0];
        return agentSuccess({
          mode: 'existing',
          projectId,
          featureId: existingTask.featureId,
          onboardingTaskId: existingTask.id,
          docsPublished: 0,
          tagsCreated: 0,
          docIds: [],
          tagIds: [],
          auditCommentId: null,
          idempotent: true,
        }, 200);
      }
    }

    let resolvedProjectId = projectId;
    let featureId: string | null = null;
    let onboardingTaskId: string | null = null;
    let auditCommentId: string | null = null;
    const docIds: string[] = [];
    const tagIds: string[] = [];

    // If no project ID, we need to link to an existing project or require one
    // For V1, we require an existing projectId (new project creation is out of scope)
    if (!resolvedProjectId) {
      return agentError('VALIDATION_ERROR', 'projectId is required for bootstrap. Create the project first.', 400);
    }

    // Verify project exists
    const project = await projectRepository.findById(resolvedProjectId, orgId);
    if (!project) {
      return agentError('NOT_FOUND', 'Project not found', 404);
    }

    // Create a feature for the bootstrap if epicId provided
    if (epicId) {
      const epic = await epicRepository.findById(epicId, orgId);

      if (!epic) {
        return agentError('NOT_FOUND', 'Epic not found', 404);
      }

      const feature = await featureRepository.create({
        title: `Bootstrap: ${manifest.projectName}`,
        epicId,
        description: `Enterprise project bootstrap via fluxo-runner init. Stack: ${manifest.stack.join(', ')}.`,
        status: 'DOING',
        focus: null,
        orgId,
      });
      featureId = feature.id;

      await auditLogRepository.log({
        orgId,
        userId,
        action: 'feature.created',
        targetType: 'feature',
        targetId: feature.id,
        actorType: 'agent',
        clientId: keyId,
        metadata: {
          source: 'agent',
          agentName,
          keyPrefix,
          authMethod,
          bootstrapIdempotencyKey: idempotencyKey,
          title: feature.title,
        },
      }).catch(() => {});
    }

    // Publish docs if consented
    if (consent.uploadDocs && manifest.candidateDocs.length > 0) {
      for (const doc of manifest.candidateDocs) {
        if (!doc.safe) continue; // Skip unsafe docs

        try {
          const createdDoc = await projectDocRepository.create({
            title: doc.title,
            projectId: resolvedProjectId,
            content: doc.content,
            tagIds: [],
            orgId,
          });
          docIds.push(createdDoc.id);

          await auditLogRepository.log({
            orgId,
            userId,
            action: 'doc.created',
            targetType: 'project_doc',
            targetId: createdDoc.id,
            actorType: 'agent',
            clientId: keyId,
            metadata: {
              source: 'agent',
              agentName,
              keyPrefix,
              authMethod,
              bootstrapIdempotencyKey: idempotencyKey,
              docPath: doc.path,
              wordCount: doc.wordCount,
            },
          }).catch(() => {});
        } catch (err) {
          console.error('[Bootstrap] Failed to create doc:', doc.path, err);
        }
      }
    }

    // Create onboarding task if consented
    if (consent.createOnboardingTask) {
      if (!featureId) {
        return agentError('VALIDATION_ERROR', 'epicId is required when createOnboardingTask is true. Bootstrap needs an epic to create the onboarding feature and task.', 400);
      }

      const task = await taskRepository.create({
        title: `Project onboarding [bootstrap:${idempotencyKey}]`,
        featureId,
        description: buildOnboardingTaskDescription(manifest, localConfig),
        type: 'TASK',
        priority: 'HIGH',
        status: 'TODO',
        focus: null,
        orgId,
      });
      onboardingTaskId = task.id;

      // Add audit comment
      const comment = await commentRepository.create({
        taskId: onboardingTaskId,
        userId,
        agentId: undefined,
        content: buildBootstrapAuditComment(manifest, localConfig, {
          docsPublished: docIds.length,
          tagsCreated: tagIds.length,
          idempotencyKey,
        }),
        orgId,
      });
      auditCommentId = comment.id;

      await auditLogRepository.log({
        orgId,
        userId,
        action: 'task.created',
        targetType: 'task',
        targetId: task.id,
        actorType: 'agent',
        clientId: keyId,
        metadata: {
          source: 'agent',
          agentName,
          keyPrefix,
          authMethod,
          bootstrapIdempotencyKey: idempotencyKey,
          taskTitle: task.title,
          localId: task.localId,
          type: 'TASK',
          priority: 'HIGH',
          status: 'TODO',
          featureId,
          docsPublished: docIds.length,
        },
      }).catch(() => {});
    }

    return agentSuccess({
      mode: 'existing',
      projectId: resolvedProjectId,
      featureId,
      onboardingTaskId,
      docsPublished: docIds.length,
      tagsCreated: tagIds.length,
      docIds,
      tagIds,
      auditCommentId,
      idempotent: false,
    }, 201);
  } catch (error) {
    return handleAgentError(error);
  }
}

/**
 * Builds the onboarding task description from the repo manifest.
 */
function buildOnboardingTaskDescription(
  manifest: z.infer<typeof manifestSchema>,
  localConfig: z.infer<typeof localConfigSchema>
): string {
  const sections: string[] = [];

  sections.push('## Project Bootstrap');
  sections.push('');
  sections.push(`**Project:** ${manifest.projectName}`);
  if (manifest.description) {
    sections.push(`**Description:** ${manifest.description}`);
  }
  sections.push(`**Primary Language:** ${manifest.primaryLanguage}`);
  sections.push(`**Stack:** ${manifest.stack.join(', ') || 'Not detected'}`);
  sections.push('');

  sections.push('## Local Configuration');
  sections.push('');
  sections.push(`- **OpenCode configured:** ${localConfig.openCodeConfigured ? 'Yes' : 'No'}`);
  sections.push(`- **Claude Code configured:** ${localConfig.claudeCodeConfigured ? 'Yes' : 'No'}`);
  sections.push(`- **CLI Version:** ${localConfig.cliVersion}`);
  sections.push('');

  if (manifest.suggestedTags.length > 0) {
    sections.push('## Suggested Tags');
    sections.push('');
    sections.push(manifest.suggestedTags.map((t) => `- ${t}`).join('\n'));
    sections.push('');
  }

  if (manifest.suggestedSkills.length > 0) {
    sections.push('## Suggested Skills');
    sections.push('');
    sections.push(manifest.suggestedSkills.map((s) => `- ${s}`).join('\n'));
    sections.push('');
  }

  sections.push('---');
  sections.push('*This task was auto-generated by `fluxo-runner init`. Review and adjust as needed.*');

  return sections.join('\n');
}

/**
 * Builds an audit comment with bootstrap summary.
 */
function buildBootstrapAuditComment(
  manifest: z.infer<typeof manifestSchema>,
  localConfig: z.infer<typeof localConfigSchema>,
  result: { docsPublished: number; tagsCreated: number; idempotencyKey: string }
): string {
  const lines: string[] = [];

  lines.push('## Bootstrap Audit Log');
  lines.push('');
  lines.push(`**Idempotency Key:** ${result.idempotencyKey}`);
  lines.push(`**Timestamp:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push('### Actions Performed');
  lines.push('');
  lines.push(`- Docs published: ${result.docsPublished}`);
  lines.push(`- Tags created: ${result.tagsCreated}`);
  lines.push(`- Stack detected: ${manifest.stack.join(', ') || 'none'}`);
  lines.push(`- OpenCode integration: ${localConfig.openCodeConfigured ? 'configured' : 'skipped'}`);
  lines.push(`- Claude Code integration: ${localConfig.claudeCodeConfigured ? 'configured' : 'skipped'}`);
  lines.push('');
  lines.push('### Source');
  lines.push('');
  lines.push(`- **Repo path:** ${localConfig.repoPath}`);
  lines.push(`- **CLI version:** ${localConfig.cliVersion}`);
  lines.push('');
  lines.push('*This comment is auto-generated for audit purposes.*');

  return lines.join('\n');
}
