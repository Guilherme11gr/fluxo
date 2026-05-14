package runner

import (
	"strings"
	"testing"

	"github.com/fluxo-app/fluxo-runner/internal/config"
)

func TestBuildPromptUsesRoleContractWithoutLegacyContextOrCommitInstruction(t *testing.T) {
	agent := config.AgentConfig{
		AgentType:           "build",
		Role:                "builder",
		RolePrompt:          "You implement changes with minimal risk.",
		OperatingRules:      []string{"Do not write to main.", "Return structured output."},
		OutputSchemaVersion: "v1",
		Context:             "legacy context should not appear",
		Workdir:             "/tmp/project",
	}

	prompt := BuildPrompt(Task{
		ID:          "task-123",
		Title:       "Implement feature",
		Description: "Make the thing work",
		Priority:    "HIGH",
		Type:        "TASK",
	}, agent)

	assertContains(t, prompt, "Role: builder")
	assertContains(t, prompt, "You implement changes with minimal risk.")
	assertContains(t, prompt, "Do not write to main.")
	assertContains(t, prompt, ResultStartMarker)
	assertContains(t, prompt, ResultEndMarker)
	assertNotContains(t, prompt, "legacy context should not appear")
	assertNotContains(t, prompt, "If you modify code, commit your changes")
}

func TestBuildPromptIncludesPreviousExecutionContext(t *testing.T) {
	agent := config.AgentConfig{
		Role:                "builder",
		OutputSchemaVersion: "v1",
	}
	exitCode := 1
	duration := 42
	prNumber := 7

	prompt := BuildPromptWithPreviousExecution(Task{
		ID:          "task-123",
		Title:       "Retry feature",
		Description: "Continue from last attempt",
		Priority:    "HIGH",
		Type:        "TASK",
		Status:      "DOING",
	}, agent, &PreviousExecutionContext{
		ID:            "exec-previous",
		Status:        "FAILED",
		ResultSummary: "Previous run changed the parser but failed validation.",
		ErrorMessage:  "validation failed",
		OutputExcerpt: "tool output excerpt",
		ExitCode:      &exitCode,
		Duration:      &duration,
		StartedAt:     "2026-05-14T00:00:00Z",
		FinishedAt:    "2026-05-14T00:00:42Z",
		Git: &PreviousExecutionGitContext{
			Mode:       "branch_commit_pr",
			BaseBranch: "main",
			Branch:     "agent/task-123",
			CommitShas: []string{"abc123"},
			PRUrl:      "https://example.com/pr/7",
			PRNumber:   &prNumber,
		},
	})

	assertContains(t, prompt, "## Previous Attempt Context")
	assertContains(t, prompt, "Previous Execution ID: exec-previous")
	assertContains(t, prompt, "Previous Summary:")
	assertContains(t, prompt, "validation failed")
	assertContains(t, prompt, "Commit SHAs: abc123")
	assertContains(t, prompt, "Use this previous attempt context to continue safely instead of restarting blindly.")
}

func assertContains(t *testing.T, value, expected string) {
	t.Helper()
	if !strings.Contains(value, expected) {
		t.Fatalf("expected %q to contain %q", value, expected)
	}
}

func assertNotContains(t *testing.T, value, expected string) {
	t.Helper()
	if strings.Contains(value, expected) {
		t.Fatalf("expected %q to not contain %q", value, expected)
	}
}
