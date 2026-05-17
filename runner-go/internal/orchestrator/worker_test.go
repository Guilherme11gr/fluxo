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
	"github.com/fluxo-app/fluxo-runner/internal/extractor"
	"github.com/fluxo-app/fluxo-runner/internal/executor"
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
		"whatChanged":   []string{},
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
	if normalized["summary"] != "Updated runner-go/internal/orchestrator/worker.go." {
		t.Fatalf("expected fallback summary, got %#v", normalized)
	}
	if got := ifaceStrings(normalized["filesTouched"]); len(got) != 1 || got[0] != "runner-go/internal/orchestrator/worker.go" {
		t.Fatalf("expected runner files to win, got %#v", normalized["filesTouched"])
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
		Name: "builder",
		Tool: "opencode",
		Model: "glm-5.1",
	}, time.Second, &config.ResultExtractorConfig{
		Enabled:   boolPtr(true),
		Provider:  "gemini",
		Model:     "gemini-3.1-flash-lite",
		APIKey:    "test-key",
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
			"status":        "failed",
			"summary":       "",
			"whatChanged":   []string{"Extractor inferred changes."},
			"decisions":     []string{},
			"risks":         []string{},
			"checksRun":     []map[string]interface{}{},
			"filesTouched":  []string{},
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
		Enabled:   boolPtr(true),
		Provider:  "gemini",
		Model:     "gemini-3.1-flash-lite",
		APIKey:    "test-key",
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
	if summary, _ := result["summary"].(string); !strings.Contains(summary, "changed.txt") {
		t.Fatalf("expected fallback summary to mention changed file, got %#v", result["summary"])
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
		Enabled:   boolPtr(true),
		Provider:  "gemini",
		Model:     "gemini-3.1-flash-lite",
		APIKey:    "test-key",
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
		mu            sync.Mutex
		finalizeBody  map[string]interface{}
		heartbeats    []string
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/agents":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"data": map[string]any{"id": "agent-reg-1"},
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
