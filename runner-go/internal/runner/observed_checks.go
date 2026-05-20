package runner

import (
	"fmt"
	"regexp"
	"strings"
)

type pendingShellCheck struct {
	CallID  string
	Tool    string
	Command string
}

var checkCommandRe = regexp.MustCompile(`(?i)(^|\s)(npm|pnpm|yarn|bun)\s+(run\s+)?(test|typecheck|check|build|lint)\b|(^|\s)(go\s+(test|vet|build)|pytest|vitest|tsc|eslint|next\s+build|cargo\s+test|mvn\s+test|gradle\s+test)\b`)
var observedExitCodeRe = regexp.MustCompile(`(?im)\b(?:EXIT_CODE|exit_code)\s*[:=]\s*(-?\d+)\b|(?:exited|exit(?:ed)?\s+with)\s+(?:code\s+)?(-?\d+)\b`)
var observedFailureTextRe = regexp.MustCompile(`(?im)(error\s+TS\d+|npm\s+ERR!|FAIL(?:ED)?\b|tests?\s+failed|lint\s+failed|compilation\s+failed|unknown\s+compiler\s+option)`)

func ExtractObservedChecks(raw string) []ExecutionResultCheck {
	lines := strings.Split(raw, "\n")
	pendingByCall := map[string]pendingShellCheck{}
	pendingByTool := map[string][]pendingShellCheck{}
	checks := []ExecutionResultCheck{}
	seen := map[string]int{}

	appendCheck := func(check *ExecutionResultCheck) {
		if check == nil {
			return
		}
		if !isCheckCommand(check.Command) && check.Status != "failed" {
			return
		}
		key := executionCheckIdentity(*check)
		if index, ok := seen[key]; ok {
			if checks[index].Status != "failed" && check.Status == "failed" {
				checks[index] = *check
			}
			return
		}
		seen[key] = len(checks)
		checks = append(checks, *check)
	}

	for _, line := range lines {
		parsed := ParseStreamEvent(line)
		if parsed == nil || !isShellTool(parsed.ToolName) {
			continue
		}

		callID := streamEventCallID(parsed.Raw)
		tool := strings.ToLower(strings.TrimSpace(parsed.ToolName))

		switch parsed.Type {
		case EventToolUse:
			command := shellCommandFromInput(parsed.Input)
			if command == "" {
				continue
			}
			if parsed.Output != nil && (parsed.Status == "completed" || parsed.Status == "error") {
				appendCheck(observedCheckFromToolResult(command, parsed.Status, parsed.Output))
				continue
			}
			pending := pendingShellCheck{CallID: callID, Tool: tool, Command: command}
			if callID != "" {
				pendingByCall[callID] = pending
			}
			pendingByTool[tool] = append(pendingByTool[tool], pending)

		case EventToolResult:
			command := shellCommandFromOutput(parsed.Output)
			if command == "" && callID != "" {
				if pending, ok := pendingByCall[callID]; ok {
					command = pending.Command
					delete(pendingByCall, callID)
				}
			}
			if command == "" {
				stack := pendingByTool[tool]
				if len(stack) > 0 {
					pending := stack[len(stack)-1]
					command = pending.Command
					pendingByTool[tool] = stack[:len(stack)-1]
					if pending.CallID != "" {
						delete(pendingByCall, pending.CallID)
					}
				}
			}
			appendCheck(observedCheckFromToolResult(command, parsed.Status, parsed.Output))
		}
	}

	if len(checks) == 0 {
		return []ExecutionResultCheck{}
	}
	return checks
}

func HasFailedCriticalCheck(checks []ExecutionResultCheck) bool {
	for _, check := range checks {
		if check.Status == "failed" && IsCriticalCheckCommand(check.Command) {
			return true
		}
	}
	return false
}

func FailedCriticalCheckSummary(checks []ExecutionResultCheck) string {
	for _, check := range checks {
		if check.Status != "failed" || !IsCriticalCheckCommand(check.Command) {
			continue
		}
		if check.Details != nil && strings.TrimSpace(*check.Details) != "" {
			return fmt.Sprintf("Observed critical check failed: %s (%s)", check.Command, strings.TrimSpace(*check.Details))
		}
		return fmt.Sprintf("Observed critical check failed: %s", check.Command)
	}
	return ""
}

func IsCriticalCheckCommand(command string) bool {
	return isCheckCommand(command)
}

