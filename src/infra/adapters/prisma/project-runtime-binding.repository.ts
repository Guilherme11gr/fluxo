/* eslint-disable @typescript-eslint/no-explicit-any */
import { PrismaClient } from '@prisma/client';

export interface ProjectRuntimeBindingRecord {
  id: string;
  orgId: string;
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
  createdAt: Date;
  updatedAt: Date;
}

function mapRecord(record: any): ProjectRuntimeBindingRecord {
  return {
    id: record.id,
    orgId: record.orgId,
    projectId: record.projectId,
    runnerProfile: record.runnerProfile,
    hostOs: record.hostOs,
    repoPath: record.repoPath,
    defaultBaseBranch: record.defaultBaseBranch,
    allowedBranchPrefix: record.allowedBranchPrefix ?? null,
    executionMode: record.executionMode,
    gitProvider: record.gitProvider ?? null,
    prPolicy: record.prPolicy,
    gitPolicy: record.gitPolicy,
    metadata: record.metadata ?? {},
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

export class ProjectRuntimeBindingRepository {
  constructor(private prisma: PrismaClient) {}

  private get client() {
    return this.prisma as PrismaClient & { projectRuntimeBinding: any };
  }

  async create(data: {
    orgId: string;
    projectId: string;
    runnerProfile: string;
    hostOs: string;
    repoPath: string;
    defaultBaseBranch?: string;
    allowedBranchPrefix?: string | null;
    executionMode?: string;
    gitProvider?: string | null;
    prPolicy?: string;
    gitPolicy?: string;
    metadata?: Record<string, unknown>;
  }): Promise<ProjectRuntimeBindingRecord> {
    const record = await this.client.projectRuntimeBinding.create({
      data: {
        orgId: data.orgId,
        projectId: data.projectId,
        runnerProfile: data.runnerProfile,
        hostOs: data.hostOs,
        repoPath: data.repoPath,
        defaultBaseBranch: data.defaultBaseBranch ?? 'main',
        allowedBranchPrefix: data.allowedBranchPrefix ?? null,
        executionMode: data.executionMode ?? 'shared_project',
        gitProvider: data.gitProvider ?? null,
        prPolicy: data.prPolicy ?? 'disabled',
        gitPolicy: data.gitPolicy ?? 'no_write',
        metadata: data.metadata ?? {},
      },
    });
    return mapRecord(record);
  }

  async findByProject(projectId: string, orgId: string): Promise<ProjectRuntimeBindingRecord[]> {
    const records = await this.client.projectRuntimeBinding.findMany({
      where: { orgId, projectId },
      orderBy: [
        { runnerProfile: 'asc' },
        { hostOs: 'asc' },
      ],
    });

    return records.map(mapRecord);
  }
}
