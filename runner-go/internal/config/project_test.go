package config

import (
	"os"
	"path/filepath"
	"testing"
)

func TestValidateProjectConfigNil(t *testing.T) {
	err := ValidateProjectConfig(nil)
	if err == nil {
		t.Fatal("expected error for nil config")
	}
}

func TestValidateProjectConfigMissingProjectID(t *testing.T) {
	cfg := &ProjectConfig{RepoPath: "/some/path"}
	err := ValidateProjectConfig(cfg)
	if err == nil {
		t.Fatal("expected error for missing projectId")
	}
}

func TestValidateProjectConfigMissingRepoPath(t *testing.T) {
	cfg := &ProjectConfig{ProjectID: "proj-123"}
	err := ValidateProjectConfig(cfg)
	if err == nil {
		t.Fatal("expected error for missing repoPath")
	}
}

func TestValidateProjectConfigValid(t *testing.T) {
	cfg := &ProjectConfig{ProjectID: "proj-123", RepoPath: "/some/path"}
	err := ValidateProjectConfig(cfg)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
}

func TestResolveWorkdirFromRuntimeBinding(t *testing.T) {
	result := ResolveWorkdir("/runtime/path", "/agent/workdir", &ProjectConfig{RepoPath: "/local/path"})
	if result != "/runtime/path" {
		t.Fatalf("expected /runtime/path, got %s", result)
	}
}

func TestResolveWorkdirFromProjectConfig(t *testing.T) {
	result := ResolveWorkdir("", "/agent/workdir", &ProjectConfig{RepoPath: "/local/path"})
	if result != "/local/path" {
		t.Fatalf("expected /local/path, got %s", result)
	}
}

func TestResolveWorkdirFromAgentWorkdir(t *testing.T) {
	result := ResolveWorkdir("", "/agent/workdir", nil)
	if result != "/agent/workdir" {
		t.Fatalf("expected /agent/workdir, got %s", result)
	}
}

func TestResolveWorkdirEmptyAll(t *testing.T) {
	result := ResolveWorkdir("", "", nil)
	if result != "" {
		t.Fatalf("expected empty, got %s", result)
	}
}

func TestResolveProvisionNil(t *testing.T) {
	cmd, key := ResolveProvision(nil)
	if cmd != "" || key != "" {
		t.Fatalf("expected empty strings, got cmd=%q key=%q", cmd, key)
	}
}

func TestResolveProvisionFromConfig(t *testing.T) {
	cfg := &ProjectConfig{
		ProvisionCommand:  "npm install",
		ProvisionCacheKey: "package-lock.json",
	}
	cmd, key := ResolveProvision(cfg)
	if cmd != "npm install" {
		t.Fatalf("expected npm install, got %q", cmd)
	}
	if key != "package-lock.json" {
		t.Fatalf("expected package-lock.json, got %q", key)
	}
}

func TestSaveAndLoadProjectConfig(t *testing.T) {
	tmpDir := t.TempDir()
	commonDir := filepath.Join(tmpDir, ".git")
	if err := os.MkdirAll(commonDir, 0o755); err != nil {
		t.Fatal(err)
	}

	repo := GitRepoInfo{
		IsRepo:    true,
		GitRoot:   tmpDir,
		GitDir:    commonDir,
		CommonDir: commonDir,
	}

	cfg := &ProjectConfig{
		ProjectID:         "proj-abc-123",
		RepoPath:          tmpDir,
		ProvisionCommand:  "go mod tidy",
		ProvisionCacheKey: "go.sum",
		Integrations:      map[string]bool{"opencode": true},
		BootstrapMetadata: map[string]string{"bootstrapped": "true"},
	}

	if err := SaveProjectConfig(repo, cfg); err != nil {
		t.Fatalf("save failed: %v", err)
	}

	loaded, err := LoadProjectConfig(repo)
	if err != nil {
		t.Fatalf("load failed: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected loaded config")
	}
	if loaded.ProjectID != "proj-abc-123" {
		t.Fatalf("expected projectId proj-abc-123, got %s", loaded.ProjectID)
	}
	if loaded.RepoPath != tmpDir {
		t.Fatalf("expected repoPath %s, got %s", tmpDir, loaded.RepoPath)
	}
	if loaded.ProvisionCommand != "go mod tidy" {
		t.Fatalf("expected provisionCommand 'go mod tidy', got %s", loaded.ProvisionCommand)
	}
	if loaded.Integrations["opencode"] != true {
		t.Fatal("expected opencode integration to be true")
	}
}

func TestLoadProjectConfigNotExists(t *testing.T) {
	tmpDir := t.TempDir()
	repo := GitRepoInfo{
		IsRepo:    true,
		GitRoot:   tmpDir,
		GitDir:    filepath.Join(tmpDir, ".git"),
		CommonDir: filepath.Join(tmpDir, ".git"),
	}

	cfg, err := LoadProjectConfig(repo)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if cfg != nil {
		t.Fatal("expected nil config for non-existent file")
	}
}

func TestProjectConfigDirEmpty(t *testing.T) {
	repo := GitRepoInfo{}
	dir := ProjectConfigDir(repo)
	if dir != "" {
		t.Fatalf("expected empty dir, got %s", dir)
	}
}

func TestProjectConfigPathEmpty(t *testing.T) {
	repo := GitRepoInfo{}
	path := ProjectConfigPath(repo)
	if path != "" {
		t.Fatalf("expected empty path, got %s", path)
	}
}

