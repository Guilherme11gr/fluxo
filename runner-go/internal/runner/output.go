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

	normalizeEvent(obj)

	eventType, _ := obj["type"].(string)
	part, _ := obj["part"].(map[string]interface{})

	switch eventType {
	case "text", "message":
		if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
			return text
		}
	case "tool_use", "tool_call":
		return formatToolUseEvent(part)
	case "tool_result", "tool_output":
		return formatToolResultEvent(part)
	case "step_start":
		return "── step ──"
	case "step_end":
		return "── step ✓ ──"
	case "result":
		if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
			return "✓ " + text
		}
		if summary, _ := part["summary"].(string); strings.TrimSpace(summary) != "" {
			return "✓ " + summary
		}
	case "error":
		if text, _ := part["text"].(string); strings.TrimSpace(text) != "" {
			return "✗ Error: " + truncateString(text, 200)
		}
		return "✗ Error"
	case "init", "session", "status":
		return ""
	}

	if eventType != "" {
		return formatUnknownJSONLEvent(obj)
	}

	return line
}

func formatUnknownJSONLEvent(obj map[string]interface{}) string {
	eventType, _ := obj["type"].(string)

	for _, key := range []string{"message", "content", "text", "error"} {
		if val, ok := obj[key].(string); ok && strings.TrimSpace(val) != "" {
			return fmt.Sprintf("[%s] %s", eventType, truncateString(val, 150))
		}
	}

	data, _ := json.Marshal(obj)
	if len(data) > 200 {
		return fmt.Sprintf("[%s] %s...", eventType, string(data[:200]))
	}
	return fmt.Sprintf("[%s] %s", eventType, string(data))
}

func normalizeEvent(obj map[string]interface{}) {
	if part, ok := obj["part"]; ok && part != nil {
		if partMap, ok := part.(map[string]interface{}); ok {
			normalizePart(obj, partMap)
		}
		return
	}

	eventType, _ := obj["type"].(string)

	switch eventType {
	case "message", "assistant":
		obj["type"] = "text"
		content, _ := obj["content"].(string)
		if content == "" {
			content, _ = obj["text"].(string)
		}
		obj["part"] = map[string]interface{}{"text": content}

	case "tool_use", "tool_call":
		obj["type"] = "tool_use"
		name, _ := obj["name"].(string)
		if name == "" {
			name, _ = obj["tool"].(string)
		}
		input := obj["input"]
		if input == nil {
			input = map[string]interface{}{}
		}
		obj["part"] = map[string]interface{}{
			"tool":  name,
			"state": map[string]interface{}{"input": input},
		}

	case "tool_result", "tool_output":
		obj["type"] = "tool_result"
		name, _ := obj["name"].(string)
		if name == "" {
			name, _ = obj["tool"].(string)
		}
		output := obj["output"]
		status := "completed"
		if isError, ok := obj["isError"].(bool); ok && isError {
			status = "error"
		} else if s, ok := obj["status"].(string); ok {
			status = s
		}
		state := map[string]interface{}{"status": status}
		if output != nil {
			state["output"] = output
		}
		obj["part"] = map[string]interface{}{
			"tool":  name,
			"state": state,
		}

	case "result":
		text, _ := obj["text"].(string)
		if text == "" {
			text, _ = obj["content"].(string)
		}
		summary, _ := obj["summary"].(string)
		part := map[string]interface{}{}
		if text != "" {
			part["text"] = text
		}
		if summary != "" {
			part["summary"] = summary
		}
		obj["part"] = part

	case "error":
		msg, _ := obj["message"].(string)
		if msg == "" {
			msg, _ = obj["error"].(string)
		}
		obj["part"] = map[string]interface{}{"text": msg}
	}
}

