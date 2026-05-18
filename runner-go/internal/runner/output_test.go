package runner

import (
	"fmt"
	"strings"
	"testing"
)

func TestFormatExecutionEventFormatsText(t *testing.T) {
	raw := `{"type":"text","part":{"text":"I will implement the feature now."}}`
	result := FormatExecutionEvent("stdout", raw)
	if result != "I will implement the feature now." {
		t.Fatalf("expected text content, got %q", result)
	}
}

func TestFormatExecutionEventFormatsToolUse(t *testing.T) {
	raw := `{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"src/app.ts"}}}}`
	result := FormatExecutionEvent("stdout", raw)
	if !strings.Contains(result, "src/app.ts") {
		t.Fatalf("expected file path in output, got %q", result)
	}
}

func TestFormatExecutionEventFormatsToolResult(t *testing.T) {
	raw := `{"type":"tool_result","part":{"tool":"grep","state":{"status":"completed","output":{"matches":3}}}}`
	result := FormatExecutionEvent("stdout", raw)
	if !strings.Contains(result, "grep") {
		t.Fatalf("expected tool name in output, got %q", result)
	}
	if !strings.Contains(result, "3 matches") {
		t.Fatalf("expected match count in output, got %q", result)
	}
}

func TestFormatExecutionEventPassthroughNonJSON(t *testing.T) {
	result := FormatExecutionEvent("stdout", "just plain text")
	if result != "just plain text" {
		t.Fatalf("expected plain text passthrough, got %q", result)
	}
}

func TestFormatExecutionEventSkipsEmpty(t *testing.T) {
	result := FormatExecutionEvent("stdout", "  ")
	if result != "" {
		t.Fatalf("expected empty for whitespace, got %q", result)
	}
}

func TestFormatToolUseEventRead(t *testing.T) {
	part := map[string]interface{}{
		"tool": "read",
		"state": map[string]interface{}{
			"input": map[string]interface{}{
				"file": "src/app.ts",
			},
		},
	}
	result := formatToolUseEvent(part)
	if !strings.Contains(result, "src/app.ts") {
		t.Fatalf("expected file path, got %q", result)
	}
}

func TestFormatToolUseEventBash(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"input": map[string]interface{}{
				"command": "npm test",
			},
		},
	}
	result := formatToolUseEvent(part)
	if !strings.Contains(result, "npm test") {
		t.Fatalf("expected command, got %q", result)
	}
}

func TestFormatToolUseEventGrep(t *testing.T) {
	part := map[string]interface{}{
		"tool": "grep",
		"state": map[string]interface{}{
			"input": map[string]interface{}{
				"pattern": "gitPolicy",
				"path":    "src/",
			},
		},
	}
	result := formatToolUseEvent(part)
	if !strings.Contains(result, "gitPolicy") {
		t.Fatalf("expected pattern, got %q", result)
	}
	if !strings.Contains(result, "src/") {
		t.Fatalf("expected path, got %q", result)
	}
}

func TestFormatToolUseEventFallback(t *testing.T) {
	part := map[string]interface{}{
		"tool": "custom_tool",
		"state": map[string]interface{}{
			"input": map[string]interface{}{
				"key": "value",
			},
		},
	}
	result := formatToolUseEvent(part)
	if !strings.Contains(result, "custom_tool") && !strings.Contains(result, "key") {
		t.Fatalf("expected tool name or input, got %q", result)
	}
}

func TestFormatToolResultEventSuccess(t *testing.T) {
	part := map[string]interface{}{
		"tool": "read",
		"state": map[string]interface{}{
			"status": "completed",
			"output": map[string]interface{}{
				"message": "File read successfully",
			},
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "read") {
		t.Fatalf("expected tool name, got %q", result)
	}
}

func TestFormatToolResultEventError(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"status": "error",
			"output": map[string]interface{}{
				"error": "command not found",
			},
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "✗") {
		t.Fatalf("expected ✗ marker in output, got %q", result)
	}
	if !strings.Contains(result, "command not found") {
		t.Fatalf("expected error message, got %q", result)
	}
}

func TestFormatToolResultEventGrepMatches(t *testing.T) {
	part := map[string]interface{}{
		"tool": "grep",
		"state": map[string]interface{}{
			"status": "completed",
			"output": map[string]interface{}{
				"matches": float64(5),
				"files":   float64(2),
			},
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "✓") {
		t.Fatalf("expected ✓ marker, got %q", result)
	}
	if !strings.Contains(result, "5 matches in 2 files") {
		t.Fatalf("expected match summary, got %q", result)
	}
}

func TestFormatToolResultEventBashExitCode(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"status": "completed",
			"output": map[string]interface{}{
				"exitCode": float64(1),
				"stderr":   "permission denied",
			},
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "bash") {
		t.Fatalf("expected tool name, got %q", result)
	}
}

func TestFormatToolResultEventBashStdout(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"status": "completed",
			"output": map[string]interface{}{
				"exitCode": float64(0),
				"stdout":   "All tests passed",
			},
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "All tests passed") {
		t.Fatalf("expected stdout in output, got %q", result)
	}
}

func TestFormatToolResultEventNoState(t *testing.T) {
	part := map[string]interface{}{
		"tool": "unknown",
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "◊") {
		t.Fatalf("expected ◊ marker, got %q", result)
	}
	if !strings.Contains(result, "unknown") {
		t.Fatalf("expected tool name, got %q", result)
	}
}

func TestSummarizeToolOutputGrep(t *testing.T) {
	output := map[string]interface{}{"matches": float64(10), "files": float64(3)}
	result := summarizeToolOutput("grep", output)
	if result != "10 matches in 3 files" {
		t.Fatalf("expected grep summary, got %q", result)
	}
}

func TestSummarizeToolOutputGrepNoMatches(t *testing.T) {
	output := map[string]interface{}{"matches": float64(0)}
	result := summarizeToolOutput("grep", output)
	if result != "no matches" {
		t.Fatalf("expected no matches, got %q", result)
	}
}

func TestSummarizeToolOutputBashExitCode(t *testing.T) {
	output := map[string]interface{}{"exitCode": float64(1)}
	result := summarizeToolOutput("bash", output)
	if !strings.Contains(result, "exit code 1") {
		t.Fatalf("expected exit code, got %q", result)
	}
}

func TestSummarizeToolOutputGlobWithCount(t *testing.T) {
	output := map[string]interface{}{"count": float64(42)}
	result := summarizeToolOutput("glob", output)
	if result != "42 items" {
		t.Fatalf("expected item count, got %q", result)
	}
}

func TestSummarizeToolOutputReadWithMessage(t *testing.T) {
	output := map[string]interface{}{"message": "Done"}
	result := summarizeToolOutput("read", output)
	if result != "Done" {
		t.Fatalf("expected message, got %q", result)
	}
}

func TestSummarizeToolOutputReadWithPath(t *testing.T) {
	output := map[string]interface{}{"path": "src/file.ts"}
	result := summarizeToolOutput("read", output)
	if result != "src/file.ts" {
		t.Fatalf("expected path, got %q", result)
	}
}

func TestSummarizeToolOutputFallback(t *testing.T) {
	output := map[string]interface{}{"custom": "data"}
	result := summarizeToolOutput("custom_tool", output)
	if !strings.Contains(result, "custom") {
		t.Fatalf("expected JSON fallback, got %q", result)
	}
}

func TestExtractErrorMessageFromError(t *testing.T) {
	output := map[string]interface{}{"error": "file not found"}
	result := extractErrorMessage(output)
	if result != "file not found" {
		t.Fatalf("expected error message, got %q", result)
	}
}

func TestExtractErrorMessageFromStderr(t *testing.T) {
	output := map[string]interface{}{"stderr": "permission denied"}
	result := extractErrorMessage(output)
	if result != "permission denied" {
		t.Fatalf("expected stderr message, got %q", result)
	}
}

func TestExtractErrorMessageNil(t *testing.T) {
	result := extractErrorMessage(nil)
	if result != "" {
		t.Fatalf("expected empty for nil, got %q", result)
	}
}

func TestTruncateString(t *testing.T) {
	short := "hello"
	if got := truncateString(short, 10); got != "hello" {
		t.Fatalf("expected %q, got %q", short, got)
	}

	long := strings.Repeat("a", 200)
	got := truncateString(long, 100)
	if len(got) != 103 {
		t.Fatalf("expected truncated length 103 (100+...), got %d", len(got))
	}
}

