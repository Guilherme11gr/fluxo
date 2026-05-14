package runner

import (
	"encoding/json"
	"fmt"
	"strings"
)

func FormatExecutionEvent(kind, content string) string {
	content = strings.TrimSpace(content)
	if content == "" {
		return ""
	}

	switch kind {
	case "stdout", "stderr":
		if formatted := formatJSONLExecutionLine(content); formatted != "" {
			return formatted
		}
	}

	return content
}

func formatJSONLExecutionLine(line string) string {
	if !strings.HasPrefix(strings.TrimSpace(line), "{") {
		return line
	}

	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(line), &obj); err != nil {
		return line
	}

	eventType, _ := obj["type"].(string)
	part, _ := obj["part"].(map[string]interface{})

	switch eventType {
	case "text":
		if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
			return text
		}
	case "tool_use":
		return formatToolUseEvent(part)
	case "tool_result":
		return formatToolResultEvent(part)
	case "step_start":
		return "[step] started"
	case "step_end":
		return "[step] completed"
	case "result":
		if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
			return text
		}
		if summary, _ := part["summary"].(string); strings.TrimSpace(summary) != "" {
			return summary
		}
	}

	return line
}

func formatToolUseEvent(part map[string]interface{}) string {
	toolName, _ := part["tool"].(string)
	if toolName == "" {
		toolName = "tool"
	}

	state, _ := part["state"].(map[string]interface{})
	input, _ := state["input"]

	if input != nil {
		display := formatToolInput(toolName, input)
		if display != "" {
			return fmt.Sprintf(">> %s  %s", toolName, display)
		}
	}

	return fmt.Sprintf(">> %s", toolName)
}

func formatToolInput(toolName string, input interface{}) string {
	m, ok := input.(map[string]interface{})
	if !ok {
		return compactJSON(input)
	}

	parts := []string{}
	switch toolName {
	case "read", "write", "edit", "create":
		if file, _ := m["file"].(string); file != "" {
			parts = append(parts, file)
		} else if path, _ := m["path"].(string); path != "" {
			parts = append(parts, path)
		}
		if oldS, _ := m["old_string"].(string); oldS != "" {
			parts = append(parts, truncateString(strings.ReplaceAll(oldS, "\n", " "), 60))
		}
		if newS, _ := m["new_string"].(string); newS != "" {
			parts = append(parts, ">> " + truncateString(strings.ReplaceAll(newS, "\n", " "), 60))
		}
	case "bash", "shell":
		if cmd, _ := m["command"].(string); cmd != "" {
			parts = append(parts, truncateString(cmd, 80))
		}
	case "grep", "search":
		if pattern, _ := m["pattern"].(string); pattern != "" {
			parts = append(parts, pattern)
		}
		if path, _ := m["path"].(string); path != "" {
			parts = append(parts, "in " + path)
		}
	case "glob":
		if pattern, _ := m["pattern"].(string); pattern != "" {
			parts = append(parts, pattern)
		}
	case "list_files":
		if path, _ := m["path"].(string); path != "" {
			parts = append(parts, path)
		}
	default:
		return compactJSON(input)
	}

	if len(parts) == 0 {
		return compactJSON(input)
	}
	return strings.Join(parts, " ")
}

func formatToolResultEvent(part map[string]interface{}) string {
	toolName, _ := part["tool"].(string)
	if toolName == "" {
		toolName = "tool"
	}

	state, _ := part["state"].(map[string]interface{})
	if state == nil {
		return fmt.Sprintf("<< %s", toolName)
	}

	status, _ := state["status"].(string)
	output := state["output"]

	switch {
	case status == "error":
		errMsg := extractErrorMessage(output)
		if errMsg != "" {
			return fmt.Sprintf("<< %s  ERROR: %s", toolName, truncateString(errMsg, 120))
		}
		return fmt.Sprintf("<< %s  ERROR", toolName)

	case output != nil:
		summary := summarizeToolOutput(toolName, output)
		if summary != "" {
			return fmt.Sprintf("<< %s  %s", toolName, summary)
		}
	}

	if status != "" {
		return fmt.Sprintf("<< %s  %s", toolName, status)
	}
	return fmt.Sprintf("<< %s", toolName)
}

func summarizeToolOutput(toolName string, output interface{}) string {
	m, ok := output.(map[string]interface{})
	if !ok {
		return compactJSON(output)
	}

	switch toolName {
	case "grep", "search":
		if matches, _ := m["matches"].(float64); matches > 0 {
			if files, _ := m["files"].(float64); files > 0 {
				return fmt.Sprintf("%.0f matches in %.0f files", matches, files)
			}
			return fmt.Sprintf("%.0f matches", matches)
		}
		if files, _ := m["files"].(float64); files > 0 {
			return fmt.Sprintf("%.0f files", files)
		}
		return "no matches"

	case "bash", "shell":
		if exitCode, _ := m["exitCode"].(float64); exitCode != 0 {
			return fmt.Sprintf("exit code %.0f", exitCode)
		}
		if stdout, _ := m["stdout"].(string); stdout != "" {
			return truncateString(strings.ReplaceAll(stdout, "\n", " "), 80)
		}
		return ""

	case "read", "write", "edit", "create":
		if msg, _ := m["message"].(string); msg != "" {
			return truncateString(msg, 100)
		}
		if path, _ := m["path"].(string); path != "" {
			return path
		}
		return ""

	case "glob", "list_files":
		if count, _ := m["count"].(float64); count > 0 {
			return fmt.Sprintf("%.0f items", count)
		}
		return ""
	}

	return compactJSON(output)
}

