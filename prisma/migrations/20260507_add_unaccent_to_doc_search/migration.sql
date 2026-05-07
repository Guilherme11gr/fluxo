-- Migration: Add unaccent + websearch_to_tsquery for better RAG search
--
-- Fixes:
-- 1. "migracao" now matches "migração" (accent normalization via unaccent)
-- 2. Multi-term queries use OR instead of AND (websearch_to_tsquery)
--
-- ⚠️  Drops and recreates the search_vector column + index.

-- 1. Extensão unaccent (normaliza acentos)
CREATE EXTENSION IF NOT EXISTS unaccent;

-- 2. Custom text search config: unaccent filter + Portuguese stemmer
DROP TEXT SEARCH CONFIGURATION IF EXISTS public.portuguese_unaccent;
CREATE TEXT SEARCH CONFIGURATION public.portuguese_unaccent (COPY = portuguese);
ALTER TEXT SEARCH CONFIGURATION public.portuguese_unaccent
  ALTER MAPPING FOR hword, hword_part, word
  WITH unaccent, portuguese_stem;

-- 3. Drop existing column and index
DROP INDEX IF EXISTS "public"."idx_project_docs_search_vector";
ALTER TABLE "public"."project_docs" DROP COLUMN IF EXISTS "search_vector";

-- 4. Recreate column with unaccent + Portuguese stemming
ALTER TABLE "public"."project_docs"
ADD COLUMN "search_vector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('public.portuguese_unaccent', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('public.portuguese_unaccent', coalesce("content", '')), 'B')
) STORED;

-- 5. Recreate GIN index
CREATE INDEX "idx_project_docs_search_vector"
ON "public"."project_docs" USING gin ("search_vector");