func normalizePart(obj, part map[string]interface{}) {
	partType, _ := part["type"].(string)
	eventType, _ := obj["type"].(string)

	switch partType {
	case "tool":
		if eventType != "tool_use" && eventType != "tool_result" {
			if _, hasOutput := part["state"].(map[string]interface{}); hasOutput {
				state, _ := part["state"].(map[string]interface{})
				if status, _ := state["status"].(string); status != "" {
					if status == "completed" || status == "error" {
						return
					}
				}
			}
		}
	}
}

func formatToolUseEvent(part map[string]interface{}) string {
	toolName, _ := part["tool"].(string)
	if toolName == "" {
		toolName = "tool"
	}

	state, _ := part["state"].(map[string]interface{})
	input, _ := state["input"]
	output := state["output"]
	status, _ := state["status"].(string)

	inputPart := ""
	if input != nil {
		inputPart = formatToolInput(toolName, input)
	}

	if output != nil && (status == "completed" || status == "error") {
		if status == "error" {
			errMsg := extractErrorMessage(output)
			if inputPart != "" {
				return fmt.Sprintf("▸ %s  %s → ✗ %s", toolName, inputPart, truncateString(errMsg, 80))
			}
			if errMsg != "" {
				return fmt.Sprintf("✗ %s  %s", toolName, truncateString(errMsg, 120))
			}
			return fmt.Sprintf("✗ %s", toolName)
		}
		summary := summarizeToolOutput(toolName, output)
		if inputPart != "" && summary != "" {
			return fmt.Sprintf("▸ %s  %s → %s", toolName, inputPart, truncateString(summary, 80))
		}
		if inputPart != "" {
			return fmt.Sprintf("▸ %s  %s", toolName, inputPart)
		}
		if summary != "" {
			return fmt.Sprintf("✓ %s  %s", toolName, summary)
		}
		return fmt.Sprintf("✓ %s", toolName)
	}

	if inputPart != "" {
		return fmt.Sprintf("▸ %s  %s", toolName, inputPart)
	}

	return fmt.Sprintf("▸ %s", toolName)
}

