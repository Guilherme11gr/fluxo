package profiler

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

const (
	maxFileSize      = 100 * 1024 // 100KB
	maxCandidateDocs = 30
	maxReadmeLines   = 80
)

var excludedDirs = map[string]bool{
	"node_modules": true, ".git": true, ".next": true, "dist": true,
	"build": true, "vendor": true, "__pycache__": true, ".venv": true,
	"venv": true, ".tox": true, ".cache": true, "coverage": true,
	".idea": true, ".vscode": true, ".turbo": true, ".vercel": true,
	"target": true, "bin": true, "out": true,
}

var sensitivePatterns = []string{
	".env", ".secret", ".key", "credentials", ".pem", ".p12",
	".pfx", ".jks", ".keystore", "id_rsa", "id_ed25519",
}

type RepoProfile struct {
	Summary         string         `json:"summary" yaml:"summary"`
	Stack           StackSummary   `json:"stack" yaml:"stack"`
	CandidateDocs   []DocCandidate `json:"candidateDocs" yaml:"candidateDocs"`
	SuggestedTags   []string       `json:"suggestedTags" yaml:"suggestedTags"`
	SuggestedSkills []string       `json:"suggestedSkills" yaml:"suggestedSkills"`
	Warnings        []string       `json:"warnings" yaml:"warnings"`
}

type StackSummary struct {
	Languages       []string `json:"languages" yaml:"languages"`
	Frameworks      []string `json:"frameworks" yaml:"frameworks"`
	Databases       []string `json:"databases" yaml:"databases"`
	Runtimes        []string `json:"runtimes" yaml:"runtimes"`
	PackageManagers []string `json:"packageManagers" yaml:"packageManagers"`
	Tools           []string `json:"tools" yaml:"tools"`
}

type DocCandidate struct {
	Path        string `json:"path" yaml:"path"`
	Description string `json:"description" yaml:"description"`
	Category    string `json:"category" yaml:"category"`
	SizeBytes   int64  `json:"sizeBytes" yaml:"sizeBytes"`
	Safe        bool   `json:"safe" yaml:"safe"`
}

type ProfileOptions struct {
	RepoPath     string
	DocsSubdir   string
	MaxDocCount  int
	MaxFileSize  int64
	SkipReadme   bool
	Fluxoignore  *Fluxoignore
}

func DefaultProfileOptions(repoPath string) ProfileOptions {
	fluxoignore, _ := LoadFluxoignore(repoPath)
	return ProfileOptions{
		RepoPath:    repoPath,
		DocsSubdir:  "docs",
		MaxDocCount: maxCandidateDocs,
		MaxFileSize: maxFileSize,
		Fluxoignore: fluxoignore,
	}
}

func Profile(opts ProfileOptions) (*RepoProfile, error) {
	profile := &RepoProfile{}

	if _, err := os.Stat(opts.RepoPath); os.IsNotExist(err) {
		return nil, fmt.Errorf("repo path does not exist: %s", opts.RepoPath)
	}

	if !opts.SkipReadme {
		profile.Summary = extractSummary(opts.RepoPath)
	}

	profile.Stack = detectStack(opts.RepoPath)

	docs, warnings := scanDocs(opts)
	profile.CandidateDocs = docs
	profile.Warnings = warnings

	profile.SuggestedTags = suggestTags(profile)
	profile.SuggestedSkills = suggestSkills(profile)

	return profile, nil
}

func extractSummary(repoPath string) string {
	readmePaths := []string{
		"README.md", "README.MD", "README", "readme.md",
	}

	for _, name := range readmePaths {
		path := filepath.Join(repoPath, name)
		data, err := os.ReadFile(path)
		if err != nil {
			continue
		}

		content := string(data)
		lines := strings.Split(content, "\n")

		var summaryLines []string
		for i, line := range lines {
			if i >= maxReadmeLines {
				break
			}
			trimmed := strings.TrimSpace(line)
			if trimmed == "" {
				if len(summaryLines) > 0 {
					break
				}
				continue
			}
			summaryLines = append(summaryLines, trimmed)
		}

		if len(summaryLines) > 0 {
			result := strings.Join(summaryLines, " ")
			if len(result) > 500 {
				result = result[:497] + "..."
			}
			return result
		}
	}

	return ""
}

