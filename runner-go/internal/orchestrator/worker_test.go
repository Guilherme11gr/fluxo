package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/executor"
	"github.com/fluxo-app/fluxo-runner/internal/extractor"
	"github.com/fluxo-app/fluxo-runner/internal/runner"
)

type stubExtractor struct {
	extractResult *extractor.ExtractResult
	result        map[string]interface{}
	err           error
}

func (s *stubExtractor) Name() string     { return "stub" }
func (s *stubExtractor) Provider() string { return "stub" }
func (s *stubExtractor) Model() string    { return "stub-model" }
func (s *stubExtractor) Extract(_ context.Context, _ extractor.ExtractRequest) (*extractor.ExtractResult, error) {
	if s.err != nil {
		return nil, s.err
	}
	if s.extractResult != nil || s.result == nil {
		return s.extractResult, nil
	}
	return &extractor.ExtractResult{Result: s.result, Source: extractor.SourceExtracted, Model: "stub-model", LatencyMs: 42, InputChars: 321}, nil
}

type stubExecutor struct {
	result executor.Result
	work   func(workdir string) error
}

func (s *stubExecutor) Name() string { return "stub-executor" }

func (s *stubExecutor) Execute(_ context.Context, _ string, workdir string, _ time.Duration, _ executor.StreamFunc) executor.Result {
	if s.work != nil {
		if err := s.work(workdir); err != nil {
			return executor.Result{Success: false, Output: err.Error(), ExitCode: 1}
		}
	}
	return s.result
}

type streamingStubExecutor struct {
	result executor.Result
	events []executor.StreamEvent
}

func (s *streamingStubExecutor) Name() string { return "streaming-stub-executor" }

func (s *streamingStubExecutor) Execute(_ context.Context, _ string, workdir string, _ time.Duration, stream executor.StreamFunc) executor.Result {
	for _, event := range s.events {
		if stream != nil {
			stream(event)
		}
	}
	return s.result
}

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

	persisted := buildPersistedExecutionOutput(rawOutput, "", "Execution timed out after 5m 0s.", runner.BuildExecutionResultV1(false, "Execution timed out after 5m 0s.", 124))

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
	if !strings.Contains(persisted, runner.ResultStartMarker) {
		t.Fatalf("expected structured result marker in persisted output, got %q", persisted)
	}
}

func TestBuildPersistedExecutionOutputAppendsStructuredResultWhenMissing(t *testing.T) {
	persisted := buildPersistedExecutionOutput(
		"plain output without markers",
		"plain output without markers",
		"",
		runner.BuildExecutionResultV1(true, "plain output without markers", 0),
	)

	if !strings.Contains(persisted, "plain output without markers") {
		t.Fatalf("expected readable output to remain visible, got %q", persisted)
	}
	if !strings.Contains(persisted, runner.ResultStartMarker) || !strings.Contains(persisted, runner.ResultEndMarker) {
		t.Fatalf("expected structured result markers in persisted output, got %q", persisted)
	}
	if _, err := runner.ParseExecutionResultV1(persisted); err != nil {
		t.Fatalf("expected appended structured result to parse, got %v", err)
	}
}

func TestBuildPersistedExecutionOutputReplacesInvalidStructuredBlock(t *testing.T) {
	raw := strings.Join([]string{
		"Execution completed.",
		runner.ResultStartMarker,
		`{"schemaVersion":"v1","status":"success"`,
		runner.ResultEndMarker,
	}, "\n")

	persisted := buildPersistedExecutionOutput(
		raw,
		raw,
		"",
		runner.BuildExecutionResultV1(true, "Execution completed.", 0),
	)

	if strings.Count(persisted, runner.ResultStartMarker) != 1 {
		t.Fatalf("expected exactly one structured result block, got %q", persisted)
	}
	parsed, err := runner.ParseExecutionResultV1(persisted)
	if err != nil {
		t.Fatalf("expected canonical structured result to parse, got %v", err)
	}
	if parsed.Summary != "Execution completed." {
		t.Fatalf("expected canonical summary, got %#v", parsed)
	}
}

func TestBuildPersistedExecutionOutputCollapsesDuplicateStructuredBlocks(t *testing.T) {
	first := runner.SerializeExecutionResultV1(runner.BuildExecutionResultV1(true, "first", 0))
	second := runner.SerializeExecutionResultV1(runner.BuildExecutionResultV1(true, "second", 0))
	raw := strings.Join([]string{
		"Execution completed.",
		first,
		"extra text",
		second,
	}, "\n\n")

	persisted := buildPersistedExecutionOutput(
		raw,
		raw,
		"",
		runner.BuildExecutionResultV1(true, "Execution completed.", 0),
	)

	if strings.Count(persisted, runner.ResultStartMarker) != 1 {
		t.Fatalf("expected exactly one structured result block, got %q", persisted)
	}
	if strings.Contains(persisted, "\"summary\": \"first\"") || strings.Contains(persisted, "\"summary\": \"second\"") {
		t.Fatalf("expected previous blocks to be removed, got %q", persisted)
	}
	parsed, err := runner.ParseExecutionResultV1(persisted)
	if err != nil {
		t.Fatalf("expected canonical structured result to parse, got %v", err)
	}
	if parsed.Summary != "Execution completed." {
		t.Fatalf("expected canonical summary, got %#v", parsed)
	}
}

func TestValidateExtractedResultNormalizesSuccessPath(t *testing.T) {
	normalized, err := validateExtractedResult(map[string]interface{}{
		"schemaVersion": "broken",
		"status":        "failed",
		"summary":       "",
		"whatChanged":   []string{"Hardened extraction fallback validation."},
		"decisions":     []string{},
		"risks":         []string{},
		"checksRun":     []map[string]interface{}{},
		"filesTouched":  []string{"wrong.txt"},
		"git": map[string]interface{}{
			"mode":       "",
			"baseBranch": nil,
			"branch":     nil,
			"commitShas": []string{},
			"prUrl":      nil,
			"prNumber":   nil,
		},
		"followups":        []string{},
		"memoryCandidates": []string{},
		"skillCandidates":  []map[string]interface{}{},
	}, extractedValidationContext{
		ExecSuccess:     true,
		FilesTouched:    []string{"runner-go/internal/orchestrator/worker.go"},
		FallbackSummary: "Updated runner-go/internal/orchestrator/worker.go.",
	})
	if err != nil {
		t.Fatalf("expected normalization success, got %v", err)
	}
	if normalized["schemaVersion"] != "v1" {
		t.Fatalf("expected schemaVersion=v1, got %#v", normalized)
	}
	if normalized["status"] != "success" {
		t.Fatalf("expected status forced to success, got %#v", normalized)
	}
	if normalized["summary"] != "Hardened extraction fallback validation." {
		t.Fatalf("expected summary to reuse meaningful whatChanged content, got %#v", normalized)
	}
	if got := ifaceStrings(normalized["filesTouched"]); len(got) != 1 || got[0] != "runner-go/internal/orchestrator/worker.go" {
		t.Fatalf("expected runner files to win, got %#v", normalized["filesTouched"])
	}
}

