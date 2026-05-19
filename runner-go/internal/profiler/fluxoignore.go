package profiler

import (
	"bufio"
	"os"
	"path/filepath"
	"strings"
)

// Fluxoignore holds parsed .fluxoignore rules.
type Fluxoignore struct {
	ignorePatterns  []pattern
	negatePatterns  []string
	defaultPatterns []string
}

type pattern struct {
	raw     string
	negated bool
	dirOnly bool
	prefix  string
	suffix  string
	contains string
}

// DefaultFluxoignorePatterns are patterns always applied even without a .fluxoignore file.
var DefaultFluxoignorePatterns = []string{
	// Secrets and credentials
	".env",
	".env.*",
	"*.env",
	".env.local",
	".env.*.local",
	".secret",
	"*.secret",
	"*.key",
	"*.pem",
	"*.p12",
	"*.pfx",
	"*.jks",
	"*.keystore",
	"id_rsa",
	"id_ed25519",
	"id_dsa",
	"id_ecdsa",
	"*.pub",

	// Package manager locks with secrets
	"package-lock.json",
	"yarn.lock",
	"pnpm-lock.yaml",

	// OS and editor files
	".DS_Store",
	"Thumbs.db",
	"*.swp",
	"*.swo",
	"*~",

	// Build outputs
	"dist/",
	"build/",
	"out/",
	"target/",
	"bin/",
	"*.o",
	"*.so",
	"*.dll",
	"*.exe",

	// Dependencies
	"node_modules/",
	"vendor/",
	"__pycache__/",
	".venv/",
	"venv/",
	".tox/",

	// Git internals
	".git/",
	".gitattributes",
	".gitmodules",

	// Logs and temp
	"*.log",
	"*.tmp",
	"*.temp",
	".cache/",
	".turbo/",
	".vercel/",
	".next/",

	// Coverage and test artifacts
	"coverage/",
	".nyc_output/",
	"*.cover",
	"*.prof",

	// IDE configs
	".idea/",
	".vscode/",
	"*.sublime-*",

	// Docker internals
	".docker/",

	// Prisma migrations (may contain sensitive data)
	"prisma/migrations/",
}

// LoadFluxoignore reads a .fluxoignore file from the repo root.
// If the file does not exist, it returns a Fluxoignore with only default patterns.
func LoadFluxoignore(repoPath string) (*Fluxoignore, error) {
	f := &Fluxoignore{
		defaultPatterns: DefaultFluxoignorePatterns,
	}

	path := filepath.Join(repoPath, ".fluxoignore")
	file, err := os.Open(path)
	if err != nil {
		if os.IsNotExist(err) {
			return f, nil
		}
		return nil, err
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())

		// Skip empty lines and comments
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		// Handle negation
		if strings.HasPrefix(line, "!") {
			negated := line[1:]
			f.negatePatterns = append(f.negatePatterns, negated)
			continue
		}

		p := parsePattern(line)
		if p != nil {
			f.ignorePatterns = append(f.ignorePatterns, *p)
		}
	}

	return f, scanner.Err()
}

// ShouldIgnore checks if a relative path should be ignored.
func (f *Fluxoignore) ShouldIgnore(relPath string, isDir bool) bool {
	// First check negations - if path matches a negation, never ignore it
	for _, neg := range f.negatePatterns {
		if matchPattern(neg, relPath, isDir) {
			return false
		}
	}

	// Check default patterns first
	for _, pat := range f.defaultPatterns {
		if matchPattern(pat, relPath, isDir) {
			return true
		}
	}

	// Check user-defined patterns
	for _, p := range f.ignorePatterns {
		if matchUserPattern(p, relPath, isDir) {
			return true
		}
	}

	return false
}

