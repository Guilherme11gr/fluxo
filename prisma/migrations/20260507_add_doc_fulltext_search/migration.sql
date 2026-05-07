-- Migration: Add full-text search to project_docs
-- Adds tsvector column with Portuguese stemming, GIN index, and trgm index for fuzzy matching

-- 1. Coluna tsvector (stored, gerada automaticamente a partir de title + content)
-- setweight('A') no title dá prioridade maior pra matches no título
-- setweight('B') no content dá prioridade menor pra matches no conteúdo
ALTER TABLE "public"."project_docs"
ADD COLUMN "search_vector" tsvector
GENERATED ALWAYS AS (
  setweight(to_tsvector('portuguese', coalesce("title", '')), 'A') ||
  setweight(to_tsvector('portuguese', coalesce("content", '')), 'B')
) STORED;

-- 2. GIN index pra buscas full-text rápidas
CREATE INDEX "idx_project_docs_search_vector"
ON "public"."project_docs" USING gin ("search_vector");

-- 3. Extensão pg_trgm (necessária pra gin_trgm_ops)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4. Índice trgm no title pra fuzzy matching (typos, substrings parciais)
CREATE INDEX "idx_project_docs_title_trgm"
ON "public"."project_docs" USING gin ("title" gin_trgm_ops);
