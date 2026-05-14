-- AlterTable: add subscription_status to organizations
-- 'trial' = free 30-day trial (default), 'active' = paid subscription, 'expired' = trial ended, no payment
ALTER TABLE "organizations" ADD COLUMN "subscription_status" VARCHAR(20) DEFAULT 'trial';