func TestFormatToolInputEdit(t *testing.T) {
	input := map[string]interface{}{
		"file":        "src/main.go",
		"old_string":  "func old()",
		"new_string":  "func new()",
	}
	result := formatToolInput("edit", input)
	if !strings.Contains(result, "src/main.go") {
		t.Fatalf("expected file path, got %q", result)
	}
	if !strings.Contains(result, "func old()") {
		t.Fatalf("expected old_string, got %q", result)
	}
	if !strings.Contains(result, ">>") {
		t.Fatalf("expected new_string marker, got %q", result)
	}
}

func TestFormatToolInputBash(t *testing.T) {
	input := map[string]interface{}{
		"command": "go test ./...",
	}
	result := formatToolInput("bash", input)
	if result != "go test ./..." {
		t.Fatalf("expected command, got %q", result)
	}
}

func TestFormatToolInputUnknown(t *testing.T) {
	input := map[string]interface{}{
		"custom_field": "custom_value",
	}
	result := formatToolInput("mystery_tool", input)
	if !strings.Contains(result, "custom_field") {
		t.Fatalf("expected JSON fallback, got %q", result)
	}
}

func TestFormatToolInputWriteWithPath(t *testing.T) {
	input := map[string]interface{}{
		"path": "/tmp/output.txt",
	}
	result := formatToolInput("write", input)
	if result != "/tmp/output.txt" {
		t.Fatalf("expected path, got %q", result)
	}
}

func TestFormatToolInputGlob(t *testing.T) {
	input := map[string]interface{}{
		"pattern": "**/*.ts",
	}
	result := formatToolInput("glob", input)
	if result != "**/*.ts" {
		t.Fatalf("expected pattern, got %q", result)
	}
}

func TestFormatToolInputEmptyInput(t *testing.T) {
	result := formatToolInput("bash", nil)
	if len(result) > 10 {
		t.Fatalf("expected short/empty output for nil input, got %q", result)
	}
}

func TestParseStreamEventText(t *testing.T) {
	parsed := ParseStreamEvent(`{"type":"text","part":{"text":"Hello world"}}`)
	if parsed.Type != EventText {
		t.Fatalf("expected EventText, got %v", parsed.Type)
	}
	if parsed.Text != "Hello world" {
		t.Fatalf("expected text, got %q", parsed.Text)
	}
}

func TestParseStreamEventToolUse(t *testing.T) {
	parsed := ParseStreamEvent(`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`)
	if parsed.Type != EventToolUse {
		t.Fatalf("expected EventToolUse, got %v", parsed.Type)
	}
	if parsed.ToolName != "read" {
		t.Fatalf("expected tool name read, got %q", parsed.ToolName)
	}
	if parsed.Input == nil {
		t.Fatal("expected input, got nil")
	}
}

func TestParseStreamEventToolResult(t *testing.T) {
	parsed := ParseStreamEvent(`{"type":"tool_result","part":{"tool":"grep","state":{"status":"completed","output":{"matches":3}}}}`)
	if parsed.Type != EventToolResult {
		t.Fatalf("expected EventToolResult, got %v", parsed.Type)
	}
	if parsed.ToolName != "grep" {
		t.Fatalf("expected tool name grep, got %q", parsed.ToolName)
	}
	if parsed.Status != "completed" {
		t.Fatalf("expected status completed, got %q", parsed.Status)
	}
}

func TestParseStreamEventStep(t *testing.T) {
	parsed := ParseStreamEvent(`{"type":"step_start","part":{"type":"step-start"}}`)
	if parsed.Type != EventStepStart {
		t.Fatalf("expected EventStepStart, got %v", parsed.Type)
	}

	parsed = ParseStreamEvent(`{"type":"step_end","part":{}}`)
	if parsed.Type != EventStepEnd {
		t.Fatalf("expected EventStepEnd, got %v", parsed.Type)
	}
}

func TestParseStreamEventResult(t *testing.T) {
	parsed := ParseStreamEvent(`{"type":"result","part":{"text":"Task completed successfully.","summary":"Done"}}`)
	if parsed.Type != EventResult {
		t.Fatalf("expected EventResult, got %v", parsed.Type)
	}
	if parsed.Text != "Task completed successfully." {
		t.Fatalf("expected result text, got %q", parsed.Text)
	}
}

func TestParseStreamEventResultFallsBackToSummary(t *testing.T) {
	parsed := ParseStreamEvent(`{"type":"result","part":{"summary":"Brief summary"}}`)
	if parsed.Text != "Brief summary" {
		t.Fatalf("expected summary, got %q", parsed.Text)
	}
}

func TestParseStreamEventUnknown(t *testing.T) {
	parsed := ParseStreamEvent("not json at all")
	if parsed.Type != EventUnknown {
		t.Fatalf("expected EventUnknown, got %v", parsed.Type)
	}
	if parsed.Text != "not json at all" {
		t.Fatalf("expected raw text, got %q", parsed.Text)
	}
}

func TestParseStreamEventEmpty(t *testing.T) {
	parsed := ParseStreamEvent("")
	if parsed.Type != EventUnknown {
		t.Fatalf("expected EventUnknown for empty, got %v", parsed.Type)
	}
}

func TestFormatStreamEventToolUse(t *testing.T) {
	parsed := &ParsedStreamEvent{
		Type:     EventToolUse,
		ToolName: "read",
		Input:    map[string]interface{}{"file": "src/app.ts"},
	}
	result := FormatStreamEvent(parsed)
	if !strings.Contains(result, "▸") {
		t.Fatalf("expected ▸ marker, got %q", result)
	}
	if !strings.Contains(result, "read") {
		t.Fatalf("expected tool name, got %q", result)
	}
	if !strings.Contains(result, "src/app.ts") {
		t.Fatalf("expected file path, got %q", result)
	}
}

func TestFormatStreamEventToolResult(t *testing.T) {
	parsed := &ParsedStreamEvent{
		Type:     EventToolResult,
		ToolName: "bash",
		Status:   "completed",
		Output:   map[string]interface{}{"stdout": "OK"},
	}
	result := FormatStreamEvent(parsed)
	if !strings.Contains(result, "bash") {
		t.Fatalf("expected tool name, got %q", result)
	}
	if !strings.Contains(result, "✓") {
		t.Fatalf("expected ✓ marker for completed result, got %q", result)
	}
}

func TestExtractReadableOutputIncludesFormattedToolEvents(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"grep","state":{"input":{"pattern":"gitPolicy"}}}}`,
		`{"type":"tool_result","part":{"tool":"grep","state":{"status":"completed","output":{"matches":3}}}}`,
		`{"type":"result","part":{"text":"Finished."}}`,
	}, "\n")

	formatted := ExtractReadableOutput(raw)
	if !strings.Contains(formatted, "Finished.") {
		t.Fatalf("expected result text, got %q", formatted)
	}
	if !strings.Contains(formatted, "grep") {
		t.Fatalf("expected tool name in output, got %q", formatted)
	}
}

func TestExtractReadableOutputTextDedup(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"text","part":{"text":"I will do this."}}`,
		`{"type":"text","part":{"text":"I will do this."}}`,
		`{"type":"text","part":{"text":"Now doing that."}}`,
	}, "\n")

	formatted := ExtractReadableOutput(raw)
	count := strings.Count(formatted, "I will do this.")
	if count > 1 {
		t.Fatalf("expected deduplication, found %d occurrences", count)
	}
}

func TestExtractReadableOutputTruncatesLong(t *testing.T) {
	longText := strings.Repeat("a", 5000)
	raw := longText
	result := ExtractReadableOutput(raw)
	if len(result) > 4500 {
		t.Fatalf("expected truncation, got length %d", len(result))
	}
}

func TestExtractReadableOutputFallbackRaw(t *testing.T) {
	raw := "just plain text output"
	result := ExtractReadableOutput(raw)
	if result != "just plain text output" {
		t.Fatalf("expected raw fallback, got %q", result)
	}
}

func TestFilterReadableTextPartsSkipsShort(t *testing.T) {
	parts := []string{"short", "this is a longer text snippet that passes"}
	result := filterReadableTextParts(parts, "")
	if len(result) != 1 {
		t.Fatalf("expected 1 filtered part, got %d", len(result))
	}
	if result[0] != parts[1] {
		t.Fatalf("expected longer part, got %q", result[0])
	}
}

