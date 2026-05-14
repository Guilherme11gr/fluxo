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
		toolName, _ := part["tool"].(string)
		if toolName == "" {
			toolName = "tool"
		}
		if state, ok := part["state"].(map[string]interface{}); ok {
			if input, ok := state["input"]; ok {
				serialized := compactJSON(input)
				if serialized != "" {
					return fmt.Sprintf("[tool:%s] %s", toolName, serialized)
				}
			}
		}
		return fmt.Sprintf("[tool:%s]", toolName)
	case "tool_result":
		toolName, _ := part["tool"].(string)
		if toolName == "" {
			toolName = "tool"
		}
		if state, ok := part["state"].(map[string]interface{}); ok {
			if output, ok := state["output"]; ok {
				serialized := compactJSON(output)
				if serialized != "" {
					return fmt.Sprintf("[tool-result:%s] %s", toolName, serialized)
				}
			}
			if status, _ := state["status"].(string); status != "" {
				return fmt.Sprintf("[tool-result:%s] status=%s", toolName, status)
			}
		}
		return fmt.Sprintf("[tool-result:%s]", toolName)
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

// ExtractReadableOutput parses JSONL output from opencode/claude and extracts
// human-readable text content. Falls back to raw output if parsing fails.
func ExtractReadableOutput(raw string) string {
	lines := strings.Split(raw, "\n")

	var textParts []string
	var toolNames []string
	var finalResult string
	seen := map[string]bool{}

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" || !strings.HasPrefix(line, "{") {
			// Not JSON — could be plain text line, include it
			if line != "" {
				textParts = append(textParts, line)
			}
			continue
		}

		var obj map[string]interface{}
		if err := json.Unmarshal([]byte(line), &obj); err != nil {
			// Not valid JSON — include as-is if short enough
			if len(line) < 500 {
				textParts = append(textParts, line)
			}
			continue
		}

		eventType, _ := obj["type"].(string)

		switch eventType {
		case "text":
			if part, ok := obj["part"].(map[string]interface{}); ok {
				if text, ok := part["text"].(string); ok && text != "" {
					if !seen[text] {
						seen[text] = true
						textParts = append(textParts, text)
					}
				}
			}

		case "result":
			if part, ok := obj["part"].(map[string]interface{}); ok {
				if text, ok := part["text"].(string); ok && text != "" {
					finalResult = text
				}
				// Also check for result summary
				if summary, ok := part["summary"].(string); ok && summary != "" {
					finalResult = summary
				}
			}
			// Direct result fields
			if text, ok := obj["text"].(string); ok && text != "" {
				finalResult = text
			}

		case "tool_use":
			if part, ok := obj["part"].(map[string]interface{}); ok {
				if tool, ok := part["tool"].(string); ok {
					if !seen["tool:"+tool] {
						seen["tool:"+tool] = true
						toolNames = append(toolNames, tool)
					}
				}
			}
			if formatted := formatJSONLExecutionLine(line); formatted != "" && !seen[formatted] {
				seen[formatted] = true
				textParts = append(textParts, formatted)
			}

		case "tool_result":
			if formatted := formatJSONLExecutionLine(line); formatted != "" && !seen[formatted] {
				seen[formatted] = true
				textParts = append(textParts, formatted)
			}
			continue

		case "step_start", "step_end":
			if formatted := formatJSONLExecutionLine(line); formatted != "" && !seen[formatted] {
				seen[formatted] = true
				textParts = append(textParts, formatted)
			}
			continue
		}
	}

	filtered := filterReadableTextParts(textParts, finalResult)

	// Build readable output
	var result strings.Builder

	// If we got a final result, use that as the primary content
	if finalResult != "" {
		result.WriteString(finalResult)
	}

	if len(filtered) > 0 {
		if result.Len() > 0 {
			result.WriteString("\n\n")
		}
		result.WriteString(strings.Join(filtered, "\n"))
	}

	// Append tool summary if we have tools
	if len(toolNames) > 0 && result.Len() > 0 && len(filtered) == 0 {
		result.WriteString(fmt.Sprintf("\n\nTools used: %s", strings.Join(toolNames, ", ")))
	}

	// If still empty, return raw (truncated)
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
		// Skip common opencode noise
		if strings.HasPrefix(t, "Running") || strings.HasPrefix(t, "Session:") {
			continue
		}
		filtered = append(filtered, t)
	}
	return filtered
}

// FormatExecutionComment creates a clean, readable comment for task execution results.
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

	// Extract readable content from JSONL
	readable := StripStructuredResultBlock(ExtractReadableOutput(output))
	if readable != "" {
		// Truncate if too long for a comment
		if len(readable) > 3000 {
			readable = readable[:3000] + "\n\n*(output truncated)*"
		}
		b.WriteString("### Output\n\n")
		b.WriteString("```\n")
		b.WriteString(readable)
		b.WriteString("\n```")
	}

	return b.String()
}
