export interface WorktreeValidationRow {
  id: string;
  label: string;
  command: string;
  expectedPattern: string;
  description: string;
}

export const worktreeValidationRows: readonly WorktreeValidationRow[] = [
  {
    id: 'wt-001',
    label: 'Worktree path check',
    command: 'git rev-parse --show-toplevel',
    expectedPattern: 'fluxo-runner/.*/worktrees/',
    description: 'Confirms the repository root is inside a runner worktree directory, not the base repo.',
  },
  {
    id: 'wt-002',
    label: 'Uncommitted changes',
    command: 'git status --porcelain',
    expectedPattern: '^$',
    description: 'Ensures no untracked or modified files exist before the runner starts writing changes.',
  },
  {
    id: 'wt-003',
    label: 'Branch isolation',
    command: 'git branch --show-current',
    expectedPattern: '^(?!main$|master$).+$',
    description: 'Verifies the worktree is on a dedicated branch, never on main or master.',
  },
  {
    id: 'wt-004',
    label: 'Worktree list',
    command: 'git worktree list',
    expectedPattern: 'worktrees/[a-f0-9-]+',
    description: 'Lists all worktrees to confirm the current one is registered and isolated.',
  },
] as const;

export function getWorktreeValidationRow(id: string): WorktreeValidationRow | undefined {
  return worktreeValidationRows.find((row) => row.id === id);
}
