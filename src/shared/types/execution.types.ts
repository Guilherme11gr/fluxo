export type AgentExecStatus = 'CLAIMED' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'TIMEOUT' | 'CANCELLED';

export interface StructuredResultCheck {
  name: string;
  status: 'passed' | 'failed' | 'skipped';
  details?: string | null;
  command?: string | null;
  observed?: boolean;
  exitCode?: number | null;
  durationMs?: number | null;
}

export interface StructuredResultGit {
  mode?: 'manual' | 'branch-push' | 'pr' | 'no_write' | 'branch_only' | 'branch_commit_pr' | null;
  gitPolicy?: string | null;
  baseBranch?: string | null;
  branch?: string | null;
  commitShas?: string[];
  newCommitShas?: string[];
  changedFiles?: string[];
  hasVerifiableDelta?: boolean;
  policyVerified?: boolean;
  prUrl?: string | null;
  prNumber?: number | null;
  links?: {
    repository?: string;
    branch?: string;
    compare?: string;
    commits?: string[];
  };
}

export interface StructuredResultV1 {
  schemaVersion: 'v1';
  status: 'success' | 'failed' | 'error' | 'rejected';
  summary: string;
  whatChanged?: string[];
  decisions?: string[];
  risks?: string[];
  checksRun?: StructuredResultCheck[];
  filesTouched?: string[];
  git?: StructuredResultGit;
  followups?: string[];
  memoryCandidates?: string[];
  skillCandidates?: { name: string; reason: string }[];
}

export interface ExecutionRecord {
  id: string;
  orgId: string;
  agentId: string;
  runnerInstanceId: string | null;
  taskId: string;
  projectId: string;
  status: AgentExecStatus;
  tool: string | null;
  model: string | null;
  workspaceMode: string | null;
  workspaceRef: string | null;
  workspacePath: string | null;
  output: string | null;
  resultSummary: string | null;
  errorMessage: string | null;
  exitCode: number | null;
  duration: number | null;
  metadata: Record<string, unknown>;
  startedAt: string;
  lastHeartbeatAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export function extractStructuredResult(metadata: Record<string, unknown>): StructuredResultV1 | null {
  const result = metadata?.result;
  if (!result || typeof result !== 'object') return null;
  const r = result as Record<string, unknown>;
  if (r.schemaVersion !== 'v1') return null;
  return r as unknown as StructuredResultV1;
}
