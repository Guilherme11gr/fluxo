-- Migration: add project memories for runner memory v1

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE "public"."project_memories" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "org_id" UUID NOT NULL,
  "project_id" UUID NOT NULL,
  "task_id" UUID,
  "execution_id" UUID,
  "kind" VARCHAR(40) NOT NULL,
  "title" TEXT,
  "content" TEXT NOT NULL,
  "source" VARCHAR(40) NOT NULL DEFAULT 'execution_result',
  "content_hash" VARCHAR(64) NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}'::jsonb,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  "search_vector" tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('public.portuguese_unaccent', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('public.portuguese_unaccent', coalesce("content", '')), 'B')
  ) STORED,

  CONSTRAINT "project_memories_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."project_memories"
  ADD CONSTRAINT "project_memories_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."project_memories"
  ADD CONSTRAINT "project_memories_project_id_fkey"
  FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."project_memories"
  ADD CONSTRAINT "project_memories_task_id_fkey"
  FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

ALTER TABLE "public"."project_memories"
  ADD CONSTRAINT "project_memories_execution_id_fkey"
  FOREIGN KEY ("execution_id") REFERENCES "public"."agent_executions"("id")
  ON DELETE SET NULL ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "uq_project_memories_org_project_kind_hash"
  ON "public"."project_memories" ("org_id", "project_id", "kind", "content_hash");

CREATE INDEX "idx_project_memories_org_project"
  ON "public"."project_memories" ("org_id", "project_id");

CREATE INDEX "idx_project_memories_project_created"
  ON "public"."project_memories" ("project_id", "created_at" DESC);

CREATE INDEX "idx_project_memories_task"
  ON "public"."project_memories" ("task_id");

CREATE INDEX "idx_project_memories_execution"
  ON "public"."project_memories" ("execution_id");

CREATE INDEX "idx_project_memories_search_vector"
  ON "public"."project_memories" USING gin ("search_vector");

CREATE TABLE "public"."project_memory_chunks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "memory_id" UUID NOT NULL,
  "org_id" UUID NOT NULL,
  "content" TEXT NOT NULL,
  "chunk_index" INTEGER NOT NULL,
  "embedding" vector(1536) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),

  CONSTRAINT "project_memory_chunks_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "public"."project_memory_chunks"
  ADD CONSTRAINT "project_memory_chunks_memory_id_fkey"
  FOREIGN KEY ("memory_id") REFERENCES "public"."project_memories"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

ALTER TABLE "public"."project_memory_chunks"
  ADD CONSTRAINT "project_memory_chunks_org_id_fkey"
  FOREIGN KEY ("org_id") REFERENCES "public"."organizations"("id")
  ON DELETE CASCADE ON UPDATE NO ACTION;

CREATE UNIQUE INDEX "uq_project_memory_chunks_memory_chunk"
  ON "public"."project_memory_chunks" ("memory_id", "chunk_index");

CREATE INDEX "idx_project_memory_chunks_memory"
  ON "public"."project_memory_chunks" ("memory_id");

CREATE INDEX "idx_project_memory_chunks_org"
  ON "public"."project_memory_chunks" ("org_id");
