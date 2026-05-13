package runner

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"sync"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/executor"
	"github.com/fluxo-app/fluxo-runner/internal/rag"
)

// activeTask tracks the current task being executed (for graceful shutdown).
var activeTask *struct {
	Task  Task
	Agent config.AgentConfig
}

// agentRegistryIDs maps agent names to their registered IDs.
// Protected by agentMu for concurrent access from syncer.
var (
	agentRegistryIDs = map[string]string{}
	agentMu          sync.Mutex
)

// RegisterAgent registers an agent with the FluXo API.
// If availableModels is non-empty, it is included in the config payload
// so the web UI can show real model suggestions.
func RegisterAgent(client *api.Client, agent config.AgentConfig, availableModels []string) string {
	body := map[string]interface{}{
		"name": agent.Name,
		"type": "RUNNER",
		"tool": agent.Tool,
		"workdir": agent.Workdir,
	}

	if len(availableModels) > 0 {
		configObj := map[string]interface{}{
			"available_models": availableModels,
		}
		if agent.Model != "" {
			configObj["model"] = agent.Model
		}
		if agent.AgentType != "" {
			configObj["agent_type"] = agent.AgentType
		}
		if agent.Variant != "" {
			configObj["variant"] = agent.Variant
		}
		body["config"] = configObj
	}

	resp, err := client.Post("/agents", body)
	if err != nil {
		fmt.Printf("  \033[33m[%s] Register error: %v\033[0m\n", agent.Name, err)
		return ""
	}

	if errMsg, ok := resp["error"]; ok {
		fmt.Printf("  \033[33m[%s] Register failed: %v\033[0m\n", agent.Name, errMsg)
		return ""
	}

	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		return ""
	}

	id, ok := data["id"].(string)
	if !ok {
		return ""
	}

	agentMu.Lock()
	agentRegistryIDs[agent.Name] = id
	agentMu.Unlock()
	return id
}

// SendHeartbeat sends a heartbeat for an agent, optionally including available_models.
func SendHeartbeat(client *api.Client, agent config.AgentConfig, status string) {
	agentMu.Lock()
	agentID, ok := agentRegistryIDs[agent.Name]
	agentMu.Unlock()
	if !ok {
		return
	}
	payload := map[string]interface{}{"status": status}
	if len(agent.AvailableModels) > 0 {
		payload["config"] = map[string]interface{}{
			"available_models": agent.AvailableModels,
		}
	}
	client.Post("/agents/"+agentID+"/heartbeat", payload)
}

