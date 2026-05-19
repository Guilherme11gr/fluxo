package integration

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestScaffoldOpencode_DryRun(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "test-project-123",
		DryRun:    true,
	}

	result, err := ScaffoldOpencode(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files in dry-run (instructions.md + opencode.json), got %d: %v", len(result.FilesWritten), result.FilesWritten)
	}

	for _, f := range result.FilesWritten {
		if !contains(f, "(dry-run)") {
			t.Errorf("dry-run file should have (dry-run) suffix: %s", f)
		}
	}

	if _, err := os.Stat(filepath.Join(tmpDir, ".opencode", "instructions.md")); !os.IsNotExist(err) {
		t.Error("instructions.md should not exist in dry-run mode")
	}
	if _, err := os.Stat(filepath.Join(tmpDir, ".opencode", "opencode.json")); !os.IsNotExist(err) {
		t.Error("opencode.json should not exist in dry-run mode")
	}
}

func TestScaffoldClaude_DryRun(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "test-project-456",
		DryRun:    true,
	}

	result, err := ScaffoldClaude(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files in dry-run (CLAUDE.md + settings.json), got %d: %v", len(result.FilesWritten), result.FilesWritten)
	}

	for _, f := range result.FilesWritten {
		if !contains(f, "(dry-run)") {
			t.Errorf("dry-run file should have (dry-run) suffix: %s", f)
		}
	}
}

func TestScaffoldOpencode_Force(t *testing.T) {
	tmpDir := t.TempDir()

	opencodeDir := filepath.Join(tmpDir, ".opencode")
	os.MkdirAll(opencodeDir, 0o755)

	existingInstructions := filepath.Join(opencodeDir, "instructions.md")
	os.WriteFile(existingInstructions, []byte("old instructions"), 0o644)

	existingConfig := filepath.Join(opencodeDir, "opencode.json")
	os.WriteFile(existingConfig, []byte("{}"), 0o644)

	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "test-project-789",
		Force:     true,
	}

	result, err := ScaffoldOpencode(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files written with force, got %d", len(result.FilesWritten))
	}

	content, err := os.ReadFile(existingInstructions)
	if err != nil {
		t.Fatalf("failed to read instructions: %v", err)
	}
	if string(content) == "old instructions" {
		t.Error("instructions should have been overwritten")
	}

	configContent, err := os.ReadFile(existingConfig)
	if err != nil {
		t.Fatalf("failed to read config: %v", err)
	}
	if string(configContent) == "{}" {
		t.Error("config should have been overwritten")
	}
}

func TestScaffoldClaude_Force(t *testing.T) {
	tmpDir := t.TempDir()

	claudeDir := filepath.Join(tmpDir, ".claude")
	os.MkdirAll(claudeDir, 0o755)

	existingClaude := filepath.Join(claudeDir, "CLAUDE.md")
	os.WriteFile(existingClaude, []byte("old claude"), 0o644)

	existingSettings := filepath.Join(claudeDir, "settings.json")
	os.WriteFile(existingSettings, []byte("{}"), 0o644)

	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "test-project-abc",
		Force:     true,
	}

	result, err := ScaffoldClaude(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files written with force, got %d", len(result.FilesWritten))
	}

	content, err := os.ReadFile(existingClaude)
	if err != nil {
		t.Fatalf("failed to read CLAUDE.md: %v", err)
	}
	if string(content) == "old claude" {
		t.Error("CLAUDE.md should have been overwritten")
	}

	settingsContent, err := os.ReadFile(existingSettings)
	if err != nil {
		t.Fatalf("failed to read settings.json: %v", err)
	}
	if string(settingsContent) == "{}" {
		t.Error("settings.json should have been overwritten")
	}
}

func TestScaffoldOpencode_Content(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "my-project-id",
	}

	result, err := ScaffoldOpencode(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files written, got %d", len(result.FilesWritten))
	}

	instructionsPath := filepath.Join(tmpDir, ".opencode", "instructions.md")
	content, err := os.ReadFile(instructionsPath)
	if err != nil {
		t.Fatalf("failed to read instructions: %v", err)
	}

	contentStr := string(content)
	if !contains(contentStr, "my-project-id") {
		t.Error("instructions should contain project ID")
	}
	if !contains(contentStr, tmpDir) {
		t.Error("instructions should contain git root")
	}
	if !contains(contentStr, "FluXo Runner") {
		t.Error("instructions should contain FluXo Runner header")
	}
	if !contains(contentStr, "Skills") {
		t.Error("instructions should contain Skills section")
	}

	configPath := filepath.Join(tmpDir, ".opencode", "opencode.json")
	configContent, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("failed to read opencode.json: %v", err)
	}

	var config map[string]interface{}
	if err := json.Unmarshal(configContent, &config); err != nil {
		t.Fatalf("opencode.json should be valid JSON: %v", err)
	}

	if config["$schema"] != "https://opencode.ai/config.json" {
		t.Error("opencode.json should have $schema")
	}

	instructions, ok := config["instructions"].([]interface{})
	if !ok || len(instructions) == 0 {
		t.Error("opencode.json should have instructions array")
	}

	mcp, ok := config["mcp"].(map[string]interface{})
	if !ok {
		t.Error("opencode.json should have mcp section")
	}
	if _, ok := mcp["fluxo"]; !ok {
		t.Error("opencode.json mcp should have fluxo server")
	}
}

