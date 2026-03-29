# Code Review Corrections Plan

## Overview

This document outlines the corrections needed for the issues identified in the code review of the local changes (JKILL-224, JKILL-63, and bug fixes).

**Total Issues**: 15 (5 Critical, 7 Warnings, 3 Minor)

---

## 🔴 Critical Issues

### 1. Token Expiration and Audit Trail (Security)

**File**: `prisma/schema.prisma`

**Problem**: Share tokens never expire, no audit trail for who shared what.

**Solution**:

```prisma
model ProjectDoc {
  // ... existing fields

  // JKILL-63: Public sharing fields with expiration and audit
  shareToken      String?            @unique @map("share_token") @db.Uuid
  isPublic        Boolean            @default(false) @map("is_public")
  sharedAt        DateTime?          @map("shared_at") @db.Timestamptz(6)
  shareExpiresAt  DateTime?          @map("share_expires_at") @db.Timestamptz(6) // NEW: Token expiration
  sharedBy        String?            @map("shared_by") @db.Uuid // NEW: User who enabled sharing

  // ... rest of model
}
```

**Files to modify**:
- `prisma/schema.prisma` - Add new fields
- `src/infra/adapters/prisma/project-doc.repository.ts` - Update repository methods
- `src/app/api/docs/[id]/share/route.ts` - Pass userId to repository
- `src/app/shared/docs/[token]/page.tsx` - Check expiration

**Migration**:
```bash
npx prisma migrate dev --name add_doc_sharing_expiration_and_audit
```

---

### 2. Race Condition in Token Generation

**File**: `src/infra/adapters/prisma/project-doc.repository.ts:304-329`

**Problem**: Two simultaneous requests could generate different tokens, with last write winning.

**Solution**:

```typescript
async generateShareToken(docId: string, orgId: string, userId: string, expiresIn?: number): Promise<string> {
  // Check if already shared - return existing token
  const existing = await this.prisma.projectDoc.findFirst({
    where: { id: docId, orgId },
    select: { shareToken: true, isPublic: true, shareExpiresAt: true },
  });

  if (existing?.isPublic && existing.shareToken) {
    // Check if token is still valid (not expired)
    if (!existing.shareExpiresAt || existing.shareExpiresAt > new Date()) {
      return existing.shareToken; // Return existing valid token
    }
    // Token expired, regenerate below
  }

  // Generate new token with expiration
  const shareToken = crypto.randomUUID();
  const shareExpiresAt = expiresIn
    ? new Date(Date.now() + expiresIn)
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days default

  // Use upsert to handle race condition
  await this.prisma.projectDoc.upsert({
    where: { id: docId },
    update: {
      shareToken,
      isPublic: true,
      sharedAt: new Date(),
      shareExpiresAt,
      sharedBy: userId,
    },
    create: {
      id: docId, // This won't actually create, doc must exist
      shareToken,
      isPublic: true,
      sharedAt: new Date(),
      shareExpiresAt,
      sharedBy: userId,
    },
  });

  return shareToken;
}
```

---

### 3. Rate Limiting on Public Endpoint

**File**: `src/app/shared/docs/[token]/page.tsx`

**Problem**: No rate limiting, vulnerable to token enumeration and DDoS.

**Solution**: Add Next.js rate limiting middleware.

```typescript
// Create: src/middleware.ts (or update existing)
import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import { type NextRequest } from 'next/server'

// Simple in-memory rate limiter for public endpoints
const rateLimit = new Map<string, { count: number; resetTime: number }>()

export async function middleware(request: NextRequest) {
  // Apply rate limiting only to public doc routes
  if (request.nextUrl.pathname.startsWith('/shared/docs/')) {
    const ip = request.ip || request.headers.get('x-forwarded-for') || 'unknown'
    const now = Date.now()
    const windowMs = 60 * 1000 // 1 minute
    const maxRequests = 30 // 30 requests per minute

    const record = rateLimit.get(ip)

    if (!record || now > record.resetTime) {
      rateLimit.set(ip, { count: 1, resetTime: now + windowMs })
    } else {
      record.count++
      if (record.count > maxRequests) {
        return new NextResponse('Too Many Requests', { status: 429 })
      }
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: '/shared/docs/:path*',
}
```

---

### 4. Streaming Response Format Inconsistency

**File**: `src/app/api/ai/generate-description/route.ts`

**Problem**: Streaming returns `text/plain` but non-streaming returns `JSON`. Clients expect consistent format.

**Solution**: Use Server-Sent Events (SSE) format for streaming.

