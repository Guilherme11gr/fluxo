package orchestrator

import (
	"strings"
	"testing"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/executor"
	"github.com/fluxo-app/fluxo-runner/internal/runner"
)

func TestBuildFailureExecutionDetailsTimeout(t *testing.T) {
	structuredOutput, headline, errorMessage, blockReason := buildFailureExecutionDetails(
		"fluxo-runner-go",
		"opencode",
		executor.Result{ExitCode: 124, TimedOut: true},
		"Now let me inspect the worker.",
		5*time.Minute,
	)

	if headline != "Execution timed out after 5m 0s." {
		t.Fatalf("unexpected headline: %q", headline)
	}
	if !strings.Contains(errorMessage, "Last readable output:") {
		t.Fatalf("expected error message to keep readable tail, got %q", errorMessage)
	}
	if !strings.Contains(structuredOutput, "Now let me inspect the worker.") {
		t.Fatalf("expected structured output to preserve readable output, got %q", structuredOutput)
	}
	if !strings.Contains(errorMessage, "Execution timed out after 5m 0s.") {
		t.Fatalf("expected timeout in error message, got %q", errorMessage)
	}
	if !strings.Contains(blockReason, "configured timeout (5m 0s)") {
		t.Fatalf("expected explicit timeout block reason, got %q", blockReason)
	}
	if structuredOutput == errorMessage {
		t.Fatalf("expected structured output to preserve fuller detail than error message, got %q", structuredOutput)
	}
}

func TestBuildFailureExecutionDetailsPreservesStructuredResultBlock(t *testing.T) {
	readableOutput := strings.Join([]string{
		"Agent failed after validation.",
		runner.ResultStartMarker,
		`{"schemaVersion":"v1","status":"failed","summary":"Structured failure summary","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
		runner.ResultEndMarker,
	}, "\n")

	structuredOutput, _, _, _ := buildFailureExecutionDetails(
		"fluxo-runner-go",
		"opencode",
		executor.Result{ExitCode: 1},
		readableOutput,
		5*time.Minute,
	)

	if !strings.Contains(structuredOutput, runner.ResultStartMarker) {
		t.Fatalf("expected structured result markers to be preserved, got %q", structuredOutput)
	}
	parsed, err := runner.ParseExecutionResultV1(structuredOutput)
	if err != nil {
		t.Fatalf("expected structured result to remain parseable, got %v", err)
	}
	if parsed.Summary != "Structured failure summary" {
		t.Fatalf("expected parsed summary to survive, got %#v", parsed)
	}
}

func TestBuildFailureExecutionDetailsCanceled(t *testing.T) {
	_, headline, errorMessage, blockReason := buildFailureExecutionDetails(
		"fluxo-runner-go",
		"opencode",
		executor.Result{ExitCode: 130, Canceled: true},
		"operator canceled the run",
		5*time.Minute,
	)

	if headline != "Execution was canceled before completion." {
		t.Fatalf("unexpected headline: %q", headline)
	}
	if !strings.Contains(errorMessage, "Last readable output:") {
		t.Fatalf("expected cancellation error message to include readable tail, got %q", errorMessage)
	}
	if !strings.Contains(blockReason, "was canceled while running opencode") {
		t.Fatalf("expected explicit cancel block reason, got %q", blockReason)
	}
}

func TestBuildPersistedExecutionOutputFormatsStreamAndPrefixesFailure(t *testing.T) {
	rawOutput := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"src/main.ts"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"File read successfully"}}}}`,
	}, "\n")

	persisted := buildPersistedExecutionOutput(rawOutput, "", "Execution timed out after 5m 0s.")

	if !strings.HasPrefix(persisted, "Execution timed out after 5m 0s.") {
		t.Fatalf("expected timeout prefix, got %q", persisted)
	}
	if strings.Contains(persisted, `{"type":"tool_use"`) {
		t.Fatalf("expected human-readable output, got %q", persisted)
	}
	if !strings.Contains(persisted, "▸ read  src/main.ts") {
		t.Fatalf("expected formatted tool use, got %q", persisted)
	}
	if !strings.Contains(persisted, "✓ read  File read successfully") {
		t.Fatalf("expected formatted tool result, got %q", persisted)
	}
}

func TestGitWorkflowPolicyParsing(t *testing.T) {
	if runner.ParseGitPolicy("branch_only") != runner.GitPolicyBranchOnly {
		t.Fatal("expected branch_only policy")
	}
	if runner.ParseGitPolicy("branch_commit_pr") != runner.GitPolicyBranchCommitPR {
		t.Fatal("expected branch_commit_pr policy")
	}
	if runner.ParseGitPolicy("") != runner.GitPolicyNoWrite {
		t.Fatal("expected no_write as default")
	}
}

func TestGitWorkflowBranchNameDeterministic(t *testing.T) {
	id1 := "5223add6-34fb-4088-aa3f-329d81fad580"
	name1 := runner.BuildBranchName(id1, "TASK", "builder", "")
	if name1 != "builder/task-5223add6" {
		t.Fatalf("expected builder/task-5223add6, got %q", name1)
	}

	name2 := runner.BuildBranchName(id1, "TASK", "builder", "agent/")
	if name2 != "agent/task-5223add6" {
		t.Fatalf("expected agent/task-5223add6, got %q", name2)
	}

	id2 := "5223add6-34fb-4088-aa3f-329d81fad580"
	name3 := runner.BuildBranchName(id2, "TASK", "builder", "")
	if name3 != name1 {
		t.Fatalf("expected deterministic branch name: %q vs %q", name1, name3)
	}
}

func TestGitWorkflowPreflightOnProtectedBranch(t *testing.T) {
	result := runner.PreflightGitCheck("/nonexistent", runner.GitPolicyBranchOnly, "main", "")
	if result.OK {
		t.Fatal("expected preflight to fail on non-existent dir or protected branch branch check")
	}
}

func TestGitWorkflowNoWriteSkipsEverything(t *testing.T) {
	result := runner.PreflightGitCheck("", runner.GitPolicyNoWrite, "main", "")
	if !result.OK {
		t.Fatal("expected no_write to always pass preflight")
	}
}

func TestGitSnapshotMergeReflectsPRInResult(t *testing.T) {
	snapshot := runner.GitSnapshot{
		Branch:     "builder/task-test",
		BaseBranch: "main",
		CommitShas: []string{"sha1"},
		Mode:       "branch_commit_pr",
		CapturedAt: time.Now().UTC().Format(time.RFC3339),
	}
	result := runner.MergeGitResult(
		runner.BuildExecutionResultV1(true, "done", 0),
		snapshot,
	)
	gitMap, ok := result["git"].(map[string]interface{})
	if !ok {
		t.Fatal("expected git map in result")
	}
	if gitMap["mode"] != "branch_commit_pr" {
		t.Fatalf("expected mode=branch_commit_pr, got %v", gitMap["mode"])
	}
	if gitMap["branch"] != "builder/task-test" {
		t.Fatalf("expected branch, got %v", gitMap["branch"])
	}
}

func TestHelperFunctions(t *testing.T) {
	if defaultStr("", "fallback") != "fallback" {
		t.Fatal("expected fallback for empty string")
	}
	if defaultStr("value", "fallback") != "value" {
		t.Fatal("expected value when non-empty")
	}
	if truncate("hello world", 5) != "hello" {
		t.Fatal("expected truncation")
	}
	if truncate("short", 100) != "short" {
		t.Fatal("expected no truncation for short strings")
	}
}
