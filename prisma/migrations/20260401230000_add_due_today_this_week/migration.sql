-- AlterTable
ALTER TABLE "public"."tasks" ADD COLUMN "due_today" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "public"."tasks" ADD COLUMN "due_this_week" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "idx_tasks_org_due_today" ON "public"."tasks"("org_id", "due_today");
CREATE INDEX "idx_tasks_org_due_this_week" ON "public"."tasks"("org_id", "due_this_week");