```typescript
/**
 * Converts an AsyncGenerator<string> into SSE format
 */
function iteratorToSSEStream(iterator: AsyncGenerator<string>) {
  return new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      try {
        for await (const chunk of iterator) {
          // SSE format: data: <content>\n\n
          const sseChunk = `data: ${JSON.stringify({ chunk })}\n\n`;
          controller.enqueue(encoder.encode(sseChunk));
        }
        // Send done signal
        controller.enqueue(encoder.encode('data: {"done":true}\n\n'));
        controller.close();
      } catch (e) {
        console.error('Stream error:', e);
        const errorChunk = `data: ${JSON.stringify({ error: 'Stream error' })}\n\n`;
        controller.enqueue(encoder.encode(errorChunk));
        controller.error(e);
      }
    },
  });
}

// In POST handler:
if (stream) {
  const streamGenerator = await generateTaskDescriptionStream(input, { aiAdapter });
  const readableStream = iteratorToSSEStream(streamGenerator);

  return new NextResponse(readableStream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });
}
```

Update `use-task-streaming.ts` to parse SSE:

```typescript
const reader = response.body.getReader();
const decoder = new TextDecoder();
let done = false;

setIsLoading(false);

while (!done) {
  const { value, done: doneReading } = await reader.read();
  done = doneReading;

  if (value) {
    const chunk = decoder.decode(value, { stream: true });
    // Parse SSE format: data: {...}\n\n
    const lines = chunk.split('\n');
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6));
          if (data.done) break;
          if (data.chunk) setDescription(prev => prev + data.chunk);
          if (data.error) throw new Error(data.error);
        } catch (e) {
          console.error('Failed to parse SSE:', e);
        }
      }
    }
  }
}
```

---

### 5. Generic Error Messages

**Files**: `src/infra/adapters/prisma/project-doc.repository.ts`

**Problem**: Generic `Error('Doc not found')` doesn't provide context.

**Solution**: Use domain-specific errors.

First, check existing error classes:

```typescript
// Check: src/shared/errors/index.ts
```

If `NotFoundError` exists, use it:

```typescript
import { NotFoundError } from '@/shared/errors';

async generateShareToken(docId: string, orgId: string, userId: string, expiresIn?: number): Promise<string> {
  const doc = await this.prisma.projectDoc.findFirst({
    where: { id: docId, orgId },
    select: { id: true, shareToken: true, isPublic: true, shareExpiresAt: true },
  });

  if (!doc) {
    throw new NotFoundError('Document', docId);
  }
  // ...
}
```

---

## ⚠️ Issues Requiring Attention

### 6. Clipboard Fallback for Older Browsers

**File**: `src/lib/query/hooks/use-project-docs.ts:294`

**Problem**: `navigator.clipboard.writeText()` fails in non-secure contexts and older browsers.

**Solution**:

```typescript
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Try modern clipboard API first
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers or non-secure contexts
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.position = 'fixed';
    textArea.style.left = '-999999px';
    textArea.style.top = '-999999px';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);

    return successful;
  } catch (err) {
    console.error('Failed to copy to clipboard:', err);
    return false;
  }
}

// In useShareDoc hook:
onSuccess: async (data) => {
  const copied = await copyToClipboard(data.shareUrl);
  if (copied) {
    toast.success('Documento compartilhado!', {
      description: 'Link copiado para a área de transferência',
    });
  } else {
    toast.success('Documento compartilhado!', {
      description: 'Copie o link manualmente',
    });
  }
  // ...
},
```

---

### 7. Remove Unused Import

**File**: `src/app/(dashboard)/projects/[id]/docs/[docId]/page.tsx:8`

**Problem**: `Check` icon imported but never used.

**Solution**:

```typescript
// Change:
import { ..., Copy, Check, X } from "lucide-react";

// To:
import { ..., Copy, X } from "lucide-react";
```

---

### 8. Fix Function Naming Inconsistency

**File**: `src/domain/use-cases/ai/generate-task-description.ts`

**Problem**: Internal function named `V2Stream` but no actual versioning.

**Solution**: Rename for clarity.

```typescript
// Change:
async function* generateTaskDescriptionV2Stream(...)

// To:
async function* generateTaskDescriptionWithStream(...)
```

---

### 9. Fix Memory Leak in Streaming Hook

**File**: `src/lib/hooks/use-task-streaming.ts`

**Problem**: Multiple rapid generations could cause overlapping streams.

**Solution**: Abort previous stream before starting new one.

```typescript
export function useTaskStreaming(): UseTaskStreamingReturn {
  const [description, setDescription] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsStreaming(false);
    setIsLoading(false);
  }, []);

  const generateDescription = useCallback(async (options: UseTaskStreamingOptions) => {
    // ⚠️ FIX: Abort any existing stream before starting new one
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    try {
      setDescription('');
      setIsLoading(true);
      setIsStreaming(true);

      abortControllerRef.current = new AbortController();

      // ... rest of implementation
    } catch (error: any) {
      // ... error handling
    }
  }, []);

  // ...
}
```

---

### 10. Fix TypeScript Null Safety

**File**: `src/app/(dashboard)/projects/[id]/docs/[docId]/page.tsx:67`

