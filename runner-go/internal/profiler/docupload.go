package profiler

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

// PreparedDoc represents a doc file ready for upload via Agent API.
type PreparedDoc struct {
	Path      string `json:"path"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	WordCount int    `json:"wordCount"`
	Safe      bool   `json:"safe"`
}

// DocUploadResult holds the result of preparing docs for upload.
type DocUploadResult struct {
	Docs     []PreparedDoc `json:"docs"`
	Warnings []string      `json:"warnings"`
	Redacted []string      `json:"redacted"`
}

// BootstrapDocPayload represents a doc in the format expected by the Agent API bootstrap endpoint.
type BootstrapDocPayload struct {
	Path      string `json:"path"`
	Title     string `json:"title"`
	Content   string `json:"content"`
	WordCount int    `json:"wordCount"`
	Safe      bool   `json:"safe"`
}

// PrepareDocsForUpload reads candidate doc files, applies .fluxoignore filtering,
// redacts secrets, and returns prepared docs ready for the Agent API.
func PrepareDocsForUpload(repoPath string, candidates []DocCandidate, fluxoignore *Fluxoignore) (*DocUploadResult, error) {
	result := &DocUploadResult{
		Docs:     []PreparedDoc{},
		Warnings: []string{},
		Redacted: []string{},
	}

	for _, c := range candidates {
		fullPath := filepath.Join(repoPath, c.Path)

		// Re-check sensitivity
		if isSensitivePath(c.Path) {
			result.Warnings = append(result.Warnings, fmt.Sprintf("skipped sensitive file: %s", c.Path))
			continue
		}

		// Check .fluxoignore
		if fluxoignore != nil {
			info, err := os.Stat(fullPath)
			if err == nil {
				if fluxoignore.ShouldIgnore(c.Path, info.IsDir()) {
					result.Warnings = append(result.Warnings, fmt.Sprintf("skipped by .fluxoignore: %s", c.Path))
					continue
				}
			}
		}

		// Read file content
		data, err := os.ReadFile(fullPath)
		if err != nil {
			result.Warnings = append(result.Warnings, fmt.Sprintf("failed to read %s: %v", c.Path, err))
			continue
		}

		content := string(data)

		// Sanitize content (redact secrets)
		sanitized, redacted := SanitizeContent(content, c.Path)
		if len(redacted) > 0 {
			for _, r := range redacted {
				result.Redacted = append(result.Redacted, fmt.Sprintf("%s: %s", c.Path, r))
			}
		}

		// Calculate word count
		wordCount := countWords(sanitized)

		// Derive title from filename
		title := deriveTitle(c.Path)

		result.Docs = append(result.Docs, PreparedDoc{
			Path:      c.Path,
			Title:     title,
			Content:   sanitized,
			WordCount: wordCount,
			Safe:      true,
		})
	}

	return result, nil
}

// PrepareBootstrapDocs converts prepared docs to the format expected by the Agent API.
func PrepareBootstrapDocs(result *DocUploadResult) []BootstrapDocPayload {
	payload := make([]BootstrapDocPayload, 0, len(result.Docs))
	for _, doc := range result.Docs {
		payload = append(payload, BootstrapDocPayload{
			Path:      doc.Path,
			Title:     doc.Title,
			Content:   doc.Content,
			WordCount: doc.WordCount,
			Safe:      doc.Safe,
		})
	}
	return payload
}

// countWords estimates the word count of a string.
func countWords(s string) int {
	if s == "" {
		return 0
	}
	return len(strings.Fields(s))
}

// deriveTitle creates a human-readable title from a file path.
func deriveTitle(path string) string {
	base := filepath.Base(path)
	name := strings.TrimSuffix(base, filepath.Ext(base))

	// Convert kebab-case or snake_case to Title Case
	name = strings.ReplaceAll(name, "-", " ")
	name = strings.ReplaceAll(name, "_", " ")

	// Capitalize first letter of each word
	words := strings.Fields(name)
	for i, w := range words {
		if len(w) > 0 {
			words[i] = strings.ToUpper(w[:1]) + w[1:]
		}
	}

	return strings.Join(words, " ")
}
