package runner

import (
	"fmt"
	"strings"

	"github.com/fluxo-app/fluxo-runner/internal/config"
)

// Task represents a FluXo task from the API.
type Task struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Description string `json:"description"`
	Priority    string `json:"priority"`
	Type        string `json:"type"`
	ProjectID   string `json:"projectId"`
	Status      string `json:"status"`
}

const (
	ResultStartMarker = "FLUXO_RESULT_JSON_START"
	ResultEndMarker   = "FLUXO_RESULT_JSON_END"
)

// BuildPrompt constructs the full prompt sent to the coding agent.
func BuildPrompt(task Task, agent config.AgentConfig) string {
	var prompt strings.Builder

	role := strings.TrimSpace(agent.Role)
	if role == "" {
		role = defaultStr(agent.AgentType, "custom")
	}

	rolePrompt := strings.TrimSpace(agent.RolePrompt)
	outputSchemaVersion := defaultStr(strings.TrimSpace(agent.OutputSchemaVersion), "v1")
	operatingRules := normalizedRules(agent.OperatingRules)

	prompt.WriteString("## Role\n")
	prompt.WriteString(fmt.Sprintf("Role: %s\n", role))
	if rolePrompt != "" {
		prompt.WriteString("\n")
		prompt.WriteString(rolePrompt)
		prompt.WriteString("\n")
	}

	prompt.WriteString(fmt.Sprintf("\n## Task: %s\n", task.Title))
	if task.Description != "" {
		prompt.WriteString(fmt.Sprintf("\n### Description\n%s\n", task.Description))
	}
	prompt.WriteString(fmt.Sprintf("\nTask ID: %s\n", task.ID))
	prompt.WriteString(fmt.Sprintf("Priority: %s\n", defaultStr(task.Priority, "MEDIUM")))
	prompt.WriteString(fmt.Sprintf("Type: %s\n", defaultStr(task.Type, "TASK")))

	if agent.Workdir != "" {
		prompt.WriteString(fmt.Sprintf("Working directory: %s\n", agent.Workdir))
	}

	prompt.WriteString("\n## Operating Rules\n")
	for _, rule := range operatingRules {
		prompt.WriteString("- ")
		prompt.WriteString(rule)
		prompt.WriteString("\n")
	}

	prompt.WriteString("\n## Output Contract\n")
	prompt.WriteString("Return your final response with a concise summary and include a valid JSON object between these exact markers:\n")
	prompt.WriteString(ResultStartMarker)
	prompt.WriteString("\n")
	prompt.WriteString(buildOutputSchemaExample(outputSchemaVersion))
	prompt.WriteString("\n")
	prompt.WriteString(ResultEndMarker)
	prompt.WriteString("\n")
	prompt.WriteString("Use empty arrays when unknown and null for unavailable git fields.\n")

	prompt.WriteString("\n## Instructions\n")
	prompt.WriteString("- Execute only the requested task.\n")
	prompt.WriteString("- Keep changes minimal, testable, and explicit.\n")
	prompt.WriteString("- End with the structured result block.\n")

	return prompt.String()
}

func defaultStr(val, def string) string {
	if val == "" {
		return def
	}
	return val
}

func normalizedRules(rules []string) []string {
	if len(rules) == 0 {
		return []string{
			"Do not write directly to protected branches.",
			"Keep the final response machine-readable.",
		}
	}

	out := make([]string, 0, len(rules))
	for _, rule := range rules {
		rule = strings.TrimSpace(rule)
		if rule == "" {
			continue
		}
		out = append(out, rule)
	}
	if len(out) == 0 {
		return []string{
			"Do not write directly to protected branches.",
			"Keep the final response machine-readable.",
		}
	}
	return out
}

func buildOutputSchemaExample(version string) string {
	if version != "v1" {
		version = "v1"
	}

	return fmt.Sprintf(`{
  "schemaVersion": %q,
  "status": "success",
  "summary": "Short summary of the outcome.",
  "whatChanged": [],
  "decisions": [],
  "risks": [],
  "checksRun": [
    { "name": "name of a check", "status": "passed", "details": null }
  ],
  "filesTouched": [],
  "git": {
    "mode": "manual",
    "baseBranch": null,
    "branch": null,
    "commitShas": [],
    "prUrl": null,
    "prNumber": null
  },
  "followups": [],
  "memoryCandidates": [],
  "skillCandidates": []
}` , version)
}
