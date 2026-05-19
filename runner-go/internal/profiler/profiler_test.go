package profiler

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func writeTestFile(t *testing.T, dir, name, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(filepath.Join(dir, name)), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, name), []byte(content), 0o644); err != nil {
		t.Fatal(err)
	}
}

func TestProfile_EmptyDir(t *testing.T) {
	dir := t.TempDir()
	opts := DefaultProfileOptions(dir)
	opts.DocsSubdir = ""

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	if profile.Summary != "" {
		t.Errorf("expected empty summary, got %q", profile.Summary)
	}
	if len(profile.CandidateDocs) != 0 {
		t.Errorf("expected no candidate docs, got %d", len(profile.CandidateDocs))
	}
	if len(profile.SuggestedTags) != 0 {
		t.Errorf("expected no tags, got %v", profile.SuggestedTags)
	}
}

func TestProfile_WithReadme(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# My Project\n\nA cool project for testing.")

	opts := DefaultProfileOptions(dir)
	opts.DocsSubdir = ""

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	if profile.Summary == "" {
		t.Error("expected non-empty summary")
	}
	if !containsStr(profile.SuggestedTags, "has-readme") {
		t.Error("expected has-readme tag")
	}
}

func TestProfile_NodeStack(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "package.json", `{
		"dependencies": {
			"next": "^16.0.0",
			"react": "^19.0.0",
			"@supabase/supabase-js": "^2.0.0",
			"@tanstack/react-query": "^5.0.0",
			"tailwindcss": "^4.0.0",
			"zod": "^4.0.0"
		},
		"devDependencies": {
			"vitest": "^4.0.0",
			"@playwright/test": "^1.58.0"
		}
	}`)
	writeTestFile(t, dir, "README.md", "# Test App")
	writeTestFile(t, dir, "Dockerfile", "FROM node:20")
	writeTestFile(t, dir, filepath.Join("prisma", "schema.prisma"), "generator client { provider = \"prisma-client-js\" }")

	opts := DefaultProfileOptions(dir)
	opts.DocsSubdir = ""

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	assertHas(t, profile.Stack.Languages, "TypeScript", "expected TypeScript")
	assertHas(t, profile.Stack.Frameworks, "Next.js", "expected Next.js")
	assertHas(t, profile.Stack.Frameworks, "React", "expected React")
	assertHas(t, profile.Stack.Databases, "Supabase", "expected Supabase")
	assertHas(t, profile.Stack.Tools, "TailwindCSS", "expected TailwindCSS")
	assertHas(t, profile.Stack.Tools, "Vitest", "expected Vitest")
	assertHas(t, profile.Stack.Tools, "Playwright", "expected Playwright")
	assertHas(t, profile.Stack.Tools, "Docker", "expected Docker")
	assertHas(t, profile.Stack.Tools, "Prisma", "expected Prisma")
	assertHas(t, profile.Stack.Tools, "TanStack Query", "expected TanStack Query")
	assertHas(t, profile.Stack.Tools, "Zod", "expected Zod")
	assertHas(t, profile.SuggestedTags, "frontend", "expected frontend tag")
	assertHas(t, profile.SuggestedSkills, "vercel-react-best-practices", "expected vercel-react skill")
	assertHas(t, profile.SuggestedSkills, "playwright-best-practices", "expected playwright skill")
	assertHas(t, profile.SuggestedSkills, "supabase-postgres-best-practices", "expected supabase skill")
}

func TestProfile_GoStack(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "go.mod", `module github.com/example/myapp

go 1.23

require (
	github.com/spf13/cobra v1.8.1
	gopkg.in/yaml.v3 v3.0.1
)`)

	opts := DefaultProfileOptions(dir)
	opts.DocsSubdir = ""

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	assertHas(t, profile.Stack.Languages, "Go", "expected Go")
	assertHas(t, profile.Stack.PackageManagers, "go modules", "expected go modules")
	assertHas(t, profile.Stack.Tools, "Cobra", "expected Cobra")
}

func TestProfile_DocsScanning(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# Test")
	writeTestFile(t, dir, filepath.Join("docs", "architecture", "overview.md"), "# Architecture Overview\n\nSystem design doc.")
	writeTestFile(t, dir, filepath.Join("docs", "guides", "setup.md"), "# Setup Guide\n\nHow to set up.")
	writeTestFile(t, dir, filepath.Join("docs", "api", "endpoints.md"), "# API Reference\n\nEndpoints.")

	opts := DefaultProfileOptions(dir)

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	foundReadme := false
	foundArch := false
	foundGuide := false
	foundAPI := false

	for _, doc := range profile.CandidateDocs {
		switch doc.Path {
		case "README.md":
			foundReadme = true
			if doc.Category != "readme" {
				t.Errorf("README.md category = %q, want readme", doc.Category)
			}
		case "docs/architecture/overview.md":
			foundArch = true
			if doc.Category != "architecture" {
				t.Errorf("overview.md category = %q, want architecture", doc.Category)
			}
			if doc.Description != "Architecture Overview" {
				t.Errorf("overview.md description = %q, want Architecture Overview", doc.Description)
			}
		case "docs/guides/setup.md":
			foundGuide = true
			if doc.Category != "guide" {
				t.Errorf("setup.md category = %q, want guide", doc.Category)
			}
		case "docs/api/endpoints.md":
			foundAPI = true
			if doc.Category != "api" {
				t.Errorf("endpoints.md category = %q, want api", doc.Category)
			}
		}
	}

	if !foundReadme {
		t.Error("README.md not in candidate docs")
	}
	if !foundArch {
		t.Error("docs/architecture/overview.md not in candidate docs")
	}
	if !foundGuide {
		t.Error("docs/guides/setup.md not in candidate docs")
	}
	if !foundAPI {
		t.Error("docs/api/endpoints.md not in candidate docs")
	}

	assertHas(t, profile.SuggestedTags, "documented", "expected documented tag")
}

