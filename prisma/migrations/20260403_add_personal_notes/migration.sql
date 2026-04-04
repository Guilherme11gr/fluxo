-- CreateTable
CREATE TABLE "personal_notes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "content" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "personal_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_personal_notes_org" ON "personal_notes"("org_id");

-- CreateIndex
CREATE INDEX "idx_personal_notes_user" ON "personal_notes"("user_id");

-- CreateIndex
CREATE INDEX "idx_personal_notes_org_user" ON "personal_notes"("org_id", "user_id");

-- AddForeignKey
ALTER TABLE "personal_notes" ADD CONSTRAINT "personal_notes_org_id_fkey" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE "personal_notes" ADD CONSTRAINT "personal_notes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profiles"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
