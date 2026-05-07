---
name: fluxo-docs-search
description: Search project documentation by content using full-text search. Use when you need to find a doc by topic, decision, or keyword without knowing the exact title.
---

# FluXo Docs Search

## Overview

Full-text search across project docs. Combines Portuguese stemming (tsvector) with typo tolerance (pg_trgm) in a single query. Returns ranked results with relevant snippets.

## Auth

```
Authorization: Bearer <FLUXO_AGENT_KEY>
```

## Endpoint

```
GET /api/agent/docs/search?q=<query>&projectId=<uuid>&limit=<n>
```

- `q` (required, min 2 chars) — search query
- `projectId` (optional) — filter by project
- `limit` (optional, default 10, max 50)

## Examples

**Search by topic:**
```bash
curl -s -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  "$FLUXO_AGENT_API_URL/docs/search?q=decisão+auth"
```

**Search with project filter:**
```bash
curl -s -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  "$FLUXO_AGENT_API_URL/docs/search?q=deploy+pipeline&projectId=<uuid>"
```

**Search with typo (still works):**
```bash
curl -s -H "Authorization: Bearer $FLUXO_AGENT_KEY" \
  "$FLUXO_AGENT_API_URL/docs/search?q=prizma"
# Finds docs about "Prisma" even with typo
```

## Response

```json
{
  "success": true,
  "data": [
    {
      "id": "uuid",
      "title": "Escolha de ORM",
      "snippet": "...decidimos usar <<Prisma>> por causa da <<type safety>>...",
      "rank": 1.85,
      "projectId": "uuid",
      "updatedAt": "2026-05-01T..."
    }
  ],
  "meta": { "total": 1, "query": "ORM prisma" }
}
```

- `snippet` — relevant excerpt with `<<highlights>>` when tsvector matched, or first 300 chars when only trgm matched
- `rank` — combined score: `(ts_rank * 2) + similarity(title, query)`. Higher = more relevant.

## How it works

1. tsvector (Portuguese stemming) matches semantically: "decidido" finds "decisão"
2. pg_trgm matches fuzzy: "prizma" finds "Prisma"
3. Both run in parallel via OR in a single query
4. Ranking: `ts_rank` (semantic weight × 2) + `similarity` (typo tolerance)
5. Snippet: `ts_headline` extracts context when tsvector matched, `left(content, 300)` when only trgm matched

## MCP Tool

```
search_docs(query: string, projectId?: string, limit?: number)
```

Same endpoint, same behavior. Returns formatted summary with ranked results.
