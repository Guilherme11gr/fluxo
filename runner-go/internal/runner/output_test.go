package runner

import (
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
	if !strings.Contains(result, "ERROR") {
		t.Fatalf("expected ERROR in output, got %q", result)
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
	if !strings.Contains(comment, "✅") {
		t.Fatalf("expected success emoji, got %s", comment)
	}
	if !strings.Contains(comment, "builder") {
		t.Fatalf("expected agent name, got %s", comment)
	}
	if !strings.Contains(comment, "opencode") {
		t.Fatalf("expected tool name, got %s", comment)
	}
	if !strings.Contains(comment, "120s") {
		t.Fatalf("expected duration, got %s", comment)
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
	if !strings.Contains(comment, "❌") {
		t.Fatalf("expected failure emoji, got %s", comment)
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
	if !strings.Contains(comment, "### Stream") {
		t.Fatalf("expected Stream section, got %s", comment)
	}
}

func TestFormatExecutionCommentNoExitCodeOnSuccess(t *testing.T) {
	comment := FormatExecutionComment("dev", "opencode", true, 10, "done", 0)
	if strings.Contains(comment, "Exit Code") {
		t.Fatalf("expected no exit code on success, got %s", comment)
	}
}

func TestFormatExecutionCommentEmptyOutput(t *testing.T) {
	comment := FormatExecutionComment("dev", "opencode", true, 5, "", 0)
	if !strings.Contains(comment, "✅") {
		t.Fatalf("expected success emoji even with empty output, got %s", comment)
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
	if !strings.Contains(result, "completed") {
		t.Fatalf("expected status, got %q", result)
	}
}