func TestScaffoldClaude_Content(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "claude-project-id",
	}

	result, err := ScaffoldClaude(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files written, got %d", len(result.FilesWritten))
	}

	claudeMdPath := filepath.Join(tmpDir, ".claude", "CLAUDE.md")
	content, err := os.ReadFile(claudeMdPath)
	if err != nil {
		t.Fatalf("failed to read CLAUDE.md: %v", err)
	}

	contentStr := string(content)
	if !contains(contentStr, "claude-project-id") {
		t.Error("CLAUDE.md should contain project ID")
	}
	if !contains(contentStr, "FluXo Runner") {
		t.Error("CLAUDE.md should contain FluXo Runner header")
	}

	settingsPath := filepath.Join(tmpDir, ".claude", "settings.json")
	settingsContent, err := os.ReadFile(settingsPath)
	if err != nil {
		t.Fatalf("failed to read settings.json: %v", err)
	}

	var settings map[string]interface{}
	if err := json.Unmarshal(settingsContent, &settings); err != nil {
		t.Fatalf("settings.json should be valid JSON: %v", err)
	}

	perms, ok := settings["permissions"].(map[string]interface{})
	if !ok {
		t.Error("settings.json should have permissions object")
	}
	allow, ok := perms["allow"].([]interface{})
	if !ok || len(allow) == 0 {
		t.Error("settings.json permissions should have allow list")
	}
}

func TestValidate_UnknownIntegration(t *testing.T) {
	ok, msg := Validate(IntegrationType("unknown"))
	if ok {
		t.Error("expected validation to fail for unknown integration")
	}
	if !contains(msg, "unknown integration type") {
		t.Errorf("expected error message about unknown type, got: %s", msg)
	}
}

func TestWriteAtomic(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "nested", "dir", "test.txt")

	written, err := writeAtomic(path, "test content")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !written {
		t.Error("expected file to be written")
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}
	if string(content) != "test content" {
		t.Errorf("expected 'test content', got %q", string(content))
	}
}

func TestWriteAtomic_Overwrite(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.txt")
	os.WriteFile(path, []byte("old"), 0o644)

	written, err := writeAtomic(path, "new")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !written {
		t.Error("expected file to be written")
	}

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("failed to read file: %v", err)
	}
	if string(content) != "new" {
		t.Errorf("expected 'new', got %q", string(content))
	}
}

func TestWriteAtomic_NoTempLeft(t *testing.T) {
	tmpDir := t.TempDir()
	path := filepath.Join(tmpDir, "test.txt")

	writeAtomic(path, "content")

	if _, err := os.Stat(path + ".tmp"); !os.IsNotExist(err) {
		t.Error("temp file should be cleaned up after atomic write")
	}
}

func TestScaffoldOpencode_CreatesDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "dir-test",
	}

	result, err := ScaffoldOpencode(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files, got %d", len(result.FilesWritten))
	}

	if _, err := os.Stat(filepath.Join(tmpDir, ".opencode")); os.IsNotExist(err) {
		t.Error(".opencode directory should be created")
	}
}

func TestScaffoldClaude_CreatesDirectories(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "dir-test",
	}

	result, err := ScaffoldClaude(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.FilesWritten) != 2 {
		t.Fatalf("expected 2 files, got %d", len(result.FilesWritten))
	}

	if _, err := os.Stat(filepath.Join(tmpDir, ".claude")); os.IsNotExist(err) {
		t.Error(".claude directory should be created")
	}
}

func TestScaffoldOpencode_NoErrorsOnSuccess(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "error-test",
		Force:     true,
	}

	result, err := ScaffoldOpencode(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got: %v", result.Errors)
	}
	if len(result.FilesSkipped) != 0 {
		t.Errorf("expected no skipped files, got: %v", result.FilesSkipped)
	}
}

func TestScaffoldClaude_NoErrorsOnSuccess(t *testing.T) {
	tmpDir := t.TempDir()
	cfg := ScaffoldConfig{
		GitRoot:   tmpDir,
		ProjectID: "error-test",
		Force:     true,
	}

	result, err := ScaffoldClaude(cfg)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if len(result.Errors) != 0 {
		t.Errorf("expected no errors, got: %v", result.Errors)
	}
	if len(result.FilesSkipped) != 0 {
		t.Errorf("expected no skipped files, got: %v", result.FilesSkipped)
	}
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && (s == substr || len(s) > 0 && containsAt(s, substr, 0))
}

func containsAt(s, substr string, start int) bool {
	if start >= len(s) {
		return false
	}
	for i := start; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