func detectStack(repoPath string) StackSummary {
	stack := StackSummary{
		Languages:       []string{},
		Frameworks:      []string{},
		Databases:       []string{},
		Runtimes:        []string{},
		PackageManagers: []string{},
		Tools:           []string{},
	}

	seen := func(slice []string, val string) bool {
		for _, v := range slice {
			if v == val {
				return true
			}
		}
		return false
	}
	add := func(slice *[]string, val string) {
		if !seen(*slice, val) {
			*slice = append(*slice, val)
		}
	}

	if data, err := os.ReadFile(filepath.Join(repoPath, "package.json")); err == nil {
		detectFromPackageJSON(data, &stack, add)
	}

	if data, err := os.ReadFile(filepath.Join(repoPath, "go.mod")); err == nil {
		detectFromGoMod(data, &stack, add)
	}

	if _, err := os.Stat(filepath.Join(repoPath, "requirements.txt")); err == nil {
		add(&stack.Languages, "Python")
		add(&stack.PackageManagers, "pip")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "Pipfile")); err == nil {
		add(&stack.Languages, "Python")
		add(&stack.PackageManagers, "pipenv")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "pyproject.toml")); err == nil {
		add(&stack.Languages, "Python")
		add(&stack.PackageManagers, "pip")
	}

	if data, err := os.ReadFile(filepath.Join(repoPath, "Cargo.toml")); err == nil {
		detectFromCargoToml(data, &stack, add)
	}

	if data, err := os.ReadFile(filepath.Join(repoPath, "pom.xml")); err == nil {
		detectFromPomXml(data, &stack, add)
	}

	if _, err := os.Stat(filepath.Join(repoPath, "Gemfile")); err == nil {
		add(&stack.Languages, "Ruby")
		add(&stack.PackageManagers, "bundler")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "composer.json")); err == nil {
		add(&stack.Languages, "PHP")
		add(&stack.PackageManagers, "composer")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "prisma", "schema.prisma")); err == nil {
		add(&stack.Tools, "Prisma")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "Dockerfile")); err == nil {
		add(&stack.Tools, "Docker")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "docker-compose.yml")); err == nil {
		add(&stack.Tools, "Docker Compose")
	}

	if _, err := os.Stat(filepath.Join(repoPath, ".github", "workflows")); err == nil {
		add(&stack.Tools, "GitHub Actions")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "vitest.config.ts")); err == nil {
		add(&stack.Tools, "Vitest")
	}

	if _, err := os.Stat(filepath.Join(repoPath, "playwright.config.ts")); err == nil {
		add(&stack.Tools, "Playwright")
	}

	return stack
}

type addFn func(*[]string, string)

func detectFromPackageJSON(data []byte, stack *StackSummary, add addFn) {
	add(&stack.Languages, "TypeScript")

	var pkg struct {
		Dependencies    map[string]string `json:"dependencies"`
		DevDependencies map[string]string `json:"devDependencies"`
	}
	if err := json.Unmarshal(data, &pkg); err != nil {
		return
	}

	all := make(map[string]string)
	for k, v := range pkg.Dependencies {
		all[k] = v
	}
	for k, v := range pkg.DevDependencies {
		all[k] = v
	}

	add(&stack.PackageManagers, "npm")

	if _, ok := all["next"]; ok {
		add(&stack.Frameworks, "Next.js")
	}
	if _, ok := all["react"]; ok {
		add(&stack.Frameworks, "React")
	}
	if _, ok := all["@supabase/supabase-js"]; ok {
		add(&stack.Databases, "Supabase")
	}
	if _, ok := all["@prisma/client"]; ok {
		add(&stack.Tools, "Prisma")
	}
	if _, ok := all["@tanstack/react-query"]; ok {
		add(&stack.Tools, "TanStack Query")
	}
	if _, ok := all["tailwindcss"]; ok {
		add(&stack.Tools, "TailwindCSS")
	}
	if _, ok := all["zod"]; ok {
		add(&stack.Tools, "Zod")
	}
	if _, ok := all["openai"]; ok {
		add(&stack.Tools, "OpenAI SDK")
	}
	if _, ok := all["vitest"]; ok {
		add(&stack.Tools, "Vitest")
	}
	if _, ok := all["@playwright/test"]; ok {
		add(&stack.Tools, "Playwright")
	}
	if _, ok := all["express"]; ok {
		add(&stack.Frameworks, "Express")
	}
	if _, ok := all["fastify"]; ok {
		add(&stack.Frameworks, "Fastify")
	}
	if _, ok := all["@radix-ui/react-dialog"]; ok {
		add(&stack.Tools, "Radix UI")
	}
	if _, ok := all["better-auth"]; ok {
		add(&stack.Tools, "Better Auth")
	}
	if _, ok := all["motion"]; ok {
		add(&stack.Tools, "Motion")
	}
	if _, ok := all["pg"]; ok {
		add(&stack.Databases, "PostgreSQL")
	}
}

func detectFromGoMod(data []byte, stack *StackSummary, add addFn) {
	add(&stack.Languages, "Go")
	add(&stack.PackageManagers, "go modules")

	content := string(data)
	if strings.Contains(content, "cobra") {
		add(&stack.Tools, "Cobra")
	}
	if strings.Contains(content, "gin-gonic") {
		add(&stack.Frameworks, "Gin")
	}
	if strings.Contains(content, "echo") {
		add(&stack.Frameworks, "Echo")
	}
	if strings.Contains(content, "gorm") {
		add(&stack.Tools, "GORM")
	}
}

