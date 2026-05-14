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

func TestParseExecutionResultV1ExtractsStructuredBlock(t *testing.T) {
	raw := strings.Join([]string{
		"Implemented the requested changes.",
		ResultStartMarker,
		`{"schemaVersion":"v1","status":"success","summary":"Done","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
		ResultEndMarker,
	}, "\n")

	result, err := ParseExecutionResultV1(raw)
	if err != nil {
		t.Fatalf("expected parse to succeed, got %v", err)
	}

	if result == nil || result.Summary != "Done" {
		t.Fatalf("expected parsed summary, got %#v", result)
	}

	stripped := StripStructuredResultBlock(raw)
	if strings.Contains(stripped, ResultStartMarker) || strings.Contains(stripped, ResultEndMarker) {
		t.Fatalf("expected structured block to be stripped, got %q", stripped)
	}
}

func TestFormatExecutionEventFormatsJSONLToolUse(t *testing.T) {
	raw := `{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"src/app.ts"}}}}`
	formatted := FormatExecutionEvent("stdout", raw)
	assertContains(t, formatted, "[tool:read]")
	assertContains(t, formatted, "src/app.ts")
}

func TestExtractReadableOutputIncludesFormattedToolEvents(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"grep","state":{"input":{"pattern":"gitPolicy"}}}}`,
		`{"type":"tool_result","part":{"tool":"grep","state":{"status":"completed","output":{"matches":3}}}}`,
		`{"type":"result","part":{"text":"Finished."}}`,
	}, "\n")

	formatted := ExtractReadableOutput(raw)
	assertContains(t, formatted, "Finished.")
	assertContains(t, formatted, "[tool:grep]")
	assertContains(t, formatted, "[tool-result:grep]")
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
