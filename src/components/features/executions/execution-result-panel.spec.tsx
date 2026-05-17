// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExecutionResultPanel } from './execution-result-panel';
import type { StructuredResultV1 } from '@/shared/types';

vi.mock('lucide-react', () => ({
  CheckCircle2: () => <span data-testid="icon-check" />,
  XCircle: () => <span data-testid="icon-x" />,
  MinusCircle: () => <span data-testid="icon-minus" />,
  GitBranch: () => <span data-testid="icon-git" />,
  ExternalLink: () => <span data-testid="icon-ext" />,
  FileCode: () => <span data-testid="icon-file" />,
  AlertTriangle: () => <span data-testid="icon-alert" />,
  Lightbulb: () => <span data-testid="icon-lightbulb" />,
  ListChecks: () => <span data-testid="icon-list" />,
  GitPullRequest: () => <span data-testid="icon-pr" />,
  GitCommitHorizontal: () => <span data-testid="icon-commit" />,
  Brain: () => <span data-testid="icon-brain" />,
  Sparkles: () => <span data-testid="icon-sparkles" />,
  ArrowRight: () => <span data-testid="icon-arrow" />,
  FilePenLine: () => <span data-testid="icon-filepen" />,
}));

const baseResult: StructuredResultV1 = {
  schemaVersion: 'v1',
  status: 'success',
  summary: 'Feature implemented successfully.',
};