func TestValidateExtractedResultCoercesSingularExtractorFields(t *testing.T) {
	normalized, err := validateExtractedResult(map[string]interface{}{
		"status":      "completed",
		"summary":     "",
		"whatChanged": "Improved extracted result normalization for malformed Gemini payloads.",
		"decisions":   "Kept runner-derived facts authoritative when the extractor omits them.",
		"checksRun": map[string]interface{}{
			"name":   "go test ./...",
			"status": "completed",
		},
		"filesTouched":    "runner-go/internal/runner/result.go",
		"git":             "manual",
		"skillCandidates": "fluxo-runner-output-v1",
	}, extractedValidationContext{
		ExecSuccess:     true,
		FilesTouched:    []string{"runner-go/internal/orchestrator/worker.go"},
		FallbackSummary: "Updated runner-go/internal/orchestrator/worker.go.",
	})
	if err != nil {
		t.Fatalf("expected malformed extractor payload to be normalized, got %v", err)
	}
	if normalized["summary"] != "Improved extracted result normalization for malformed Gemini payloads." {
		t.Fatalf("expected summary to reuse whatChanged entry, got %#v", normalized["summary"])
	}
	if got := ifaceStrings(normalized["decisions"]); len(got) != 1 || got[0] != "Kept runner-derived facts authoritative when the extractor omits them." {
		t.Fatalf("expected decisions string to become array, got %#v", normalized["decisions"])
	}
	checks, ok := normalized["checksRun"].([]interface{})
	if !ok || len(checks) != 1 {
		t.Fatalf("expected one normalized check, got %#v", normalized["checksRun"])
	}
	check, ok := checks[0].(map[string]interface{})
	if !ok {
		t.Fatalf("expected normalized check map, got %#v", checks[0])
	}
	if check["status"] != "passed" {
		t.Fatalf("expected completed check to normalize to passed, got %#v", check)
	}
	if got := ifaceStrings(normalized["filesTouched"]); len(got) != 1 || got[0] != "runner-go/internal/orchestrator/worker.go" {
		t.Fatalf("expected runner-detected files to override extractor files, got %#v", normalized["filesTouched"])
	}
	skillCandidates, ok := normalized["skillCandidates"].([]interface{})
	if !ok || len(skillCandidates) != 1 {
		t.Fatalf("expected normalized skill candidate, got %#v", normalized["skillCandidates"])
	}
	skill, ok := skillCandidates[0].(map[string]interface{})
	if !ok || skill["name"] != "fluxo-runner-output-v1" {
		t.Fatalf("expected skill candidate string to become object, got %#v", skillCandidates[0])
	}
}

func TestValidateExtractedResultRejectsMeaninglessPayload(t *testing.T) {
	_, err := validateExtractedResult(map[string]interface{}{
		"status": "success",
		"git":    "manual",
	}, extractedValidationContext{
		ExecSuccess:     true,
		FilesTouched:    []string{"runner-go/internal/orchestrator/worker.go"},
		FallbackSummary: "Updated runner-go/internal/orchestrator/worker.go.",
	})
	if err == nil {
		t.Fatal("expected meaningless extractor payload to be rejected")
	}
	if !strings.Contains(err.Error(), "meaningful structured content") {
		t.Fatalf("expected meaningful-content error, got %v", err)
	}
}

func TestBuildPersistedExecutionOutputKeepsEnrichedDerivedResult(t *testing.T) {
	structured := runner.BuildExecutionResultV1WithContext(true, "", 0, runner.ExecutionResultDerivedContext{
		FilesTouched: []string{"src/app/page.tsx"},
	})
	persisted := buildPersistedExecutionOutput("", "", "", structured)

	parsed, err := runner.ParseExecutionResultV1(persisted)
	if err != nil {
		t.Fatalf("expected persisted structured result to parse, got %v", err)
	}
	if len(parsed.FilesTouched) != 1 || parsed.FilesTouched[0] != "src/app/page.tsx" {
		t.Fatalf("expected filesTouched in persisted output, got %#v", parsed.FilesTouched)
	}
	if !strings.Contains(parsed.Summary, "src/app/page.tsx") {
		t.Fatalf("expected enriched summary, got %q", parsed.Summary)
	}
}

func TestTryExtractStructuredResultUsesConfiguredExtractor(t *testing.T) {
	originalFactory := newStructuredResultExtractor
	defer func() { newStructuredResultExtractor = originalFactory }()

	newStructuredResultExtractor = func(cfg extractor.Config) (extractor.StructuredResultExtractor, error) {
		if cfg.Provider != "gemini" {
			return nil, fmt.Errorf("unexpected provider %q", cfg.Provider)
		}
		return &stubExtractor{result: map[string]interface{}{
			"schemaVersion": "v1",
			"status":        "success",
			"summary":       "Implemented the requested change.",
			"whatChanged":   []string{"Updated task output parsing."},
			"decisions":     []string{},
			"risks":         []string{},
			"checksRun":     []map[string]interface{}{},
			"filesTouched":  []string{"runner-go/internal/orchestrator/worker.go"},
			"git": map[string]interface{}{
				"mode":       "manual",
				"baseBranch": nil,
				"branch":     nil,
				"commitShas": []string{},
				"prUrl":      nil,
				"prNumber":   nil,
			},
			"followups":        []string{},
			"memoryCandidates": []string{},
			"skillCandidates":  []map[string]interface{}{},
		}}, nil
	}

	worker := NewAgentWorker("http://example.com", "key", "runner-1", config.AgentConfig{
		Name:  "builder",
		Tool:  "opencode",
		Model: "glm-5.1",
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:    boolPtr(true),
		Provider:   "gemini",
		Model:      "gemini-3.1-flash-lite",
		APIKey:     "test-key",
		TimeoutSec: 10,
	})

	claimed := api.ClaimedTaskResponse{}
	claimed.Task.ID = "task-1"
	claimed.Task.Title = "Fix structured output"
	claimed.Task.Description = "Ensure derived results can be extracted"

	result, meta, err := worker.tryExtractStructuredResult(context.Background(), worker.agent, claimed, "raw", "readable", []string{"runner-go/internal/orchestrator/worker.go"}, executor.Result{Success: true})
	if err != nil {
		t.Fatalf("expected extractor success, got %v", err)
	}
	if result == nil {
		t.Fatal("expected extracted result")
	}
	if summary, _ := result["summary"].(string); summary != "Implemented the requested change." {
		t.Fatalf("unexpected summary: %#v", result)
	}
	if meta["success"] != true {
		t.Fatalf("expected extractor metadata success, got %#v", meta)
	}
}

