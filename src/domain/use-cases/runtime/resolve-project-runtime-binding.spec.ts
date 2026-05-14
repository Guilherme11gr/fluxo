import { describe, expect, it } from 'vitest';
import { resolveProjectRuntimeBinding } from './resolve-project-runtime-binding';

describe('resolveProjectRuntimeBinding', () => {
  const bindings = [
    {
      id: 'binding-1',
      orgId: 'org-1',
      projectId: 'project-1',
      runnerProfile: 'windows-dev',
      hostOs: 'windows',
      repoPath: 'D:\\code\\fluxo',
      defaultBaseBranch: 'main',
      allowedBranchPrefix: 'agent/',
      executionMode: 'branch_per_task',
      gitProvider: 'github',
      prPolicy: 'draft',
      gitPolicy: 'branch_commit_pr',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: 'binding-2',
      orgId: 'org-1',
      projectId: 'project-1',
      runnerProfile: 'linux-ci',
      hostOs: 'linux',
      repoPath: '/srv/fluxo',
      defaultBaseBranch: 'main',
      allowedBranchPrefix: null,
      executionMode: 'shared_project',
      gitProvider: null,
      prPolicy: 'disabled',
      gitPolicy: 'no_write',
      metadata: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it('prefers exact runnerProfile and hostOs match', () => {
    const resolved = resolveProjectRuntimeBinding(bindings, {
      runnerProfile: 'windows-dev',
      hostOs: 'windows',
    });

    expect(resolved?.id).toBe('binding-1');
    expect(resolved?.repoPath).toBe('D:\\code\\fluxo');
  });

  it('returns null when there is no meaningful match', () => {
    const resolved = resolveProjectRuntimeBinding(bindings, {
      runnerProfile: 'mac-laptop',
      hostOs: 'macos',
    });

    expect(resolved).toBeNull();
  });
});
