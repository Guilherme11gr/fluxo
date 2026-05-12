/**
 * Text chunking utility for RAG (Retrieval-Augmented Generation).
 *
 * Splits text content into chunks of approximately `maxChars` characters each,
 * with `overlap` characters of overlap between consecutive chunks. The splitting
 * strategy follows a hierarchy:
 *
 * 1. Split by double newlines (paragraphs)
 * 2. If a paragraph exceeds `maxChars`, split by sentences (`. ! ?`)
 * 3. If a sentence exceeds `maxChars`, split into hard character slices
 *
 * Each chunk is tagged with a zero-based index for downstream ordering.
 */

/** A single chunk produced by the chunking pipeline. */
export interface Chunk {
  /** The text content of this chunk. */
  content: string;
  /** Zero-based position of this chunk in the ordered result list. */
  index: number;
}

/**
 * Split `text` into an ordered array of chunks.
 *
 * @param text     - The raw text to chunk.
 * @param maxChars - Maximum target size (in characters) for each chunk. Defaults to 500.
 * @param overlap  - Number of trailing characters from the previous chunk to
 *                   prepend to the current chunk. Defaults to 50.
 * @returns An array of {@link Chunk} objects sorted by `index`.
 *
 * @example
 * ```ts
 * const chunks = chunkText("Some long document...", 500, 50);
 * for (const c of chunks) console.log(c.index, c.content.length);
 * ```
 */
export function chunkText(
  text: string,
  maxChars: number = 500,
  overlap: number = 50,
): Array<{ content: string; index: number }> {
  if (!text || text.trim().length === 0) {
    return [];
  }

  // Normalise line endings so \r\n and \r become \n
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // --- Step 1: split by paragraphs (double newlines) -----------------
  const paragraphs = splitParagraphs(normalised);

  // --- Step 2 & 3: ensure every unit is <= maxChars ------------------
  const units: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= maxChars) {
      units.push(para);
    } else {
      // Split by sentences first
      const sentences = splitSentences(para);
      for (const sentence of sentences) {
        if (sentence.length <= maxChars) {
          units.push(sentence);
        } else {
          // Hard-slice oversized sentences
          units.push(...hardSlice(sentence, maxChars));
        }
      }
    }
  }

  // Filter out empty / whitespace-only units
  const filtered = units.filter((u) => u.trim().length > 0);
  if (filtered.length === 0) {
    return [];
  }

  // --- Step 4: merge small units into chunks & add overlap ------------
  return mergeWithOverlap(filtered, maxChars, overlap);
}

/**
 * Convenience helper that prepends `title` to the first chunk of a document
 * and returns the full chunk array.
 *
 * The title is joined to the content with a double newline so it forms its own
 * paragraph in the first chunk.
 *
 * @param title   - Document title (will be prepended to the first chunk).
 * @param content - Document body text.
 * @param maxChars - Maximum target size per chunk (default 500).
 * @param overlap  - Overlap in characters between chunks (default 50).
 * @returns An array of {@link Chunk} objects.
 *
 * @example
 * ```ts
 * const chunks = chunkDoc("My Doc", "Long body text...");
 * ```
 */
export function chunkDoc(
  title: string,
  content: string,
  maxChars: number = 500,
  overlap: number = 50,
): Array<{ content: string; index: number }> {
  const fullText = title.trim().length > 0 ? `${title.trim()}\n\n${content}` : content;
  return chunkText(fullText, maxChars, overlap);
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Split text on double newlines, preserving the content of each paragraph.
 */
function splitParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

/**
 * Split a paragraph into sentences on `.`, `!`, or `?` boundaries.
 * The delimiter is kept attached to the preceding sentence.
 */
function splitSentences(paragraph: string): string[] {
  // Match everything up to and including the sentence-ending punctuation + any trailing quotes/whitespace
  const regex = /[^.!?]*[.!?]["'\u201D\u2019)\]]*(?:\s*)/g;
  const matches: string[] = [];
  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(paragraph)) !== null) {
    const sentence = match[0].trim();
    if (sentence.length > 0) {
      matches.push(sentence);
    }
    lastIndex = regex.lastIndex;
  }

  // Capture any trailing text that didn't end with sentence punctuation
  const remainder = paragraph.slice(lastIndex).trim();
  if (remainder.length > 0) {
    matches.push(remainder);
  }

  return matches.length > 0 ? matches : [paragraph];
}

/**
 * Hard-slice a string into pieces of at most `maxChars` characters.
 * Slices are made on character boundaries (no word-level awareness).
 */
function hardSlice(text: string, maxChars: number): string[] {
  const slices: string[] = [];
  for (let i = 0; i < text.length; i += maxChars) {
    const slice = text.slice(i, i + maxChars).trim();
    if (slice.length > 0) {
      slices.push(slice);
    }
  }
  return slices;
}

/**
 * Merge small units into chunks of at most `maxChars`, then prepend `overlap`
 * characters from the end of the previous chunk to each subsequent chunk.
 */
function mergeWithOverlap(
  units: string[],
  maxChars: number,
  overlap: number,
): Array<{ content: string; index: number }> {
  const chunks: Array<{ content: string; index: number }> = [];

  // First pass: merge small adjacent units up to maxChars
  const merged: string[] = [];
  let buffer = "";

  for (const unit of units) {
    const separator = buffer.length > 0 ? " " : "";
    const candidate = buffer + separator + unit;

    if (candidate.length <= maxChars) {
      buffer = candidate;
    } else {
      if (buffer.length > 0) {
        merged.push(buffer);
      }
      buffer = unit;
    }
  }
  if (buffer.length > 0) {
    merged.push(buffer);
  }

  // Second pass: add overlap from the tail of the previous chunk
  for (let i = 0; i < merged.length; i++) {
    let content = merged[i];

    if (i > 0 && overlap > 0) {
      const prev = chunks[i - 1].content;
      const overlapText = prev.slice(-overlap);
      content = overlapText + content;
    }

    chunks.push({ content, index: i });
  }

  return chunks;
}