func parsePattern(line string) *pattern {
	original := line

	// Negation
	negated := false
	if strings.HasPrefix(line, "!") {
		negated = true
		line = line[1:]
	}

	// Directory-only (trailing slash)
	dirOnly := false
	if strings.HasSuffix(line, "/") {
		dirOnly = true
		line = strings.TrimSuffix(line, "/")
	}

	p := &pattern{
		raw:     original,
		negated: negated,
		dirOnly: dirOnly,
	}

	// Determine matching strategy
	if strings.Contains(line, "**") {
		// Glob pattern with ** - store as contains for simplicity
		cleaned := strings.ReplaceAll(line, "**", "")
		cleaned = strings.Trim(cleaned, "/")
		if cleaned != "" {
			p.contains = cleaned
		}
	} else if strings.HasPrefix(line, "*") {
		// Suffix match (e.g., *.log)
		p.suffix = line[1:]
	} else if strings.HasSuffix(line, "*") {
		// Prefix match
		p.prefix = strings.TrimSuffix(line, "*")
	} else {
		// Exact or contains match
		p.contains = line
	}

	return p
}

func matchPattern(pat string, relPath string, isDir bool) bool {
	// Directory-only patterns
	if strings.HasSuffix(pat, "/") {
		if !isDir {
			// For non-dirs, check if the path is under this directory
			dirPat := strings.TrimSuffix(pat, "/")
			if strings.HasPrefix(relPath, dirPat+"/") {
				return true
			}
			return false
		}
		pat = strings.TrimSuffix(pat, "/")
	}

	// Check if the pattern matches any component of the path
	lower := strings.ToLower(relPath)
	lowerPat := strings.ToLower(pat)

	// Glob with *
	if strings.Contains(lowerPat, "*") {
		return globMatch(lowerPat, lower)
	}

	// Exact match on filename
	base := filepath.Base(lower)
	if base == lowerPat {
		return true
	}

	// Contains match (for patterns like .env)
	if strings.Contains(lower, lowerPat) {
		return true
	}

	// Prefix match for directory paths
	if strings.HasPrefix(lower, lowerPat+"/") {
		return true
	}

	// Check if any path component matches
	parts := strings.Split(lower, "/")
	for _, part := range parts {
		if part == lowerPat {
			return true
		}
	}

	return false
}

func matchUserPattern(p pattern, relPath string, isDir bool) bool {
	if p.dirOnly && !isDir {
		// Check if path is under this directory
		dirPattern := strings.TrimSuffix(p.raw, "/")
		if strings.HasPrefix(relPath, dirPattern+"/") {
			return true
		}
		return false
	}

	lower := strings.ToLower(relPath)
	base := strings.ToLower(filepath.Base(relPath))

	// Suffix match
	if p.suffix != "" {
		if strings.HasSuffix(lower, strings.ToLower(p.suffix)) || strings.HasSuffix(base, strings.ToLower(p.suffix)) {
			return true
		}
	}

	// Prefix match
	if p.prefix != "" {
		if strings.HasPrefix(base, strings.ToLower(p.prefix)) || strings.HasPrefix(lower, strings.ToLower(p.prefix)) {
			return true
		}
	}

	// Contains match
	if p.contains != "" {
		lowerContains := strings.ToLower(p.contains)
		if base == lowerContains || strings.Contains(lower, lowerContains) {
			return true
		}
		// Check path components
		parts := strings.Split(lower, "/")
		for _, part := range parts {
			if part == lowerContains {
				return true
			}
		}
	}

	return false
}

func globMatch(pattern, s string) bool {
	// Simple glob matching supporting * and **
	// For ** patterns, we treat them as "contains"
	if strings.Contains(pattern, "**") {
		parts := strings.Split(pattern, "**")
		for _, part := range parts {
			part = strings.Trim(part, "*")
			part = strings.Trim(part, "/")
			if part != "" && !strings.Contains(s, strings.ToLower(part)) {
				return false
			}
		}
		return true
	}

	// Single * glob
	patternParts := strings.Split(pattern, "*")
	if len(patternParts) == 2 {
		prefix, suffix := patternParts[0], patternParts[1]
		return strings.HasPrefix(s, prefix) && strings.HasSuffix(s, suffix)
	}

	return false
}
