export type GitLinkKind =
  | 'branch_naming'
  | 'artifact_link'
  | 'compare_link'
  | 'commit_link'
  | 'pr_link'
  | 'policy_rule'
  | 'marker';

export interface RunnerGitValidationCard {
  id: string;
  label: string;
  kind: GitLinkKind;
  description: string;
  example?: string;
  sourceFile: string;
  validated: boolean;
}

export const GIT_POLICIES = ['no_write', 'branch_only', 'branch_commit_pr'] as const;
export type GitPolicy = (typeof GIT_POLICIES)[number];

export const RESULT_MARKERS = {
  summaryStart: 'FLUXO_SUMMARY_START',
  summaryEnd: 'FLUXO_SUMMARY_END',
  resultStart: 'FLUXO_RESULT_JSON_START',
  resultEnd: 'FLUXO_RESULT_JSON_END',
} as const;

export const BRANCH_NAME_MAX_LENGTH = 128;
export const BRANCH_SHORT_ID_LENGTH = 8;
export const COMMIT_MSG_TITLE_MAX_LENGTH = 72;

export function buildBranchName(
  taskId: string,
  taskType: string,
  agentName: string,
  allowedPrefix: string = '',
  execId: string = ''
): string {
  const shortId = taskId.slice(0, 8);
  const shortExecId = execId ? execId.slice(0, 8) : '';
  const agentSlug = agentName
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9/_\-]/g, '-')
    .replace(/^-+|-+$/g, '');
  const typeSlug = taskType.toLowerCase().trim() || 'task';

  let name: string;
  if (shortExecId) {
    name = `${agentSlug}/${typeSlug}-${shortId}-${shortExecId}`;
  } else {
    name = `${agentSlug}/${typeSlug}-${shortId}`;
  }

  if (allowedPrefix) {
    const prefix = allowedPrefix.trim().replace(/^\/|\/$/g, '');
    if (prefix) {
      name = shortExecId
        ? `${prefix}/${typeSlug}-${shortId}-${shortExecId}`
        : `${prefix}/${typeSlug}-${shortId}`;
    }
  }

  name = name.replace(/[^a-zA-Z0-9/_\-]/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '');
  if (name.length > BRANCH_NAME_MAX_LENGTH) {
    name = name.slice(0, BRANCH_NAME_MAX_LENGTH).replace(/-+$/, '');
  }

  return name;
}

export function buildCompareLink(
  repoUrl: string,
  baseBranch: string,
  currentBranch: string
): string {
  const base = repoUrl.replace(/\/$/, '');
  return `${base}/compare/${encodeURIComponent(baseBranch)}...${encodeURIComponent(currentBranch)}`;
}

export function buildCommitLink(
  repoUrl: string,
  commitSha: string
): string {
  const base = repoUrl.replace(/\/$/, '');
  return `${base}/commit/${commitSha}`;
}

export function buildPRLink(
  repoUrl: string,
  prNumber: number
): string {
  const base = repoUrl.replace(/\/$/, '');
  return `${base}/pull/${prNumber}`;
}

export function buildArtifactLink(
  repoUrl: string,
  branch: string,
  filePath: string
): string {
  const base = repoUrl.replace(/\/$/, '');
  return `${base}/blob/${encodeURIComponent(branch)}/${filePath}`;
}

