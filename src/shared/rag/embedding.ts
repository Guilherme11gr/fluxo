/**
 * @fileoverview OpenAI embedding service for generating text embeddings.
 *
 * Provides functions to generate vector embeddings using OpenAI's
 * `text-embedding-3-small` model (1536 dimensions). Includes retry
 * logic with exponential backoff for transient failures (429 / 5xx).
 *
 * No external dependencies — uses the native `fetch` API.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A dense embedding vector produced by the OpenAI embedding model. */
export type EmbeddingVector = number[];

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const OPENAI_EMBEDDINGS_URL = 'https://api.openai.com/v1/embeddings';
const MODEL = 'text-embedding-3-small';
const MAX_RETRIES = 3;
const BATCH_SIZE = 100; // texts per API call (OpenAI accepts up to 2048 but batching at 100 is safer for latency & rate-limits)
const INITIAL_BACKOFF_MS = 1_000;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Sleep for the given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Return `true` when the HTTP status warrants a retry (429 or 5xx).
 */
function isRetryable(status: number): boolean {
  return status === 429 || status >= 500;
}

/**
 * Resolve the OpenAI API key from the environment.
 *
 * @throws {Error} If `OPENAI_API_KEY` is not set.
 */
function requireApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      'OPENAI_API_KEY environment variable is not set. ' +
        'Please set it before using the embedding service.',
    );
  }
  return key;
}

/**
 * Call the OpenAI embeddings endpoint with retry logic.
 *
 * Retries up to `MAX_RETRIES` times with exponential back-off on
 * rate-limit (429) and server-error (5xx) responses.
 *
 * @param texts - Array of strings to embed in a single request.
 * @returns Array of embedding vectors in the same order as `texts`.
 */
async function callEmbeddingApi(texts: string[]): Promise<EmbeddingVector[]> {
  const apiKey = requireApiKey();

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, attempt - 1);
      await sleep(backoff);
    }

    const response = await fetch(OPENAI_EMBEDDINGS_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: texts,
      }),
    });

    // --- Retry on transient errors ---
    if (isRetryable(response.status)) {
      lastError = new Error(
        `OpenAI embedding API returned status ${response.status} (attempt ${attempt + 1}/${MAX_RETRIES + 1})`,
      );
      continue;
    }

    // --- Non-retryable HTTP error ---
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(
        `OpenAI embedding API error: ${response.status} ${response.statusText} — ${body}`,
      );
    }

    // --- Parse successful response ---
    const data = await response.json();

    if (!Array.isArray(data?.data)) {
      throw new Error(
        'Unexpected OpenAI embedding response format: missing `data` array.',
      );
    }

    // Sort by index to guarantee order matches the input order.
    const sorted = (data.data as Array<{ embedding: EmbeddingVector; index: number }>).sort(
      (a, b) => a.index - b.index,
    );

    return sorted.map((item) => item.embedding);
  }

  // Exhausted all retries
  throw lastError ?? new Error('OpenAI embedding API: all retries exhausted.');
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate an embedding vector for a single text string.
 *
 * Uses the `text-embedding-3-small` model (1536 dimensions).
 *
 * @param text - The text to embed.
 * @returns A promise that resolves to the embedding vector.
 *
 * @example
 * ```ts
 * const vector = await getEmbedding('Hello, world!');
 * console.log(vector.length); // 1536
 * ```
 */
export async function getEmbedding(text: string): Promise<EmbeddingVector> {
  const embeddings = await callEmbeddingApi([text]);
  return embeddings[0];
}

/**
 * Generate embedding vectors for multiple texts in batches.
 *
 * Texts are automatically split into chunks of {@link BATCH_SIZE} (100)
 * to stay within OpenAI's per-request limits and to balance latency.
 *
 * @param texts - Array of strings to embed (max 2048 total across all batches per OpenAI policy).
 * @returns A promise that resolves to an array of embedding vectors in the same order as `texts`.
 *
 * @example
 * ```ts
 * const vectors = await getEmbeddings(['Hello', 'World']);
 * console.log(vectors.length);          // 2
 * console.log(vectors[0].length);       // 1536
 * ```
 */
export async function getEmbeddings(texts: string[]): Promise<EmbeddingVector[]> {
  if (texts.length === 0) {
    return [];
  }

  if (texts.length <= BATCH_SIZE) {
    return callEmbeddingApi(texts);
  }

  // Batch in chunks of BATCH_SIZE, process sequentially to avoid rate-limit spikes.
  const results: EmbeddingVector[] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const chunk = texts.slice(i, i + BATCH_SIZE);
    const chunkResult = await callEmbeddingApi(chunk);
    results.push(...chunkResult);
  }

  return results;
}