func TestFilterReadableTextPartsSkipsDuplicateOfResult(t *testing.T) {
	parts := []string{"Final answer text here", "some intermediate text"}
	result := filterReadableTextParts(parts, "Final answer text here")
	if len(result) != 1 {
		t.Fatalf("expected 1 part (duplicate removed), got %d", len(result))
	}
}

func TestFilterReadableTextPartsSkipsNoise(t *testing.T) {
	parts := []string{
		"Running opencode...",
		"Session: abc123",
		"This is real content from the agent",
	}
	result := filterReadableTextParts(parts, "")
	if len(result) != 1 {
		t.Fatalf("expected 1 real content part, got %d", len(result))
	}
}

func TestFormatExecutionCommentSuccess(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"src/main.ts"}}}}`,
		`{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"npm test"}}}}`,
		`{"type":"result","part":{"text":"All tests pass. Feature implemented."}}`,
	}, "\n")

	comment := FormatExecutionComment("builder", "opencode", true, 120, raw, 0)
	if !strings.Contains(comment, "Execution Complete") {
		t.Fatalf("expected success header, got %s", comment)
	}
	if !strings.Contains(comment, "builder") {
		t.Fatalf("expected agent name, got %s", comment)
	}
	if !strings.Contains(comment, "opencode") {
		t.Fatalf("expected tool name, got %s", comment)
	}
	if !strings.Contains(comment, "2m 0s") {
		t.Fatalf("expected formatted duration, got %s", comment)
	}
	if !strings.Contains(comment, "read") {
		t.Fatalf("expected tool read in tools list, got %s", comment)
	}
	if !strings.Contains(comment, "bash") {
		t.Fatalf("expected tool bash in tools list, got %s", comment)
	}
}

func TestFormatExecutionCommentFailure(t *testing.T) {
	comment := FormatExecutionComment("builder", "claude", false, 60, "error output", 1)
	if !strings.Contains(comment, "Execution Failed") {
		t.Fatalf("expected failure header, got %s", comment)
	}
	if !strings.Contains(comment, "Exit Code") {
		t.Fatalf("expected exit code, got %s", comment)
	}
}

func TestFormatExecutionCommentHasStructuredSections(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"grep","state":{"input":{"pattern":"TODO"}}}}`,
		`{"type":"tool_use","part":{"tool":"edit","state":{"input":{"file":"src/fix.ts","old_string":"bug","new_string":"fix"}}}}`,
		`{"type":"result","part":{"text":"Fixed the bug."}}`,
	}, "\n")

	comment := FormatExecutionComment("dev", "opencode", true, 45, raw, 0)
	if !strings.Contains(comment, "### Summary") {
		t.Fatalf("expected Summary section, got %s", comment)
	}
	if !strings.Contains(comment, "### Tools Used") {
		t.Fatalf("expected Tools Used section, got %s", comment)
	}
	if !strings.Contains(comment, "<details>") {
		t.Fatalf("expected Stream details section, got %s", comment)
	}
}

func TestFormatExecutionCommentNoExitCodeOnSuccess(t *testing.T) {
	comment := FormatExecutionComment("dev", "opencode", true, 10, "done", 0)
	if !strings.Contains(comment, "Execution Complete") {
		t.Fatalf("expected success header, got %s", comment)
	}
	if strings.Contains(comment, "Exit Code") {
		t.Fatalf("expected no exit code on success, got %s", comment)
	}
}

func TestFormatExecutionCommentEmptyOutput(t *testing.T) {
	comment := FormatExecutionComment("dev", "opencode", true, 5, "", 0)
	if !strings.Contains(comment, "Execution Complete") {
		t.Fatalf("expected success header even with empty output, got %s", comment)
	}
}

func TestExtractCommentToolsDeduplicates(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"b.ts"}}}}`,
		`{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"ls"}}}}`,
	}, "\n")

	tools := extractCommentTools(raw)
	if len(tools) != 2 {
		t.Fatalf("expected 2 unique tools, got %d: %v", len(tools), tools)
	}
	if tools[0] != "read" || tools[1] != "bash" {
		t.Fatalf("expected [read, bash], got %v", tools)
	}
}

func TestFormatStreamEventStep(t *testing.T) {
	parsed := &ParsedStreamEvent{Type: EventStepStart}
	result := FormatStreamEvent(parsed)
	if result != "── step ──" {
		t.Fatalf("expected step start format, got %q", result)
	}

	parsed = &ParsedStreamEvent{Type: EventStepEnd}
	result = FormatStreamEvent(parsed)
	if result != "── step ✓ ──" {
		t.Fatalf("expected step end format, got %q", result)
	}
}

func TestFormatStreamEventResult(t *testing.T) {
	parsed := &ParsedStreamEvent{Type: EventResult, Text: "All done."}
	result := FormatStreamEvent(parsed)
	if !strings.Contains(result, "✓") {
		t.Fatalf("expected ✓ marker for result, got %q", result)
	}
	if !strings.Contains(result, "All done.") {
		t.Fatalf("expected result text, got %q", result)
	}
}

func TestExtractCommentStreamBodyFiltersShortText(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"text","part":{"text":"hi"}}`,
		`{"type":"text","part":{"text":"This is a meaningful text with enough length to pass"}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"result","part":{"text":"Done"}}`,
	}, "\n")

	body := extractCommentStreamBody(raw)
	if strings.Contains(body, "\"hi\"") {
		t.Fatalf("expected short text filtered out, got %q", body)
	}
	if !strings.Contains(body, "meaningful") {
		t.Fatalf("expected long text kept, got %q", body)
	}
	if !strings.Contains(body, "read") {
		t.Fatalf("expected tool use kept, got %q", body)
	}
	if !strings.Contains(body, "Done") {
		t.Fatalf("expected result kept, got %q", body)
	}
}

func TestCompactJSON(t *testing.T) {
	val := map[string]interface{}{"key": "value"}
	result := compactJSON(val)
	if !strings.Contains(result, "key") {
		t.Fatalf("expected key in compact JSON, got %q", result)
	}
}

func TestCompactJSONTruncation(t *testing.T) {
	longVal := map[string]interface{}{"data": strings.Repeat("x", 500)}
	result := compactJSON(longVal)
	if !strings.HasSuffix(result, "...") {
		t.Fatalf("expected truncation, got length %d", len(result))
	}
}

