package integration

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type IntegrationType string

const (
	Opencode IntegrationType = "opencode"
	Claude   IntegrationType = "claude"
)

type ScaffoldResult struct {
	Type         IntegrationType
	FilesWritten []string
	FilesSkipped []string
	Errors       []string
}

type ScaffoldConfig struct {
	GitRoot   string
	ProjectID string
	DryRun    bool
	Force     bool
}

type ScaffoldFile struct {
	Path      string
	Generator func(cfg ScaffoldConfig) (string, error)
}

func ScaffoldOpencode(cfg ScaffoldConfig) (*ScaffoldResult, error) {
	result := &ScaffoldResult{Type: Opencode}

	files := []ScaffoldFile{
		{Path: filepath.Join(cfg.GitRoot, ".opencode", "instructions.md"), Generator: scaffoldOpencodeInstructions},
		{Path: filepath.Join(cfg.GitRoot, ".opencode", "opencode.json"), Generator: scaffoldOpencodeConfig},
	}

	for _, f := range files {
		content, err := f.Generator(cfg)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("generate %s: %v", f.Path, err))
			continue
		}

		if cfg.DryRun {
			result.FilesWritten = append(result.FilesWritten, f.Path+" (dry-run)")
			continue
		}

		written, err := writeFileWithConfirmation(f.Path, content, cfg.Force)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("write %s: %v", f.Path, err))
		} else if written {
			result.FilesWritten = append(result.FilesWritten, f.Path)
		} else {
			result.FilesSkipped = append(result.FilesSkipped, f.Path)
		}
	}

	return result, nil
}

func ScaffoldClaude(cfg ScaffoldConfig) (*ScaffoldResult, error) {
	result := &ScaffoldResult{Type: Claude}

	files := []ScaffoldFile{
		{Path: filepath.Join(cfg.GitRoot, ".claude", "CLAUDE.md"), Generator: scaffoldClaudeInstructions},
		{Path: filepath.Join(cfg.GitRoot, ".claude", "settings.json"), Generator: scaffoldClaudeSettings},
	}

	for _, f := range files {
		content, err := f.Generator(cfg)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("generate %s: %v", f.Path, err))
			continue
		}

		if cfg.DryRun {
			result.FilesWritten = append(result.FilesWritten, f.Path+" (dry-run)")
			continue
		}

		written, err := writeFileWithConfirmation(f.Path, content, cfg.Force)
		if err != nil {
			result.Errors = append(result.Errors, fmt.Sprintf("write %s: %v", f.Path, err))
		} else if written {
			result.FilesWritten = append(result.FilesWritten, f.Path)
		} else {
			result.FilesSkipped = append(result.FilesSkipped, f.Path)
		}
	}

	return result, nil
}

func Validate(t IntegrationType) (bool, string) {
	switch t {
	case Opencode:
		return validateOpencode()
	case Claude:
		return validateClaude()
	default:
		return false, fmt.Sprintf("unknown integration type: %s", t)
	}
}

func validateOpencode() (bool, string) {
	path, err := exec.LookPath("opencode")
	if err != nil {
		return false, "opencode binary not found in PATH"
	}

	cwd, _ := os.Getwd()
	instructionsPath := filepath.Join(cwd, ".opencode", "instructions.md")
	if _, err := os.Stat(instructionsPath); err != nil {
		return true, fmt.Sprintf("opencode found at %s (instructions.md not yet scaffolded)", path)
	}

	configPath := filepath.Join(cwd, ".opencode", "opencode.json")
	if _, err := os.Stat(configPath); err != nil {
		return true, fmt.Sprintf("opencode found at %s (opencode.json not yet scaffolded)", path)
	}

	return true, fmt.Sprintf("opencode found at %s, config scaffolded", path)
}

func validateClaude() (bool, string) {
	path, err := exec.LookPath("claude")
	if err != nil {
		return false, "claude binary not found in PATH"
	}

	cwd, _ := os.Getwd()
	claudeMdPath := filepath.Join(cwd, ".claude", "CLAUDE.md")
	if _, err := os.Stat(claudeMdPath); err != nil {
		return true, fmt.Sprintf("claude found at %s (CLAUDE.md not yet scaffolded)", path)
	}

	return true, fmt.Sprintf("claude found at %s, CLAUDE.md scaffolded", path)
}