func formatToolInput(toolName string, input interface{}) string {
	m, ok := input.(map[string]interface{})
	if !ok {
		return compactJSON(input)
	}

	parts := []string{}
	switch toolName {
	case "read", "write", "edit", "create":
		file := firstNonEmptyStr(m, "file", "file_path", "filePath", "path")
		if file != "" {
			parts = append(parts, file)
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
	case "task":
		if desc, _ := m["description"].(string); desc != "" {
			parts = append(parts, truncateString(desc, 60))
		}
		if subType, _ := m["subagent_type"].(string); subType != "" {
			parts = append(parts, "[" + subType + "]")
		}
	case "webfetch", "fetch", "curl":
		if url, _ := m["url"].(string); url != "" {
			parts = append(parts, truncateString(url, 80))
		}
	case "fill", "type", "fill_form":
		if uid, _ := m["uid"].(string); uid != "" {
			parts = append(parts, uid)
		}
		if val, _ := m["value"].(string); val != "" {
			parts = append(parts, truncateString(val, 40))
		}
	case "click", "hover":
		if uid, _ := m["uid"].(string); uid != "" {
			parts = append(parts, uid)
		}
	case "navigate", "navigate_page":
		if url, _ := m["url"].(string); url != "" {
			parts = append(parts, truncateString(url, 80))
		}
	case "todowrite", "todo_write":
		return formatTodoInput(m)
	case "screenshot", "take_screenshot":
		if uid, _ := m["uid"].(string); uid != "" {
			parts = append(parts, uid)
		}
	case "upload":
		if uid, _ := m["uid"].(string); uid != "" {
			parts = append(parts, uid)
		}
		if fp, _ := m["filePath"].(string); fp != "" {
			parts = append(parts, fp)
		}
	case "press_key":
		if key, _ := m["key"].(string); key != "" {
			parts = append(parts, key)
		}
	default:
		return compactJSON(input)
	}

	if len(parts) == 0 {
		return compactJSON(input)
	}
	return strings.Join(parts, " ")
}

func formatTodoInput(m map[string]interface{}) string {
	todos, _ := m["todos"].([]interface{})
	if len(todos) == 0 {
		if content, _ := m["content"].(string); content != "" {
			return truncateString(content, 60)
		}
		return compactJSON(m)
	}
	count := len(todos)
	inProgress := 0
	for _, t := range todos {
		if todo, ok := t.(map[string]interface{}); ok {
			if status, _ := todo["status"].(string); status == "in_progress" {
				inProgress++
			}
		}
	}
	if inProgress > 0 {
		return fmt.Sprintf("%d items (%d active)", count, inProgress)
	}
	return fmt.Sprintf("%d items", count)
}

func formatToolResultEvent(part map[string]interface{}) string {
	toolName, _ := part["tool"].(string)
	if toolName == "" {
		toolName = "tool"
	}

	state, _ := part["state"].(map[string]interface{})
	if state == nil {
		return fmt.Sprintf("◊ %s", toolName)
	}

	status, _ := state["status"].(string)
	output := state["output"]

	switch {
	case status == "error":
		errMsg := extractErrorMessage(output)
		if errMsg != "" {
			return fmt.Sprintf("✗ %s  %s", toolName, truncateString(errMsg, 120))
		}
		return fmt.Sprintf("✗ %s", toolName)

	case output != nil:
		summary := summarizeToolOutput(toolName, output)
		if summary != "" {
			return fmt.Sprintf("✓ %s  %s", toolName, summary)
		}
	}

	if status != "" {
		return fmt.Sprintf("◊ %s  %s", toolName, status)
	}
	return fmt.Sprintf("◊ %s", toolName)
}

func summarizeToolOutput(toolName string, output interface{}) string {
	switch toolName {
	case "task":
		return summarizeTaskOutput(output)
	}

	m, ok := output.(map[string]interface{})
	if !ok {
		return summarizeStringOutput(fmt.Sprintf("%v", output))
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

func summarizeTaskOutput(output interface{}) string {
	str, ok := output.(string)
	if !ok {
		return compactJSON(output)
	}

	taskID := extractTaskID(str)
	firstLine := firstMeaningfulLine(str, 80)
	if taskID != "" && firstLine != "" {
		return fmt.Sprintf("%s — %s", taskID, firstLine)
	}
	if taskID != "" {
		return taskID
	}
	return summarizeStringOutput(str)
}

func extractTaskID(text string) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "task_id:") || strings.HasPrefix(line, "task_id ") {
			parts := strings.SplitN(line, ":", 2)
			if len(parts) == 2 {
				id := strings.TrimSpace(parts[1])
				if len(id) > 12 {
					id = id[:12] + "..."
				}
				return id
			}
		}
	}
	return ""
}

func firstMeaningfulLine(text string, maxLen int) string {
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "task_id:") || strings.HasPrefix(line, "<task_result>") || strings.HasPrefix(line, "</task_result>") {
			continue
		}
		if len(line) > maxLen {
			return line[:maxLen] + "..."
		}
		return line
	}
	return ""
}

func summarizeStringOutput(text string) string {
	text = strings.TrimSpace(text)
	if text == "" {
		return ""
	}
	first := firstMeaningfulLine(text, 100)
	if first != "" {
		return first
	}
	return truncateString(text, 100)
}