func TestParseExecutionResultV1ExtractsStructuredBlock(t *testing.T) {
	raw := strings.Join([]string{
		"Implemented the requested changes.",
		SummaryStartMarker,
		"Version: v1",
		"Summary: Implemented the requested changes.",
		SummaryEndMarker,
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
	if strings.Contains(stripped, SummaryStartMarker) || strings.Contains(stripped, SummaryEndMarker) {
		t.Fatalf("expected summary block to be stripped, got %q", stripped)
	}
}

func TestParseAgentSummaryDetailedExtractsSummaryBlock(t *testing.T) {
	raw := strings.Join([]string{
		"Human intro that should be ignored.",
		SummaryStartMarker,
		"Version: v1",
		"Summary: Implemented summary-first output.",
		"What changed:",
		"- Updated the worker to read agent summaries.",
		"Decisions:",
		"- Kept ExecutionResultV1 as the canonical persisted schema.",
		"Risks:",
		"- Checks are still partially derived.",
		"Followups:",
		"- Instrument usedSkills from tool events.",
		SummaryEndMarker,
	}, "\n")

	summary, meta, err := ParseAgentSummaryDetailed(raw)
	if err != nil {
		t.Fatalf("expected agent summary parse to succeed, got %v", err)
	}
	if summary == nil {
		t.Fatal("expected parsed agent summary")
	}
	if summary.Summary != "Implemented summary-first output." {
		t.Fatalf("unexpected summary: %#v", summary)
	}
	if len(summary.WhatChanged) != 1 || summary.WhatChanged[0] != "Updated the worker to read agent summaries." {
		t.Fatalf("unexpected whatChanged: %#v", summary.WhatChanged)
	}
	if len(summary.Decisions) != 1 || summary.Decisions[0] != "Kept ExecutionResultV1 as the canonical persisted schema." {
		t.Fatalf("unexpected decisions: %#v", summary.Decisions)
	}
	if len(summary.Risks) != 1 || summary.Risks[0] != "Checks are still partially derived." {
		t.Fatalf("unexpected risks: %#v", summary.Risks)
	}
	if len(summary.Followups) != 1 || summary.Followups[0] != "Instrument usedSkills from tool events." {
		t.Fatalf("unexpected followups: %#v", summary.Followups)
	}
	if meta.Source != StructuredResultSourceSummary {
		t.Fatalf("expected summary source, got %#v", meta)
	}
	if !meta.HadMarkers {
		t.Fatalf("expected summary markers metadata, got %#v", meta)
	}
}

func TestSerializeExecutionResultV1WrapsMarkers(t *testing.T) {
	serialized := SerializeExecutionResultV1(BuildExecutionResultV1(true, "Done", 0))
	if !strings.Contains(serialized, ResultStartMarker) || !strings.Contains(serialized, ResultEndMarker) {
		t.Fatalf("expected serialized structured result markers, got %q", serialized)
	}
	parsed, err := ParseExecutionResultV1(serialized)
	if err != nil {
		t.Fatalf("expected serialized structured result to parse, got %v", err)
	}
	if parsed.Status != "success" {
		t.Fatalf("expected success status, got %#v", parsed)
	}
}

func TestParseExecutionResultV1DetailedRepairsTrimmedJSONBlock(t *testing.T) {
	raw := strings.Join([]string{
		"Implemented the requested changes.",
		ResultStartMarker,
		"```json",
		`{"schemaVersion":"v1","status":"success","summary":"Done","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
		"``` trailing text that should be ignored",
		ResultEndMarker,
	}, "\n")

	result, meta, err := ParseExecutionResultV1Detailed(raw)
	if err != nil {
		t.Fatalf("expected parse to succeed after repair, got %v", err)
	}
	if result == nil || result.Summary != "Done" {
		t.Fatalf("expected parsed summary, got %#v", result)
	}
	if meta.Source != StructuredResultSourceRepaired {
		t.Fatalf("expected repaired source, got %#v", meta)
	}
	if !meta.RepairApplied {
		t.Fatalf("expected repairApplied=true, got %#v", meta)
	}
}

func TestBuildExecutionResultV1WithMetaFallsBackToDerived(t *testing.T) {
	result, meta := BuildExecutionResultV1WithMeta(true, "plain output without markers", 0)
	if summary, _ := result["summary"].(string); summary != "plain output without markers" {
		t.Fatalf("expected derived summary, got %#v", result)
	}
	if meta.Source != StructuredResultSourceDerived {
		t.Fatalf("expected derived source, got %#v", meta)
	}
	if meta.HadMarkers {
		t.Fatalf("expected hadMarkers=false, got %#v", meta)
	}
}

func TestBuildExecutionResultV1WithContextAndMetaUsesTouchedFilesForDerivedFallback(t *testing.T) {
	result, meta := BuildExecutionResultV1WithContextAndMeta(true, "", 0, ExecutionResultDerivedContext{
		FilesTouched: []string{"src/app/page.tsx", "src/components/card.tsx"},
	})

	if meta.Source != StructuredResultSourceDerived {
		t.Fatalf("expected derived source, got %#v", meta)
	}
	files, ok := result["filesTouched"].([]interface{})
	if !ok || len(files) != 2 {
		t.Fatalf("expected filesTouched to be populated, got %#v", result["filesTouched"])
	}
	summary, _ := result["summary"].(string)
	if !strings.Contains(summary, "Updated 2 files") {
		t.Fatalf("expected touched-files summary, got %q", summary)
	}
	whatChanged, ok := result["whatChanged"].([]interface{})
	if !ok || len(whatChanged) == 0 {
		t.Fatalf("expected whatChanged fallback entry, got %#v", result["whatChanged"])
	}
}

func TestBuildExecutionResultV1WithContextAndMetaUsesAgentSummaryWhenJSONMissing(t *testing.T) {
	raw := strings.Join([]string{
		SummaryStartMarker,
		"Version: v1",
		"Summary: Implemented summary-first fallback.",
		"What changed:",
		"- Updated worker finalization to persist agentSummary metadata.",
		"Decisions:",
		"- Kept JSON output as a compatibility path during rollout.",
		SummaryEndMarker,
	}, "\n")

	result, meta := BuildExecutionResultV1WithContextAndMeta(true, raw, 0, ExecutionResultDerivedContext{
		FilesTouched: []string{"runner-go/internal/orchestrator/worker.go"},
	})

	if meta.Source != StructuredResultSourceSummary {
		t.Fatalf("expected summary source, got %#v", meta)
	}
	if !meta.HadMarkers {
		t.Fatalf("expected summary markers, got %#v", meta)
	}
	if summary, _ := result["summary"].(string); summary != "Implemented summary-first fallback." {
		t.Fatalf("unexpected summary: %#v", result)
	}
	whatChanged, ok := result["whatChanged"].([]interface{})
	if !ok || len(whatChanged) != 1 || whatChanged[0] != "Updated worker finalization to persist agentSummary metadata." {
		t.Fatalf("unexpected whatChanged: %#v", result["whatChanged"])
	}
	decisions, ok := result["decisions"].([]interface{})
	if !ok || len(decisions) != 1 || decisions[0] != "Kept JSON output as a compatibility path during rollout." {
		t.Fatalf("unexpected decisions: %#v", result["decisions"])
	}
	filesTouched, ok := result["filesTouched"].([]interface{})
	if !ok || len(filesTouched) != 1 || filesTouched[0] != "runner-go/internal/orchestrator/worker.go" {
		t.Fatalf("expected filesTouched from runner context, got %#v", result["filesTouched"])
	}
}

func TestBuildExecutionResultV1WithMetaPreservesParseErrorOnIrrecoverableJSON(t *testing.T) {
	raw := strings.Join([]string{
		"Implemented the requested changes.",
		ResultStartMarker,
		`{"schemaVersion":`,
		ResultEndMarker,
	}, "\n")

	result, meta := BuildExecutionResultV1WithMeta(false, raw, 1)
	if meta.Source != StructuredResultSourceDerived {
		t.Fatalf("expected derived source, got %#v", meta)
	}
	if !meta.HadMarkers {
		t.Fatalf("expected hadMarkers=true, got %#v", meta)
	}
	if meta.ParseError == "" {
		t.Fatalf("expected parseError to be preserved, got %#v", meta)
	}
	if summary, _ := result["summary"].(string); summary == "" {
		t.Fatalf("expected fallback summary, got %#v", result)
	}
}

func TestFormatExecutionEventFormatsJSONLToolUse(t *testing.T) {
	raw := `{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"src/app.ts"}}}}`
	formatted := FormatExecutionEvent("stdout", raw)
	if !strings.Contains(formatted, "src/app.ts") {
		t.Fatalf("expected file path in formatted output, got %q", formatted)
	}
	if !strings.Contains(formatted, "read") {
		t.Fatalf("expected tool name in formatted output, got %q", formatted)
	}
}

func TestFormatToolResultEventNoOutputJustStatus(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"status": "completed",
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "◊") {
		t.Fatalf("expected ◊ marker for status-only result, got %q", result)
	}
	if !strings.Contains(result, "completed") {
		t.Fatalf("expected status, got %q", result)
	}
}

func TestFormatDuration(t *testing.T) {
	tests := []struct {
		seconds  float64
		expected string
	}{
		{0.5, "<1s"},
		{1, "1s"},
		{45, "45s"},
		{60, "1m 0s"},
		{90, "1m 30s"},
		{120, "2m 0s"},
		{3661, "61m 1s"},
	}
	for _, tt := range tests {
		got := FormatDuration(tt.seconds)
		if got != tt.expected {
			t.Fatalf("FormatDuration(%v) = %q, want %q", tt.seconds, got, tt.expected)
		}
	}
}

func TestFormatStreamForDisplay(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"main.go"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`,
		`{"type":"text","part":{"text":"Hello world"}}`,
		`{"type":"result","part":{"text":"Done"}}`,
	}, "\n")

	display := FormatStreamForDisplay(raw)
	if !strings.Contains(display, "── Step") {
		t.Fatalf("expected step marker, got %q", display)
	}
	if !strings.Contains(display, "▸ read  main.go") {
		t.Fatalf("expected tool use, got %q", display)
	}
	if !strings.Contains(display, "✓ read") {
		t.Fatalf("expected tool result, got %q", display)
	}
	if !strings.Contains(display, "Hello world") {
		t.Fatalf("expected text, got %q", display)
	}
	if !strings.Contains(display, "✓ Done") {
		t.Fatalf("expected result, got %q", display)
	}
}

func TestFormatStreamForDisplayEmpty(t *testing.T) {
	display := FormatStreamForDisplay("")
	if display != "" {
		t.Fatalf("expected empty, got %q", display)
	}
}

func TestFormatStreamForDisplayNonJSON(t *testing.T) {
	display := FormatStreamForDisplay("plain text\nmore text")
	if !strings.Contains(display, "plain text") {
		t.Fatalf("expected plain text passthrough, got %q", display)
	}
}

func TestFormatToolResultEventSuccessMarker(t *testing.T) {
	part := map[string]interface{}{
		"tool": "read",
		"state": map[string]interface{}{
			"status": "completed",
			"output": map[string]interface{}{
				"message": "File read successfully",
			},
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "✓") {
		t.Fatalf("expected ✓ success marker, got %q", result)
	}
	if !strings.Contains(result, "read") {
		t.Fatalf("expected tool name, got %q", result)
	}
}

func TestFormatToolResultEventStatusOnly(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"status": "running",
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "◊") {
		t.Fatalf("expected ◊ marker for unknown status, got %q", result)
	}
	if !strings.Contains(result, "running") {
		t.Fatalf("expected status text, got %q", result)
	}
}

func TestFormatExecutionEventStepStart(t *testing.T) {
	raw := `{"type":"step_start","part":{"type":"step-start"}}`
	result := FormatExecutionEvent("stdout", raw)
	if result != "── step ──" {
		t.Fatalf("expected step start format, got %q", result)
	}
}

func TestFormatExecutionEventStepEnd(t *testing.T) {
	raw := `{"type":"step_end","part":{}}`
	result := FormatExecutionEvent("stdout", raw)
	if result != "── step ✓ ──" {
		t.Fatalf("expected step end format, got %q", result)
	}
}

func TestFormatExecutionEventResult(t *testing.T) {
	raw := `{"type":"result","part":{"text":"All done!"}}`
	result := FormatExecutionEvent("stdout", raw)
	if !strings.Contains(result, "✓") {
		t.Fatalf("expected ✓ marker for result, got %q", result)
	}
	if !strings.Contains(result, "All done!") {
		t.Fatalf("expected result text, got %q", result)
	}
}

func TestCommentStreamBodyIncludesSteps(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"step_end","part":{}}`,
	}, "\n")
	body := extractCommentStreamBody(raw)
	if !strings.Contains(body, "── step ──") {
		t.Fatalf("expected step start in stream body, got %q", body)
	}
	if !strings.Contains(body, "── step ✓ ──") {
		t.Fatalf("expected step end in stream body, got %q", body)
	}
}

