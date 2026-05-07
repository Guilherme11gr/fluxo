-- Migration: Add personal board tags and linked task support
-- Adds:
-- 1. linked_task_id column to personal_board_items (optional link to project task)
-- 2. personal_board_item_tags table (per-user personal tags)
-- 3. personal_board_item_tag_assignments table (item-tag join)

-- Step 1: Add linked_task_id to personal_board_items
ALTER TABLE "public"."personal_board_items"
ADD COLUMN "linked_task_id" UUID;

CREATE INDEX "idx_personal_board_items_linked_task"
ON "public"."personal_board_items" ("linked_task_id");

-- Step 2: Create personal_board_item_tags table
CREATE TABLE "public"."personal_board_item_tags" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "org_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" VARCHAR NOT NULL,
    "color" VARCHAR NOT NULL DEFAULT '#6366f1',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "personal_board_item_tags_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: one tag name per user
CREATE UNIQUE INDEX "uq_personal_board_tags_user_name"
ON "public"."personal_board_item_tags" ("user_id", "name");

-- Indexes for common lookups
CREATE INDEX "idx_personal_board_tags_org"
ON "public"."personal_board_item_tags" ("org_id");

CREATE INDEX "idx_personal_board_tags_user"
ON "public"."personal_board_item_tags" ("user_id");

-- Foreign keys
ALTER TABLE "public"."personal_board_item_tags"
ADD CONSTRAINT "personal_board_item_tags_org_id_fkey"
FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."personal_board_item_tags"
ADD CONSTRAINT "personal_board_item_tags_user_id_fkey"
FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

-- Step 3: Create personal_board_item_tag_assignments table
CREATE TABLE "public"."personal_board_item_tag_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "item_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "personal_board_item_tag_assignments_pkey" PRIMARY KEY ("id")
);

-- Unique constraint: no duplicate tag per item
CREATE UNIQUE INDEX "uq_personal_board_item_tag_assignments_item_tag"
ON "public"."personal_board_item_tag_assignments" ("item_id", "tag_id");

-- Indexes
CREATE INDEX "idx_pb_item_tag_assignments_item"
ON "public"."personal_board_item_tag_assignments" ("item_id");

CREATE INDEX "idx_pb_item_tag_assignments_tag"
ON "public"."personal_board_item_tag_assignments" ("tag_id");

-- Foreign keys
ALTER TABLE "public"."personal_board_item_tag_assignments"
ADD CONSTRAINT "personal_board_item_tag_assignments_item_id_fkey"
FOREIGN KEY ("item_id") REFERENCES "public"."personal_board_items"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."personal_board_item_tag_assignments"
ADD CONSTRAINT "personal_board_item_tag_assignments_tag_id_fkey"
FOREIGN KEY ("tag_id") REFERENCES "public"."personal_board_item_tags"("id")
ON DELETE CASCADE ON UPDATE NO ACTION;
