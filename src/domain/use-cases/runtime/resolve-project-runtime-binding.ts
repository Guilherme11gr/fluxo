import type { ProjectRuntimeBindingRecord } from '@/infra/adapters/prisma/project-runtime-binding.repository';

export interface RunnerRuntimeContext {
  hostOs: string | null;
  runnerProfile: string | null;
}

export interface ResolvedProjectRuntimeBinding {
  id: string;
  projectId: string;
  runnerProfile: string;
  hostOs: string;
  repoPath: string;
  defaultBaseBranch: string;
  allowedBranchPrefix: string | null;
  executionMode: string;
  gitProvider: string | null;
  prPolicy: string;
  gitPolicy: string;
  metadata: Record<string, unknown>;
}

function normalize(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function toResolved(binding: ProjectRuntimeBindingRecord): ResolvedProjectRuntimeBinding {
  return {
    id: binding.id,
    projectId: binding.projectId,
    runnerProfile: binding.runnerProfile,
    hostOs: binding.hostOs,
    repoPath: binding.repoPath,
    defaultBaseBranch: binding.defaultBaseBranch,
    allowedBranchPrefix: binding.allowedBranchPrefix,
    executionMode: binding.executionMode,
    gitProvider: binding.gitProvider,
    prPolicy: binding.prPolicy,
    gitPolicy: binding.gitPolicy,
    metadata: binding.metadata,
  };
}

export function resolveProjectRuntimeBinding(
  bindings: ProjectRuntimeBindingRecord[],
  runner: RunnerRuntimeContext,
): ResolvedProjectRuntimeBinding | null {
  if (bindings.length === 0) {
    return null;
  }

  const desiredProfile = normalize(runner.runnerProfile);
  const desiredHostOs = normalize(runner.hostOs);

  const ranked = bindings
    .map((binding) => {
      const profileScore = normalize(binding.runnerProfile) === desiredProfile ? 2 : 0;
      const hostOsScore = normalize(binding.hostOs) === desiredHostOs ? 1 : 0;

      return {
        binding,
        score: profileScore + hostOsScore,
      };
    })
    .sort((left, right) => right.score - left.score);

  if (ranked[0].score === 0) {
    return null;
  }

  return toResolved(ranked[0].binding);
}
