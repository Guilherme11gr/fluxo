package runner

import (
	"fmt"

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

// BuildPrompt constructs the full prompt sent to the coding agent.
func BuildPrompt(task Task, agent config.AgentConfig, ragContext string) string {
	var prompt string

	// Agent context
	if agent.Context != "" {
		prompt += agent.Context + "\n"
	}

	// RAG context
	if ragContext != "" {
		prompt += ragContext + "\n"
	}

	// Task info
	prompt += fmt.Sprintf("\n## Task: %s\n", task.Title)
	if task.Description != "" {
		prompt += fmt.Sprintf("\n### Description\n%s\n", task.Description)
	}
	prompt += fmt.Sprintf("\nTask ID: %s\n", task.ID)
	prompt += fmt.Sprintf("Priority: %s\n", defaultStr(task.Priority, "MEDIUM"))
	prompt += fmt.Sprintf("Type: %s\n", defaultStr(task.Type, "TASK"))

	if agent.Workdir != "" {
		prompt += fmt.Sprintf("\nWorking directory: %s\n", agent.Workdir)
	}

	prompt += "\n## Instructions\n"
	prompt += "- Execute the task described above.\n"
	prompt += "- If you modify code, commit your changes.\n"
	prompt += "- Post a summary of what you did.\n"

	return prompt
}

func defaultStr(val, def string) string {
	if val == "" {
		return def
	}
	return val
}
