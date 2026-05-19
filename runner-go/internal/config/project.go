package config

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

// ProjectConfig holds per-project local configuration.
// Stored at $(git rev-parse --git-common-dir)/fluxo-runner/project.yaml
type ProjectConfig struct {
	ProjectID         string            `yaml:"projectId"`
	RepoPath          string            `yaml:"repoPath"`
	ProvisionCommand  string            `yaml:"provisionCommand,omitempty"`
	ProvisionCacheKey string            `yaml:"provisionCacheKey,omitempty"`
	Integrations      map[string]bool   `yaml:"integrations,omitempty"`
	BootstrapMetadata map[string]string `yaml:"bootstrapMetadata,omitempty"`
}

// GitRepoInfo holds detected git repository information.
type GitRepoInfo struct {
	IsRepo    bool
	GitRoot   string
	GitDir    string
	CommonDir string
}

// DetectGitRepo checks if the current or given directory is inside a git repo
// and returns repo information.
func DetectGitRepo(dir string) (GitRepoInfo, error) {
	info := GitRepoInfo{}

	if dir == "" {
		var err error
		dir, err = os.Getwd()
		if err != nil {
			return info, fmt.Errorf("get working directory: %w", err)
		}
	}

	gitRoot, err := runGitCmd(dir, "rev-parse", "--show-toplevel")
	if err != nil {
		return info, nil
	}
	info.IsRepo = true
	info.GitRoot = strings.TrimSpace(gitRoot)

	gitDir, err := runGitCmd(dir, "rev-parse", "--git-dir")
	if err == nil {
		info.GitDir = strings.TrimSpace(gitDir)
		if !filepath.IsAbs(info.GitDir) {
			info.GitDir = filepath.Join(info.GitRoot, info.GitDir)
		}
	}

	commonDir, err := runGitCmd(dir, "rev-parse", "--git-common-dir")
	if err == nil {
		info.CommonDir = strings.TrimSpace(commonDir)
		if !filepath.IsAbs(info.CommonDir) {
			info.CommonDir = filepath.Join(info.GitRoot, info.CommonDir)
		}
	} else {
		info.CommonDir = info.GitDir
	}

	return info, nil
}

// ProjectConfigDir returns the directory where project.yaml should be stored
// for the given git repo info.
func ProjectConfigDir(repo GitRepoInfo) string {
	if repo.CommonDir == "" {
		return ""
	}
	return filepath.Join(repo.CommonDir, "fluxo-runner")
}

// ProjectConfigPath returns the full path to project.yaml for the given repo.
func ProjectConfigPath(repo GitRepoInfo) string {
	dir := ProjectConfigDir(repo)
	if dir == "" {
		return ""
	}
	return filepath.Join(dir, "project.yaml")
}

// LoadProjectConfig loads the project config from the given repo's local path.
// Returns nil config if the file does not exist.
func LoadProjectConfig(repo GitRepoInfo) (*ProjectConfig, error) {
	path := ProjectConfigPath(repo)
	if path == "" {
		return nil, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, fmt.Errorf("read project config: %w", err)
	}

	var cfg ProjectConfig
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse project config: %w", err)
	}

	if cfg.Integrations == nil {
		cfg.Integrations = map[string]bool{}
	}
	if cfg.BootstrapMetadata == nil {
		cfg.BootstrapMetadata = map[string]string{}
	}

	return &cfg, nil
}

// SaveProjectConfig writes the project config to the repo's local path.
// Creates the directory if it does not exist.
// Uses atomic write (write to temp file + rename) to prevent corruption.
func SaveProjectConfig(repo GitRepoInfo, cfg *ProjectConfig) error {
	if cfg == nil {
		return fmt.Errorf("project config is nil")
	}

	dir := ProjectConfigDir(repo)
	if dir == "" {
		return fmt.Errorf("cannot determine project config directory: no git common dir")
	}

	if err := os.MkdirAll(dir, 0o755); err != nil {
		return fmt.Errorf("create project config directory: %w", err)
	}

	data, err := yaml.Marshal(cfg)
	if err != nil {
		return fmt.Errorf("marshal project config: %w", err)
	}

	path := ProjectConfigPath(repo)

	// Atomic write: write to temp file first, then rename
	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0o644); err != nil {
		return fmt.Errorf("write temp config file: %w", err)
	}

	// Verify the temp file can be parsed back
	verifyData, err := os.ReadFile(tmpPath)
	if err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("verify temp config: %w", err)
	}
	var verifyCfg ProjectConfig
	if err := yaml.Unmarshal(verifyData, &verifyCfg); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("verify config parse: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return fmt.Errorf("atomic rename config: %w", err)
	}

	return nil
}