func TestRunOnceCommentReflectsExtractedSummary(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	originalFactory := newStructuredResultExtractor
	defer func() { newStructuredResultExtractor = originalFactory }()

	newStructuredResultExtractor = func(cfg extractor.Config) (extractor.StructuredResultExtractor, error) {
		return &stubExtractor{result: map[string]interface{}{
			"schemaVersion": "v1",
			"status":        "success",
			"summary":       "Extractor produced the final summary.",
			"whatChanged":   []string{"Changed by extractor."},
			"decisions":     []string{},
			"risks":         []string{},
			"checksRun":     []map[string]interface{}{},
			"filesTouched":  []string{},
			"git": map[string]interface{}{
				"mode":       "manual",
				"baseBranch": nil,
				"branch":     nil,
				"commitShas": []string{},
				"prUrl":      nil,
				"prNumber":   nil,
			},
			"followups":        []string{},
			"memoryCandidates": []string{},
			"skillCandidates":  []map[string]interface{}{},
		}}, nil
	}

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-comment-extract","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":20,"title":"Comment uses extracted","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-comment-extract","orgId":"org-1","taskId":"task-comment-extract","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-comment-extract","projectId":"project-1","executionId":"exec-comment-extract","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-comment-extract","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-comment-extract":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-comment-extract/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-comment-extract/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:    boolPtr(true),
		Provider:   "gemini",
		Model:      "gemini-3.1-flash-lite",
		APIKey:     "test-key",
		TimeoutSec: 10,
	})
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "changed.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	comment, _ := finalizeBody["comment"].(string)
	if comment == "" {
		t.Fatal("expected comment to be present in finalize payload")
	}
	if !strings.Contains(comment, "Extractor produced the final summary.") {
		t.Fatalf("expected comment to contain extracted summary, got %q", comment)
	}
}

func TestRunOnceCommentReflectsDerivedSummaryWhenNoExtractor(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-comment-derived","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":21,"title":"Comment uses derived","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-comment-derived","orgId":"org-1","taskId":"task-comment-derived","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-comment-derived","projectId":"project-1","executionId":"exec-comment-derived","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-comment-derived","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-comment-derived":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-comment-derived/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-comment-derived/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "derived-change.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	comment, _ := finalizeBody["comment"].(string)
	if comment == "" {
		t.Fatal("expected comment to be present in finalize payload")
	}
	if !strings.Contains(comment, "derived-change.txt") {
		t.Fatalf("expected comment to reflect derived summary with changed file, got %q", comment)
	}
}

func TestRunOncePromotesDerivedResultToExtracted(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	originalFactory := newStructuredResultExtractor
	defer func() { newStructuredResultExtractor = originalFactory }()

	newStructuredResultExtractor = func(cfg extractor.Config) (extractor.StructuredResultExtractor, error) {
		if !cfg.Enabled {
			t.Fatal("expected extractor to be enabled")
		}
		if cfg.Provider != "gemini" {
			t.Fatalf("unexpected provider %q", cfg.Provider)
		}
		return &stubExtractor{result: map[string]interface{}{
			"schemaVersion": "v1",
			"status":        "completed",
			"summary":       "",
			"whatChanged":   "Extractor inferred changes.",
			"decisions":     "Kept derived fallback data for any facts missing from the model output.",
			"risks":         []string{},
			"checksRun": map[string]interface{}{
				"name":   "go test ./...",
				"status": "completed",
			},
			"filesTouched":     []string{},
			"git":              "manual",
			"followups":        []string{},
			"memoryCandidates": []string{},
			"skillCandidates":  "fluxo-runner-output-v1",
		}}, nil
	}

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-1","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":12,"title":"Extract result","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-1","orgId":"org-1","taskId":"task-1","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-1","projectId":"project-1","executionId":"exec-1","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-1","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-1":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-1/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-1/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:    boolPtr(true),
		Provider:   "gemini",
		Model:      "gemini-3.1-flash-lite",
		APIKey:     "test-key",
		TimeoutSec: 10,
	})
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "changed.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	if finalizeBody["status"] != "SUCCESS" {
		t.Fatalf("expected SUCCESS finalize status, got %#v", finalizeBody)
	}
	result, ok := finalizeBody["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected result map, got %#v", finalizeBody["result"])
	}
	if result["status"] != "success" {
		t.Fatalf("expected extracted result status=success, got %#v", result)
	}
	if got := ifaceStrings(result["filesTouched"]); len(got) != 1 || got[0] != "changed.txt" {
		t.Fatalf("expected runner-detected filesTouched, got %#v", result["filesTouched"])
	}
	if summary, _ := result["summary"].(string); summary != "Extractor inferred changes." {
		t.Fatalf("expected summary to be promoted from whatChanged, got %#v", result["summary"])
	}
	if got := ifaceStrings(result["decisions"]); len(got) != 1 || got[0] != "Kept derived fallback data for any facts missing from the model output." {
		t.Fatalf("expected malformed decisions field to be normalized, got %#v", result["decisions"])
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	outputContract, ok := metadata["outputContract"].(map[string]interface{})
	if !ok || outputContract["source"] != string(runner.StructuredResultSourceExtracted) {
		t.Fatalf("expected extracted outputContract source, got %#v", metadata["outputContract"])
	}
	extractorMeta, ok := metadata["extractor"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected extractor metadata, got %#v", metadata["extractor"])
	}
	if extractorMeta["success"] != true {
		t.Fatalf("expected extractor success metadata, got %#v", extractorMeta)
	}
	if extractorMeta["latencyMs"] != float64(42) && extractorMeta["latencyMs"] != int64(42) && extractorMeta["latencyMs"] != int(42) {
		t.Fatalf("expected latencyMs metadata, got %#v", extractorMeta)
	}
	if extractorMeta["inputChars"] != float64(321) && extractorMeta["inputChars"] != int(321) {
		t.Fatalf("expected inputChars metadata, got %#v", extractorMeta)
	}
}

func TestRunOnceUsesAgentSummaryWhenJSONBlockIsMissing(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-summary","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":15,"title":"Summary-first result","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-summary","orgId":"org-1","taskId":"task-summary","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-summary","projectId":"project-1","executionId":"exec-summary","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-summary","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-summary":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-summary/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-summary/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{
				Success: true,
				Output: strings.Join([]string{
					runner.SummaryStartMarker,
					"Version: v1",
					"Summary: Implemented the summary-first contract.",
					"What changed:",
					"- Persisted agentSummary metadata during finalize.",
					"Decisions:",
					"- Kept ExecutionResultV1 as the canonical stored result.",
					runner.SummaryEndMarker,
				}, "\n"),
			},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "summary-only.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	if finalizeBody["resultSummary"] != "Implemented the summary-first contract." {
		t.Fatalf("expected human resultSummary, got %#v", finalizeBody["resultSummary"])
	}
	result, ok := finalizeBody["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected result map, got %#v", finalizeBody["result"])
	}
	if result["summary"] != "Implemented the summary-first contract." {
		t.Fatalf("expected structured result summary from agent summary, got %#v", result)
	}
	if got := ifaceStrings(result["filesTouched"]); len(got) != 1 || got[0] != "summary-only.txt" {
		t.Fatalf("expected runner-detected filesTouched, got %#v", result["filesTouched"])
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	outputContract, ok := metadata["outputContract"].(map[string]interface{})
	if !ok || outputContract["source"] != string(runner.StructuredResultSourceSummary) {
		t.Fatalf("expected summary outputContract source, got %#v", metadata["outputContract"])
	}
	agentSummary, ok := metadata["agentSummary"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected agentSummary metadata, got %#v", metadata["agentSummary"])
	}
	if agentSummary["summary"] != "Implemented the summary-first contract." {
		t.Fatalf("unexpected agentSummary metadata: %#v", agentSummary)
	}
	persistedOutput, _ := finalizeBody["output"].(string)
	if strings.Contains(persistedOutput, runner.SummaryStartMarker) || strings.Contains(persistedOutput, runner.SummaryEndMarker) {
		t.Fatalf("expected persisted output to strip summary markers, got %q", persistedOutput)
	}
	if !strings.Contains(persistedOutput, "Implemented the summary-first contract.") {
		t.Fatalf("expected persisted output to keep human-readable summary, got %q", persistedOutput)
	}
}

