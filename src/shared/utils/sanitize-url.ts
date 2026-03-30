/**
 * URL sanitization for user-generated markdown content.
 *
 * Allowlist approach: only permit known-safe protocols.
 * Returns undefined for anything else, which causes <a href={undefined}>
 * to render without a clickable href attribute.
 */

const ALLOWED_PROTOCOLS = new Set([
  'http:',
  'https:',
  'mailto:',
  'tel:',
  '#', // fragment-only (no protocol)
]);

/**
 * Sanitize a URL string for safe use in <a href>.
 *
 * - Allows http, https, mailto, tel protocols
 * - Allows relative URLs (no protocol)
 * - Allows fragment-only URLs (#section)
 * - Returns undefined for everything else (javascript:, data:, vbscript:, etc.)
 *
 * Handles encoding tricks:
 * - Mixed case (JaVaScRiPt:)
 * - Leading whitespace / tabs / newlines
 * - Null bytes
 * - HTML entities in URL (not decoded here -- browser won't execute them)
 */
export function sanitizeUrl(url: string | undefined): string | undefined {
  if (!url) return undefined;

  // Strip null bytes -- they can break URL parsing
  const cleaned = url.replace(/\0/g, '');

  // Trim whitespace (but preserve internal spaces in data URIs we'll reject anyway)
  const trimmed = cleaned.trim();

  if (!trimmed) return undefined;

  // Fragment-only: #section
  if (trimmed.startsWith('#')) return trimmed;

  // Relative URL: no colon at all, or colon only after a slash (like /path:not-a-protocol)
  const firstColon = trimmed.indexOf(':');
  if (firstColon === -1) return trimmed;

  // If colon appears after a /, it's a relative URL, not a protocol
  // e.g., "/path/to:file" or "./foo:bar"
  const firstSlash = trimmed.indexOf('/');
  if (firstSlash !== -1 && firstSlash < firstColon) return trimmed;

  // Extract potential protocol
  const protocol = trimmed.slice(0, firstColon + 1).toLowerCase();

  if (ALLOWED_PROTOCOLS.has(protocol)) return trimmed;

  // Blocked protocol (javascript:, data:, vbscript:, blob:, etc.)
  return undefined;
}