func writeFileWithConfirmation(path, content string, force bool) (bool, error) {
	if _, err := os.Stat(path); err == nil {
		if force {
			return writeAtomic(path, content)
		}
		fmt.Printf("  \033[33m⚠ File already exists: %s\033[0m\n", path)
		fmt.Print("  Overwrite? [y/N]: ")

		var answer string
		fmt.Scanln(&answer)
		if strings.TrimSpace(strings.ToLower(answer)) != "y" {
			return false, nil
		}
	}

	return writeAtomic(path, content)
}

func writeAtomic(path, content string) (bool, error) {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return false, fmt.Errorf("create directory %s: %w", dir, err)
	}

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, []byte(content), 0o644); err != nil {
		return false, fmt.Errorf("write temp file: %w", err)
	}

	if err := os.Rename(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return false, fmt.Errorf("rename: %w", err)
	}

	return true, nil
}

func scaffoldOpencodeInstructions(cfg ScaffoldConfig) (string, error) {
	return fmt.Sprintf(`# FluXo Runner — OpenCode Instructions

## Project Context
- Project ID: %s
- Repo: %s

## Workflow
- Tasks are assigned via FluXo Agent API
- Use structured output format when returning results
- Follow the handoff contract for task finalization

## Rules
- Do not write directly to protected branches
- Keep changes minimal, testable, and explicit
- Include summary blocks before final JSON blocks
- End with structured result blocks using FLUXO_RESULT_JSON markers

## Skills
FluXo skills are available under .opencode/skills/ and provide:
- fluxo-agent-api-core: Agent API integration
- fluxo-agent-docs-rag: Documentation search
- fluxo-runner-handoff: Task handoff and finalization
- fluxo-runner-output-v1: Structured output contract
- fluxo-runner-register-agent: Agent registration

## Integration
This file was generated by fluxo-runner init.
`, cfg.ProjectID, cfg.GitRoot), nil
}

func scaffoldOpencodeConfig(cfg ScaffoldConfig) (string, error) {
	config := map[string]interface{}{
		"$schema":     "https://opencode.ai/config.json",
		"instructions": []string{".opencode/instructions.md"},
		"mcp": map[string]interface{}{
			"fluxo": map[string]interface{}{
				"command": "node",
				"args":    []string{"mcp-server/dist/index.js"},
			},
		},
	}

	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal opencode config: %w", err)
	}
	return string(data) + "\n", nil
}

func scaffoldClaudeInstructions(cfg ScaffoldConfig) (string, error) {
	return fmt.Sprintf(`# FluXo Runner — Claude Code Instructions

## Project Context
- Project ID: %s
- Repo: %s

## Workflow
- Tasks are assigned via FluXo Agent API
- Use structured output format when returning results
- Follow the handoff contract for task finalization

## Rules
- Do not write directly to protected branches
- Keep changes minimal, testable, and explicit
- Include summary blocks before final JSON blocks
- End with structured result blocks using FLUXO_RESULT_JSON markers

## Integration
This file was generated by fluxo-runner init.
`, cfg.ProjectID, cfg.GitRoot), nil
}

func scaffoldClaudeSettings(cfg ScaffoldConfig) (string, error) {
	settings := map[string]interface{}{
		"permissions": map[string]interface{}{
			"allow": []string{
				"mcp__jt-kill__list_projects",
				"mcp__jt-kill__list_epics",
				"mcp__jt-kill__get_epic_full",
				"mcp__jt-kill__get_task",
				"mcp__jt-kill__list_features",
				"mcp__jt-kill__update_task",
			},
		},
	}

	data, err := json.MarshalIndent(settings, "", "  ")
	if err != nil {
		return "", fmt.Errorf("marshal claude settings: %w", err)
	}
	return string(data) + "\n", nil
}
