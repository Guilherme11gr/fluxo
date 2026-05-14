import { prisma } from '@/infra/adapters/prisma';

export const TRIAL_DURATION_DAYS = 30;

export interface TrialStatus {
  isInTrial: boolean;
  trialDaysRemaining: number;
  hasActiveSubscription: boolean;
  subscriptionStatus: string | null;
  trialStartDate: Date;
  trialEndDate: Date;
}

export async function getTrialStatus(orgId: string): Promise<TrialStatus | null> {
  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      createdAt: true,
      subscriptionStatus: true,
    },
  });

  if (!org) return null;

  const trialStartDate = org.createdAt;
  const trialEndDate = new Date(trialStartDate);
  trialEndDate.setDate(trialEndDate.getDate() + TRIAL_DURATION_DAYS);

  const now = new Date();
  const isInTrial = now < trialEndDate;
  const hasActiveSubscription = org.subscriptionStatus === 'active';
  const diffMs = trialEndDate.getTime() - now.getTime();
  const trialDaysRemaining = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

  return {
    isInTrial,
    trialDaysRemaining,
    hasActiveSubscription,
    subscriptionStatus: org.subscriptionStatus,
    trialStartDate,
    trialEndDate,
  };
}

export function shouldBlockAccess(trialStatus: TrialStatus): boolean {
  if (trialStatus.hasActiveSubscription) return false;
  return !trialStatus.isInTrial;
}