describe('ExecutionResultPanel', () => {
  it('renders summary and status badge', () => {
    render(<ExecutionResultPanel result={baseResult} />);
    expect(screen.getByText('Feature implemented successfully.')).toBeInTheDocument();
    expect(screen.getByText('Sucesso')).toBeInTheDocument();
  });

  it('renders failed status', () => {
    render(<ExecutionResultPanel result={{ ...baseResult, status: 'failed' }} />);
    expect(screen.getByText('Falhou')).toBeInTheDocument();
  });

  it('renders error status', () => {
    render(<ExecutionResultPanel result={{ ...baseResult, status: 'error' }} />);
    expect(screen.getByText('Erro')).toBeInTheDocument();
  });

  it('renders checks', () => {
    render(
      <ExecutionResultPanel
        result={{
          ...baseResult,
          checksRun: [
            { name: 'lint', status: 'passed' },
            { name: 'test', status: 'failed', details: '2 failures' },
            { name: 'build', status: 'skipped' },
          ],
        }}
      />
    );
    expect(screen.getByText('lint')).toBeInTheDocument();
    expect(screen.getByText('test')).toBeInTheDocument();
    expect(screen.getByText(/2 failures/)).toBeInTheDocument();
    expect(screen.getByText('build')).toBeInTheDocument();
    expect(screen.getByText(/1 passed/)).toBeInTheDocument();
    expect(screen.getByText(/1 failed/)).toBeInTheDocument();
    expect(screen.getByText(/1 skipped/)).toBeInTheDocument();
  });

  it('renders whatChanged section', () => {
    render(
      <ExecutionResultPanel
        result={{ ...baseResult, whatChanged: ['Added component A', 'Fixed bug B'] }}
      />
    );
    expect(screen.getByText('Added component A')).toBeInTheDocument();
    expect(screen.getByText('Fixed bug B')).toBeInTheDocument();
  });

  it('renders filesTouched as badges', () => {
    render(
      <ExecutionResultPanel
        result={{ ...baseResult, filesTouched: ['src/a.ts', 'src/b.ts'] }}
      />
    );
    expect(screen.getByText('src/a.ts')).toBeInTheDocument();
    expect(screen.getByText('src/b.ts')).toBeInTheDocument();
  });

  it('renders git section with PR link', () => {
    render(
      <ExecutionResultPanel
        result={{
          ...baseResult,
          git: {
            branch: 'feat/x',
            baseBranch: 'main',
            prUrl: 'https://github.com/org/repo/pull/42',
            prNumber: 42,
            commitShas: ['abc123def456'],
          },
        }}
      />
    );
    expect(screen.getByText('feat/x')).toBeInTheDocument();
    expect(screen.getByText('main')).toBeInTheDocument();
    expect(screen.getByText(/PR #42/)).toBeInTheDocument();
    expect(screen.getByText('abc123d')).toBeInTheDocument();
  });

  it('renders git mode when present', () => {
    render(
      <ExecutionResultPanel
        result={{
          ...baseResult,
          git: { mode: 'manual', branch: 'main' },
        }}
      />
    );
    expect(screen.getByText('Manual')).toBeInTheDocument();
  });

  it('renders git mode branch-push', () => {
    render(
      <ExecutionResultPanel
        result={{
          ...baseResult,
          git: { mode: 'branch-push' },
        }}
      />
    );
    expect(screen.getByText('Branch Push')).toBeInTheDocument();
  });

  it('renders git mode pr', () => {
    render(
      <ExecutionResultPanel
        result={{
          ...baseResult,
          git: { mode: 'pr' },
        }}
      />
    );
    expect(screen.getByText('Pull Request')).toBeInTheDocument();
  });

  it('renders risks section', () => {
    render(
      <ExecutionResultPanel
        result={{ ...baseResult, risks: ['May break on mobile'] }}
      />
    );
    expect(screen.getByText('May break on mobile')).toBeInTheDocument();
  });

  it('renders decisions section', () => {
    render(
      <ExecutionResultPanel
        result={{ ...baseResult, decisions: ['Used CSS modules'] }}
      />
    );
    expect(screen.getByText('Used CSS modules')).toBeInTheDocument();
  });

  it('renders followups section', () => {
    render(
      <ExecutionResultPanel
        result={{ ...baseResult, followups: ['Add e2e test'] }}
      />
    );
    expect(screen.getByText('Add e2e test')).toBeInTheDocument();
  });

  it('renders memoryCandidates section', () => {
    render(
      <ExecutionResultPanel
        result={{ ...baseResult, memoryCandidates: ['Pattern: always use CSS modules for styling'] }}
      />
    );
    expect(screen.getByText(/Pattern: always use CSS modules/)).toBeInTheDocument();
  });

  it('renders skillCandidates section', () => {
    render(
      <ExecutionResultPanel
        result={{
          ...baseResult,
          skillCandidates: [
            { name: 'react-patterns', reason: 'Component uses hooks pattern' },
          ],
        }}
      />
    );
    expect(screen.getByText('react-patterns')).toBeInTheDocument();
    expect(screen.getByText(/Component uses hooks pattern/)).toBeInTheDocument();
  });

  it('does not render sections when arrays are empty', () => {
    const { container } = render(
      <ExecutionResultPanel
        result={{ ...baseResult, whatChanged: [], checksRun: [], filesTouched: [] }}
      />
    );
    expect(container.textContent).not.toContain('O que mudou');
    expect(container.textContent).not.toContain('Checks');
    expect(container.textContent).not.toContain('Arquivos alterados');
  });

  it('does not render memory/skill sections when arrays are empty', () => {
    const { container } = render(
      <ExecutionResultPanel
        result={{ ...baseResult, memoryCandidates: [], skillCandidates: [] }}
      />
    );
    expect(container.textContent).not.toContain('Memória');
    expect(container.textContent).not.toContain('Skills sugeridas');
  });

  it('does not render git section when only empty/null fields', () => {
    const { container } = render(
      <ExecutionResultPanel
        result={{ ...baseResult, git: { mode: null, branch: null, commitShas: [], prUrl: null } }}
      />
    );
    expect(container.textContent).not.toContain('Git');
  });

  it('renders skillCandidate without reason', () => {
    render(
      <ExecutionResultPanel
        result={{
          ...baseResult,
          skillCandidates: [{ name: 'unit-test', reason: '' }],
        }}
      />
    );
    expect(screen.getByText('unit-test')).toBeInTheDocument();
  });
});