func detectFromCargoToml(data []byte, stack *StackSummary, add addFn) {
	add(&stack.Languages, "Rust")
	add(&stack.PackageManagers, "cargo")

	content := string(data)
	if strings.Contains(content, "actix") {
		add(&stack.Frameworks, "Actix")
	}
	if strings.Contains(content, "tokio") {
		add(&stack.Runtimes, "Tokio")
	}
	if strings.Contains(content, "axum") {
		add(&stack.Frameworks, "Axum")
	}
}

var mavenArtifactRe = regexp.MustCompile(`<artifactId>([\w-]+)</artifactId>`)

func detectFromPomXml(data []byte, stack *StackSummary, add addFn) {
	add(&stack.Languages, "Java")
	add(&stack.PackageManagers, "Maven")

	content := string(data)
	if strings.Contains(content, "spring-boot") {
		add(&stack.Frameworks, "Spring Boot")
	}
	if strings.Contains(content, "quarkus") {
		add(&stack.Frameworks, "Quarkus")
	}
	if strings.Contains(content, "micronaut") {
		add(&stack.Frameworks, "Micronaut")
	}
}

func scanDocs(opts ProfileOptions) ([]DocCandidate, []string) {
	var candidates []DocCandidate
	var warnings []string

	docDirs := []string{}
	if opts.DocsSubdir != "" {
		docDirs = append(docDirs, filepath.Join(opts.RepoPath, opts.DocsSubdir))
	}

	readmePath := filepath.Join(opts.RepoPath, "README.md")
	if _, err := os.Stat(readmePath); err == nil {
		info, _ := os.Stat(readmePath)
		safe := !isSensitivePath("README.md")
		if opts.Fluxoignore != nil {
			safe = safe && !opts.Fluxoignore.ShouldIgnore("README.md", false)
		}
		candidates = append(candidates, DocCandidate{
			Path:        "README.md",
			Description: "Project README",
			Category:    "readme",
			SizeBytes:   info.Size(),
			Safe:        safe,
		})
	}

	agentsPath := filepath.Join(opts.RepoPath, "AGENTS.md")
	if _, err := os.Stat(agentsPath); err == nil {
		info, _ := os.Stat(agentsPath)
		safe := !isSensitivePath("AGENTS.md")
		if opts.Fluxoignore != nil {
			safe = safe && !opts.Fluxoignore.ShouldIgnore("AGENTS.md", false)
		}
		candidates = append(candidates, DocCandidate{
			Path:        "AGENTS.md",
			Description: "Agent instructions",
			Category:    "agents",
			SizeBytes:   info.Size(),
			Safe:        safe,
		})
	}

	for _, docDir := range docDirs {
		filepath.WalkDir(docDir, func(path string, d os.DirEntry, err error) error {
			if err != nil {
				return nil
			}

			rel, relErr := filepath.Rel(opts.RepoPath, path)
			if relErr != nil {
				return nil
			}

			if d.IsDir() {
				if excludedDirs[d.Name()] {
					return filepath.SkipDir
				}
				// Also check .fluxoignore for directories
				if opts.Fluxoignore != nil && opts.Fluxoignore.ShouldIgnore(rel, true) {
					return filepath.SkipDir
				}
				return nil
			}

			if isSensitivePath(rel) {
				return nil
			}

			if !isDocFile(d.Name()) {
				return nil
			}

			info, infoErr := d.Info()
			if infoErr != nil {
				return nil
			}

			if info.Size() > opts.MaxFileSize {
				warnings = append(warnings, fmt.Sprintf("skipped large file (%d KB): %s", info.Size()/1024, rel))
				return nil
			}

			// Check .fluxoignore
			safe := true
			if opts.Fluxoignore != nil {
				if opts.Fluxoignore.ShouldIgnore(rel, false) {
					warnings = append(warnings, fmt.Sprintf("skipped by .fluxoignore: %s", rel))
					return nil
				}
			}

			if len(candidates) >= opts.MaxDocCount {
				warnings = append(warnings, fmt.Sprintf("max candidate docs reached (%d), skipped: %s", opts.MaxDocCount, rel))
				return nil
			}

			category := categorizeDoc(rel)
			desc := extractDocDescription(path, d.Name())

			candidates = append(candidates, DocCandidate{
				Path:        filepath.ToSlash(rel),
				Description: desc,
				Category:    category,
				SizeBytes:   info.Size(),
				Safe:        safe,
			})

			return nil
		})
	}

	sort.Slice(candidates, func(i, j int) bool {
		return candidates[i].Path < candidates[j].Path
	})

	return candidates, warnings
}