func TestRunOnceKeepsCanonicalJSONSummaryWhenSummaryBlockDisagrees(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-json","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":16,"title":"JSON remains canonical","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-json","orgId":"org-1","taskId":"task-json","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-json","projectId":"project-1","executionId":"exec-json","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-json","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-json":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-json/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-json/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{
				Success: true,
				Output: strings.Join([]string{
					runner.SummaryStartMarker,
					"Version: v1",
					"Summary: Stale summary block.",
					runner.SummaryEndMarker,
					runner.ResultStartMarker,
					`{"schemaVersion":"v1","status":"success","summary":"Canonical JSON summary.","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
					runner.ResultEndMarker,
				}, "\n"),
			},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "json-canonical.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	if finalizeBody["resultSummary"] != "Canonical JSON summary." {
		t.Fatalf("expected canonical JSON resultSummary, got %#v", finalizeBody["resultSummary"])
	}
	result, ok := finalizeBody["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected result map, got %#v", finalizeBody["result"])
	}
	if result["summary"] != "Canonical JSON summary." {
		t.Fatalf("expected structured result to stay canonical, got %#v", result)
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	agentSummary, ok := metadata["agentSummary"].(map[string]interface{})
	if !ok || agentSummary["summary"] != "Stale summary block." {
		t.Fatalf("expected agentSummary metadata to keep original block, got %#v", metadata["agentSummary"])
	}
}

func TestRunOnceFallsBackToDerivedWhenExtractorReturnsNilResult(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	originalFactory := newStructuredResultExtractor
	defer func() { newStructuredResultExtractor = originalFactory }()

	newStructuredResultExtractor = func(cfg extractor.Config) (extractor.StructuredResultExtractor, error) {
		return &stubExtractor{}, nil
	}

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-2","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":13,"title":"Fallback result","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-2","orgId":"org-1","taskId":"task-2","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-2","projectId":"project-1","executionId":"exec-2","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-2","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-2":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-2/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-2/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:    boolPtr(true),
		Provider:   "gemini",
		Model:      "gemini-3.1-flash-lite",
		APIKey:     "test-key",
		TimeoutSec: 10,
	})
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "derived.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	outputContract, ok := metadata["outputContract"].(map[string]interface{})
	if !ok || outputContract["source"] != string(runner.StructuredResultSourceDerived) {
		t.Fatalf("expected derived outputContract source, got %#v", metadata["outputContract"])
	}
	extractorMeta, ok := metadata["extractor"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected extractor metadata, got %#v", metadata["extractor"])
	}
	if extractorMeta["success"] != false {
		t.Fatalf("expected extractor success=false, got %#v", extractorMeta)
	}
	if !strings.Contains(fmt.Sprint(extractorMeta["error"]), "nil result") {
		t.Fatalf("expected nil result error metadata, got %#v", extractorMeta)
	}
	result, ok := finalizeBody["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected result map, got %#v", finalizeBody["result"])
	}
	if result["status"] != "success" {
		t.Fatalf("expected derived success result, got %#v", result)
	}
	if got := ifaceStrings(result["filesTouched"]); len(got) != 1 || got[0] != "derived.txt" {
		t.Fatalf("expected derived filesTouched, got %#v", result["filesTouched"])
	}
}

func TestRunOnceFallsBackToDerivedWhenExtractorReturnsMeaninglessPayload(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	originalFactory := newStructuredResultExtractor
	defer func() { newStructuredResultExtractor = originalFactory }()

	newStructuredResultExtractor = func(cfg extractor.Config) (extractor.StructuredResultExtractor, error) {
		return &stubExtractor{result: map[string]interface{}{
			"status": "success",
			"git":    "manual",
		}}, nil
	}

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-3","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":14,"title":"Fallback result","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-3","orgId":"org-1","taskId":"task-3","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-3","projectId":"project-1","executionId":"exec-3","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-3","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-3":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-3/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-3/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:    boolPtr(true),
		Provider:   "gemini",
		Model:      "gemini-3.1-flash-lite",
		APIKey:     "test-key",
		TimeoutSec: 10,
	})
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "derived-meaningless.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	outputContract, ok := metadata["outputContract"].(map[string]interface{})
	if !ok || outputContract["source"] != string(runner.StructuredResultSourceDerived) {
		t.Fatalf("expected derived outputContract source, got %#v", metadata["outputContract"])
	}
	extractorMeta, ok := metadata["extractor"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected extractor metadata, got %#v", metadata["extractor"])
	}
	if extractorMeta["success"] != false {
		t.Fatalf("expected extractor success=false, got %#v", extractorMeta)
	}
	if !strings.Contains(fmt.Sprint(extractorMeta["error"]), "meaningful structured content") {
		t.Fatalf("expected meaningful-content error metadata, got %#v", extractorMeta)
	}
	result, ok := finalizeBody["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected result map, got %#v", finalizeBody["result"])
	}
	if result["status"] != "success" {
		t.Fatalf("expected derived success result, got %#v", result)
	}
	if got := ifaceStrings(result["filesTouched"]); len(got) != 1 || got[0] != "derived-meaningless.txt" {
		t.Fatalf("expected derived filesTouched, got %#v", result["filesTouched"])
	}
	if summary, _ := result["summary"].(string); !strings.Contains(summary, "derived-meaningless.txt") {
		t.Fatalf("expected derived summary to mention changed file, got %#v", result["summary"])
	}
}

func TestResolveResultExtractorConfigPrefersExplicitAgentDisable(t *testing.T) {
	resolved := resolveResultExtractorConfig(&config.ResultExtractorConfig{
		Enabled:   boolPtr(true),
		Provider:  "gemini",
		Model:     "gemini-3.1-flash-lite",
		APIKeyEnv: "GEMINI_API_KEY",
	}, &config.ResultExtractorConfig{
		Enabled: boolPtr(false),
	})
	if resolved == nil {
		t.Fatal("expected resolved config")
	}
	if resolved.IsEnabled() {
		t.Fatalf("expected explicit agent disable to win, got %#v", resolved)
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

func TestRunOnceFinalizesFailureWhenEffectiveWorkdirIsEmpty(t *testing.T) {
	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
		heartbeats   []string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/agents":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"data":    map[string]any{"id": "agent-reg-1"},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/agents/agent-reg-1/heartbeat":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode heartbeat body: %v", err)
			}
			mu.Lock()
			if status, _ := body["status"].(string); status != "" {
				heartbeats = append(heartbeats, status)
			}
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(`{
				"data": {
					"task": {
						"id": "task-1",
						"orgId": "org-1",
						"projectId": "project-1",
						"featureId": "feature-1",
						"localId": 12,
						"title": "Inspect runner lifecycle",
						"description": "desc",
						"status": "DOING",
						"type": "TASK",
						"priority": "HIGH"
					},
					"execution": {
						"id": "exec-1",
						"orgId": "org-1",
						"taskId": "task-1",
						"projectId": "project-1",
						"agentId": "agent-1",
						"runnerInstanceId": "runner-1",
						"status": "CLAIMED",
						"tool": "opencode",
						"model": "glm-5.1",
						"metadata": {},
						"startedAt": "2026-05-16T00:00:00Z"
					},
					"lease": {
						"id": "lease-1",
						"projectId": "project-1",
						"executionId": "exec-1",
						"expiresAt": "2026-05-16T00:01:00Z"
					}
				}
			}`))
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-1/finalize":
			if err := json.NewDecoder(r.Body).Decode(&finalizeBody); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	agent := config.AgentConfig{
		ID:          "agent-1",
		Name:        "fluxo-runner-go",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
	}
	if runner.RegisterAgent(api.NewClient(server.URL, "test-key", agent.Name), agent, nil) == "" {
		t.Fatal("expected agent registration to succeed")
	}

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", agent, time.Second, nil)
	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected execution to be finalized")
	}
	if status, _ := finalizeBody["status"].(string); status != "FAILED" {
		t.Fatalf("expected FAILED finalize status, got %v", finalizeBody["status"])
	}
	errorMessage, _ := finalizeBody["errorMessage"].(string)
	if !strings.Contains(errorMessage, "Execution cannot start without a resolved workdir") {
		t.Fatalf("expected explicit missing workdir message, got %q", errorMessage)
	}
	if !strings.Contains(errorMessage, "No project runtime binding matched this runner instance.") {
		t.Fatalf("expected runtime binding hint, got %q", errorMessage)
	}
	result, ok := finalizeBody["result"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected structured result map, got %#v", finalizeBody["result"])
	}
	if summary, _ := result["summary"].(string); !strings.Contains(summary, "Execution cannot start without a resolved workdir") {
		t.Fatalf("expected structured summary to mention missing workdir, got %q", summary)
	}
	if len(heartbeats) < 2 || heartbeats[0] != "ONLINE" || heartbeats[len(heartbeats)-1] != "ONLINE" {
		t.Fatalf("expected ONLINE heartbeats around failure, got %#v", heartbeats)
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	contract, ok := metadata["outputContract"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected outputContract metadata, got %#v", metadata["outputContract"])
	}
	if contract["source"] != string(runner.StructuredResultSourceDerived) {
		t.Fatalf("expected derived source for missing workdir path, got %#v", contract)
	}
	if contract["repairApplied"] != false {
		t.Fatalf("expected repairApplied=false, got %#v", contract)
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

func TestRunOncePersistFinalSummarySourceAndCommentSummarySourceWithExtractor(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	originalFactory := newStructuredResultExtractor
	defer func() { newStructuredResultExtractor = originalFactory }()

	newStructuredResultExtractor = func(cfg extractor.Config) (extractor.StructuredResultExtractor, error) {
		return &stubExtractor{result: map[string]interface{}{
			"schemaVersion": "v1",
			"status":        "success",
			"summary":       "Extractor produced the final summary.",
			"whatChanged":   []string{"Changed by extractor."},
			"decisions":     []string{},
			"risks":         []string{},
			"checksRun":     []map[string]interface{}{},
			"filesTouched":  []string{},
			"git": map[string]interface{}{
				"mode":       "manual",
				"baseBranch": nil,
				"branch":     nil,
				"commitShas": []string{},
				"prUrl":      nil,
				"prNumber":   nil,
			},
			"followups":        []string{},
			"memoryCandidates": []string{},
			"skillCandidates":  []map[string]interface{}{},
		}}, nil
	}

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-src-extract","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":30,"title":"Summary source extract","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-src-extract","orgId":"org-1","taskId":"task-src-extract","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-src-extract","projectId":"project-1","executionId":"exec-src-extract","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-src-extract","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-src-extract":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-src-extract/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-src-extract/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:    boolPtr(true),
		Provider:   "gemini",
		Model:      "gemini-3.1-flash-lite",
		APIKey:     "test-key",
		TimeoutSec: 10,
	})
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "changed.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	if metadata["finalSummarySource"] != "extracted" {
		t.Fatalf("expected finalSummarySource=extracted, got %#v", metadata["finalSummarySource"])
	}
	if metadata["commentSummarySource"] != "extracted" {
		t.Fatalf("expected commentSummarySource=extracted, got %#v", metadata["commentSummarySource"])
	}
}

func TestRunOncePersistFinalSummarySourceAndCommentSummarySourceDerived(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-src-derived","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":31,"title":"Summary source derived","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-src-derived","orgId":"org-1","taskId":"task-src-derived","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-src-derived","projectId":"project-1","executionId":"exec-src-derived","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-src-derived","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-src-derived":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-src-derived/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-src-derived/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "derived-change.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	if metadata["finalSummarySource"] != "derived" {
		t.Fatalf("expected finalSummarySource=derived, got %#v", metadata["finalSummarySource"])
	}
	if metadata["commentSummarySource"] != "derived" {
		t.Fatalf("expected commentSummarySource=derived, got %#v", metadata["commentSummarySource"])
	}
}

func TestRunOnceCommentSummarySourceIsRawWhenStructuredResultAlreadyInOutput(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	agentOutput := strings.Join([]string{
		"Agent did the work.",
		runner.ResultStartMarker,
		`{"schemaVersion":"v1","status":"success","summary":"Model produced summary.","whatChanged":["Updated file."],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
		runner.ResultEndMarker,
	}, "\n")

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-src-raw","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":32,"title":"Summary source raw","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-src-raw","orgId":"org-1","taskId":"task-src-raw","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-src-raw","projectId":"project-1","executionId":"exec-src-raw","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-src-raw","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-src-raw":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-src-raw/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-src-raw/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true, Output: agentOutput},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "model-change.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	if metadata["finalSummarySource"] != "model" {
		t.Fatalf("expected finalSummarySource=model, got %#v", metadata["finalSummarySource"])
	}
	if metadata["commentSummarySource"] != "model" {
		t.Fatalf("expected commentSummarySource=model (structured result already in output), got %#v", metadata["commentSummarySource"])
	}
}

func TestRunOnceSummarySourceFieldsDoNotRemoveExistingMetadata(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-src-meta","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":33,"title":"Summary source meta","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-src-meta","orgId":"org-1","taskId":"task-src-meta","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-src-meta","projectId":"project-1","executionId":"exec-src-meta","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-src-meta","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-src-meta":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-src-meta/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-src-meta/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "meta-test.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	metadata, ok := finalizeBody["metadata"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected metadata map, got %#v", finalizeBody["metadata"])
	}
	existingFields := []string{"tool", "model", "git", "outputContract", "execution", "runtimeBinding"}
	for _, field := range existingFields {
		if _, ok := metadata[field]; !ok {
			t.Fatalf("expected existing metadata field %q to be preserved, got keys: %#v", field, mapKeys(metadata))
		}
	}
	if _, ok := metadata["finalSummarySource"]; !ok {
		t.Fatal("expected finalSummarySource field to be present")
	}
	if _, ok := metadata["commentSummarySource"]; !ok {
		t.Fatal("expected commentSummarySource field to be present")
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

func TestIsHighPriorityEventKind(t *testing.T) {
	highPriorityKinds := []string{"step_start", "step_end", "result", "error"}
	for _, kind := range highPriorityKinds {
		if !isHighPriorityEventKind(kind) {
			t.Fatalf("expected %q to be high priority", kind)
		}
	}

	lowPriorityKinds := []string{"stdout", "stderr", "tool_use", "tool_result", "text", "init", "session", "status", "unknown"}
	for _, kind := range lowPriorityKinds {
		if isHighPriorityEventKind(kind) {
			t.Fatalf("expected %q to NOT be high priority", kind)
		}
	}
}

func TestFlushEventsBatchesCommonEvents(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu            sync.Mutex
		eventBatches  [][]api.ExecutionEvent
		flushCounter  int
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-flush-batch","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":40,"title":"Flush batch test","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-flush-batch","orgId":"org-1","taskId":"task-flush-batch","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-flush-batch","projectId":"project-1","executionId":"exec-flush-batch","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-flush-batch","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/events"):
			var body struct {
				Events []api.ExecutionEvent `json:"events"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode events body: %v", err)
			}
			mu.Lock()
			eventBatches = append(eventBatches, body.Events)
			flushCounter++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"created": len(body.Events)}})
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-flush-batch":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-flush-batch/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-flush-batch/finalize":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)

	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &streamingStubExecutor{
			result: executor.Result{Success: true},
			events: []executor.StreamEvent{
				{Seq: 1, Kind: "stdout", Content: "line 1"},
				{Seq: 2, Kind: "stdout", Content: "line 2"},
				{Seq: 3, Kind: "stdout", Content: "line 3"},
				{Seq: 4, Kind: "stdout", Content: "line 4"},
				{Seq: 5, Kind: "stdout", Content: "line 5"},
				{Seq: 6, Kind: "stdout", Content: "line 6"},
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()

	if flushCounter < 1 {
		t.Fatal("expected at least one flush (force at end)")
	}

	totalEvents := 0
	for _, batch := range eventBatches {
		totalEvents += len(batch)
	}
	if totalEvents != 6 {
		t.Fatalf("expected 6 total events flushed, got %d", totalEvents)
	}
}

func TestFlushEventsImmediateForHighPriorityKinds(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		eventBatches [][]api.ExecutionEvent
		flushCounter int
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-flush-priority","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":41,"title":"Flush priority test","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-flush-priority","orgId":"org-1","taskId":"task-flush-priority","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-flush-priority","projectId":"project-1","executionId":"exec-flush-priority","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-flush-priority","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/events"):
			var body struct {
				Events []api.ExecutionEvent `json:"events"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode events body: %v", err)
			}
			mu.Lock()
			eventBatches = append(eventBatches, body.Events)
			flushCounter++
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"created": len(body.Events)}})
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-flush-priority":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-flush-priority/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-flush-priority/finalize":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)

	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &streamingStubExecutor{
			result: executor.Result{Success: true},
			events: []executor.StreamEvent{
				{Seq: 1, Kind: "stdout", Content: "working..."},
				{Seq: 2, Kind: "step_start", Content: "── step ──"},
				{Seq: 3, Kind: "stdout", Content: "doing work"},
				{Seq: 4, Kind: "step_end", Content: "── step ✓ ──"},
				{Seq: 5, Kind: "result", Content: "done"},
				{Seq: 6, Kind: "error", Content: "something went wrong"},
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()

	if flushCounter < 4 {
		t.Fatalf("expected at least 4 flushes (step_start, step_end, result, error each trigger immediate flush + final force), got %d", flushCounter)
	}

	totalEvents := 0
	for _, batch := range eventBatches {
		totalEvents += len(batch)
	}
	if totalEvents != 6 {
		t.Fatalf("expected 6 total events flushed, got %d", totalEvents)
	}
}

func TestFlushEventsOrderingPreserved(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu        sync.Mutex
		allEvents []api.ExecutionEvent
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-flush-order","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":42,"title":"Flush order test","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-flush-order","orgId":"org-1","taskId":"task-flush-order","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-flush-order","projectId":"project-1","executionId":"exec-flush-order","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-flush-order","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPost && strings.HasSuffix(r.URL.Path, "/events"):
			var body struct {
				Events []api.ExecutionEvent `json:"events"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode events body: %v", err)
			}
			mu.Lock()
			allEvents = append(allEvents, body.Events...)
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"created": len(body.Events)}})
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-flush-order":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-flush-order/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-flush-order/finalize":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)

	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &streamingStubExecutor{
			result: executor.Result{Success: true},
			events: []executor.StreamEvent{
				{Seq: 1, Kind: "stdout", Content: "line 1"},
				{Seq: 2, Kind: "stdout", Content: "line 2"},
				{Seq: 3, Kind: "step_start", Content: "step"},
				{Seq: 4, Kind: "stdout", Content: "line 3"},
				{Seq: 5, Kind: "step_end", Content: "step end"},
				{Seq: 6, Kind: "result", Content: "result"},
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()

	if len(allEvents) != 6 {
		t.Fatalf("expected 6 events, got %d", len(allEvents))
	}

	for i := 1; i < len(allEvents); i++ {
		if allEvents[i].Seq <= allEvents[i-1].Seq {
			t.Fatalf("expected seq ordering: event[%d].Seq=%d > event[%d].Seq=%d", i, allEvents[i].Seq, i-1, allEvents[i-1].Seq)
		}
	}
}

func TestRunOnceCommentUsesFinalSummaryOverAgentSummary(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-final-summary","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":50,"title":"Final summary priority","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-final-summary","orgId":"org-1","taskId":"task-final-summary","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-final-summary","projectId":"project-1","executionId":"exec-final-summary","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-final-summary","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-final-summary":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-final-summary/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-final-summary/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{
				Success: true,
				Output: strings.Join([]string{
					runner.SummaryStartMarker,
					"Version: v1",
					"Summary: Agent summary that should not win.",
					runner.SummaryEndMarker,
					runner.ResultStartMarker,
					`{"schemaVersion":"v1","status":"success","summary":"Canonical structured result summary wins.","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
					runner.ResultEndMarker,
				}, "\n"),
			},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "priority-test.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	comment, _ := finalizeBody["comment"].(string)
	if comment == "" {
		t.Fatal("expected comment to be present in finalize payload")
	}
	if !strings.Contains(comment, "Canonical structured result summary wins.") {
		t.Fatalf("expected comment to use structured result summary, got %q", comment)
	}
	if strings.Contains(comment, "Agent summary that should not win.") {
		t.Fatalf("expected comment NOT to contain stale agent summary, got %q", comment)
	}
	if finalizeBody["resultSummary"] != "Canonical structured result summary wins." {
		t.Fatalf("expected resultSummary to match comment summary, got %#v", finalizeBody["resultSummary"])
	}
}

