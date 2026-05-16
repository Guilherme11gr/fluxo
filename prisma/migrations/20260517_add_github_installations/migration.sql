-- Step 1: Create the github_installations table
CREATE TABLE "public"."github_installations" (
    "id" SERIAL PRIMARY KEY,
    "org_id" UUID NOT NULL,
    "installation_id" INTEGER NOT NULL,
    "account_login" VARCHAR(100),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

    CONSTRAINT "github_installations_org_id_installation_id_key" UNIQUE ("org_id", "installation_id"),
    CONSTRAINT "github_installations_installation_id_key" UNIQUE ("installation_id")
);

-- Step 2: Foreign key to organizations
ALTER TABLE "public"."github_installations"
    ADD CONSTRAINT "github_installations_org_id_fkey"
    FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
    ON DELETE CASCADE ON UPDATE NO ACTION;

-- Step 3: Migrate existing data: insert distinct (org_id, github_installation_id) from projects
INSERT INTO "public"."github_installations" ("org_id", "installation_id")
SELECT DISTINCT p."org_id", p."github_installation_id"
FROM "public"."projects" p
WHERE p."github_installation_id" IS NOT NULL
ON CONFLICT ("org_id", "installation_id") DO NOTHING;

-- Step 4: Add a temporary column for the new FK (auto-increment int id)
ALTER TABLE "public"."projects"
    ADD COLUMN "_new_github_installation_id" INTEGER;

-- Step 5: Populate the new FK column by joining with github_installations
-- If multiple projects in the same org share the same installation_id,
-- we need to link them to the same github_installations row.
-- Since installation_id is unique in github_installations, we can join on it.
UPDATE "public"."projects" p
SET "_new_github_installation_id" = gi."id"
FROM "public"."github_installations" gi
WHERE p."github_installation_id" = gi."installation_id"
  AND p."org_id" = gi."org_id";

-- Step 6: Drop the old column and rename the new one
ALTER TABLE "public"."projects" DROP COLUMN "github_installation_id";
ALTER TABLE "public"."projects" RENAME COLUMN "_new_github_installation_id" TO "github_installation_id";

-- Step 7: Recreate the index on the new column
CREATE INDEX "idx_projects_github_installation" ON "public"."projects"("github_installation_id");

-- Step 8: Add the foreign key constraint
ALTER TABLE "public"."projects"
    ADD CONSTRAINT "projects_github_installation_id_fkey"
    FOREIGN KEY ("github_installation_id") REFERENCES "public"."github_installations"("id")
    ON DELETE SET NULL ON UPDATE NO ACTION;

-- Step 9: Create index on github_installations
CREATE INDEX "idx_github_installations_org" ON "public"."github_installations"("org_id");