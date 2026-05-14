package orchestrator

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/executor"
	"github.com/fluxo-app/fluxo-runner/internal/rag"
	"github.com/fluxo-app/fluxo-runner/internal/runner"
)

type AgentWorker struct {
	apiURL   string
	apiKey   string
	runnerID string
	pollInterval time.Duration

	mu     sync.RWMutex
	agent   config.AgentConfig
	stopCh chan struct{}
}

func NewAgentWorker(apiURL, apiKey, runnerID string, agent config.AgentConfig, pollInterval time.Duration) *AgentWorker {
	return &AgentWorker{
		apiURL:   apiURL,
		apiKey:   apiKey,
		runnerID: runnerID,
		pollInterval: pollInterval,
		agent:    agent,
		stopCh:   make(chan struct{}),
	}
}

func (w *AgentWorker) UpdateAgent(agent config.AgentConfig) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.agent = agent
}

func (w *AgentWorker) Stop() {
	select {
	case <-w.stopCh:
	default:
		close(w.stopCh)
	}
}

func (w *AgentWorker) Run(ctx context.Context) {
	interval := w.pollInterval
	if interval <= 0 {
		interval = 30 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	w.runOnce(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.runOnce(ctx)
		}
	}
}

func (w *AgentWorker) runOnce(ctx context.Context) {
	w.mu.RLock()
	agent := w.agent
	w.mu.RUnlock()

	client := api.NewClient(w.apiURL, w.apiKey, agent.Name)
	runner.SendHeartbeat(client, agent, "ONLINE")

	claimed, err := api.ClaimNextTask(client, api.ClaimNextTaskParams{
		AgentID:          agent.ID,
		RunnerInstanceID: w.runnerID,
		PickStatus:       defaultStr(agent.PickStatus, "TODO"),
		ClaimStatus:      defaultStr(agent.ClaimStatus, "DOING"),
		ProjectID:        agent.ProjectID,
		CandidateLimit:   10,
		Tool:             agent.Tool,
		Model:            agent.Model,
		WorkspaceMode:    "shared_project",
	})
	if err != nil {
		fmt.Printf("[%s] claim-next error: %v\n", agent.Name, err)
		return
	}
	if claimed == nil {
		return
	}

	runner.SendHeartbeat(client, agent, "BUSY")
	_ = api.UpdateExecution(client, claimed.Execution.ID, map[string]interface{}{
		"status":          "RUNNING",
		"lastHeartbeatAt": time.Now().UTC().Format(time.RFC3339),
	})

	_, _ = client.Post("/tasks/"+claimed.Task.ID+"/comments", map[string]interface{}{
		"content": fmt.Sprintf("## Execution Started\n\n**Agent:** %s  \n**Tool:** %s  \n**Model:** %s", agent.Name, agent.Tool, agent.Model),
		"agentId": agent.ID,
	})

	ragContext := rag.FetchContext(client, claimed.Task.Title, claimed.Task.ProjectID)
	prompt := runner.BuildPrompt(runner.Task{
		ID:          claimed.Task.ID,
		Title:       claimed.Task.Title,
		Description: claimed.Task.Description,
		Priority:    claimed.Task.Priority,
		Type:        claimed.Task.Type,
		ProjectID:   claimed.Task.ProjectID,
		Status:      claimed.Task.Status,
	}, agent, ragContext)

	var exec executor.Executor
	switch agent.Tool {
	case "claude":
		exec = &executor.ClaudeExecutor{Config: agent}
	default:
		exec = &executor.OpenCodeExecutor{Config: agent}
	}

	timeout := time.Duration(agent.Timeout) * time.Second
	if timeout == 0 {
		timeout = 300 * time.Second
	}

	var (
		eventMu       sync.Mutex
		pendingEvents []api.ExecutionEvent
		fullOutput    []string
		lastFlush     = time.Now()
	)
	flushEvents := func(force bool) {
		eventMu.Lock()
		defer eventMu.Unlock()
		if len(pendingEvents) == 0 {
			return
		}
		if !force && len(pendingEvents) < 5 && time.Since(lastFlush) < 2*time.Second {
			return
		}
		_, err := api.AppendExecutionEvents(client, claimed.Execution.ID, pendingEvents)
		if err == nil {
			pendingEvents = nil
			lastFlush = time.Now()
		}
	}

	start := time.Now()
	execCtx, execCancel := context.WithCancel(ctx)
	heartbeatDone := make(chan struct{})
	go func() {
		defer close(heartbeatDone)
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-execCtx.Done():
				return
			case <-ticker.C:
				if err := api.HeartbeatExecution(client, claimed.Execution.ID); err != nil {
					fmt.Printf("[%s] execution heartbeat error: %v\n", agent.Name, err)
				}
			}
		}
	}()

	result := exec.Execute(execCtx, prompt, agent.Workdir, timeout, func(event executor.StreamEvent) {
		content := strings.TrimSpace(event.Content)
		if content == "" {
			return
		}
		eventMu.Lock()
		pendingEvents = append(pendingEvents, api.ExecutionEvent{
			Seq:     event.Seq,
			Kind:    event.Kind,
			Content: content,
		})
		fullOutput = append(fullOutput, content)
		eventMu.Unlock()
		flushEvents(false)
	})
	execCancel()
	<-heartbeatDone
	flushEvents(true)

	duration := int(time.Since(start).Seconds())
	output := strings.Join(fullOutput, "\n")
	readableOutput := runner.ExtractReadableOutput(output)
	comment := runner.FormatExecutionComment(agent.Name, agent.Tool, result.Success, float64(duration), output, result.ExitCode)

	status := "FAILED"
	nextStatus := defaultStr(agent.ClaimStatus, "DOING")
	var nextAssignee *string
	errorMessage := truncate(readableOutput, 2000)
	blockReason := fmt.Sprintf("Agent %s failed while running %s.", agent.Name, agent.Tool)
	if result.Success {
		status = "SUCCESS"
		nextStatus = defaultStr(agent.DoneStatus, "DONE")
		errorMessage = ""
		if agent.NextAssigneeID != "" {
			nextAssignee = &agent.NextAssigneeID
		}
		blockReason = ""
	}

	_, err = api.FinalizeExecution(client, claimed.Execution.ID, api.FinalizeExecutionParams{
		Status:              status,
		Output:              output,
		ResultSummary:       truncate(readableOutput, 500),
		ErrorMessage:        errorMessage,
		ExitCode:            result.ExitCode,
		Duration:            duration,
		NextStatus:          nextStatus,
		NextAssigneeAgentID: nextAssignee,
		BlockReason:         nullableString(blockReason),
		Comment:             comment,
		Metadata: map[string]interface{}{
			"tool": agent.Tool,
			"model": agent.Model,
		},
	})
	if err != nil {
		fmt.Printf("[%s] finalize error: %v\n", agent.Name, err)
	}

	runner.SendHeartbeat(client, agent, "ONLINE")
}

func defaultStr(val, def string) string {
	if val == "" {
		return def
	}
	return val
}

func truncate(val string, max int) string {
	if max <= 0 || len(val) <= max {
		return val
	}
	return val[:max]
}

func nullableString(val string) *string {
	if strings.TrimSpace(val) == "" {
		return nil
	}
	return &val
}