func TestRunOnceCommentMatchesResultSummaryAfterExtractor(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	originalFactory := newStructuredResultExtractor
	defer func() { newStructuredResultExtractor = originalFactory }()

	newStructuredResultExtractor = func(cfg extractor.Config) (extractor.StructuredResultExtractor, error) {
		return &stubExtractor{result: map[string]interface{}{
			"schemaVersion": "v1",
			"status":        "success",
			"summary":       "Extractor summary matches resultSummary.",
			"whatChanged":   []string{"Changed by extractor."},
			"decisions":     []string{},
			"risks":         []string{},
			"checksRun":     []map[string]interface{}{},
			"filesTouched":  []string{},
			"git": map[string]interface{}{
				"mode":       "manual",
				"baseBranch": nil,
				"branch":     nil,
				"commitShas": []string{},
				"prUrl":      nil,
				"prNumber":   nil,
			},
			"followups":        []string{},
			"memoryCandidates": []string{},
			"skillCandidates":  []map[string]interface{}{},
		}}, nil
	}

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-match-summary","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":51,"title":"Comment matches resultSummary","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-match-summary","orgId":"org-1","taskId":"task-match-summary","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-match-summary","projectId":"project-1","executionId":"exec-match-summary","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-match-summary","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-match-summary":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-match-summary/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-match-summary/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:    boolPtr(true),
		Provider:   "gemini",
		Model:      "gemini-3.1-flash-lite",
		APIKey:     "test-key",
		TimeoutSec: 10,
	})
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: true},
			work: func(workdir string) error {
				return os.WriteFile(filepath.Join(workdir, "match-test.txt"), []byte("hello"), 0644)
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	comment, _ := finalizeBody["comment"].(string)
	if comment == "" {
		t.Fatal("expected comment to be present in finalize payload")
	}
	if !strings.Contains(comment, "Extractor summary matches resultSummary.") {
		t.Fatalf("expected comment to contain extracted summary, got %q", comment)
	}
	if finalizeBody["resultSummary"] != "Extractor summary matches resultSummary." {
		t.Fatalf("expected resultSummary to match comment, got %#v", finalizeBody["resultSummary"])
	}
}

