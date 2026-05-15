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

	configObj := map[string]interface{}{}
	if len(availableModels) > 0 {
		configObj["available_models"] = availableModels
	}
	if agent.Model != "" {
		configObj["model"] = agent.Model
	}
	if agent.AgentType != "" {
		configObj["agent_type"] = agent.AgentType
	}
	if agent.Role != "" {
		configObj["role"] = agent.Role
	}
	if agent.RolePrompt != "" {
		configObj["role_prompt"] = agent.RolePrompt
	}
	if len(agent.OperatingRules) > 0 {
		configObj["operating_rules"] = agent.OperatingRules
	}
	if agent.OutputSchemaVersion != "" {
		configObj["output_schema_version"] = agent.OutputSchemaVersion
	}
	if agent.Variant != "" {
		configObj["variant"] = agent.Variant
	}
	if len(configObj) > 0 {
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
	if agent.ID != "" {
		pollPath += "&assigneeAgentId=" + url.QueryEscape(agent.ID)
	} else if agent.AssigneeID != "" {
		pollPath += "&assigneeAgentId=" + url.QueryEscape(agent.AssigneeID)
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

	// Step 1.5: Create execution record (CLAIMED)
	agentMu.Lock()
	agentID := agentRegistryIDs[agent.Name]
	agentMu.Unlock()

	execID, execErr := api.CreateExecution(client, task.ID, agentID, task.ProjectID, agent.Tool, agent.Model)
	if execErr != nil {
		fmt.Printf("  \033[33m[%s] Execution record failed: %v\033[0m\n", agent.Name, execErr)
		// Non-fatal — continue without execution tracking
	} else {
		fmt.Printf("  \033[90m[%s] Execution: %s...\033[0m\n", agent.Name, execID[:8])
	}

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
		"content": fmt.Sprintf("## 🚀 Execution Started\n\n**Agent:** %s  \n**Tool:** %s  \n**Model:** %s", agent.Name, agent.Tool, agent.Model),
		"agentId": agentID,
	})

	// Update execution: RUNNING
	if execID != "" {
		api.UpdateExecution(client, execID, map[string]interface{}{
			"status": "RUNNING",
		})
	}

	// Step 3: Execute
	fmt.Printf("  \033[33m[%s] Executing with %s...\033[0m\n", agent.Name, agent.Tool)

	gitPolicy := ResolveGitPolicy(agent.GitPolicy, GitPolicyNoWrite)
	gitCfg := GitWorkflowConfig{
		Policy:        gitPolicy,
		BaseBranch:    agent.GitBaseBranch,
		AllowedPrefix: agent.GitAllowedPrefix,
		AgentName:     agent.Name,
		TaskID:        task.ID,
		TaskType:      task.Type,
		TaskTitle:     task.Title,
		ExecID:        execID,
		Workdir:       agent.Workdir,
		PushAfterCommit: PolicyRequiresPush(gitPolicy),
		CreatePR:      PolicyRequiresPR(gitPolicy),
		PRDraft:       true,
	}

	gitWorkflowResult := ExecuteGitWorkflow(gitCfg)
	if !gitWorkflowResult.PreflightOK {
		fmt.Printf("  \033[33m[%s] Git preflight warning: %s (continuing in no_write mode)\033[0m\n", agent.Name, gitWorkflowResult.Error)
		gitPolicy = GitPolicyNoWrite
		gitCfg.Policy = GitPolicyNoWrite
		gitCfg.PushAfterCommit = false
		gitCfg.CreatePR = false
	} else if gitWorkflowResult.Error != nil {
		fmt.Printf("  \033[33m[%s] Git branch prepare warning: %s (continuing in no_write mode)\033[0m\n", agent.Name, gitWorkflowResult.Error)
		gitPolicy = GitPolicyNoWrite
		gitCfg.Policy = GitPolicyNoWrite
		gitCfg.PushAfterCommit = false
		gitCfg.CreatePR = false
	} else {
		fmt.Printf("  \033[90m[%s] Git: branch=%s mode=%s\033[0m\n", agent.Name, gitWorkflowResult.BranchName, gitPolicy)
	}

	prompt := BuildPrompt(task, agent)

	var exec2 executor.Executor
	switch agent.Tool {
	case "claude":
		exec2 = &executor.ClaudeExecutor{Config: agent}
	case "opencode":
		exec2 = &executor.OpenCodeExecutor{Config: agent}
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
	result := exec2.Execute(ctx, prompt, agent.Workdir, timeout, nil)
	elapsed := time.Since(startTime).Seconds()
	elapsedInt := int(elapsed)

	if result.Success && PolicyRequiresCommit(gitPolicy) {
		finalResult := FinalizeGitWorkflow(gitCfg, gitWorkflowResult.Preparation)
		if finalResult.Error != nil {
			fmt.Printf("  \033[33m[%s] Git finalize warning: %s\033[0m\n", agent.Name, finalResult.Error)
		} else {
			gitWorkflowResult = finalResult
			if len(finalResult.CommitShas) > 0 {
				fmt.Printf("  \033[90m[%s] Git: committed %d SHA(s)\033[0m\n", agent.Name, len(finalResult.CommitShas))
			}
			if finalResult.PRUrl != nil && *finalResult.PRUrl != "" {
				fmt.Printf("  \033[90m[%s] Git: PR %s\033[0m\n", agent.Name, *finalResult.PRUrl)
			}
		}
	}

	statusIcon := "\033[32m✓\033[0m"
	statusText := "SUCCESS"
	execStatus := "SUCCESS"
	if !result.Success {
		statusIcon = "\033[31m✗\033[0m"
		statusText = "FAILED"
		execStatus = "FAILED"
	}
	fmt.Printf("  %s [%s] %s in %.1fs\n", statusIcon, agent.Name, statusText, elapsed)

	// Update execution: SUCCESS/FAILED
	if execID != "" {
		readableOutput := ExtractReadableOutput(result.Output)
		execResult := map[string]interface{}{
			"status":     execStatus,
			"duration":   elapsedInt,
			"finishedAt": time.Now().UTC().Format(time.RFC3339),
		}
		if result.ExitCode != 0 {
			execResult["exitCode"] = result.ExitCode
		}
		if !result.Success && len(readableOutput) > 0 {
			errMsg := readableOutput
			if len(errMsg) > 2000 {
				errMsg = errMsg[:2000]
			}
			execResult["errorMessage"] = errMsg
		}
		if result.Success {
			summary := readableOutput
			if len(summary) > 500 {
				summary = summary[:500]
			}
			execResult["resultSummary"] = summary
		}
		gitMeta := GitMetadataMap(gitWorkflowResult.Snapshot)
		if len(gitMeta) > 0 {
			execResult["metadata"] = map[string]interface{}{"git": gitMeta}
		}
		api.UpdateExecution(client, execID, execResult)
	}

	// Step 5: Post result
	comment := FormatExecutionComment(agent.Name, agent.Tool, result.Success, elapsed, result.Output, result.ExitCode)
	client.Post("/tasks/"+task.ID+"/comments", map[string]interface{}{"content": comment, "agentId": agentID})

	// Step 6: Handoff
	doneStatus := defaultStr(agent.DoneStatus, "DONE")
	patchBody := map[string]interface{}{}
	if !result.Success {
		doneStatus = claimStatus
		patchBody["blocked"] = true
		patchBody["blockReason"] = fmt.Sprintf("Agent %s failed after %.1fs while running %s. Check execution logs and comments for details.", agent.Name, elapsed, agent.Tool)
	} else {
		patchBody["blocked"] = false
	}
	changeReason := fmt.Sprintf("[FluXo Runner][%s] Execution %s with %s", agent.Name, statusText, agent.Tool)
	patchBody["status"] = doneStatus
	patchBody["_metadata"] = map[string]interface{}{
		"status":        doneStatus,
		"changeReason":  changeReason,
	}
	if gitWorkflowResult.Snapshot.Mode != "" {
		patchBody["_metadata"].(map[string]interface{})["git"] = GitMetadataMap(gitWorkflowResult.Snapshot)
	}
	if gitWorkflowResult.PRUrl != nil && *gitWorkflowResult.PRUrl != "" {
		patchBody["prUrl"] = *gitWorkflowResult.PRUrl
	}
	if gitWorkflowResult.PRNumber != nil {
		patchBody["prNumber"] = *gitWorkflowResult.PRNumber
	}
	if result.Success && agent.NextAssigneeID != "" {
		patchBody["assigneeAgentId"] = agent.NextAssigneeID
	}

	fmt.Printf("  [%s] Handoff → %s\n", agent.Name, doneStatus)
	client.Patch("/tasks/"+task.ID, patchBody)

	if result.Success && agent.NextAssigneeID != "" {
		client.Post("/tasks/"+task.ID+"/comments", map[string]interface{}{
			"content": fmt.Sprintf("[FluXo Runner][%s] Reassigned to next agent.", agent.Name),
			"agentId": agentID,
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