func extractErrorMessage(output interface{}) string {
	if output == nil {
		return ""
	}
	m, ok := output.(map[string]interface{})
	if !ok {
		return compactJSON(output)
	}
	if errStr, _ := m["error"].(string); errStr != "" {
		return errStr
	}
	if stderr, _ := m["stderr"].(string); stderr != "" {
		return truncateString(stderr, 120)
	}
	if msg, _ := m["message"].(string); msg != "" {
		return msg
	}
	return compactJSON(output)
}

func compactJSON(value interface{}) string {
	bytes, err := json.Marshal(value)
	if err != nil {
		return ""
	}
	text := strings.TrimSpace(string(bytes))
	if len(text) > 300 {
		return text[:300] + "..."
	}
	return text
}

func truncateString(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

type StreamEventType string

const (
	EventText       StreamEventType = "text"
	EventToolUse    StreamEventType = "tool_use"
	EventToolResult StreamEventType = "tool_result"
	EventStepStart  StreamEventType = "step_start"
	EventStepEnd    StreamEventType = "step_end"
	EventResult     StreamEventType = "result"
	EventUnknown    StreamEventType = "unknown"
)

type ParsedStreamEvent struct {
	Type     StreamEventType
	ToolName string
	Text     string
	Input    interface{}
	Output   interface{}
	Status   string
	Raw      map[string]interface{}
}

func ParseStreamEvent(line string) *ParsedStreamEvent {
	line = strings.TrimSpace(line)
	if line == "" || !strings.HasPrefix(line, "{") {
		return &ParsedStreamEvent{Type: EventUnknown, Text: line}
	}

	var obj map[string]interface{}
	if err := json.Unmarshal([]byte(line), &obj); err != nil {
		return &ParsedStreamEvent{Type: EventUnknown, Text: line}
	}

	eventType, _ := obj["type"].(string)
	part, _ := obj["part"].(map[string]interface{})

	parsed := &ParsedStreamEvent{Raw: obj}

	switch eventType {
	case "text":
		parsed.Type = EventText
		if part != nil {
			parsed.Text, _ = part["text"].(string)
		}
	case "tool_use":
		parsed.Type = EventToolUse
		if part != nil {
			parsed.ToolName, _ = part["tool"].(string)
			if state, ok := part["state"].(map[string]interface{}); ok {
				parsed.Input = state["input"]
			}
		}
	case "tool_result":
		parsed.Type = EventToolResult
		if part != nil {
			parsed.ToolName, _ = part["tool"].(string)
			if state, ok := part["state"].(map[string]interface{}); ok {
				parsed.Status, _ = state["status"].(string)
				parsed.Output = state["output"]
			}
		}
	case "step_start":
		parsed.Type = EventStepStart
	case "step_end":
		parsed.Type = EventStepEnd
	case "result":
		parsed.Type = EventResult
		if part != nil {
			parsed.Text, _ = part["text"].(string)
			if summary, _ := part["summary"].(string); summary != "" && parsed.Text == "" {
				parsed.Text = summary
			}
		}
	default:
		parsed.Type = EventUnknown
	}

	return parsed
}

func FormatStreamEvent(parsed *ParsedStreamEvent) string {
	switch parsed.Type {
	case EventText:
		return parsed.Text
	case EventToolUse:
		if parsed.Input != nil {
			display := formatToolInput(parsed.ToolName, parsed.Input)
			if display != "" {
				return fmt.Sprintf(">> %s  %s", parsed.ToolName, display)
			}
		}
		return fmt.Sprintf(">> %s", parsed.ToolName)
	case EventToolResult:
		return formatToolResultEvent(map[string]interface{}{
			"tool":  parsed.ToolName,
			"state": map[string]interface{}{"status": parsed.Status, "output": parsed.Output},
		})
	case EventStepStart:
		return "[step] started"
	case EventStepEnd:
		return "[step] completed"
	case EventResult:
		return parsed.Text
	default:
		return ""
	}
}

func ExtractReadableOutput(raw string) string {
	lines := strings.Split(raw, "\n")

	var textParts []string
	var toolNames []string
	var finalResult string
	seen := map[string]bool{}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		parsed := ParseStreamEvent(line)

		switch parsed.Type {
		case EventText:
			if parsed.Text != "" && !seen[parsed.Text] {
				seen[parsed.Text] = true
				textParts = append(textParts, parsed.Text)
			}

		case EventResult:
			if parsed.Text != "" {
				finalResult = parsed.Text
			}

		case EventToolUse:
			if parsed.ToolName != "" && !seen["tool:"+parsed.ToolName] {
				seen["tool:"+parsed.ToolName] = true
				toolNames = append(toolNames, parsed.ToolName)
			}
			if formatted := FormatStreamEvent(parsed); formatted != "" && !seen[formatted] {
				seen[formatted] = true
				textParts = append(textParts, formatted)
			}

		case EventToolResult:
			if formatted := FormatStreamEvent(parsed); formatted != "" && !seen[formatted] {
				seen[formatted] = true
				textParts = append(textParts, formatted)
			}

		case EventStepStart, EventStepEnd:
			if formatted := FormatStreamEvent(parsed); formatted != "" && !seen[formatted] {
				seen[formatted] = true
				textParts = append(textParts, formatted)
			}

		case EventUnknown:
			if parsed.Text != "" && len(parsed.Text) < 500 {
				textParts = append(textParts, parsed.Text)
			}
		}
	}

	filtered := filterReadableTextParts(textParts, finalResult)

	var result strings.Builder

	if finalResult != "" {
		result.WriteString(finalResult)
	}

	if len(filtered) > 0 {
		if result.Len() > 0 {
			result.WriteString("\n\n")
		}
		result.WriteString(strings.Join(filtered, "\n"))
	}

	if len(toolNames) > 0 && result.Len() > 0 && len(filtered) == 0 {
		result.WriteString(fmt.Sprintf("\n\nTools used: %s", strings.Join(toolNames, ", ")))
	}

	if result.Len() == 0 {
		if len(raw) > 1000 {
			return raw[:1000] + "\n\n(output truncated)"
		}
		return raw
	}

	out := result.String()
	if len(out) > 4000 {
		out = out[:4000] + "\n\n(output truncated)"
	}
	return out
}