func TestRunOnceCommentNoRegressionOnFailure(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-fail-comment","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":52,"title":"Failure comment regression","description":"desc","status":"DOING","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-fail-comment","orgId":"org-1","taskId":"task-fail-comment","projectId":"project-1","agentId":"agent-1","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-16T00:00:00Z"},"lease":{"id":"lease-fail-comment","projectId":"project-1","executionId":"exec-fail-comment","expiresAt":"2026-05-16T00:01:00Z"},"runtimeBinding":{"id":"binding-fail-comment","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-fail-comment":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-fail-comment/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-fail-comment/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-1",
		Name:        "builder",
		Tool:        "opencode",
		Model:       "glm-5.1",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{Success: false, ExitCode: 1},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	if finalizeBody["status"] != "FAILED" {
		t.Fatalf("expected FAILED status, got %v", finalizeBody["status"])
	}
	comment, _ := finalizeBody["comment"].(string)
	if comment == "" {
		t.Fatal("expected comment to be present for failure")
	}
	if !strings.Contains(comment, "Execution Failed") {
		t.Fatalf("expected failure header in comment, got %q", comment)
	}
	if !strings.Contains(comment, "Exit Code") {
		t.Fatalf("expected exit code in failure comment, got %q", comment)
	}
	resultSummary, _ := finalizeBody["resultSummary"].(string)
	if resultSummary == "" {
		t.Fatal("expected non-empty resultSummary for failure")
	}
}

