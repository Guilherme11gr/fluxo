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

type GitWorkflowConfig struct {
	Policy           GitPolicy
	BaseBranch       string
	AllowedPrefix    string
	AgentName        string
	TaskID           string
	TaskType         string
	TaskTitle        string
	ExecID           string
	Workdir          string
	PushAfterCommit  bool
	CreatePR         bool
	PRDraft          bool
}

type PreviousExecutionContext struct {
	ID            string
	Status        string
	ResultSummary string
	ErrorMessage  string
	OutputExcerpt string
	ExitCode      *int
	Duration      *int
	StartedAt     string
	FinishedAt    string
	Git           *PreviousExecutionGitContext
}

type PreviousExecutionGitContext struct {
	Mode       string
	BaseBranch string
	Branch     string
	CommitShas []string
	PRUrl      string
	PRNumber   *int
}

const (
	ResultStartMarker = "FLUXO_RESULT_JSON_START"
	ResultEndMarker   = "FLUXO_RESULT_JSON_END"
)

// BuildPrompt constructs the full prompt sent to the coding agent.
func BuildPrompt(task Task, agent config.AgentConfig) string {
	return BuildPromptWithPreviousExecution(task, agent, nil)
}

func BuildPromptWithPreviousExecution(task Task, agent config.AgentConfig, previousExecution *PreviousExecutionContext) string {
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
	prompt.WriteString(fmt.Sprintf("Current Status: %s\n", defaultStr(task.Status, "TODO")))

	if agent.Workdir != "" {
		prompt.WriteString(fmt.Sprintf("Working directory: %s\n", agent.Workdir))
	}

	if previousExecution != nil {
		prompt.WriteString("\n## Previous Attempt Context\n")
		prompt.WriteString(fmt.Sprintf("Previous Execution ID: %s\n", previousExecution.ID))
		prompt.WriteString(fmt.Sprintf("Previous Status: %s\n", defaultStr(previousExecution.Status, "UNKNOWN")))
		if previousExecution.StartedAt != "" {
			prompt.WriteString(fmt.Sprintf("Started At: %s\n", previousExecution.StartedAt))
		}
		if previousExecution.FinishedAt != "" {
			prompt.WriteString(fmt.Sprintf("Finished At: %s\n", previousExecution.FinishedAt))
		}
		if previousExecution.Duration != nil {
			prompt.WriteString(fmt.Sprintf("Duration Seconds: %d\n", *previousExecution.Duration))
		}
		if previousExecution.ExitCode != nil {
			prompt.WriteString(fmt.Sprintf("Exit Code: %d\n", *previousExecution.ExitCode))
		}
		if previousExecution.ResultSummary != "" {
			prompt.WriteString("\nPrevious Summary:\n")
			prompt.WriteString(previousExecution.ResultSummary)
			prompt.WriteString("\n")
		}
		if previousExecution.ErrorMessage != "" {
			prompt.WriteString("\nPrevious Error:\n")
			prompt.WriteString(previousExecution.ErrorMessage)
			prompt.WriteString("\n")
		}
		if previousExecution.OutputExcerpt != "" {
			prompt.WriteString("\nPrevious Output Excerpt:\n")
			prompt.WriteString(previousExecution.OutputExcerpt)
			prompt.WriteString("\n")
		}
		if previousExecution.Git != nil {
			prompt.WriteString("\nPrevious Git Context:\n")
			if previousExecution.Git.Mode != "" {
				prompt.WriteString(fmt.Sprintf("- Mode: %s\n", previousExecution.Git.Mode))
			}
			if previousExecution.Git.BaseBranch != "" {
				prompt.WriteString(fmt.Sprintf("- Base Branch: %s\n", previousExecution.Git.BaseBranch))
			}
			if previousExecution.Git.Branch != "" {
				prompt.WriteString(fmt.Sprintf("- Branch: %s\n", previousExecution.Git.Branch))
			}
			if len(previousExecution.Git.CommitShas) > 0 {
				prompt.WriteString(fmt.Sprintf("- Commit SHAs: %s\n", strings.Join(previousExecution.Git.CommitShas, ", ")))
			}
			if previousExecution.Git.PRUrl != "" {
				prompt.WriteString(fmt.Sprintf("- PR URL: %s\n", previousExecution.Git.PRUrl))
			}
			if previousExecution.Git.PRNumber != nil {
				prompt.WriteString(fmt.Sprintf("- PR Number: %d\n", *previousExecution.Git.PRNumber))
			}
		}
		prompt.WriteString("\nUse this previous attempt context to continue safely instead of restarting blindly.\n")
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
}`, version)
}