func TestCommentUsesDetailsTag(t *testing.T) {
	raw := `{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"x.ts"}}}}`
	comment := FormatExecutionComment("dev", "opencode", true, 30, raw, 0)
	if !strings.Contains(comment, "<details>") {
		t.Fatalf("expected <details> tag for stream, got %s", comment)
	}
	if !strings.Contains(comment, "Full Output") {
		t.Fatalf("expected Full Output summary, got %s", comment)
	}
}

func TestFormatExecutionCommentPrefersAgentSummarySummary(t *testing.T) {
	raw := strings.Join([]string{
		SummaryStartMarker,
		"Version: v1",
		"Summary: Human summary from agent block.",
		"What changed:",
		"- Changed runner parsing.",
		SummaryEndMarker,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"x.ts"}}}}`,
	}, "\n")

	comment := FormatExecutionComment("dev", "opencode", true, 30, raw, 0)
	if !strings.Contains(comment, "Human summary from agent block.") {
		t.Fatalf("expected comment summary to use agent summary, got %s", comment)
	}
	if strings.Contains(comment, SummaryStartMarker) || strings.Contains(comment, SummaryEndMarker) {
		t.Fatalf("expected raw summary markers to be stripped from comment, got %s", comment)
	}
}

func TestFormatExecutionCommentPrefersStructuredResultOverAgentSummary(t *testing.T) {
	raw := strings.Join([]string{
		SummaryStartMarker,
		"Version: v1",
		"Summary: Stale summary block.",
		SummaryEndMarker,
		ResultStartMarker,
		`{"schemaVersion":"v1","status":"success","summary":"Canonical JSON summary.","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
		ResultEndMarker,
	}, "\n")

	comment := FormatExecutionComment("dev", "opencode", true, 30, raw, 0)
	if !strings.Contains(comment, "Canonical JSON summary.") {
		t.Fatalf("expected canonical JSON summary in comment, got %s", comment)
	}
	if strings.Contains(comment, "Stale summary block.") {
		t.Fatalf("expected summary block not to override structured result, got %s", comment)
	}
}

func TestFormatExecutionCommentFailureIgnoresAgentSummaryBlock(t *testing.T) {
	raw := strings.Join([]string{
		SummaryStartMarker,
		"Version: v1",
		"Summary: Stale success summary.",
		SummaryEndMarker,
		"Execution failed with exit code 1.",
	}, "\n")

	comment := FormatExecutionComment("dev", "opencode", false, 30, raw, 1)
	if strings.Contains(comment, "Stale success summary.") {
		t.Fatalf("expected failure comment to ignore agent summary block, got %s", comment)
	}
	if !strings.Contains(comment, "Execution failed with exit code 1.") {
		t.Fatalf("expected failure comment to keep failure summary, got %s", comment)
	}
}

func TestFormatStreamReadableBasicFlow(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"main.go"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`,
		`{"type":"text","part":{"text":"I will now implement the feature."}}`,
		`{"type":"step_end","part":{}}`,
		`{"type":"result","part":{"text":"Done implementing."}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "── Step") {
		t.Fatalf("expected step start header, got %q", result)
	}
	if !strings.Contains(result, "Step") && !strings.Contains(result, "✓ ──") {
		t.Fatalf("expected step end marker, got %q", result)
	}
	if !strings.Contains(result, "▸ read") {
		t.Fatalf("expected tool use line, got %q", result)
	}
	if !strings.Contains(result, "✓ read") {
		t.Fatalf("expected tool result line, got %q", result)
	}
	if !strings.Contains(result, "implement the feature") {
		t.Fatalf("expected text content, got %q", result)
	}
	if !strings.Contains(result, "✓ Done implementing") {
		t.Fatalf("expected result line, got %q", result)
	}
}

func TestFormatStreamReadableEmpty(t *testing.T) {
	result := FormatStreamReadable("")
	if result != "" {
		t.Fatalf("expected empty for empty input, got %q", result)
	}
}

func TestFormatStreamReadableNonJSONLines(t *testing.T) {
	raw := "plain text line\nanother line"
	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "plain text line") {
		t.Fatalf("expected plain text passthrough, got %q", result)
	}
	if !strings.Contains(result, "another line") {
		t.Fatalf("expected second plain text line, got %q", result)
	}
}

func TestFormatStreamReadableStepIndentation(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"ls"}}}}`,
		`{"type":"step_end","part":{}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "▸ bash") {
		t.Fatalf("expected tool use, got %q", result)
	}

	lines := strings.Split(result, "\n")
	var stepAtZero, toolIndented bool
	for _, line := range lines {
		if strings.Contains(line, "── Step") && !strings.Contains(line, "✓") {
			if strings.HasPrefix(line, "── Step") {
				stepAtZero = true
			}
		}
		if strings.Contains(line, "▸ bash") {
			if strings.HasPrefix(line, "  ▸ bash") {
				toolIndented = true
			}
		}
	}
	if !stepAtZero || !toolIndented {
		t.Fatalf("expected step at zero indent, tool indented, got:\n%s", result)
	}
}