func isSensitivePath(relPath string) bool {
	lower := strings.ToLower(relPath)
	for _, pattern := range sensitivePatterns {
		if strings.Contains(lower, strings.ToLower(pattern)) {
			return true
		}
	}
	return false
}

func isDocFile(name string) bool {
	lower := strings.ToLower(name)
	exts := []string{".md", ".markdown", ".mdx", ".rst", ".adoc", ".txt", ".html"}
	for _, ext := range exts {
		if strings.HasSuffix(lower, ext) {
			return true
		}
	}
	return false
}

func categorizeDoc(relPath string) string {
	lower := strings.ToLower(relPath)
	switch {
	case strings.Contains(lower, "architecture"):
		return "architecture"
	case strings.Contains(lower, "guide") || strings.Contains(lower, "guides"):
		return "guide"
	case strings.Contains(lower, "api"):
		return "api"
	case strings.Contains(lower, "ui-ux") || strings.Contains(lower, "ui_ux") || strings.Contains(lower, "design"):
		return "ui-ux"
	case strings.Contains(lower, "database") || strings.Contains(lower, "db"):
		return "database"
	case strings.Contains(lower, "roadmap") || strings.Contains(lower, "planning"):
		return "planning"
	case strings.Contains(lower, "readme"):
		return "readme"
	default:
		return "general"
	}
}

func extractDocDescription(path, filename string) string {
	data, err := os.ReadFile(path)
	if err != nil {
		return filename
	}

	lines := strings.Split(string(data), "\n")
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		if strings.HasPrefix(trimmed, "#") {
			desc := strings.TrimLeft(trimmed, "# ")
			if len(desc) > 120 {
				desc = desc[:117] + "..."
			}
			return desc
		}
		break
	}

	return filename
}

func suggestTags(profile *RepoProfile) []string {
	tagSet := map[string]bool{}

	for _, lang := range profile.Stack.Languages {
		tagSet[strings.ToLower(lang)] = true
	}

	for _, fw := range profile.Stack.Frameworks {
		tagSet[strings.ToLower(fw)] = true
	}

	for _, db := range profile.Stack.Databases {
		tagSet[strings.ToLower(db)] = true
	}

	for _, tool := range profile.Stack.Tools {
		lower := strings.ToLower(tool)
		tagSet[lower] = true
	}

	hasFrontend := containsAny(profile.Stack.Frameworks, "React", "Next.js", "Vue", "Angular", "Svelte") ||
		containsAny(profile.Stack.Tools, "TailwindCSS", "Radix UI")
	hasBackend := containsAny(profile.Stack.Frameworks, "Express", "Fastify", "Gin", "Echo", "Spring Boot")
	hasDatabase := len(profile.Stack.Databases) > 0
	hasAI := containsAny(profile.Stack.Tools, "OpenAI SDK")

	if hasFrontend && hasBackend {
		tagSet["fullstack"] = true
	} else if hasFrontend {
		tagSet["frontend"] = true
	} else if hasBackend {
		tagSet["backend"] = true
	}

	if hasDatabase {
		tagSet["database"] = true
	}

	if hasAI {
		tagSet["ai"] = true
	}

	for _, doc := range profile.CandidateDocs {
		if doc.Category == "architecture" {
			tagSet["documented"] = true
		}
	}

	if profile.Summary != "" {
		tagSet["has-readme"] = true
	}

	tags := make([]string, 0, len(tagSet))
	for tag := range tagSet {
		tags = append(tags, tag)
	}
	sort.Strings(tags)
	return tags
}

func suggestSkills(profile *RepoProfile) []string {
	var skills []string
	seen := map[string]bool{}

	maybeAdd := func(skill string) {
		if !seen[skill] {
			seen[skill] = true
			skills = append(skills, skill)
		}
	}

	if containsAny(profile.Stack.Frameworks, "React", "Next.js") {
		maybeAdd("vercel-react-best-practices")
		maybeAdd("ui-design-system")
	}

	if containsAny(profile.Stack.Tools, "Playwright") {
		maybeAdd("playwright-best-practices")
	}

	if containsAny(profile.Stack.Databases, "Supabase") || containsAny(profile.Stack.Databases, "PostgreSQL") {
		maybeAdd("supabase-postgres-best-practices")
	}

	if containsAny(profile.Stack.Languages, "Go") {
		maybeAdd("go-best-practices")
	}

	if containsAny(profile.Stack.Languages, "TypeScript") && containsAny(profile.Stack.Tools, "TailwindCSS") {
		maybeAdd("frontend-design")
	}

	return skills
}

func containsAny(slice []string, vals ...string) bool {
	for _, v := range vals {
		for _, s := range slice {
			if strings.EqualFold(s, v) {
				return true
			}
		}
	}
	return false
}