func filterReadableTextParts(textParts []string, finalResult string) []string {
	var filtered []string
	for _, t := range textParts {
		t = strings.TrimSpace(t)
		if len(t) < 10 {
			continue
		}
		if t == finalResult {
			continue
		}
		if strings.HasPrefix(t, "Running") || strings.HasPrefix(t, "Session:") {
			continue
		}
		filtered = append(filtered, t)
	}
	return filtered
}

func FormatExecutionComment(agentName, tool string, success bool, elapsed float64, output string, exitCode int) string {
	var b strings.Builder

	if success {
		b.WriteString("## ✅ Execution Complete\n\n")
	} else {
		b.WriteString("## ❌ Execution Failed\n\n")
	}

	b.WriteString(fmt.Sprintf("**Agent:** %s  \n", agentName))
	b.WriteString(fmt.Sprintf("**Tool:** %s  \n", tool))
	b.WriteString(fmt.Sprintf("**Duration:** %.0fs  \n", elapsed))
	if !success && exitCode != 0 {
		b.WriteString(fmt.Sprintf("**Exit Code:** %d  \n", exitCode))
	}
	b.WriteString("\n")

	readable := StripStructuredResultBlock(ExtractReadableOutput(output))

	summary := extractCommentSummary(readable)
	if summary != "" {
		b.WriteString("### Summary\n\n")
		b.WriteString(summary)
		b.WriteString("\n\n")
	}

	tools := extractCommentTools(output)
	if len(tools) > 0 {
		b.WriteString("### Tools Used\n\n")
		for _, t := range tools {
			b.WriteString(fmt.Sprintf("- `%s`\n", t))
		}
		b.WriteString("\n")
	}

	streamBody := extractCommentStreamBody(output)
	if streamBody != "" {
		maxLen := 2000
		if len(streamBody) > maxLen {
			streamBody = streamBody[:maxLen] + "\n\n*(output truncated)*"
		}
		b.WriteString("### Stream\n\n")
		b.WriteString("```\n")
		b.WriteString(streamBody)
		b.WriteString("\n```\n")
	}

	return b.String()
}

func extractCommentSummary(readable string) string {
	readable = strings.TrimSpace(readable)
	if readable == "" {
		return ""
	}
	lines := strings.SplitN(readable, "\n", 2)
	first := strings.TrimSpace(lines[0])
	if len(first) > 500 {
		return first[:500] + "..."
	}
	return first
}

func extractCommentTools(raw string) []string {
	var tools []string
	seen := map[string]bool{}
	lines := strings.Split(raw, "\n")
	for _, line := range lines {
		parsed := ParseStreamEvent(line)
		if parsed.Type == EventToolUse && parsed.ToolName != "" && !seen[parsed.ToolName] {
			seen[parsed.ToolName] = true
			tools = append(tools, parsed.ToolName)
		}
	}
	return tools
}

func extractCommentStreamBody(raw string) string {
	var parts []string
	lines := strings.Split(raw, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parsed := ParseStreamEvent(line)
		switch parsed.Type {
		case EventToolUse, EventToolResult, EventResult:
			if formatted := FormatStreamEvent(parsed); formatted != "" {
				parts = append(parts, formatted)
			}
		case EventText:
			text := strings.TrimSpace(parsed.Text)
			if len(text) >= 20 {
				parts = append(parts, text)
			}
		}
	}
	return strings.Join(parts, "\n")
}