func TestFormatStreamReadableMultipleSteps(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`,
		`{"type":"step_end","part":{}}`,
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"npm test"}}}}`,
		`{"type":"tool_result","part":{"tool":"bash","state":{"status":"completed","output":{"exitCode":0,"stdout":"All tests passed"}}}}`,
		`{"type":"step_end","part":{}}`,
		`{"type":"result","part":{"text":"All done."}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	stepCount := strings.Count(result, "── Step")
	if stepCount < 4 {
		t.Fatalf("expected at least 4 step markers (2 start + 2 end), got %d in:\n%s", stepCount, result)
	}
	if !strings.Contains(result, "✓ All done") {
		t.Fatalf("expected result line, got %q", result)
	}
}

func TestFormatStreamReadableToolUseAndResultPairing(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"grep","state":{"input":{"pattern":"TODO","path":"src/"}}}}`,
		`{"type":"tool_result","part":{"tool":"grep","state":{"status":"completed","output":{"matches":5,"files":3}}}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "▸ grep") {
		t.Fatalf("expected grep tool use, got %q", result)
	}
	if !strings.Contains(result, "5 matches in 3 files") {
		t.Fatalf("expected grep result summary, got %q", result)
	}
	if !strings.Contains(result, "✓ grep") {
		t.Fatalf("expected grep success marker, got %q", result)
	}
}

func TestFormatStreamReadableTextAfterToolUseGetsNewline(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"x.ts"}}}}`,
		`{"type":"text","part":{"text":"Now I'll edit the file."}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "▸ read") {
		t.Fatalf("expected tool use line, got %q", result)
	}
	if !strings.Contains(result, "Now I'll edit the file.") {
		t.Fatalf("expected text content, got %q", result)
	}
}

func TestFormatStreamReadableErrorResult(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"bad_cmd"}}}}`,
		`{"type":"tool_result","part":{"tool":"bash","state":{"status":"error","output":{"error":"command not found"}}}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "✗ bash") {
		t.Fatalf("expected error marker, got %q", result)
	}
	if !strings.Contains(result, "command not found") {
		t.Fatalf("expected error message, got %q", result)
	}
}

func TestFormatStreamForDisplayUsesFormatStreamReadable(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"main.go"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`,
		`{"type":"step_end","part":{}}`,
	}, "\n")

	display := FormatStreamForDisplay(raw)
	if !strings.Contains(display, "── Step") {
		t.Fatalf("expected step marker, got %q", display)
	}
	if !strings.Contains(display, "▸ read") {
		t.Fatalf("expected tool use, got %q", display)
	}
	if !strings.Contains(display, "✓ ──") {
		t.Fatalf("expected step end, got %q", display)
	}
}

func TestFormatStreamForDisplayEmptyStillWorks(t *testing.T) {
	display := FormatStreamForDisplay("")
	if display != "" {
		t.Fatalf("expected empty for empty input, got %q", display)
	}
}

func TestFormatStreamForDisplayNonJSONStillWorks(t *testing.T) {
	display := FormatStreamForDisplay("plain text\nmore text")
	if !strings.Contains(display, "plain text") {
		t.Fatalf("expected plain text passthrough, got %q", display)
	}
}

func TestCommentStreamBodyUsesFormatStreamReadable(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`,
		`{"type":"step_end","part":{}}`,
		`{"type":"result","part":{"text":"Completed."}}`,
	}, "\n")

	comment := FormatExecutionComment("dev", "opencode", true, 30, raw, 0)
	if !strings.Contains(comment, "<details>") {
		t.Fatalf("expected <details> tag, got %s", comment)
	}
	if !strings.Contains(comment, "── Step") {
		t.Fatalf("expected step markers in stream body, got %s", comment)
	}
	if !strings.Contains(comment, "▸ read") {
		t.Fatalf("expected tool use in stream body, got %s", comment)
	}
	if !strings.Contains(comment, "✓ Completed") {
		t.Fatalf("expected result in stream body, got %s", comment)
	}
}

func TestCommentStreamBodyTruncationIncreased(t *testing.T) {
	var events []string
	events = append(events, `{"type":"step_start","part":{"type":"step-start"}}`)
	for i := 0; i < 50; i++ {
		events = append(events, fmt.Sprintf(`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"file_%d.ts"}}}}`, i))
		events = append(events, `{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`)
	}
	events = append(events, `{"type":"step_end","part":{}}`)
	raw := strings.Join(events, "\n")

	comment := FormatExecutionComment("dev", "opencode", true, 30, raw, 0)
	streamSection := comment[strings.Index(comment, "<details>"):]
	if len(streamSection) > 9000 {
		t.Fatalf("expected stream section to be bounded, got length %d", len(streamSection))
	}
	if strings.Contains(streamSection, "output truncated") {
		t.Logf("truncation applied as expected for large output")
	}
}

func TestExtractCommentSummarySkipsShortLines(t *testing.T) {
	readable := "hi\n\nThis is a meaningful summary that is long enough"
	summary := extractCommentSummary(readable)
	if !strings.Contains(summary, "meaningful summary") {
		t.Fatalf("expected summary to skip short line, got %q", summary)
	}
}

func TestFormatStreamReadableNestedSteps(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"config.yaml"}}}}`,
		`{"type":"step_end","part":{}}`,
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"text","part":{"text":"Analyzing configuration file for potential issues."}}`,
		`{"type":"step_end","part":{}}`,
		`{"type":"result","part":{"text":"Configuration is valid."}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if strings.Count(result, "── Step") < 4 {
		t.Fatalf("expected at least 4 step markers (2 start + 2 end), got:\n%s", result)
	}
	if !strings.Contains(result, "Analyzing configuration") {
		t.Fatalf("expected text content in output, got:\n%s", result)
	}
}

func TestFormatStreamReadableConsecutiveTextEvents(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"text","part":{"text":"First part of thought."}}`,
		`{"type":"text","part":{"text":"Second part of thought."}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "First part") {
		t.Fatalf("expected first text, got %q", result)
	}
	if !strings.Contains(result, "Second part") {
		t.Fatalf("expected second text, got %q", result)
	}
}

