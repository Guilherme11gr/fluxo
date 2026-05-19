package profiler

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPrepareDocsForUpload_Basic(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# My Project\n\nThis is a test project.")
	writeTestFile(t, dir, filepath.Join("docs", "guide.md"), "# Setup Guide\n\nHow to set up the project.")

	candidates := []DocCandidate{
		{Path: "README.md", Description: "Project README", Category: "readme", Safe: true},
		{Path: "docs/guide.md", Description: "Setup Guide", Category: "guide", Safe: true},
	}

	result, err := PrepareDocsForUpload(dir, candidates, nil)
	if err != nil {
		t.Fatalf("PrepareDocsForUpload() error = %v", err)
	}

	if len(result.Docs) != 2 {
		t.Errorf("expected 2 docs, got %d", len(result.Docs))
	}

	for _, doc := range result.Docs {
		if doc.Path == "README.md" {
			if doc.Title != "README" {
				t.Errorf("README title = %q, want 'README'", doc.Title)
			}
			if doc.WordCount == 0 {
				t.Error("expected non-zero word count for README")
			}
			if !doc.Safe {
				t.Error("README should be safe")
			}
		}
	}
}

func TestPrepareDocsForUpload_FluxoignoreFilter(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# My Project")
	writeTestFile(t, dir, filepath.Join("docs", "internal.md"), "# Internal Doc")
	writeTestFile(t, dir, filepath.Join("docs", "public.md"), "# Public Doc")

	// Create .fluxoignore that excludes internal docs
	if err := os.WriteFile(filepath.Join(dir, ".fluxoignore"), []byte("docs/internal.md\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	fluxoignore, err := LoadFluxoignore(dir)
	if err != nil {
		t.Fatal(err)
	}

	candidates := []DocCandidate{
		{Path: "README.md", Description: "Project README", Category: "readme", Safe: true},
		{Path: "docs/internal.md", Description: "Internal", Category: "general", Safe: true},
		{Path: "docs/public.md", Description: "Public", Category: "general", Safe: true},
	}

	result, err := PrepareDocsForUpload(dir, candidates, fluxoignore)
	if err != nil {
		t.Fatalf("PrepareDocsForUpload() error = %v", err)
	}

	// README and public.md should be included, internal.md should be filtered
	if len(result.Docs) != 2 {
		t.Errorf("expected 2 docs (README + public), got %d", len(result.Docs))
	}

	foundPublic := false
	for _, doc := range result.Docs {
		if doc.Path == "docs/public.md" {
			foundPublic = true
		}
		if doc.Path == "docs/internal.md" {
			t.Error("internal.md should be filtered by .fluxoignore")
		}
	}

	if !foundPublic {
		t.Error("public.md should be included")
	}
}

func TestPrepareDocsForUpload_SecretRedaction(t *testing.T) {
	dir := t.TempDir()
	content := `# Config Documentation

The API key is: sk-1234567890abcdef1234567890abcdef

Database URL: postgres://user:password123@localhost/db
`
	writeTestFile(t, dir, filepath.Join("docs", "config.md"), content)

	candidates := []DocCandidate{
		{Path: "docs/config.md", Description: "Config docs", Category: "general", Safe: true},
	}

	result, err := PrepareDocsForUpload(dir, candidates, nil)
	if err != nil {
		t.Fatalf("PrepareDocsForUpload() error = %v", err)
	}

	if len(result.Docs) != 1 {
		t.Fatalf("expected 1 doc, got %d", len(result.Docs))
	}

	doc := result.Docs[0]

	if doc.Content == content {
		t.Error("content should have been sanitized")
	}

	if len(result.Redacted) == 0 {
		t.Error("expected some redactions")
	}

	// Verify secrets are redacted
	if doc.Safe != true {
		t.Error("doc should still be marked as safe after redaction")
	}
}

func TestPrepareDocsForUpload_SensitivePathSkipped(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, filepath.Join("docs", ".env.example"), "DB_HOST=localhost")

	candidates := []DocCandidate{
		{Path: "docs/.env.example", Description: "Env example", Category: "general", Safe: false},
	}

	result, err := PrepareDocsForUpload(dir, candidates, nil)
	if err != nil {
		t.Fatalf("PrepareDocsForUpload() error = %v", err)
	}

	if len(result.Docs) != 0 {
		t.Error("sensitive file should be skipped")
	}

	if len(result.Warnings) == 0 {
		t.Error("expected warning for skipped sensitive file")
	}
}

func TestPrepareDocsForUpload_NonexistentFile(t *testing.T) {
	dir := t.TempDir()

	candidates := []DocCandidate{
		{Path: "nonexistent.md", Description: "Missing", Category: "general", Safe: true},
	}

	result, err := PrepareDocsForUpload(dir, candidates, nil)
	if err != nil {
		t.Fatalf("PrepareDocsForUpload() error = %v", err)
	}

	if len(result.Docs) != 0 {
		t.Error("nonexistent file should not be included")
	}

	if len(result.Warnings) == 0 {
		t.Error("expected warning for failed read")
	}
}

func TestDeriveTitle(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"README.md", "README"},
		{"docs/architecture/overview.md", "Overview"},
		{"docs/setup-guide.md", "Setup Guide"},
		{"docs/api_reference.md", "Api Reference"},
		{"CONTRIBUTING.md", "CONTRIBUTING"},
	}

	for _, tt := range tests {
		got := deriveTitle(tt.path)
		if got != tt.want {
			t.Errorf("deriveTitle(%q) = %q, want %q", tt.path, got, tt.want)
		}
	}
}

func TestCountWords(t *testing.T) {
	tests := []struct {
		input string
		want  int
	}{
		{"", 0},
		{"hello", 1},
		{"hello world", 2},
		{"  multiple   spaces  ", 2},
		{"one\ntwo\nthree", 3},
	}

	for _, tt := range tests {
		got := countWords(tt.input)
		if got != tt.want {
			t.Errorf("countWords(%q) = %d, want %d", tt.input, got, tt.want)
		}
	}
}