export function getValidationCards(): RunnerGitValidationCard[] {
  return [
    {
      id: 'branch-naming-format',
      label: 'Branch naming format',
      kind: 'branch_naming',
      description:
        'Branches follow the pattern {agent-slug}/{type}-{shortId}[-{shortExecId}], with special characters sanitized to hyphens and max length of 128 chars.',
      example: 'agent/codex-task-182955ed',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'branch-naming-allowed-prefix',
      label: 'Branch naming with allowed prefix',
      kind: 'branch_naming',
      description:
        'When an allowedPrefix is configured, the branch name uses that prefix instead of the agent slug.',
      example: 'agent/codex/task-182955ed',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'branch-naming-with-exec-id',
      label: 'Branch naming with execution ID',
      kind: 'branch_naming',
      description:
        'When an execution ID is provided, it is appended as a short 8-char suffix to the branch name.',
      example: 'agent/codex-task-182955ed-2f034b28',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'artifact-link-blob',
      label: 'Artifact blob link',
      kind: 'artifact_link',
      description:
        'Links to files on a specific branch using the GitHub blob URL format.',
      example: 'https://github.com/org/repo/blob/branch/path/to/file.ts',
      sourceFile: 'runner-go/internal/runner/gitsnapshot.go',
      validated: true,
    },
    {
      id: 'compare-link-range',
      label: 'Compare link (base...head)',
      kind: 'compare_link',
      description:
        'GitHub compare URL showing diff between base branch and feature branch.',
      example: 'https://github.com/org/repo/compare/main...agent/codex-task-abc123',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'commit-link-sha',
      label: 'Commit link by SHA',
      kind: 'commit_link',
      description:
        'Direct link to a specific commit using its full SHA hash.',
      example: 'https://github.com/org/repo/commit/0b6c5af8c223f64d5021fa06319cec06d6b8e343',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'pr-link-number',
      label: 'Pull request link',
      kind: 'pr_link',
      description:
        'Link to a pull request by number, created via gh pr create.',
      example: 'https://github.com/org/repo/pull/42',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'policy-no-write',
      label: 'Policy: no_write',
      kind: 'policy_rule',
      description:
        'No git operations are performed. The runner reads but never modifies the repository.',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'policy-branch-only',
      label: 'Policy: branch_only',
      kind: 'policy_rule',
      description:
        'Creates/switches to a feature branch and commits changes. Does not create a PR.',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'policy-branch-commit-pr',
      label: 'Policy: branch_commit_pr',
      kind: 'policy_rule',
      description:
        'Full workflow: creates branch, commits, pushes, and creates a draft or regular PR via gh CLI.',
      sourceFile: 'runner-go/internal/runner/branch.go',
      validated: true,
    },
    {
      id: 'marker-summary-start',
      label: 'Summary start marker',
      kind: 'marker',
      description: 'Opening marker for the human-readable summary block in agent output.',
      example: RESULT_MARKERS.summaryStart,
      sourceFile: 'runner-go/internal/runner/prompt.go',
      validated: true,
    },
    {
      id: 'marker-summary-end',
      label: 'Summary end marker',
      kind: 'marker',
      description: 'Closing marker for the human-readable summary block in agent output.',
      example: RESULT_MARKERS.summaryEnd,
      sourceFile: 'runner-go/internal/runner/prompt.go',
      validated: true,
    },
    {
      id: 'marker-result-start',
      label: 'Result JSON start marker',
      kind: 'marker',
      description: 'Opening marker for the structured JSON result block (v1 output contract).',
      example: RESULT_MARKERS.resultStart,
      sourceFile: 'runner-go/internal/runner/prompt.go',
      validated: true,
    },
    {
      id: 'marker-result-end',
      label: 'Result JSON end marker',
      kind: 'marker',
      description: 'Closing marker for the structured JSON result block (v1 output contract).',
      example: RESULT_MARKERS.resultEnd,
      sourceFile: 'runner-go/internal/runner/prompt.go',
      validated: true,
    },
  ];
}

export function validateCards(cards: RunnerGitValidationCard[]): {
  allValid: boolean;
  uniqueIds: boolean;
  nonEmptyLabels: boolean;
  expectedKinds: GitLinkKind[];
  missingKinds: GitLinkKind[];
} {
  const expectedKinds: GitLinkKind[] = [
    'branch_naming',
    'artifact_link',
    'compare_link',
    'commit_link',
    'pr_link',
    'policy_rule',
    'marker',
  ];

  const ids = cards.map((c) => c.id);
  const uniqueIds = new Set(ids).size === ids.length;

  const nonEmptyLabels = cards.every((c) => c.label.trim().length > 0);

  const presentKinds = new Set(cards.map((c) => c.kind));
  const missingKinds = expectedKinds.filter((k) => !presentKinds.has(k));

  return {
    allValid: uniqueIds && nonEmptyLabels && missingKinds.length === 0,
    uniqueIds,
    nonEmptyLabels,
    expectedKinds,
    missingKinds,
  };
}
