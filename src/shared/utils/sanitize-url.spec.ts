import { describe, it, expect } from 'vitest';
import { sanitizeUrl } from './sanitize-url';

describe('sanitizeUrl', () => {
  describe('undefined / null / empty input', () => {
    it('should return undefined for undefined', () => {
      expect(sanitizeUrl(undefined)).toBeUndefined();
    });

    it('should return undefined for empty string', () => {
      expect(sanitizeUrl('')).toBeUndefined();
    });

    it('should return undefined for whitespace only', () => {
      expect(sanitizeUrl('   ')).toBeUndefined();
    });

    it('should return undefined for tabs and newlines only', () => {
      expect(sanitizeUrl('\t\n\r')).toBeUndefined();
    });
  });

  describe('allowed protocols', () => {
    it('should allow https URLs', () => {
      expect(sanitizeUrl('https://example.com')).toBe('https://example.com');
    });

    it('should allow http URLs', () => {
      expect(sanitizeUrl('http://example.com')).toBe('http://example.com');
    });

    it('should allow mailto URLs', () => {
      expect(sanitizeUrl('mailto:test@example.com')).toBe('mailto:test@example.com');
    });

    it('should allow tel URLs', () => {
      expect(sanitizeUrl('tel:+5511999998888')).toBe('tel:+5511999998888');
    });
  });

  describe('relative URLs', () => {
    it('should allow relative path without protocol', () => {
      expect(sanitizeUrl('/dashboard')).toBe('/dashboard');
    });

    it('should allow relative path with dot', () => {
      expect(sanitizeUrl('./page')).toBe('./page');
    });

    it('should allow relative path with double dot', () => {
      expect(sanitizeUrl('../parent')).toBe('../parent');
    });

    it('should allow bare filename', () => {
      expect(sanitizeUrl('page.html')).toBe('page.html');
    });

    it('should allow relative URL with colon after slash (not a protocol)', () => {
      expect(sanitizeUrl('/path/to:file')).toBe('/path/to:file');
    });

    it('should allow relative URL with dot and colon after slash', () => {
      expect(sanitizeUrl('./foo:bar')).toBe('./foo:bar');
    });
  });

  describe('fragment-only URLs', () => {
    it('should allow #section', () => {
      expect(sanitizeUrl('#section')).toBe('#section');
    });

    it('should allow # with complex anchor', () => {
      expect(sanitizeUrl('#my-heading-123')).toBe('#my-heading-123');
    });

    it('should allow bare #', () => {
      expect(sanitizeUrl('#')).toBe('#');
    });
  });

  describe('blocked protocols -- XSS vectors', () => {
    it('should block javascript: protocol', () => {
      expect(sanitizeUrl('javascript:alert(1)')).toBeUndefined();
    });

    it('should block javascript: with mixed case', () => {
      expect(sanitizeUrl('JaVaScRiPt:alert(1)')).toBeUndefined();
    });

    it('should block JAVASCRIPT: uppercase', () => {
      expect(sanitizeUrl('JAVASCRIPT:alert(1)')).toBeUndefined();
    });

    it('should block data: protocol', () => {
      expect(sanitizeUrl('data:text/html,<script>alert(1)</script>')).toBeUndefined();
    });

    it('should block data: protocol with base64', () => {
      expect(sanitizeUrl('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==')).toBeUndefined();
    });

    it('should block vbscript: protocol', () => {
      expect(sanitizeUrl('vbscript:msgbox(1)')).toBeUndefined();
    });

    it('should block blob: protocol', () => {
      expect(sanitizeUrl('blob:https://example.com/something')).toBeUndefined();
    });

    it('should block file: protocol', () => {
      expect(sanitizeUrl('file:///etc/passwd')).toBeUndefined();
    });

    it('should block ftp: protocol', () => {
      expect(sanitizeUrl('ftp://example.com')).toBeUndefined();
    });

    it('should block ssh: protocol', () => {
      expect(sanitizeUrl('ssh://user@host')).toBeUndefined();
    });
  });

  describe('encoding and bypass attempts', () => {
    it('should block javascript: with leading whitespace', () => {
      expect(sanitizeUrl('   javascript:alert(1)')).toBeUndefined();
    });

    it('should block javascript: with leading tab', () => {
      expect(sanitizeUrl('\tjavascript:alert(1)')).toBeUndefined();
    });

    it('should block javascript: with leading newline', () => {
      expect(sanitizeUrl('\njavascript:alert(1)')).toBeUndefined();
    });

    it('should block javascript: with null bytes before protocol', () => {
      expect(sanitizeUrl('java\0script:alert(1)')).toBeUndefined();
    });

    it('should block javascript: with null bytes inside protocol', () => {
      expect(sanitizeUrl('java\0script:alert(1)')).toBeUndefined();
    });

    it('should block javascript: with null bytes after protocol', () => {
      expect(sanitizeUrl('javascript:\0alert(1)')).toBeUndefined();
    });

    it('should block javascript: with mixed whitespace and newlines', () => {
      expect(sanitizeUrl(' \n\t javascript:alert(1)')).toBeUndefined();
    });
  });

  describe('edge cases', () => {
    it('should allow URL with query params', () => {
      expect(sanitizeUrl('https://example.com?foo=bar&baz=1')).toBe('https://example.com?foo=bar&baz=1');
    });

    it('should allow URL with hash fragment', () => {
      expect(sanitizeUrl('https://example.com#section')).toBe('https://example.com#section');
    });

    it('should allow URL with port', () => {
      expect(sanitizeUrl('https://example.com:3000')).toBe('https://example.com:3000');
    });

    it('should allow URL with path and query', () => {
      expect(sanitizeUrl('https://example.com/api/v1/tasks?status=done')).toBe('https://example.com/api/v1/tasks?status=done');
    });

    it('should allow URL with encoded characters', () => {
      expect(sanitizeUrl('https://example.com/path%20with%20spaces')).toBe('https://example.com/path%20with%20spaces');
    });

    it('should allow URL with auth info', () => {
      expect(sanitizeUrl('https://user:pass@example.com')).toBe('https://user:pass@example.com');
    });

    it('should handle colon in query string of allowed protocol', () => {
      expect(sanitizeUrl('https://example.com?time=12:30')).toBe('https://example.com?time=12:30');
    });

    it('should handle colon in hash fragment of allowed protocol', () => {
      expect(sanitizeUrl('https://example.com#section:2')).toBe('https://example.com#section:2');
    });

    it('should block colon-first string (ambiguous protocol)', () => {
      // ":something" -- colon at index 0, no real protocol, safer to block
      expect(sanitizeUrl(':something')).toBeUndefined();
    });

    it('should block single letter protocol not in allowlist', () => {
      expect(sanitizeUrl('x:evil')).toBeUndefined();
    });

    it('should handle URL with only protocol (no path)', () => {
      expect(sanitizeUrl('https:')).toBe('https:');
      expect(sanitizeUrl('javascript:')).toBeUndefined();
    });

    it('should allow mailto with complex email', () => {
      expect(sanitizeUrl('mailto:user+tag@sub.domain.com?subject=Hello')).toBe('mailto:user+tag@sub.domain.com?subject=Hello');
    });
  });
});