func TestProfile_SensitiveFilesExcluded(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# Test")
	writeTestFile(t, dir, filepath.Join("docs", ".env.example"), "DB_HOST=localhost")
	writeTestFile(t, dir, filepath.Join("docs", "credentials.md"), "# Credentials\n\nSecret stuff.")
	writeTestFile(t, dir, filepath.Join("docs", "safe-guide.md"), "# Safe Guide\n\nNormal doc.")

	opts := DefaultProfileOptions(dir)

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	for _, doc := range profile.CandidateDocs {
		if doc.Path == "docs/.env.example" {
			t.Error("sensitive .env file should be excluded")
		}
		if doc.Path == "docs/credentials.md" {
			t.Error("credentials file should be excluded")
		}
	}

	found := false
	for _, doc := range profile.CandidateDocs {
		if doc.Path == "docs/safe-guide.md" {
			found = true
		}
	}
	if !found {
		t.Error("safe-guide.md should be included")
	}
}

func TestProfile_LargeFileWarning(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# Test")

	bigContent := make([]byte, 101*1024)
	for i := range bigContent {
		bigContent[i] = 'a'
	}
	writeTestFile(t, dir, filepath.Join("docs", "big.md"), string(bigContent))

	opts := DefaultProfileOptions(dir)

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	if len(profile.Warnings) == 0 {
		t.Error("expected warnings for large file")
	}

	for _, doc := range profile.CandidateDocs {
		if doc.Path == "docs/big.md" {
			t.Error("large file should be excluded from candidates")
		}
	}
}

func TestProfile_MaxDocsLimit(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# Test")

	for i := 0; i < 35; i++ {
		writeTestFile(t, dir, filepath.Join("docs", "guide", "doc.md"), "# Doc")
		os.Rename(
			filepath.Join(dir, "docs", "guide", "doc.md"),
			filepath.Join(dir, "docs", "guide", "doc-"+string(rune('0'+i))+".md"),
		)
	}

	opts := DefaultProfileOptions(dir)
	opts.MaxDocCount = 10

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	nonReadmeDocs := 0
	for _, doc := range profile.CandidateDocs {
		if doc.Path != "README.md" {
			nonReadmeDocs++
		}
	}

	if nonReadmeDocs > 10 {
		t.Errorf("expected at most 10 non-README docs, got %d", nonReadmeDocs)
	}
}

func TestProfile_ExcludedDirsSkipped(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "README.md", "# Test")
	writeTestFile(t, dir, filepath.Join("docs", "node_modules", "pkg", "readme.md"), "# Pkg Readme")
	writeTestFile(t, dir, filepath.Join("docs", ".git", "hooks", "info.md"), "# Hooks")
	writeTestFile(t, dir, filepath.Join("docs", "real", "guide.md"), "# Real Guide")

	opts := DefaultProfileOptions(dir)

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	for _, doc := range profile.CandidateDocs {
		if strings.Contains(doc.Path, "node_modules") {
			t.Error("node_modules should be excluded")
		}
		if strings.Contains(doc.Path, ".git") {
			t.Error(".git should be excluded")
		}
	}
}

func TestProfile_NonexistentPath(t *testing.T) {
	opts := DefaultProfileOptions("/nonexistent/path/12345")
	_, err := Profile(opts)
	if err == nil {
		t.Error("expected error for nonexistent path")
	}
}

func TestProfile_AGENTSMDoc(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "AGENTS.md", "# Agent Instructions\n\nBuild agent rules.")

	opts := DefaultProfileOptions(dir)
	opts.DocsSubdir = ""

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	found := false
	for _, doc := range profile.CandidateDocs {
		if doc.Path == "AGENTS.md" && doc.Category == "agents" {
			found = true
		}
	}
	if !found {
		t.Error("AGENTS.md should be in candidate docs with category 'agents'")
	}
}

func TestProfile_MultipleLanguages(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "package.json", `{"dependencies":{"next":"^16.0.0"}}`)
	writeTestFile(t, dir, "go.mod", "module github.com/example/myapp\n\ngo 1.23\n")
	writeTestFile(t, dir, "requirements.txt", "flask==2.0\n")

	opts := DefaultProfileOptions(dir)
	opts.DocsSubdir = ""

	profile, err := Profile(opts)
	if err != nil {
		t.Fatalf("Profile() error = %v", err)
	}

	assertHas(t, profile.Stack.Languages, "TypeScript", "expected TypeScript")
	assertHas(t, profile.Stack.Languages, "Go", "expected Go")
	assertHas(t, profile.Stack.Languages, "Python", "expected Python")
}

func assertHas(t *testing.T, slice []string, val, msg string) {
	t.Helper()
	for _, s := range slice {
		if s == val {
			return
		}
	}
	t.Errorf("%s: slice %v does not contain %q", msg, slice, val)
}

func containsStr(slice []string, substr string) bool {
	for _, s := range slice {
		if s == substr || strings.Contains(s, substr) {
			return true
		}
	}
	return false
}
