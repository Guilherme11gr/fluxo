package runner

import (
	"encoding/json"
	"fmt"
	"strings"
)

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

		case "tool_result":
			// Skip tool results — too verbose
			continue

		case "step_start", "step_end":
			// Skip step markers
			continue
		}
	}

	// Build readable output
	var result strings.Builder

	// If we got a final result, use that as the primary content
	if finalResult != "" {
		result.WriteString(finalResult)
	}

	// If no final result, use collected text parts
	if result.Len() == 0 && len(textParts) > 0 {
		// Deduplicate and take the most relevant parts
		// Skip very short fragments and system messages
		var filtered []string
		for _, t := range textParts {
			t = strings.TrimSpace(t)
			if len(t) < 10 {
				continue
			}
			// Skip common opencode noise
			if strings.HasPrefix(t, "Running") || strings.HasPrefix(t, "Session:") {
				continue
			}
			filtered = append(filtered, t)
		}
		if len(filtered) > 0 {
			result.WriteString(strings.Join(filtered, "\n"))
		}
	}

	// Append tool summary if we have tools
	if len(toolNames) > 0 && result.Len() > 0 {
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
