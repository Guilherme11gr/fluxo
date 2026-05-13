/**
 * Text chunking utility for RAG (Retrieval-Augmented Generation).
 *
 * Supports two modes:
 *
 * 1. **Plain-text mode** (`chunkText`): splits text into chunks of approximately
 *    `maxChars` characters using a paragraph → sentence → hard-slice hierarchy.
 *
 * 2. **Markdown-aware mode** (`chunkDoc`): parses markdown headers to build a
 *    section tree. Each section becomes a candidate chunk prefixed with its
 *    header hierarchy path (e.g. "## Escopo > ### Inclui\n..."), giving
 *    embeddings semantic context about WHERE in the document the chunk lives.
 *    Sections exceeding `maxChars` are further split by paragraph → sentence
 *    → hard-slice.
 *
 * Both modes use `maxChars` and `overlap` with sensible defaults.
 */

/** A single chunk produced by the chunking pipeline. */
export interface Chunk {
  /** The text content of this chunk. */
  content: string;
  /** Zero-based position of this chunk in the ordered result list. */
  index: number;
}

/** A parsed markdown section with its full header-path breadcrumb. */
export interface MarkdownSection {
  /** Breadcrumb path like "## Title > ### Subtitle" (empty string for preamble). */
  headerPath: string;
  /** The body content of the section (everything under the header, excluding sub-headers). */
  content: string;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split `text` into an ordered array of chunks (plain-text mode).
 *
 * @param text     - The raw text to chunk.
 * @param maxChars - Maximum target size (in characters) for each chunk. Defaults to 600.
 * @param overlap  - Number of trailing characters from the previous chunk to
 *                   prepend to the current chunk. Defaults to 100.
 * @returns An array of {@link Chunk} objects sorted by `index`.
 *
 * @example
 * ```ts
 * const chunks = chunkText("Some long document...", 600, 100);
 * for (const c of chunks) console.log(c.index, c.content.length);
 * ```
 */
export function chunkText(
  text: string,
  maxChars: number = 600,
  overlap: number = 100,
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
 * Chunk a document with markdown-aware splitting.
 *
 * Parses the content into sections based on markdown headers (# through ######).
 * Each section is prefixed with its full header hierarchy path so that embeddings
 * carry semantic context about where in the document the chunk lives.
 *
 * Sections exceeding `maxChars` are further split by paragraph, then sentence,
 * then hard-slice. Each sub-chunk still carries the header path prefix.
 *
 * If `title` is provided and non-empty, it is used as the document-level context
 * but does NOT create a separate chunk — it is folded into the header path of the
 * first section's chunks.
 *
 * @param title    - Document title (optional, used for context in header path).
 * @param content  - Document body text (may contain markdown headers).
 * @param maxChars - Maximum target size per chunk (default 600).
 * @param overlap  - Overlap in characters between chunks (default 100).
 * @returns An array of {@link Chunk} objects.
 *
 * @example
 * ```ts
 * const chunks = chunkDoc("PRD", "## Escopo\n### Inclui\n- item1\n- item2\n### Nao inclui\n- item3");
 * // chunk 0: "PRD > ## Escopo > ### Inclui\n- item1\n- item2"
 * // chunk 1: "PRD > ## Escopo > ### Nao inclui\n- item3"
 * ```
 */
export function chunkDoc(
  title: string,
  content: string,
  maxChars: number = 600,
  overlap: number = 100,
): Array<{ content: string; index: number }> {
  const trimmedTitle = title.trim();

  if (!content || content.trim().length === 0) {
    if (trimmedTitle.length > 0) {
      return [{ content: trimmedTitle, index: 0 }];
    }
    return [];
  }

  // Normalise line endings
  const normalised = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Check if the content has any markdown headers at all
  const hasHeaders = /^#{1,6}\s+.+$/m.test(normalised);

  if (!hasHeaders) {
    // Fallback: no headers found — use plain-text chunking with title prefix
    const fullText = trimmedTitle.length > 0
      ? `${trimmedTitle}\n\n${normalised}`
      : normalised;
    return chunkText(fullText, maxChars, overlap);
  }

  // --- Markdown-aware path -------------------------------------------
  const sections = parseMarkdownSections(normalised);

  // Build chunks from each section
  const allUnits: string[] = [];

  for (const section of sections) {
    const prefix = buildPrefix(trimmedTitle, section.headerPath);

    // Section content may be empty (header-only line)
    const body = section.content.trim();
    if (body.length === 0 && prefix.length > 0) {
      // Header-only section with no body — emit just the path as context
      allUnits.push(prefix);
      continue;
    }

    if (body.length === 0) {
      continue;
    }

    // Full section text = prefix + newline + body
    const fullSection = prefix.length > 0 ? `${prefix}\n${body}` : body;

    // If it fits in one chunk, emit it directly
    if (fullSection.length <= maxChars) {
      allUnits.push(fullSection);
    } else {
      // Need to split the body; each sub-chunk gets the prefix
      const bodyUnits = splitBody(body, maxChars - prefix.length - 1, overlap);

      for (const unit of bodyUnits) {
        const chunk = prefix.length > 0 ? `${prefix}\n${unit}` : unit;
        allUnits.push(chunk);
      }
    }
  }

  // Filter empty units
  const filtered = allUnits.filter((u) => u.trim().length > 0);
  if (filtered.length === 0) {
    return [];
  }

  // Merge small units (those that share the same header path can be combined)
  // and add overlap
  return mergeWithOverlap(filtered, maxChars, overlap);
}

// ---------------------------------------------------------------------------
// Markdown parsing
// ---------------------------------------------------------------------------

/**
 * Parse markdown text into a flat array of sections, each annotated with its
 * full header hierarchy path.
 *
 * The algorithm:
 * 1. Split the text at every header line (lines matching /^#{1,6}\s+.+$/).
 * 2. Maintain a stack representing the current header hierarchy.
 * 3. For each header encountered, record the content accumulated under the
 *    previous header level, then push the new header.
 * 4. Return a flat array where each entry has:
 *    - `headerPath`: the breadcrumb trail like "## H2 > ### H3"
 *    - `content`:    the text body under that header (excluding sub-headers)
 *
 * Any text before the first header is emitted as a "preamble" section with
 * an empty `headerPath`.
 */
export function parseMarkdownSections(text: string): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  const lines = text.split("\n");

  /** Tracks the current header hierarchy as { level, text } entries. */
  const stack: Array<{ level: number; text: string }> = [];

  /** Lines accumulated for the current section (between consecutive headers). */
  let currentLines: string[] = [];

  /**
   * Flush the accumulated lines into a section with the current header path.
   */
  function flushCurrentSection(): void {
    const body = currentLines.join("\n").trim();
    currentLines = [];

    if (body.length === 0 && stack.length === 0) return;

    const headerPath = stack.map((h) => `${"#".repeat(h.level)} ${h.text}`).join(" > ");

    // Only emit if there's either a header or some body content
    if (headerPath.length > 0 || body.length > 0) {
      sections.push({ headerPath, content: body });
    }
  }

  for (const line of lines) {
    const headerMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headerMatch) {
      // Flush content accumulated under the previous header
      flushCurrentSection();

      const level = headerMatch[1].length;
      const headerText = headerMatch[2].trim();

      // Pop stack entries at the same or deeper level
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      stack.push({ level, text: headerText });
    } else {
      currentLines.push(line);
    }
  }

  // Flush the last section
  flushCurrentSection();

  return sections;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Build the prefix string from title and header path.
 * Returns something like "Title > ## Section > ### Sub" or just "## Section".
 */
function buildPrefix(title: string, headerPath: string): string {
  const parts: string[] = [];
  if (title.length > 0) {
    parts.push(title);
  }
  if (headerPath.length > 0) {
    parts.push(headerPath);
  }
  return parts.join(" > ");
}

/**
 * Split the body of a section into units that each fit within `budget` chars.
 * Uses paragraph → sentence → hard-slice hierarchy, but does NOT merge
 * (merging is done later by mergeWithOverlap).
 */
function splitBody(body: string, budget: number, _overlap: number): string[] {
  if (budget <= 0) budget = 100; // Safety floor

  if (body.length <= budget) {
    return [body];
  }

  // Split by paragraphs
  const paragraphs = splitParagraphs(body);

  const units: string[] = [];
  for (const para of paragraphs) {
    if (para.length <= budget) {
      units.push(para);
    } else {
      // Split by sentences
      const sentences = splitSentences(para);
      for (const sentence of sentences) {
        if (sentence.length <= budget) {
          units.push(sentence);
        } else {
          units.push(...hardSlice(sentence, budget));
        }
      }
    }
  }

  return units.filter((u) => u.trim().length > 0);
}

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