func boolPtr(v bool) *bool {
	return &v
}

func ifaceStrings(value interface{}) []string {
	items, ok := value.([]interface{})
	if !ok {
		if strings, ok := value.([]string); ok {
			return strings
		}
		return nil
	}
	result := make([]string, 0, len(items))
	for _, item := range items {
		if str, ok := item.(string); ok {
			result = append(result, str)
		}
	}
	return result
}

func mapKeys(m map[string]interface{}) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	return keys
}

func TestValidateExtractedResultPreservesRejectedStatus(t *testing.T) {
	ctx := extractedValidationContext{
		ExecSuccess:     true,
		FilesTouched:    []string{},
		FallbackSummary: "Fallback summary",
	}
	result, err := validateExtractedResult(map[string]interface{}{
		"schemaVersion": "v1",
		"status":        "rejected",
		"summary":       "Missing tests in handler.ts",
		"whatChanged":   []string{},
		"decisions":     []string{},
		"risks":         []string{"No test coverage added"},
		"checksRun":     []map[string]interface{}{{"name": "Tests", "status": "failed", "details": "No new tests added"}},
		"filesTouched":  []string{},
		"git": map[string]interface{}{
			"mode":       "manual",
			"baseBranch": nil,
			"branch":     nil,
			"commitShas": []string{},
			"prUrl":      nil,
			"prNumber":   nil,
		},
		"followups":        []string{},
		"memoryCandidates": []string{},
		"skillCandidates":  []map[string]interface{}{},
	}, ctx)
	if err != nil {
		t.Fatalf("expected validation to succeed, got %v", err)
	}
	if result == nil {
		t.Fatal("expected validated result")
	}
	if status, _ := result["status"].(string); status != "rejected" {
		t.Fatalf("expected status=rejected, got %q", status)
	}
}