func TestProjectConfigDirAndPath(t *testing.T) {
	repo := GitRepoInfo{
		CommonDir: "/path/to/.git",
	}
	dir := ProjectConfigDir(repo)
	expectedDir := filepath.FromSlash("/path/to/.git/fluxo-runner")
	if dir != expectedDir {
		t.Fatalf("expected %s, got %s", expectedDir, dir)
	}

	path := ProjectConfigPath(repo)
	expectedPath := filepath.FromSlash("/path/to/.git/fluxo-runner/project.yaml")
	if path != expectedPath {
		t.Fatalf("expected %s, got %s", expectedPath, path)
	}
}

func TestMergeWithOwnershipRemotePolicyWins(t *testing.T) {
	remote := &RemotePolicy{
		GitPolicy:         "branch_commit_pr",
		DefaultBaseBranch: "develop",
		AllowedBranchPrefix: "agent/",
		ExecutionMode:     "remote",
		PRPolicy:          "draft",
	}
	local := &ProjectConfig{
		ProjectID:         "proj-123",
		RepoPath:          "/local/repo/path",
		ProvisionCommand:  "npm install",
		ProvisionCacheKey: "package-lock.json",
	}

	merged := MergeWithOwnership(remote, local, "/agent/workdir")

	// Remote policy owns behavioral fields
	if merged.GitPolicy != "branch_commit_pr" {
		t.Fatalf("expected gitPolicy from remote, got %s", merged.GitPolicy)
	}
	if merged.DefaultBaseBranch != "develop" {
		t.Fatalf("expected baseBranch from remote, got %s", merged.DefaultBaseBranch)
	}
	if merged.AllowedBranchPrefix != "agent/" {
		t.Fatalf("expected branchPrefix from remote, got %s", merged.AllowedBranchPrefix)
	}
	if merged.ExecutionMode != "remote" {
		t.Fatalf("expected executionMode from remote, got %s", merged.ExecutionMode)
	}
	if merged.PRPolicy != "draft" {
		t.Fatalf("expected PRPolicy from remote, got %s", merged.PRPolicy)
	}

	// Local config owns path and provision
	if merged.RepoPath != "/local/repo/path" {
		t.Fatalf("expected repoPath from local, got %s", merged.RepoPath)
	}
	if merged.ProvisionCommand != "npm install" {
		t.Fatalf("expected provisionCommand from local, got %s", merged.ProvisionCommand)
	}
	if merged.ProvisionCacheKey != "package-lock.json" {
		t.Fatalf("expected provisionCacheKey from local, got %s", merged.ProvisionCacheKey)
	}

	// Workdir resolves to local repoPath
	if merged.Workdir != "/local/repo/path" {
		t.Fatalf("expected workdir from local repoPath, got %s", merged.Workdir)
	}
}

func TestMergeWithOwnershipLocalFallback(t *testing.T) {
	merged := MergeWithOwnership(nil, nil, "/agent/workdir")

	if merged.Workdir != "/agent/workdir" {
		t.Fatalf("expected workdir from agent, got %s", merged.Workdir)
	}
	if merged.RepoPath != "" {
		t.Fatalf("expected empty repoPath, got %s", merged.RepoPath)
	}
	if merged.GitPolicy != "" {
		t.Fatalf("expected empty gitPolicy, got %s", merged.GitPolicy)
	}
}

func TestMergeWithOwnershipWorkdirPriority(t *testing.T) {
	local := &ProjectConfig{RepoPath: "/local/path"}
	merged := MergeWithOwnership(nil, local, "/agent/workdir")

	if merged.Workdir != "/local/path" {
		t.Fatalf("expected workdir from local repoPath, got %s", merged.Workdir)
	}
}

func TestMergeWithOwnershipEmptyStringsTrimmed(t *testing.T) {
	remote := &RemotePolicy{
		GitPolicy:         "  branch_only  ",
		DefaultBaseBranch: "  main  ",
	}
	local := &ProjectConfig{
		RepoPath:         "  /path/with/spaces  ",
		ProvisionCommand: "  npm install  ",
	}

	merged := MergeWithOwnership(remote, local, "")

	if merged.GitPolicy != "branch_only" {
		t.Fatalf("expected trimmed gitPolicy, got %q", merged.GitPolicy)
	}
	if merged.DefaultBaseBranch != "main" {
		t.Fatalf("expected trimmed baseBranch, got %q", merged.DefaultBaseBranch)
	}
	if merged.RepoPath != "/path/with/spaces" {
		t.Fatalf("expected trimmed repoPath, got %q", merged.RepoPath)
	}
	if merged.ProvisionCommand != "npm install" {
		t.Fatalf("expected trimmed provisionCommand, got %q", merged.ProvisionCommand)
	}
}

func TestSaveProjectConfigAtomicWrite(t *testing.T) {
	tmpDir := t.TempDir()
	commonDir := filepath.Join(tmpDir, ".git")
	if err := os.MkdirAll(commonDir, 0o755); err != nil {
		t.Fatal(err)
	}

	repo := GitRepoInfo{
		IsRepo:    true,
		GitRoot:   tmpDir,
		GitDir:    commonDir,
		CommonDir: commonDir,
	}

	cfg := &ProjectConfig{
		ProjectID:    "proj-atomic",
		RepoPath:     tmpDir,
		Integrations: map[string]bool{"opencode": true},
	}

	if err := SaveProjectConfig(repo, cfg); err != nil {
		t.Fatalf("atomic save failed: %v", err)
	}

	// Verify no temp file left behind
	tmpPath := ProjectConfigPath(repo) + ".tmp"
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Fatal("expected temp file to be cleaned up")
	}

	// Verify final file exists and is valid
	loaded, err := LoadProjectConfig(repo)
	if err != nil {
		t.Fatalf("load after atomic save failed: %v", err)
	}
	if loaded == nil {
		t.Fatal("expected loaded config")
	}
	if loaded.ProjectID != "proj-atomic" {
		t.Fatalf("expected projectId proj-atomic, got %s", loaded.ProjectID)
	}
}
