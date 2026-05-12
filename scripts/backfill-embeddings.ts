/**
 * Backfill script: Index all existing docs into doc_chunks with embeddings.
 *
 * Usage: npx tsx scripts/backfill-embeddings.ts
 *
 * Reads all project_docs, chunks them, generates embeddings via OpenAI,
 * and inserts into doc_chunks table.
 *
 * Skips docs that are already indexed.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('[Backfill] Starting embedding backfill...');

  // Get all docs
  const docs = await prisma.projectDoc.findMany({
    select: {
      id: true,
      orgId: true,
      title: true,
      content: true,
    },
    orderBy: { updatedAt: 'desc' },
  });

  console.log(`[Backfill] Found ${docs.length} docs`);

  // Check which docs are already indexed
  const indexedRows = await prisma.$queryRaw<{ doc_id: string }[]>`
    SELECT DISTINCT doc_id FROM doc_chunks
  `;
  const indexedIds = new Set(indexedRows.map((r) => r.doc_id));

  const toIndex = docs.filter((d) => !indexedIds.has(d.id));
  console.log(`[Backfill] Already indexed: ${indexedIds.size}, To index: ${toIndex.length}`);

  if (toIndex.length === 0) {
    console.log('[Backfill] Nothing to do. All docs are indexed.');
    return;
  }

  // Import chunking + embedding
  const { chunkDoc } = await import('../src/shared/rag/chunking');
  const { getEmbeddings } = await import('../src/shared/rag/embedding');

  let totalChunks = 0;
  let processed = 0;
  let failed = 0;

  // Process in batches of 5 docs (to avoid rate limits)
  const BATCH_SIZE = 5;

  for (let i = 0; i < toIndex.length; i += BATCH_SIZE) {
    const batch = toIndex.slice(i, i + BATCH_SIZE);

    for (const doc of batch) {
      try {
        processed++;
        const chunks = chunkDoc(doc.title, doc.content || '');

        if (chunks.length === 0) {
          console.log(`  [${processed}/${toIndex.length}] Skipped (empty): ${doc.title}`);
          continue;
        }

        // Generate embeddings
        const texts = chunks.map((c) => c.content);
        const embeddings = await getEmbeddings(texts);

        // Delete any existing chunks for this doc (idempotent)
        await prisma.$executeRaw`DELETE FROM doc_chunks WHERE doc_id = ${doc.id}::uuid`;

        // Insert chunks
        for (let j = 0; j < chunks.length; j++) {
          const chunk = chunks[j];
          const embedding = embeddings[j];
          const vectorStr = `[${embedding.join(',')}]`;

          await prisma.$executeRaw`
            INSERT INTO doc_chunks (doc_id, org_id, content, chunk_index, embedding)
            VALUES (
              ${doc.id}::uuid,
              ${doc.orgId}::uuid,
              ${chunk.content},
              ${chunk.index},
              ${vectorStr}::vector
            )
          `;
        }

        totalChunks += chunks.length;
        console.log(`  [${processed}/${toIndex.length}] ${doc.title} → ${chunks.length} chunks`);
      } catch (err) {
        failed++;
        console.error(`  [${processed}/${toIndex.length}] FAILED: ${doc.title}`, err);
      }
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < toIndex.length) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  console.log(`\n[Backfill] Done! Processed: ${processed}, Chunks: ${totalChunks}, Failed: ${failed}`);
}

main()
  .catch((err) => {
    console.error('[Backfill] Fatal error:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
