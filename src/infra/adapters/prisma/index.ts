import { PrismaClient } from '@prisma/client';
import { ProjectRepository } from './project.repository';
import { EpicRepository } from './epic.repository';
import { FeatureRepository } from './feature.repository';
import { TaskRepository } from './task.repository';
import { CommentRepository } from './comment.repository';
import { ProjectDocRepository } from './project-doc.repository';
import { ProjectNoteRepository } from './project-note.repository';
import { UserProfileRepository } from './user-profile.repository';
import { DocTagRepository } from './doc-tag.repository';
import { TaskTagRepository } from './task-tag.repository';
import { InviteRepository } from './invite.repository';
import { AuditLogRepository } from './audit-log.repository';
import { OrgMembershipRepository } from './org-membership.repository';
import { AgentApiKeyRepository } from './agent-api-key.repository';
import { GitHubEventRepository } from './github-event.repository';
import { PersonalBoardRepository } from './personal-board.repository';
import { PersonalNoteRepository } from './personal-note.repository';

// Singleton Prisma Client
// https://www.prisma.io/docs/guides/performance-and-optimization/connection-management#prismaclient-in-long-running-applications
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Build DATABASE_URL with conservative pool settings for VPS
// Prisma uses connection_limit from the URL to set pool_size
// Default: num_cpus * 2 + 1 (can be 5-10 on dev, but we cap at 5 for prod)
function buildPrismaUrl(): string {
  const base = process.env.DATABASE_URL || '';
  if (!base) return base;

  try {
    const url = new URL(base);
    // Only add pool params if not already set
    if (!url.searchParams.has('connection_limit')) {
      url.searchParams.set('connection_limit', process.env.PRISMA_CONNECTION_LIMIT || '5');
    }
    if (!url.searchParams.has('pool_timeout')) {
      url.searchParams.set('pool_timeout', '10');
    }
    return url.toString();
  } catch {
    return base;
  }
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: buildPrismaUrl(),
    },
  },
});

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Repository instances
export const projectRepository = new ProjectRepository(prisma);
export const epicRepository = new EpicRepository(prisma);
export const featureRepository = new FeatureRepository(prisma);
export const taskRepository = new TaskRepository(prisma);
export const commentRepository = new CommentRepository(prisma);
export const projectDocRepository = new ProjectDocRepository(prisma);
export const projectNoteRepository = new ProjectNoteRepository(prisma);
export const userProfileRepository = new UserProfileRepository(prisma);
export const docTagRepository = new DocTagRepository(prisma);
export const taskTagRepository = new TaskTagRepository(prisma);
export const inviteRepository = new InviteRepository(prisma);
export const auditLogRepository = new AuditLogRepository(prisma);
export const orgMembershipRepository = new OrgMembershipRepository(prisma);
export const agentApiKeyRepository = new AgentApiKeyRepository(prisma);
export const gitHubEventRepository = new GitHubEventRepository(prisma);
export const personalBoardRepository = new PersonalBoardRepository(prisma);
export const personalNoteRepository = new PersonalNoteRepository(prisma);

// Re-export for convenience
export {
  ProjectRepository,
  EpicRepository,
  FeatureRepository,
  TaskRepository,
  CommentRepository,
  ProjectDocRepository,
  ProjectNoteRepository,
  UserProfileRepository,
  DocTagRepository,
  TaskTagRepository,
  InviteRepository,
  AuditLogRepository,
  OrgMembershipRepository,
  AgentApiKeyRepository,
};

// Re-export audit action constants
export { AUDIT_ACTIONS, type AuditAction } from './audit-log.repository';
