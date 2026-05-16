// Project status types
import { Task } from './task.types';

export type EpicStatus = 'OPEN' | 'CLOSED';
export type FeatureStatus = 'BACKLOG' | 'TODO' | 'DOING' | 'DONE';
export type TaskStatus = 'BACKLOG' | 'TODO' | 'DOING' | 'REVIEW' | 'QA_READY' | 'DONE';
export type TaskType = 'TASK' | 'BUG';
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type PokerStatus = 'VOTING' | 'REVEALED' | 'CLOSED';

// Health check types
export type FeatureHealth = 'healthy' | 'warning' | 'critical';
export type EpicRisk = 'low' | 'medium' | 'high';
export type TaskFocus = 'TODAY' | 'THIS_WEEK';

// Fibonacci points
export type StoryPoints = 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21 | null;
export type PokerVote = 0 | 1 | 2 | 3 | 5 | 8 | 13 | 21; // 0 = "?"

// Organization (Tenant)
export interface Organization {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
}

// GitHub Installation (tenant-scoped)
export interface GithubInstallation {
  id: number;
  orgId: string;
  installationId: number;
  accountLogin: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Project
export interface Project {
  id: string;
  orgId: string;
  name: string;
  key: string; // Prefix for task IDs (APP, SDK, etc)
  description: string | null;
  modules: string[];
  githubInstallationId: number | null; // FK to GithubInstallation.id
  githubRepoFullName: string | null;
  githubRepoUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Epic
export interface Epic {
  id: string;
  orgId: string;
  projectId: string;
  title: string;
  description: string | null;
  status: EpicStatus;
  createdAt: Date;
  updatedAt: Date;
  // Health check fields
  risk: EpicRisk;
  riskUpdatedAt: Date;
  riskReason: string | null;
}

// Feature
export interface Feature {
  id: string;
  orgId: string;
  epicId: string;
  title: string;
  description: string | null;
  status: FeatureStatus;
  createdAt: Date;
  updatedAt: Date;
  isSystem: boolean;
  // Health check fields
  health: FeatureHealth;
  healthUpdatedAt: Date;
  healthReason?: string | null;
  technicalAnalysis?: string | null;
  analysisUpdatedAt?: Date | string | null;
  focus?: TaskFocus | null;
  tasks?: Task[];
}