func TestFormatStreamReadableToolResultWithStatusOnly(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"bash","state":{"input":{"command":"echo hi"}}}}`,
		`{"type":"tool_result","part":{"tool":"bash","state":{"status":"running"}}}`,
	}, "\n")

 	result := FormatStreamReadable(raw)
 	if !strings.Contains(result, "▸ bash") {
 		t.Fatalf("expected tool use, got %q", result)
 	}
 	if !strings.Contains(result, "bash") {
 		t.Fatalf("expected tool name in result, got %q", result)
 	}
}

func TestFormatToolInputTaskTool(t *testing.T) {
	input := map[string]interface{}{
		"description":     "Explore codebase structure",
		"subagent_type":   "explore",
		"prompt":          "Explore the codebase at D:\\... (very long prompt)",
	}
	result := formatToolInput("task", input)
	if !strings.Contains(result, "Explore codebase structure") {
		t.Fatalf("expected description, got %q", result)
	}
	if !strings.Contains(result, "[explore]") {
		t.Fatalf("expected subagent type, got %q", result)
	}
	if strings.Contains(result, "prompt") {
		t.Fatalf("should not include full prompt, got %q", result)
	}
}

func TestFormatToolInputWebFetch(t *testing.T) {
	input := map[string]interface{}{
		"url": "https://example.com/api/docs",
	}
	result := formatToolInput("webfetch", input)
	if !strings.Contains(result, "https://example.com") {
		t.Fatalf("expected URL, got %q", result)
	}
}

func TestFormatToolInputFilePathVariant(t *testing.T) {
	input := map[string]interface{}{
		"file_path": "src/components/App.tsx",
	}
	result := formatToolInput("read", input)
	if !strings.Contains(result, "src/components/App.tsx") {
		t.Fatalf("expected file_path variant to work, got %q", result)
	}
}

func TestFormatToolInputFilePathCamelCase(t *testing.T) {
	input := map[string]interface{}{
		"filePath": "src/utils/helper.go",
	}
	result := formatToolInput("edit", input)
	if !strings.Contains(result, "src/utils/helper.go") {
		t.Fatalf("expected filePath variant to work, got %q", result)
	}
}

func TestSummarizeToolOutputTaskWithStringOutput(t *testing.T) {
	output := "task_id: ses_abc123def456\n\n<task_result>\nNow I have a comprehensive understanding.\n\n## Summary\nFixed the bug.\n</task_result>"
	result := summarizeToolOutput("task", output)
	if !strings.Contains(result, "ses_abc123de") {
		t.Fatalf("expected task_id extraction, got %q", result)
	}
}

func TestSummarizeToolOutputTaskWithMapOutput(t *testing.T) {
	output := map[string]interface{}{"task_id": "ses_xyz"}
	result := summarizeToolOutput("task", output)
	if result == "" {
		t.Fatalf("expected non-empty result for map task output, got %q", result)
	}
}

func TestSummarizeStringOutput(t *testing.T) {
	result := summarizeStringOutput("First meaningful line\nSecond line\nThird line")
	if !strings.Contains(result, "First meaningful line") {
		t.Fatalf("expected first meaningful line, got %q", result)
	}
}

func TestSummarizeStringOutputEmpty(t *testing.T) {
	result := summarizeStringOutput("")
	if result != "" {
		t.Fatalf("expected empty for empty input, got %q", result)
	}
}

func TestFirstMeaningfulLine(t *testing.T) {
	text := "\ntask_id: abc\n\n<task_result>\nThis is the real content\n</task_result>"
	result := firstMeaningfulLine(text, 80)
	if result != "This is the real content" {
		t.Fatalf("expected to skip noise, got %q", result)
	}
}

func TestExtractTaskID(t *testing.T) {
	text := "task_id: ses_1d6a5b692ffeuvXHZlcTMWd2Ua\n\nSome output"
	result := extractTaskID(text)
	if !strings.HasPrefix(result, "ses_1d6a5b69") {
		t.Fatalf("expected task ID extraction, got %q", result)
	}
}

func TestExtractTaskIDMissing(t *testing.T) {
	result := extractTaskID("no task id here")
	if result != "" {
		t.Fatalf("expected empty for missing task_id, got %q", result)
	}
}

func TestExtractErrorMessageFromString(t *testing.T) {
	result := extractErrorMessage("Something went wrong with the command")
	if !strings.Contains(result, "Something went wrong") {
		t.Fatalf("expected string error extraction, got %q", result)
	}
}

func TestFormatToolUseEventWithEmbeddedResult(t *testing.T) {
	part := map[string]interface{}{
		"tool": "task",
		"state": map[string]interface{}{
			"status": "completed",
			"input": map[string]interface{}{
				"description":     "Explore codebase",
				"subagent_type":   "explore",
			},
			"output": "task_id: ses_abc123\n\n<task_result>\nProject uses Go with a runner architecture.\n</task_result>",
		},
	}
	result := formatToolUseEvent(part)
	if !strings.Contains(result, "▸ task") {
		t.Fatalf("expected tool use marker, got %q", result)
	}
	if !strings.Contains(result, "Explore codebase") {
		t.Fatalf("expected description, got %q", result)
	}
	if !strings.Contains(result, "ses_abc123") {
		t.Fatalf("expected task_id in output, got %q", result)
	}
}

func TestFormatToolUseEventWithEmbeddedError(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"status": "error",
			"input": map[string]interface{}{
				"command": "npm build",
			},
			"output": map[string]interface{}{
				"error": "build failed",
			},
		},
	}
	result := formatToolUseEvent(part)
	if !strings.Contains(result, "✗") {
		t.Fatalf("expected error marker, got %q", result)
	}
	if !strings.Contains(result, "npm build") {
		t.Fatalf("expected command, got %q", result)
	}
}

func TestFormatToolResultEventWithStringOutput(t *testing.T) {
	part := map[string]interface{}{
		"tool": "bash",
		"state": map[string]interface{}{
			"status": "completed",
			"output": "All 5 tests passed\nNo failures",
		},
	}
	result := formatToolResultEvent(part)
	if !strings.Contains(result, "✓") {
		t.Fatalf("expected success marker, got %q", result)
	}
	if !strings.Contains(result, "bash") {
		t.Fatalf("expected tool name, got %q", result)
	}
}

func TestFormatStreamRealWorldOpenCodeEvent(t *testing.T) {
	raw := `{"type":"tool_use","timestamp":1778810428310,"sessionID":"ses_1d6a5b69","part":{"type":"tool","tool":"task","callID":"call_09b6a0a93ffb","state":{"status":"completed","input":{"description":"Explore codebase structure","prompt":"Explore the codebase thoroughly","subagent_type":"explore"},"output":"task_id: ses_abc123\n\n<task_result>\nNow I have a comprehensive understanding.\n</task_result>"}}}`
	formatted := FormatExecutionEvent("stdout", raw)
	if !strings.Contains(formatted, "Explore codebase structure") {
		t.Fatalf("expected description in formatted output, got %q", formatted)
	}
	if !strings.Contains(formatted, "[explore]") {
		t.Fatalf("expected subagent type, got %q", formatted)
	}
}

func TestFormatStreamReadableWithTaskTool(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"task","state":{"status":"completed","input":{"description":"Explore codebase","subagent_type":"explore"},"output":"task_id: ses_abc\n\nResult here"}}}`,
		`{"type":"step_end","part":{}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "▸ task") {
		t.Fatalf("expected task tool use, got %q", result)
	}
	if !strings.Contains(result, "Explore codebase") {
		t.Fatalf("expected description, got %q", result)
	}
	if !strings.Contains(result, "ses_abc") {
		t.Fatalf("expected task_id, got %q", result)
	}
}

func TestFirstNonEmptyStr(t *testing.T) {
	m := map[string]interface{}{
		"file":     "",
		"file_path": "src/app.ts",
		"path":     "fallback",
	}
	result := firstNonEmptyStr(m, "file", "file_path", "path")
	if result != "src/app.ts" {
		t.Fatalf("expected first non-empty, got %q", result)
	}
}

func TestFirstNonEmptyStrNoneMatch(t *testing.T) {
	m := map[string]interface{}{
		"other": "value",
	}
	result := firstNonEmptyStr(m, "file", "path")
	if result != "" {
		t.Fatalf("expected empty, got %q", result)
	}
}

func TestSummarizeToolOutputFallbackString(t *testing.T) {
	output := "some plain string output from unknown tool"
	result := summarizeToolOutput("custom_tool", output)
	if !strings.Contains(result, "some plain string") {
		t.Fatalf("expected string summary for unknown tool, got %q", result)
	}
}

func TestFormatToolInputTodoWrite(t *testing.T) {
	input := map[string]interface{}{
		"todos": []interface{}{
			map[string]interface{}{"content": "Step 1", "status": "completed"},
			map[string]interface{}{"content": "Step 2", "status": "in_progress"},
			map[string]interface{}{"content": "Step 3", "status": "pending"},
		},
	}
	result := formatToolInput("todowrite", input)
	if !strings.Contains(result, "3 items") {
		t.Fatalf("expected item count, got %q", result)
	}
	if !strings.Contains(result, "1 active") {
		t.Fatalf("expected active count, got %q", result)
	}
}

func TestFormatToolInputTodoWriteNoActive(t *testing.T) {
	input := map[string]interface{}{
		"todos": []interface{}{
			map[string]interface{}{"content": "Step 1", "status": "completed"},
			map[string]interface{}{"content": "Step 2", "status": "completed"},
		},
	}
	result := formatToolInput("todowrite", input)
	if !strings.Contains(result, "2 items") {
		t.Fatalf("expected item count, got %q", result)
	}
	if strings.Contains(result, "active") {
		t.Fatalf("expected no active count, got %q", result)
	}
}

func TestFormatToolInputClick(t *testing.T) {
	input := map[string]interface{}{
		"uid": "btn-submit",
	}
	result := formatToolInput("click", input)
	if !strings.Contains(result, "btn-submit") {
		t.Fatalf("expected uid, got %q", result)
	}
}

func TestFormatToolInputPressKey(t *testing.T) {
	input := map[string]interface{}{
		"key": "Enter",
	}
	result := formatToolInput("press_key", input)
	if !strings.Contains(result, "Enter") {
		t.Fatalf("expected key, got %q", result)
	}
}

func TestFormatToolInputNavigate(t *testing.T) {
	input := map[string]interface{}{
		"url": "https://example.com/page",
	}
	result := formatToolInput("navigate", input)
	if !strings.Contains(result, "https://example.com") {
		t.Fatalf("expected url, got %q", result)
	}
}

func TestFormatToolInputFillWithValue(t *testing.T) {
	input := map[string]interface{}{
		"uid":   "input-name",
		"value": "John",
	}
	result := formatToolInput("fill", input)
	if !strings.Contains(result, "input-name") {
		t.Fatalf("expected uid, got %q", result)
	}
	if !strings.Contains(result, "John") {
		t.Fatalf("expected value, got %q", result)
	}
}

func TestDedupStreamLinesRemovesDuplicates(t *testing.T) {
	lines := []streamLine{
		{eventType: EventText, content: "hello world"},
		{eventType: EventText, content: "hello world"},
		{eventType: EventToolUse, content: "▸ read  a.ts"},
		{eventType: EventToolUse, content: "▸ read  a.ts"},
	}
	result := dedupStreamLines(lines)
	if len(result) != 2 {
		t.Fatalf("expected 2 deduped lines, got %d: %v", len(result), result)
	}
}

func TestDedupStreamLinesPreservesSteps(t *testing.T) {
	lines := []streamLine{
		{eventType: EventStepStart, content: ""},
		{eventType: EventStepStart, content: ""},
	}
	result := dedupStreamLines(lines)
	if len(result) != 2 {
		t.Fatalf("expected step markers preserved, got %d", len(result))
	}
}

func TestNormalizeEventWithAssistantType(t *testing.T) {
	raw := `{"type":"assistant","content":"I will help you with that."}`
	formatted := FormatExecutionEvent("stdout", raw)
	if !strings.Contains(formatted, "I will help you with that") {
		t.Fatalf("expected assistant message normalized to text, got %q", formatted)
	}
}

func TestFormatStreamReadableDedupIdenticalLines(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	readCount := strings.Count(result, "▸ read")
	if readCount > 1 {
		t.Fatalf("expected deduplication of identical tool use, got %d occurrences:\n%s", readCount, result)
	}
}

func TestFormatStreamCompactDedup(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"a.ts"}}}}`,
		`{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`,
	}, "\n")

	result := FormatStreamCompact(raw)
	readCount := strings.Count(result, "▸ read")
	if readCount > 1 {
		t.Fatalf("expected deduplication in compact format, got %d occurrences:\n%s", readCount, result)
	}
}