func extractErrorMessage(output interface{}) string {
	if output == nil {
		return ""
	}
	if str, ok := output.(string); ok {
		return summarizeStringOutput(str)
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

func firstNonEmptyStr(m map[string]interface{}, keys ...string) string {
	for _, k := range keys {
		if v, _ := m[k].(string); strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
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
	EventError      StreamEventType = "error"
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

	normalizeEvent(obj)

	eventType, _ := obj["type"].(string)
	part, _ := obj["part"].(map[string]interface{})

	parsed := &ParsedStreamEvent{Raw: obj}

	switch eventType {
	case "text", "message":
		parsed.Type = EventText
		if part != nil {
			parsed.Text, _ = part["text"].(string)
		}
	case "tool_use", "tool_call":
		parsed.Type = EventToolUse
		if part != nil {
			parsed.ToolName, _ = part["tool"].(string)
			if state, ok := part["state"].(map[string]interface{}); ok {
				parsed.Input = state["input"]
				if output := state["output"]; output != nil {
					parsed.Output = output
					parsed.Status, _ = state["status"].(string)
				}
			}
		}
	case "tool_result", "tool_output":
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
	case "error":
		parsed.Type = EventError
		if part != nil {
			parsed.Text, _ = part["text"].(string)
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
		if parsed.Output != nil && (parsed.Status == "completed" || parsed.Status == "error") {
			return formatToolUseEvent(map[string]interface{}{
				"tool": parsed.ToolName,
				"state": map[string]interface{}{
					"status": parsed.Status,
					"input":  parsed.Input,
					"output": parsed.Output,
				},
			})
		}
		if parsed.Input != nil {
			display := formatToolInput(parsed.ToolName, parsed.Input)
			if display != "" {
				return fmt.Sprintf("▸ %s  %s", parsed.ToolName, display)
			}
		}
		return fmt.Sprintf("▸ %s", parsed.ToolName)
	case EventToolResult:
		return formatToolResultEvent(map[string]interface{}{
			"tool":  parsed.ToolName,
			"state": map[string]interface{}{"status": parsed.Status, "output": parsed.Output},
		})
	case EventStepStart:
		return "── step ──"
	case EventStepEnd:
		return "── step ✓ ──"
	case EventResult:
		if parsed.Text != "" {
			return "✓ " + parsed.Text
		}
		return ""
	case EventError:
		if parsed.Text != "" {
			return "✗ Error: " + truncateString(parsed.Text, 200)
		}
		return "✗ Error"
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
			if parsed.Text != "" && !isDuplicateText(seen, parsed.Text) {
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

		case EventError:
			if formatted := FormatStreamEvent(parsed); formatted != "" && !seen[formatted] {
				seen[formatted] = true
				textParts = append(textParts, formatted)
			}

		case EventUnknown:
			if parsed.Text != "" && len(parsed.Text) < 500 && !isDuplicateText(seen, parsed.Text) {
				seen[parsed.Text] = true
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

func isDuplicateText(seen map[string]bool, text string) bool {
	if seen[text] {
		return true
	}
	truncated := truncateString(text, 80)
	if seen[truncated] {
		return true
	}
	return false
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

type streamLine struct {
	eventType StreamEventType
	content   string
	indent    int
}

func FormatStreamForDisplay(raw string) string {
	lines := FormatStreamReadable(raw)
	if lines == "" {
		return ""
	}
	return lines
}

func FormatStreamReadable(raw string) string {
	parsed := parseStreamLines(raw)
	if len(parsed) == 0 {
		return ""
	}

	parsed = dedupStreamLines(parsed)

	var b strings.Builder
	indent := 0
	stepNum := 0
	for i, line := range parsed {
		switch line.eventType {
		case EventStepStart:
			stepNum++
			if b.Len() > 0 {
				b.WriteString("\n")
			}
			prefix := strings.Repeat("  ", indent)
			b.WriteString(fmt.Sprintf("%s── Step %d ──\n", prefix, stepNum))
			indent++

		case EventStepEnd:
			if indent > 0 {
				indent--
			}
			prefix := strings.Repeat("  ", indent)
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
				b.WriteString("\n")
			}
			b.WriteString(fmt.Sprintf("%s── Step %d ✓ ──", prefix, stepNum))

		case EventToolUse:
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
				b.WriteString("\n")
			}
			prefix := strings.Repeat("  ", indent)
			b.WriteString(prefix + line.content)

		case EventToolResult:
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
				b.WriteString("\n")
			}
			prefix := strings.Repeat("  ", indent)
			b.WriteString(prefix + line.content)

		case EventResult:
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
				b.WriteString("\n")
			}
			prefix := strings.Repeat("  ", indent)
			b.WriteString(prefix + line.content)

		case EventError:
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
				b.WriteString("\n")
			}
			prefix := strings.Repeat("  ", indent)
			b.WriteString(prefix + line.content)

		case EventText:
			if line.content == "" {
				continue
			}
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
				if isStructuralEvent(parsed, i-1) {
					b.WriteString("\n")
				} else {
					b.WriteString(" ")
				}
			}
			prefix := strings.Repeat("  ", indent)
			if isStructuralEvent(parsed, i-1) {
				b.WriteString(prefix + line.content)
			} else {
				b.WriteString(line.content)
			}

		case EventUnknown:
			if line.content == "" {
				continue
			}
			if b.Len() > 0 && !strings.HasSuffix(b.String(), "\n") {
				b.WriteString("\n")
			}
			prefix := strings.Repeat("  ", indent)
			b.WriteString(prefix + line.content)
		}
	}

	return b.String()
}

func dedupStreamLines(lines []streamLine) []streamLine {
	if len(lines) <= 1 {
		return lines
	}

	var result []streamLine
	seen := map[string]bool{}

	for _, line := range lines {
		switch line.eventType {
		case EventStepStart, EventStepEnd:
			result = append(result, line)
		default:
			key := string(line.eventType) + ":" + line.content
			if seen[key] {
				continue
			}
			seen[key] = true
			result = append(result, line)
		}
	}
	return result
}

func FormatStreamCompact(raw string) string {
	parsed := parseStreamLines(raw)
	if len(parsed) == 0 {
		return ""
	}

	parsed = dedupStreamLines(parsed)

	var lines []string
	stepNum := 0
	seen := map[string]bool{}

	for _, line := range parsed {
		switch line.eventType {
		case EventStepStart:
			stepNum++
			lines = append(lines, fmt.Sprintf("── Step %d ──", stepNum))
		case EventStepEnd:
			lines = append(lines, fmt.Sprintf("── Step %d ✓ ──", stepNum))
		case EventToolUse, EventToolResult, EventResult, EventError:
			if line.content != "" && !seen[line.content] {
				seen[line.content] = true
				lines = append(lines, line.content)
			}
		case EventText:
			text := strings.TrimSpace(line.content)
			if len(text) >= 40 && !seen[text] {
				seen[text] = true
				lines = append(lines, truncateString(text, 120))
			}
		}
	}

	return strings.Join(lines, "\n")
}

func parseStreamLines(raw string) []streamLine {
	var result []streamLine
	lines := strings.Split(raw, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		parsed := ParseStreamEvent(line)
		content := FormatStreamEvent(parsed)
		if parsed.Type == EventUnknown && content == "" {
			content = strings.TrimSpace(parsed.Text)
		}
		if content == "" && parsed.Type != EventStepStart && parsed.Type != EventStepEnd {
			continue
		}
		result = append(result, streamLine{
			eventType: parsed.Type,
			content:   content,
		})
	}
	return result
}

func isStructuralEvent(lines []streamLine, idx int) bool {
	if idx < 0 || idx >= len(lines) {
		return false
	}
	t := lines[idx].eventType
	return t == EventStepStart || t == EventStepEnd || t == EventToolUse || t == EventToolResult || t == EventResult || t == EventError
}

func FormatDuration(seconds float64) string {
	if seconds < 1 {
		return "<1s"
	}
	totalSecs := int(seconds)
	mins := totalSecs / 60
	secs := totalSecs % 60
	if mins > 0 {
		return fmt.Sprintf("%dm %ds", mins, secs)
	}
	return fmt.Sprintf("%ds", secs)
}

func FormatExecutionComment(agentName, tool string, success bool, elapsed float64, output string, exitCode int) string {
	var b strings.Builder
	sanitizedOutput := StripStructuredResultBlock(output)

	if success {
		b.WriteString("## Execution Complete\n\n")
	} else {
		b.WriteString("## Execution Failed\n\n")
	}

	b.WriteString(fmt.Sprintf("**Agent:** %s  \n", agentName))
	b.WriteString(fmt.Sprintf("**Tool:** %s  \n", tool))
	b.WriteString(fmt.Sprintf("**Duration:** %s  \n", FormatDuration(elapsed)))
	if !success && exitCode != 0 {
		b.WriteString(fmt.Sprintf("**Exit Code:** %d  \n", exitCode))
	}
	b.WriteString("\n")

	readable := ExtractReadableOutput(sanitizedOutput)

	summary := ""
	if structured, err := ParseExecutionResultV1(output); err == nil && structured != nil {
		summary = strings.TrimSpace(structured.Summary)
	}
	if success && summary == "" {
		if agentSummary, err := ParseAgentSummary(output); err == nil && agentSummary != nil {
			summary = strings.TrimSpace(agentSummary.Summary)
		}
	}
	if summary == "" {
		summary = extractCommentSummary(readable)
	}
	if summary != "" {
		b.WriteString("### Summary\n\n")
		if len(summary) > 800 {
			summary = summary[:800] + "..."
		}
		b.WriteString(summary)
		b.WriteString("\n\n")
	}

	keyChanges := extractKeyChangesFromOutput(sanitizedOutput)
	if len(keyChanges) > 0 {
		b.WriteString("### Key Changes\n\n")
		for _, c := range keyChanges {
			b.WriteString(fmt.Sprintf("- %s\n", c))
		}
		b.WriteString("\n")
	}

	tools := extractCommentTools(sanitizedOutput)
	if len(tools) > 0 {
		b.WriteString("### Tools Used\n\n")
		for _, t := range tools {
			b.WriteString(fmt.Sprintf("- `%s`\n", t))
		}
		b.WriteString("\n")
	}

	streamBody := FormatStreamReadable(sanitizedOutput)
	if streamBody == "" {
		streamBody = FormatStreamCompact(sanitizedOutput)
	}
	if streamBody != "" {
		maxLen := 8000
		if len(streamBody) > maxLen {
			streamBody = streamBody[:maxLen] + "\n\n*(output truncated)*"
		}
		b.WriteString("<details>\n<summary>Full Output</summary>\n\n```\n")
		b.WriteString(streamBody)
		b.WriteString("\n```\n\n</details>\n")
	}

	return b.String()
}

func extractKeyChangesFromOutput(raw string) []string {
	var changes []string
	seen := map[string]bool{}
	lines := strings.Split(raw, "\n")
	for _, line := range lines {
		parsed := ParseStreamEvent(line)
		if parsed.Type == EventToolUse {
			switch parsed.ToolName {
			case "edit", "write", "create":
				input, _ := parsed.Input.(map[string]interface{})
				if input == nil {
					continue
				}
				file, _ := input["file"].(string)
				if file == "" {
					file, _ = input["path"].(string)
				}
				if file != "" && !seen[file] {
					seen[file] = true
					action := "Edited"
					if parsed.ToolName == "write" {
						action = "Wrote"
					} else if parsed.ToolName == "create" {
						action = "Created"
					}
					changes = append(changes, fmt.Sprintf("%s `%s`", action, file))
				}
			}
		}
	}
	return changes
}

func extractCommentSummary(readable string) string {
	readable = strings.TrimSpace(readable)
	if readable == "" {
		return ""
	}
	lines := strings.Split(readable, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if len(line) >= 10 {
			if len(line) > 500 {
				return line[:500] + "..."
			}
			return line
		}
	}
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
		case EventToolUse, EventToolResult, EventResult, EventStepStart, EventStepEnd, EventError:
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