func isCheckCommand(command string) bool {
	command = strings.TrimSpace(command)
	if command == "" {
		return false
	}
	return checkCommandRe.MatchString(command)
}

func isShellTool(tool string) bool {
	switch strings.ToLower(strings.TrimSpace(tool)) {
	case "bash", "shell", "terminal", "exec", "exec_command":
		return true
	default:
		return false
	}
}

func streamEventCallID(raw map[string]interface{}) string {
	if raw == nil {
		return ""
	}
	if id := firstNonEmptyStr(raw, "callID", "callId", "id"); id != "" {
		return id
	}
	part, _ := raw["part"].(map[string]interface{})
	if part == nil {
		return ""
	}
	return firstNonEmptyStr(part, "callID", "callId", "id")
}

func shellCommandFromInput(input interface{}) string {
	m, ok := input.(map[string]interface{})
	if !ok {
		return ""
	}
	return firstNonEmptyStr(m, "command", "cmd")
}

func shellCommandFromOutput(output interface{}) string {
	m, ok := output.(map[string]interface{})
	if !ok {
		return ""
	}
	return firstNonEmptyStr(m, "command", "cmd")
}

func observedCheckFromToolResult(command, status string, output interface{}) *ExecutionResultCheck {
	command = strings.TrimSpace(command)
	if command == "" {
		return nil
	}

	outputText := observedOutputText(output)
	exitCode := observedExitCode(output)
	normalizedStatus := normalizeExecutionCheckStatus(status)
	if exitCode != nil && *exitCode != 0 {
		normalizedStatus = "failed"
	}
	if normalizedStatus != "failed" && IsCriticalCheckCommand(command) && observedOutputLooksFailed(outputText) {
		normalizedStatus = "failed"
	}
	if normalizedStatus == "" {
		normalizedStatus = "passed"
	}

	var details *string
	if normalizedStatus == "failed" {
		message := strings.TrimSpace(extractErrorMessage(output))
		if message == "" {
			message = summarizeStringOutput(outputText)
		}
		if exitCode != nil {
			if message != "" {
				message = fmt.Sprintf("exit code %d: %s", *exitCode, message)
			} else {
				message = fmt.Sprintf("exit code %d", *exitCode)
			}
		}
		if message != "" {
			details = &message
		}
	}

	return &ExecutionResultCheck{
		Name:       command,
		Status:     normalizedStatus,
		Details:    details,
		Command:    command,
		Observed:   true,
		ExitCode:   exitCode,
		DurationMs: observedDurationMs(output),
	}
}

func observedOutputLooksFailed(text string) bool {
	text = strings.TrimSpace(text)
	if text == "" {
		return false
	}
	return observedFailureTextRe.MatchString(text)
}

func observedExitCode(output interface{}) *int {
	if parsed := observedExitCodeFromText(observedOutputText(output)); parsed != nil {
		return parsed
	}
	m, ok := output.(map[string]interface{})
	if !ok {
		return nil
	}
	return normalizeExecutionIntPointer(firstNonNil(m["exitCode"], m["exit_code"], m["code"]))
}

func observedOutputText(output interface{}) string {
	switch typed := output.(type) {
	case nil:
		return ""
	case string:
		return typed
	case map[string]interface{}:
		parts := []string{}
		for _, key := range []string{"stdout", "stderr", "output", "text", "message", "error", "raw", "result"} {
			if value, ok := typed[key]; ok {
				text := observedOutputText(value)
				if strings.TrimSpace(text) != "" {
					parts = append(parts, text)
				}
			}
		}
		return strings.Join(parts, "\n")
	case []interface{}:
		parts := []string{}
		for _, value := range typed {
			text := observedOutputText(value)
			if strings.TrimSpace(text) != "" {
				parts = append(parts, text)
			}
		}
		return strings.Join(parts, "\n")
	default:
		return compactJSON(output)
	}
}

func observedExitCodeFromText(text string) *int {
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	matches := observedExitCodeRe.FindStringSubmatch(text)
	if len(matches) == 0 {
		return nil
	}
	for _, match := range matches[1:] {
		if parsed := normalizeExecutionIntPointer(match); parsed != nil {
			return parsed
		}
	}
	return nil
}

func observedDurationMs(output interface{}) *int64 {
	m, ok := output.(map[string]interface{})
	if !ok {
		return nil
	}
	return normalizeExecutionInt64Pointer(firstNonNil(m["durationMs"], m["duration_ms"]))
}
