package profiler

import (
	"os"
	"path/filepath"
	"testing"
)

func TestFluxoignore_LoadNonexistent(t *testing.T) {
	dir := t.TempDir()
	f, err := LoadFluxoignore(dir)
	if err != nil {
		t.Fatalf("LoadFluxoignore() error = %v", err)
	}
	if f == nil {
		t.Fatal("expected non-nil Fluxoignore")
	}
	// Should have default patterns
	if len(f.defaultPatterns) == 0 {
		t.Error("expected default patterns")
	}
}

func TestFluxoignore_LoadWithFile(t *testing.T) {
	dir := t.TempDir()
	content := `# Custom ignore patterns
docs/internal/
*.draft.md
!docs/important.md
`
	if err := os.WriteFile(filepath.Join(dir, ".fluxoignore"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	f, err := LoadFluxoignore(dir)
	if err != nil {
		t.Fatalf("LoadFluxoignore() error = %v", err)
	}

	if len(f.ignorePatterns) != 2 {
		t.Errorf("expected 2 user ignore patterns, got %d", len(f.ignorePatterns))
	}
	if len(f.negatePatterns) != 1 {
		t.Errorf("expected 1 negate pattern, got %d", len(f.negatePatterns))
	}
}

func TestFluxoignore_ShouldIgnore_Defaults(t *testing.T) {
	dir := t.TempDir()
	f, err := LoadFluxoignore(dir)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		path  string
		isDir bool
		want  bool
	}{
		{".env", false, true},
		{".env.local", false, true},
		{"config.env", false, true},
		{"node_modules/pkg/index.js", false, true},
		{".git/config", false, true},
		{".next/server/page.js", false, true},
		{"dist/bundle.js", false, true},
		{"coverage/lcov.info", false, true},
		{"docs/guide.md", false, false},
		{"README.md", false, false},
		{"src/index.ts", false, false},
	}

	for _, tt := range tests {
		got := f.ShouldIgnore(tt.path, tt.isDir)
		if got != tt.want {
			t.Errorf("ShouldIgnore(%q, %v) = %v, want %v", tt.path, tt.isDir, got, tt.want)
		}
	}
}

func TestFluxoignore_ShouldIgnore_UserPatterns(t *testing.T) {
	dir := t.TempDir()
	content := `# Ignore internal docs
docs/internal/
# Ignore drafts
*.draft.md
# But not this one
!docs/important.md
`
	if err := os.WriteFile(filepath.Join(dir, ".fluxoignore"), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}

	f, err := LoadFluxoignore(dir)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		path  string
		isDir bool
		want  bool
	}{
		{"docs/internal/secret.md", false, true},
		{"notes.draft.md", false, true},
		{"docs/important.md", false, false},
		{"docs/public/guide.md", false, false},
	}

	for _, tt := range tests {
		got := f.ShouldIgnore(tt.path, tt.isDir)
		if got != tt.want {
			t.Errorf("ShouldIgnore(%q, %v) = %v, want %v", tt.path, tt.isDir, got, tt.want)
		}
	}
}

func TestFluxoignore_GlobPatterns(t *testing.T) {
	dir := t.TempDir()
	f, err := LoadFluxoignore(dir)
	if err != nil {
		t.Fatal(err)
	}

	tests := []struct {
		path string
		want bool
	}{
		{"test.log", true},
		{"app.log", true},
		{"debug.log", true},
		{"test.txt", false},
		{"*.swp", true},
		{"file.swp", true},
	}

	for _, tt := range tests {
		got := f.ShouldIgnore(tt.path, false)
		if got != tt.want {
			t.Errorf("ShouldIgnore(%q, false) = %v, want %v", tt.path, got, tt.want)
		}
	}
}