**Problem**: `doc.shareToken` used without null check after async state update.

**Solution**:

```typescript
// Change:
const handleCopyLink = () => {
  if (doc?.shareToken) {
    const shareUrl = `${window.location.origin}/shared/docs/${doc.shareToken}`;
    // ...
  }
};

// To - capture doc.shareToken at time of click:
const handleCopyLink = () => {
  const token = doc?.shareToken;
  if (token) {
    const shareUrl = `${window.location.origin}/shared/docs/${token}`;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
};
```

---

## 📋 Database Migration

### Migration Command

```bash
npx prisma migrate dev --name add_doc_sharing_expiration_and_audit
```

### Expected Migration SQL

```sql
-- AlterTable
ALTER TABLE "project_docs" ADD COLUMN "share_expires_at" Timestamptz(6);
ALTER TABLE "project_docs" ADD COLUMN "shared_by" UUID;

-- CreateIndex
CREATE INDEX "idx_project_docs_share_expires_at" ON "project_docs"("share_expires_at");
```

---

## 🧪 Test Coverage Needed

### 1. Repository Tests

**File**: `src/infra/adapters/prisma/project-doc.repository.spec.ts` (create if doesn't exist)

```typescript
describe('ProjectDocRepository - Sharing', () => {
  describe('generateShareToken', () => {
    it('should generate unique token for doc');
    it('should return existing token if already shared and not expired');
    it('should regenerate token if existing token is expired');
    it('should throw NotFoundError for non-existent doc');
    it('should handle race conditions with upsert');
  });

  describe('disableSharing', () => {
    it('should remove token and set isPublic to false');
    it('should throw NotFoundError for non-existent doc');
  });

  describe('findByShareToken', () => {
    it('should return doc for valid token');
    it('should return null for expired token');
    it('should return null when isPublic is false');
    it('should return null for non-existent token');
  });
});
```

### 2. Hook Tests

**File**: `src/lib/hooks/use-task-streaming.spec.ts` (create)

```typescript
describe('useTaskStreaming', () => {
  it('should stream description chunks');
  it('should abort on stopGeneration');
  it('should abort previous stream when starting new one');
  it('should handle fetch errors');
});
```

### 3. API Route Tests

**File**: `src/app/api/docs/[id]/share/route.spec.ts` (create)

```typescript
describe('POST /api/docs/[id]/share', () => {
  it('should generate share token');
  it('should return 404 for non-existent doc');
  it('should validate authentication');
});

describe('DELETE /api/docs/[id]/share', () => {
  it('should disable sharing');
  it('should return 404 for non-existent doc');
  it('should validate authentication');
});
```

---

## Implementation Order

### Phase 1: Critical Security Fixes (Must Do)
1. ✅ Add token expiration and audit fields to schema
2. ✅ Run database migration
3. ✅ Fix race condition with upsert pattern
4. ✅ Add rate limiting middleware
5. ✅ Update public page to check expiration

### Phase 2: Bug Fixes (Should Do)
1. ✅ Fix streaming response format (SSE)
2. ✅ Add clipboard fallback
3. ✅ Fix memory leak in streaming hook
4. ✅ Fix TypeScript null safety

### Phase 3: Code Quality (Nice to Have)
1. ✅ Remove unused import
2. ✅ Rename V2Stream function
3. ✅ Use domain-specific errors

### Phase 4: Test Coverage (Should Do)
1. ✅ Add repository tests
2. ✅ Add hook tests
3. ✅ Add API route tests

---

## Summary of File Changes

| File | Changes | Priority |
|------|---------|----------|
| `prisma/schema.prisma` | Add `shareExpiresAt`, `sharedBy` | Critical |
| `src/infra/adapters/prisma/project-doc.repository.ts` | Update methods with expiration, userId, upsert | Critical |
| `src/middleware.ts` | Add rate limiting | Critical |
| `src/app/shared/docs/[token]/page.tsx` | Check expiration | Critical |
| `src/app/api/ai/generate-description/route.ts` | Use SSE format | Critical |
| `src/lib/hooks/use-task-streaming.ts` | Parse SSE, abort previous stream | Critical |
| `src/lib/query/hooks/use-project-docs.ts` | Add clipboard fallback | High |
| `src/app/(dashboard)/projects/[id]/docs/[docId]/page.tsx` | Fix null safety, remove Check import | High |
| `src/domain/use-cases/ai/generate-task-description.ts` | Rename V2Stream | Medium |
| New test files | Add test coverage | High |

---

## Pre-Merge Checklist

- [ ] Database migration run successfully
- [ ] All critical issues addressed
- [ ] Rate limiting tested
- [ ] Clipboard fallback tested in multiple browsers
- [ ] Streaming abort tested
- [ ] Token expiration tested
- [ ] TypeScript compilation passes
- [ ] Build succeeds
- [ ] New tests added and passing