// PollAndExecute runs the full poll → claim → execute → post → handoff cycle.
func PollAndExecute(client *api.Client, agent config.AgentConfig) {
	// Heartbeat: BUSY
	SendHeartbeat(client, agent, "BUSY")

	// Step 1: Poll for tasks
	pickStatus := defaultStr(agent.PickStatus, "TODO")
	pollPath := fmt.Sprintf("/tasks?status=%s&limit=5", url.QueryEscape(pickStatus))
	if agent.AssigneeID != "" {
		pollPath += "&assigneeId=" + url.QueryEscape(agent.AssigneeID)
	}
	if agent.ProjectID != "" {
		pollPath += "&projectId=" + url.QueryEscape(agent.ProjectID)
	}

	fmt.Printf("\n\033[36m[%s]\033[0m Polling tasks...\n", agent.Name)

	resp, err := client.Get(pollPath)
	if err != nil {
		fmt.Printf("  \033[31m[%s] Poll error: %v\033[0m\n", agent.Name, err)
		SendHeartbeat(client, agent, "ONLINE")
		return
	}

	// Extract tasks array
	var tasks []interface{}
	if data, ok := resp["data"].([]interface{}); ok {
		tasks = data
	} else if arr, ok := resp["data"].([]interface{}); ok {
		tasks = arr
	}

	if len(tasks) == 0 {
		fmt.Printf("  \033[90m[%s] No tasks found.\033[0m\n", agent.Name)
		SendHeartbeat(client, agent, "ONLINE")
		return
	}

	// Parse first task
	taskMap, ok := tasks[0].(map[string]interface{})
	if !ok {
		fmt.Printf("  \033[31m[%s] Invalid task format\033[0m\n", agent.Name)
		SendHeartbeat(client, agent, "ONLINE")
		return
	}

	taskBytes, _ := json.Marshal(taskMap)
	var task Task
	json.Unmarshal(taskBytes, &task)

	shortID := task.ID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}
	fmt.Printf("  \033[32m[%s]\033[0m Found: \"%s\" (%s...)\n", agent.Name, task.Title, shortID)

	// Step 2: Claim
	claimStatus := defaultStr(agent.ClaimStatus, "DOING")
	fmt.Printf("  [%s] Claiming → %s\n", agent.Name, claimStatus)
	activeTask = &struct {
		Task  Task
		Agent config.AgentConfig
	}{Task: task, Agent: agent}

	_, err = client.Patch("/tasks/"+task.ID, map[string]interface{}{"status": claimStatus})
	if err != nil {
		fmt.Printf("  \033[31m[%s] Claim error: %v\033[0m\n", agent.Name, err)
		activeTask = nil
		return
	}

	// Post "started" comment
	client.Post("/tasks/"+task.ID+"/comments", map[string]interface{}{
		"content": fmt.Sprintf("[FluXo Runner][%s] Task claimed. Starting execution with %s...", agent.Name, agent.Tool),
	})

	// Step 3: Fetch RAG context
	fmt.Printf("  \033[90m[%s] Fetching RAG context...\033[0m\n", agent.Name)
	ragContext := rag.FetchContext(client, task.Title, task.ProjectID)

	// Step 4: Execute
	fmt.Printf("  \033[33m[%s] Executing with %s...\033[0m\n", agent.Name, agent.Tool)
	prompt := BuildPrompt(task, agent, ragContext)

	var exec executor.Executor
	switch agent.Tool {
	case "claude":
		exec = &executor.ClaudeExecutor{Config: agent}
	case "opencode":
		exec = &executor.OpenCodeExecutor{Config: agent}
	default:
		fmt.Printf("  \033[31m[%s] Unknown tool: %s\033[0m\n", agent.Name, agent.Tool)
		activeTask = nil
		SendHeartbeat(client, agent, "ONLINE")
		return
	}

	timeout := time.Duration(agent.Timeout) * time.Second
	if timeout == 0 {
		timeout = 300 * time.Second
	}

	startTime := time.Now()
	ctx := context.Background()
	result := exec.Execute(ctx, prompt, agent.Workdir, timeout)
	elapsed := time.Since(startTime).Seconds()

	statusIcon := "\033[32m✓\033[0m"
	statusText := "SUCCESS"
	if !result.Success {
		statusIcon = "\033[31m✗\033[0m"
		statusText = "FAILED"
	}
	fmt.Printf("  %s [%s] %s in %.1fs\n", statusIcon, agent.Name, statusText, elapsed)

	// Step 5: Post result
	const maxLen = 4000
	truncated := len(result.Output) > maxLen
	output := result.Output
	if len(output) > maxLen {
		output = output[:maxLen]
	}

	var summary string
	if result.Success {
		summary = fmt.Sprintf("[FluXo Runner][%s] Completed in %.1fs.\n\n%s", agent.Name, elapsed, output)
	} else {
		summary = fmt.Sprintf("[FluXo Runner][%s] FAILED in %.1fs (exit: %d).\n\n%s", agent.Name, elapsed, result.ExitCode, output)
	}
	if truncated {
		summary += "\n\n*(output truncated — full log available locally)*"
	}

	client.Post("/tasks/"+task.ID+"/comments", map[string]interface{}{"content": summary})

	// Step 6: Handoff
	doneStatus := defaultStr(agent.DoneStatus, "DONE")
	if !result.Success {
		doneStatus = "BLOCKED"
	}
	changeReason := fmt.Sprintf("[FluXo Runner][%s] Execution %s with %s", agent.Name, statusText, agent.Tool)
	patchBody := map[string]interface{}{
		"status":       doneStatus,
		"changeReason": changeReason,
	}
	if result.Success && agent.NextAssigneeID != "" {
		patchBody["assigneeId"] = agent.NextAssigneeID
	}

	fmt.Printf("  [%s] Handoff → %s\n", agent.Name, doneStatus)
	client.Patch("/tasks/"+task.ID, patchBody)

	if result.Success && agent.NextAssigneeID != "" {
		client.Post("/tasks/"+task.ID+"/comments", map[string]interface{}{
			"content": fmt.Sprintf("[FluXo Runner][%s] Reassigning to next agent for review.", agent.Name),
		})
	}

	activeTask = nil
	SendHeartbeat(client, agent, "ONLINE")
	fmt.Printf("  \033[32m[%s] Task complete.\033[0m\n", agent.Name)
}

// GetActiveTask returns the currently active task (for graceful shutdown).
func GetActiveTask() (Task, config.AgentConfig, bool) {
	if activeTask == nil {
		return Task{}, config.AgentConfig{}, false
	}
	return activeTask.Task, activeTask.Agent, true
}
