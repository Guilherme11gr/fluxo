/**
 * Bootstrap Contract Types
 *
 * Types for the enterprise project bootstrap flow triggered by `fluxo-runner init`.
 */

// ============ Input Types ============

/**
 * Metadata produced by the Repo Profiler agent.
 * Contains the minimal context extracted from the local repo.
 */
export interface BootstrapRepoManifest {
  /** Project name inferred from repo or package.json */
  projectName: string;
  /** Project description from README or package.json */
  description: string | null;
  /** Detected tech stack (e.g., ['typescript', 'nextjs', 'postgres']) */
  stack: string[];
  /** Primary language detected */
  primaryLanguage: string;
  /** README content (sanitized, secrets redacted) */
  readmeContent: string | null;
  /** List of candidate doc files selected for upload */
  candidateDocs: BootstrapDocCandidate[];
  /** Suggested tags for the project */
  suggestedTags: string[];
  /** Suggested internal skills relevant to the project */
  suggestedSkills: string[];
}

/**
 * A candidate doc file selected by the profiler for upload.
 */
export interface BootstrapDocCandidate {
  /** Relative path from repo root */
  path: string;
  /** File title (derived from filename or frontmatter) */
  title: string;
  /** File content (sanitized) */
  content: string;
  /** Estimated word count */
  wordCount: number;
  /** Whether this file passed .fluxoignore and secret redaction */
  safe: boolean;
}

/**
 * Local configuration captured by the CLI during init.
 */
export interface BootstrapLocalConfig {
  /** Git root path on the local machine (not persisted in backend) */
  repoPath: string;
  /** Git common dir path */
  gitCommonDir: string;
  /** Whether OpenCode integration was configured */
  openCodeConfigured: boolean;
  /** Whether Claude Code integration was configured */
  claudeCodeConfigured: boolean;
  /** CLI version that initiated the bootstrap */
  cliVersion: string;
}

/**
 * Main bootstrap request payload.
 * POST /api/agent/projects/bootstrap
 */
export interface BootstrapRequest {
  /** Project ID to bootstrap (required — V1 does not support project creation through bootstrap) */
  projectId: string | null;
  /** If creating a new project, the epic to attach it to */
  epicId: string | null;
  /** Repo manifest from the profiler agent */
  manifest: BootstrapRepoManifest;
  /** Local config metadata (for audit trail) */
  localConfig: BootstrapLocalConfig;
  /** Explicit consent flags */
  consent: {
    /** User approved doc upload */
    uploadDocs: boolean;
    /** User approved tag creation */
    createTags: boolean;
    /** User approved onboarding task creation */
    createOnboardingTask: boolean;
  };
  /** Idempotency key to prevent duplicate bootstraps */
  idempotencyKey: string;
}

// ============ Output Types ============

/**
 * Result of a bootstrap operation.
 */
export interface BootstrapResult {
  /** Whether this was a new project or existing project */
  mode: 'new' | 'existing';
  /** Project ID */
  projectId: string;
  /** Feature ID created for the bootstrap (if new project) */
  featureId: string | null;
  /** Onboarding task ID (if created) */
  onboardingTaskId: string | null;
  /** Number of docs published */
  docsPublished: number;
  /** Number of tags created */
  tagsCreated: number;
  /** List of published doc IDs */
  docIds: string[];
  /** List of created tag IDs */
  tagIds: string[];
  /** Audit comment ID on the onboarding task */
  auditCommentId: string | null;
}

/**
 * Bootstrap audit event logged for each action.
 */
export interface BootstrapAuditEvent {
  /** Timestamp of the event */
  timestamp: string;
  /** Action performed */
  action: 'project.created' | 'feature.created' | 'task.created' | 'doc.published' | 'tag.created' | 'comment.added';
  /** Target entity type */
  targetType: string;
  /** Target entity ID */
  targetId: string;
  /** Additional context */
  metadata: Record<string, unknown>;
}