func TestFormatExecutionCommentUsesReadableStream(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"edit","state":{"input":{"file":"src/app.ts","old_string":"old","new_string":"new"}}}}`,
		`{"type":"step_end","part":{}}`,
		`{"type":"result","part":{"text":"Feature implemented."}}`,
	}, "\n")

	comment := FormatExecutionComment("dev", "opencode", true, 30, raw, 0)
	if !strings.Contains(comment, "### Key Changes") {
		t.Fatalf("expected Key Changes section, got %s", comment)
	}
	if !strings.Contains(comment, "Edited `src/app.ts`") {
		t.Fatalf("expected edited file in Key Changes, got %s", comment)
	}
	if !strings.Contains(comment, "Full Output") {
		t.Fatalf("expected Full Output summary, got %s", comment)
	}
	if !strings.Contains(comment, "Feature implemented") {
		t.Fatalf("expected summary text, got %s", comment)
	}
}

func TestFormatStreamReadableWithTodoWrite(t *testing.T) {
	raw := strings.Join([]string{
		`{"type":"step_start","part":{"type":"step-start"}}`,
		`{"type":"tool_use","part":{"tool":"todowrite","state":{"input":{"todos":[{"content":"Step 1","status":"in_progress"},{"content":"Step 2","status":"pending"}]}}}}`,
		`{"type":"step_end","part":{}}`,
	}, "\n")

	result := FormatStreamReadable(raw)
	if !strings.Contains(result, "▸ todowrite") {
		t.Fatalf("expected todowrite tool use, got %q", result)
	}
	if !strings.Contains(result, "2 items") {
		t.Fatalf("expected item count, got %q", result)
	}
}

func TestFormatToolInputTodoWriteWithContent(t *testing.T) {
	input := map[string]interface{}{
		"content": "Write tests",
	}
	result := formatToolInput("todowrite", input)
	if !strings.Contains(result, "Write tests") {
		t.Fatalf("expected content fallback, got %q", result)
	}
}

func TestFormatToolInputTodoWriteEmpty(t *testing.T) {
	input := map[string]interface{}{}
	result := formatToolInput("todowrite", input)
	if result == "" {
		t.Fatalf("expected non-empty fallback, got %q", result)
	}
}

func TestFormatStreamReadableLargeMultiStep(t *testing.T) {
	var events []string
	for s := 0; s < 5; s++ {
		events = append(events, `{"type":"step_start","part":{"type":"step-start"}}`)
		for i := 0; i < 3; i++ {
			events = append(events, fmt.Sprintf(`{"type":"tool_use","part":{"tool":"read","state":{"input":{"file":"file_s%d_i%d.ts"}}}}`, s, i))
			events = append(events, `{"type":"tool_result","part":{"tool":"read","state":{"status":"completed","output":{"message":"OK"}}}}`)
		}
		events = append(events, `{"type":"text","part":{"text":"Analyzing the files now."}}`)
		events = append(events, `{"type":"step_end","part":{}}`)
	}
	events = append(events, `{"type":"result","part":{"text":"All files analyzed."}}`)
	raw := strings.Join(events, "\n")

	result := FormatStreamReadable(raw)
	stepCount := strings.Count(result, "── Step")
	if stepCount < 10 {
		t.Fatalf("expected at least 10 step markers, got %d", stepCount)
	}
	if !strings.Contains(result, "All files analyzed") {
		t.Fatalf("expected final result, got:\n%s", result)
	}
}

func TestFormatToolInputUpload(t *testing.T) {
	input := map[string]interface{}{
		"uid":      "file-input",
		"filePath": "/tmp/upload.txt",
	}
	result := formatToolInput("upload", input)
	if !strings.Contains(result, "file-input") {
		t.Fatalf("expected uid, got %q", result)
	}
	if !strings.Contains(result, "/tmp/upload.txt") {
		t.Fatalf("expected filePath, got %q", result)
	}
}

func TestFormatToolInputScreenshot(t *testing.T) {
	input := map[string]interface{}{
		"uid": "page-body",
	}
	result := formatToolInput("screenshot", input)
	if !strings.Contains(result, "page-body") {
		t.Fatalf("expected uid, got %q", result)
	}
}

func TestFormatExecutionCommentWithFinalSummaryUsesExplicitSummary(t *testing.T) {
	raw := "Some plain output without structured blocks."
	comment := FormatExecutionCommentWithFinalSummary("dev", "opencode", true, 30, raw, 0, "Explicit final summary from extractor.")
	if !strings.Contains(comment, "Explicit final summary from extractor.") {
		t.Fatalf("expected comment to use explicit final summary, got %s", comment)
	}
}

func TestFormatExecutionCommentWithFinalSummaryFallsBackWhenEmpty(t *testing.T) {
	raw := strings.Join([]string{
		ResultStartMarker,
		`{"schemaVersion":"v1","status":"success","summary":"Parsed from output.","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
		ResultEndMarker,
	}, "\n")
	comment := FormatExecutionCommentWithFinalSummary("dev", "opencode", true, 30, raw, 0, "")
	if !strings.Contains(comment, "Parsed from output.") {
		t.Fatalf("expected comment to fall back to parsed output summary, got %s", comment)
	}
}

func TestFormatExecutionCommentWithFinalSummaryOverridesParsedSummary(t *testing.T) {
	raw := strings.Join([]string{
		ResultStartMarker,
		`{"schemaVersion":"v1","status":"success","summary":"Stale derived summary.","whatChanged":[],"decisions":[],"risks":[],"checksRun":[],"filesTouched":[],"git":{"mode":"manual","baseBranch":null,"branch":null,"commitShas":[],"prUrl":null,"prNumber":null},"followups":[],"memoryCandidates":[],"skillCandidates":[]}`,
		ResultEndMarker,
	}, "\n")
	comment := FormatExecutionCommentWithFinalSummary("dev", "opencode", true, 30, raw, 0, "Extractor improved summary.")
	if !strings.Contains(comment, "Extractor improved summary.") {
		t.Fatalf("expected comment to use explicit summary over parsed one, got %s", comment)
	}
	if strings.Contains(comment, "Stale derived summary.") {
		t.Fatalf("expected stale summary to be overridden, got %s", comment)
	}
}

func TestFormatExecutionCommentWithFinalSummaryFailureUsesExplicit(t *testing.T) {
	comment := FormatExecutionCommentWithFinalSummary("dev", "opencode", false, 30, "error output", 1, "Explicit failure summary.")
	if !strings.Contains(comment, "Execution Failed") {
		t.Fatalf("expected failure header, got %s", comment)
	}
	if !strings.Contains(comment, "Explicit failure summary.") {
		t.Fatalf("expected explicit failure summary in comment, got %s", comment)
	}
}