// RemotePolicy holds project-level policy from the backend.
// These fields are owned by the remote and should not be overridden by local config.
type RemotePolicy struct {
	GitPolicy         string
	DefaultBaseBranch string
	AllowedBranchPrefix string
	ExecutionMode     string
	PRPolicy          string
}

// MergedExecutionConfig holds the merged configuration for execution.
// Remote policy owns behavioral fields, local config owns path/provision fields.
type MergedExecutionConfig struct {
	Workdir           string
	RepoPath          string
	ProvisionCommand  string
	ProvisionCacheKey string
	GitPolicy         string
	DefaultBaseBranch string
	AllowedBranchPrefix string
	ExecutionMode     string
	PRPolicy          string
}

// MergeWithOwnership merges remote policy and local project config by ownership.
// Remote policy owns: gitPolicy, baseBranch, branchPrefix, executionMode, prPolicy
// Local config owns: repoPath, provisionCommand, provisionCacheKey
// Agent workdir is the lowest priority fallback.
func MergeWithOwnership(remotePolicy *RemotePolicy, localCfg *ProjectConfig, agentWorkdir string) MergedExecutionConfig {
	result := MergedExecutionConfig{}

	// Local config owns repoPath and provision settings
	if localCfg != nil {
		result.RepoPath = strings.TrimSpace(localCfg.RepoPath)
		result.ProvisionCommand = strings.TrimSpace(localCfg.ProvisionCommand)
		result.ProvisionCacheKey = strings.TrimSpace(localCfg.ProvisionCacheKey)
	}

	// Remote policy owns behavioral fields
	if remotePolicy != nil {
		result.GitPolicy = strings.TrimSpace(remotePolicy.GitPolicy)
		result.DefaultBaseBranch = strings.TrimSpace(remotePolicy.DefaultBaseBranch)
		result.AllowedBranchPrefix = strings.TrimSpace(remotePolicy.AllowedBranchPrefix)
		result.ExecutionMode = strings.TrimSpace(remotePolicy.ExecutionMode)
		result.PRPolicy = strings.TrimSpace(remotePolicy.PRPolicy)
	}

	// Resolve workdir: local repoPath > agent workdir
	result.Workdir = ResolveWorkdir("", agentWorkdir, localCfg)

	return result
}

// ValidateProjectConfig checks that required fields are set.
func ValidateProjectConfig(cfg *ProjectConfig) error {
	if cfg == nil {
		return fmt.Errorf("project config is nil")
	}
	if strings.TrimSpace(cfg.ProjectID) == "" {
		return fmt.Errorf("projectId is required")
	}
	if strings.TrimSpace(cfg.RepoPath) == "" {
		return fmt.Errorf("repoPath is required")
	}
	return nil
}

// ResolveWorkdir attempts to resolve the working directory for execution.
// Priority: runtimeBinding.RepoPath > local project config repoPath > agent.Workdir
func ResolveWorkdir(runtimeBindingRepoPath, agentWorkdir string, projectCfg *ProjectConfig) string {
	if path := strings.TrimSpace(runtimeBindingRepoPath); path != "" {
		return path
	}
	if projectCfg != nil {
		if path := strings.TrimSpace(projectCfg.RepoPath); path != "" {
			return path
		}
	}
	return strings.TrimSpace(agentWorkdir)
}

// ResolveProvision resolves provision settings from local config.
// Local config takes ownership of provision settings.
func ResolveProvision(projectCfg *ProjectConfig) (command, cacheKey string) {
	if projectCfg == nil {
		return "", ""
	}
	return strings.TrimSpace(projectCfg.ProvisionCommand), strings.TrimSpace(projectCfg.ProvisionCacheKey)
}

func runGitCmd(dir string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s: %s", strings.Join(args, " "), strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}