func TestRunOnceReviewerRejectedRoutesToTODO(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	rejectedJSON := `{"schemaVersion":"v1","status":"rejected","summary":"Rejected: No tests found","whatChanged":[],"decisions":[],"risks":["Handler lacks test coverage"],"checksRun":[{"name":"Tests","status":"failed","details":"No tests"}],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":["Add unit tests before resubmitting"],"memoryCandidates":[],"skillCandidates":[]}`

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-review-1","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":99,"title":"Review: add auth","description":"Verify acceptance criteria","status":"REVIEW","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-review-1","orgId":"org-1","taskId":"task-review-1","projectId":"project-1","agentId":"agent-reviewer","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-17T00:00:00Z"},"lease":{"id":"lease-review-1","projectId":"project-1","executionId":"exec-review-1","expiresAt":"2026-05-17T00:01:00Z"},"runtimeBinding":{"id":"binding-review-1","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-review-1":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-review-1/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-review-1/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:             "agent-reviewer",
		Name:           "reviewer",
		Tool:           "opencode",
		Model:          "glm-5.1",
		AgentType:      "reviewer",
		ClaimStatus:    "REVIEW",
		PickStatus:     "REVIEW",
		DoneStatus:     "QA_READY",
		NextAssigneeID: "agent-builder",
		Timeout:        30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{
				Success: true,
				Output:  "Review output.\n\n" + runner.ResultStartMarker + "\n" + rejectedJSON + "\n" + runner.ResultEndMarker,
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	if status, _ := finalizeBody["status"].(string); status != "SUCCESS" {
		t.Fatalf("expected SUCCESS finalize status, got %q", status)
	}
	nextStatus, _ := finalizeBody["nextStatus"].(string)
	if nextStatus != "TODO" {
		t.Fatalf("expected nextStatus TODO, got %q", nextStatus)
	}
	nextAssignee, _ := finalizeBody["nextAssigneeAgentId"].(string)
	if nextAssignee != "agent-builder" {
		t.Fatalf("expected nextAssigneeAgentId agent-builder, got %q", nextAssignee)
	}
	blockReason, _ := finalizeBody["blockReason"].(string)
	if blockReason != "" {
		t.Fatalf("expected no blockReason on rejected review, got %q", blockReason)
	}
	resultMap, ok := finalizeBody["result"].(map[string]interface{})
	if !ok {
		t.Fatal("expected result map in finalize payload")
	}
	resultStatus, _ := resultMap["status"].(string)
	if resultStatus != "rejected" {
		t.Fatalf("expected result.status=rejected, got %q", resultStatus)
	}
	comment, _ := finalizeBody["comment"].(string)
	if comment == "" {
		t.Fatal("expected comment in finalize payload")
	}
	if !strings.Contains(comment, "Review Rejected") {
		t.Fatalf("expected comment to contain Review Rejected headline, got %q", comment)
	}
	if !strings.Contains(comment, "No tests found") {
		t.Fatalf("expected comment to contain rejection reason, got %q", comment)
	}
}

func TestRunOnceReviewerRejectedWithoutNextAssignee(t *testing.T) {
	repo := initWorkerTestGitRepo(t)

	var (
		mu           sync.Mutex
		finalizeBody map[string]interface{}
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && strings.HasPrefix(r.URL.Path, "/agents/") && strings.HasSuffix(r.URL.Path, "/heartbeat"):
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/claim-next":
			_, _ = w.Write([]byte(fmt.Sprintf(`{"data":{"task":{"id":"task-review-2","orgId":"org-1","projectId":"project-1","featureId":"feature-1","localId":100,"title":"Review: no builder config","description":"desc","status":"REVIEW","type":"TASK","priority":"HIGH"},"execution":{"id":"exec-review-2","orgId":"org-1","taskId":"task-review-2","projectId":"project-1","agentId":"agent-reviewer-2","runnerInstanceId":"runner-1","status":"CLAIMED","tool":"opencode","model":"glm-5.1","metadata":{},"startedAt":"2026-05-17T00:00:00Z"},"lease":{"id":"lease-review-2","projectId":"project-1","executionId":"exec-review-2","expiresAt":"2026-05-17T00:01:00Z"},"runtimeBinding":{"id":"binding-review-2","projectId":"project-1","runnerProfile":"local","hostOs":"windows","repoPath":%q,"defaultBaseBranch":"main","allowedBranchPrefix":"","executionMode":"local","gitProvider":"github","prPolicy":"draft","gitPolicy":"no_write","metadata":{}}}}`, repo)))
		case r.Method == http.MethodPatch && r.URL.Path == "/executions/exec-review-2":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/tasks/task-review-2/comments":
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		case r.Method == http.MethodPost && r.URL.Path == "/executions/exec-review-2/finalize":
			var body map[string]interface{}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode finalize body: %v", err)
			}
			mu.Lock()
			finalizeBody = body
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	worker := NewAgentWorker(server.URL, "test-key", "runner-1", config.AgentConfig{
		ID:          "agent-reviewer-2",
		Name:        "reviewer",
		Tool:        "opencode",
		Model:       "glm-5.1",
		AgentType:   "reviewer",
		ClaimStatus: "REVIEW",
		PickStatus:  "REVIEW",
		DoneStatus:  "QA_READY",
		Timeout:     30,
	}, time.Second, nil)
	worker.executorFactory = func(agent config.AgentConfig) executor.Executor {
		return &stubExecutor{
			result: executor.Result{
				Success: true,
				Output:  "Review failed.\n\n" + runner.ResultStartMarker + "\n" + `{"schemaVersion":"v1","status":"rejected","summary":"No PR found","whatChanged":[],"decisions":[],"risks":["Missing PR"],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}` + "\n" + runner.ResultEndMarker,
			},
		}
	}

	worker.runOnce(context.Background())

	mu.Lock()
	defer mu.Unlock()
	if finalizeBody == nil {
		t.Fatal("expected finalize payload")
	}
	if status, _ := finalizeBody["status"].(string); status != "SUCCESS" {
		t.Fatalf("expected SUCCESS finalize status even without nextAssignee, got %q", status)
	}
	nextStatus, _ := finalizeBody["nextStatus"].(string)
	if nextStatus != "TODO" {
		t.Fatalf("expected nextStatus TODO, got %q", nextStatus)
	}
	nextAssignee, _ := finalizeBody["nextAssigneeAgentId"].(string)
	if nextAssignee != "" {
		t.Fatalf("expected no nextAssigneeAgentId when not configured, got %q", nextAssignee)
	}
}

func initWorkerTestGitRepo(t *testing.T) string {
	t.Helper()
	dir := t.TempDir()
	runGit(t, dir, "init")
	runGit(t, dir, "config", "user.email", "test@fluxo.dev")
	runGit(t, dir, "config", "user.name", "Test")
	runGit(t, dir, "checkout", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("# test"), 0644); err != nil {
		t.Fatalf("write readme: %v", err)
	}
	runGit(t, dir, "add", "-A")
	runGit(t, dir, "commit", "-m", "initial")
	return dir
}

func runGit(t *testing.T, dir string, args ...string) string {
	t.Helper()
	cmd := exec.Command("git", append([]string{"-C", dir}, args...)...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("git %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(output)))
	}
	return strings.TrimSpace(string(output))
}
