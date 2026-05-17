package orchestrator

import (
	"context"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/executor"
	"github.com/fluxo-app/fluxo-runner/internal/logging"
	"github.com/fluxo-app/fluxo-runner/internal/runner"
)

type AgentWorker struct {
	apiURL       string
	apiKey       string
	runnerID     string
	pollInterval time.Duration

	mu     sync.RWMutex
	agent  config.AgentConfig
	stopCh chan struct{}
}

func NewAgentWorker(apiURL, apiKey, runnerID string, agent config.AgentConfig, pollInterval time.Duration) *AgentWorker {
	return &AgentWorker{
		apiURL:       apiURL,
		apiKey:       apiKey,
		runnerID:     runnerID,
		pollInterval: pollInterval,
		agent:        agent,
		stopCh:       make(chan struct{}),
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
	logging.Debugf("worker[%s] polling claim-next pick=%s claim=%s project=%s tool=%s model=%s", agent.Name, defaultStr(agent.PickStatus, "TODO"), defaultStr(agent.ClaimStatus, "DOING"), agent.ProjectID, agent.Tool, agent.Model)

	claimed, err := api.ClaimNextTask(client, api.ClaimNextTaskParams{
		AgentID:          agent.ID,
		RunnerInstanceID: w.runnerID,
		PickStatus:       defaultStr(agent.PickStatus, "TODO"),
		ClaimStatus:      defaultStr(agent.ClaimStatus, "DOING"),
		ProjectID:        agent.ProjectID,
		CandidateLimit:   10,
		Tool:             agent.Tool,
		Model:            agent.Model,
	})
	if err != nil {
		fmt.Printf("[%s] claim-next error: %v\n", agent.Name, err)
		return
	}
	if claimed == nil {
		logging.Debugf("worker[%s] no eligible task returned", agent.Name)
		return
	}
	logging.Debugf("worker[%s] claimed task=%s exec=%s runtimeBinding.repoPath=%q runtimeBinding.gitPolicy=%q runtimeBinding.runnerProfile=%q", agent.Name, claimed.Task.ID, claimed.Execution.ID, claimed.RuntimeBinding.RepoPath, claimed.RuntimeBinding.GitPolicy, claimed.RuntimeBinding.RunnerProfile)

	gitPolicy := runner.ParseGitPolicy(claimed.RuntimeBinding.GitPolicy)
	gitBranch := runner.BuildBranchName(
		claimed.Task.ID,
		claimed.Task.Type,
		agent.Name,
		claimed.RuntimeBinding.AllowedBranchPrefix,
	)
	gitBaseBranch := claimed.RuntimeBinding.DefaultBaseBranch
	if gitBaseBranch == "" {
		gitBaseBranch = "main"
	}
	workdir := agent.Workdir
	if claimed.RuntimeBinding.RepoPath != "" {
		workdir = claimed.RuntimeBinding.RepoPath
	}
	workdir = strings.TrimSpace(workdir)
	if workdir == "" {
		errorMessage := fmt.Sprintf(
			"Execution cannot start without a resolved workdir. agent.workdir and runtimeBinding.repoPath are both empty for agent %s.",
			agent.Name,
		)
		if cwd, err := os.Getwd(); err == nil && strings.TrimSpace(cwd) != "" {
			errorMessage += fmt.Sprintf(" Runner current directory is %q, but runner-go now requires an explicit workdir for stable execution.", cwd)
		}
		if claimed.RuntimeBinding.ID == "" {
			errorMessage += " No project runtime binding matched this runner instance."
		}

		structuredResult, resultMeta := runner.BuildExecutionResultV1WithMeta(false, errorMessage, 1)
		persistedOutput := buildPersistedExecutionOutput("", errorMessage, "", structuredResult)
		_, _ = api.FinalizeExecution(client, claimed.Execution.ID, api.FinalizeExecutionParams{
			Status:        "FAILED",
			Output:        persistedOutput,
			ResultSummary: truncate(errorMessage, 500),
			Result:        structuredResult,
			ErrorMessage:  truncate(errorMessage, 2000),
			ExitCode:      1,
			Duration:      0,
			NextStatus:    defaultStr(agent.ClaimStatus, "DOING"),
			BlockReason:   nullableString(errorMessage),
			Comment:       runner.FormatExecutionComment(agent.Name, agent.Tool, false, 0, errorMessage, 1),
			Metadata: map[string]interface{}{
				"tool":  agent.Tool,
				"model": agent.Model,
				"git":   runner.GitMetadataMap(runner.GitSnapshot{Mode: string(gitPolicy)}),
				"outputContract": outputContractMetadata(resultMeta),
				"runtimeBinding": map[string]interface{}{
					"id":                  claimed.RuntimeBinding.ID,
					"projectId":           claimed.RuntimeBinding.ProjectID,
					"runnerProfile":       claimed.RuntimeBinding.RunnerProfile,
					"hostOs":              claimed.RuntimeBinding.HostOS,
					"repoPath":            claimed.RuntimeBinding.RepoPath,
					"defaultBaseBranch":   claimed.RuntimeBinding.DefaultBaseBranch,
					"allowedBranchPrefix": claimed.RuntimeBinding.AllowedBranchPrefix,
					"executionMode":       claimed.RuntimeBinding.ExecutionMode,
					"gitProvider":         claimed.RuntimeBinding.GitProvider,
					"prPolicy":            claimed.RuntimeBinding.PRPolicy,
					"gitPolicy":           claimed.RuntimeBinding.GitPolicy,
					"metadata":            claimed.RuntimeBinding.Metadata,
				},
			},
		})
		runner.SendHeartbeat(client, agent, "ONLINE")
		return
	}
	logging.Debugf("worker[%s] preparing git policy=%s branch=%s base=%s workdir=%q", agent.Name, gitPolicy, gitBranch, gitBaseBranch, workdir)
	preparedGit, err := runner.PrepareGitBranch(workdir, gitPolicy, gitBranch, gitBaseBranch, claimed.RuntimeBinding.AllowedBranchPrefix)
	if err != nil {
		logging.Debugf("worker[%s] git preparation failed: %v", agent.Name, err)
		failedGitSnapshot := runner.GitSnapshot{
			Branch:     gitBranch,
			BaseBranch: gitBaseBranch,
			CommitShas: []string{},
			Mode:       string(gitPolicy),
			CapturedAt: time.Now().UTC().Format(time.RFC3339),
		}
		errorMessage := runner.StripStructuredResultBlock(runner.ExtractReadableOutput(runner.FormatGitPreparationError(err, failedGitSnapshot)))
		baseResult, resultMeta := runner.BuildExecutionResultV1WithMeta(false, errorMessage, 1)
		structuredResult := runner.MergeGitResult(
			baseResult,
			failedGitSnapshot,
		)
		persistedOutput := buildPersistedExecutionOutput("", errorMessage, "", structuredResult)
		_, _ = api.FinalizeExecution(client, claimed.Execution.ID, api.FinalizeExecutionParams{
			Status:        "FAILED",
			Output:        persistedOutput,
			ResultSummary: truncate(errorMessage, 500),
			Result:        structuredResult,
			ErrorMessage:  truncate(errorMessage, 2000),
			ExitCode:      1,
			Duration:      0,
			NextStatus:    defaultStr(agent.ClaimStatus, "DOING"),
			BlockReason:   nullableString(errorMessage),
			Comment:       runner.FormatExecutionComment(agent.Name, agent.Tool, false, 0, errorMessage, 1),
			Metadata: map[string]interface{}{
				"tool":  agent.Tool,
				"model": agent.Model,
				"git":   runner.GitMetadataMap(failedGitSnapshot),
				"outputContract": outputContractMetadata(resultMeta),
				"runtimeBinding": map[string]interface{}{
					"id":                  claimed.RuntimeBinding.ID,
					"projectId":           claimed.RuntimeBinding.ProjectID,
					"runnerProfile":       claimed.RuntimeBinding.RunnerProfile,
					"hostOs":              claimed.RuntimeBinding.HostOS,
					"repoPath":            claimed.RuntimeBinding.RepoPath,
					"defaultBaseBranch":   claimed.RuntimeBinding.DefaultBaseBranch,
					"allowedBranchPrefix": claimed.RuntimeBinding.AllowedBranchPrefix,
					"executionMode":       claimed.RuntimeBinding.ExecutionMode,
					"gitProvider":         claimed.RuntimeBinding.GitProvider,
					"prPolicy":            claimed.RuntimeBinding.PRPolicy,
					"gitPolicy":           claimed.RuntimeBinding.GitPolicy,
					"metadata":            claimed.RuntimeBinding.Metadata,
				},
			},
		})
		runner.SendHeartbeat(client, agent, "ONLINE")
		return
	}
	logging.Debugf("worker[%s] git prepared branch=%q base=%q commits=%d", agent.Name, preparedGit.Branch, preparedGit.BaseBranch, len(preparedGit.CommitShas))

	preflight := runner.PreflightGitCheck(workdir, gitPolicy, gitBaseBranch, claimed.RuntimeBinding.AllowedBranchPrefix)
	if !preflight.OK {
		logging.Debugf("worker[%s] preflight check failed: %s", agent.Name, preflight.ErrorMessage)
		failedGitSnapshot := runner.GitSnapshot{
			Branch:     preflight.CurrentBranch,
			BaseBranch: preflight.BaseBranch,
			CommitShas: []string{},
			Mode:       string(gitPolicy),
			CapturedAt: time.Now().UTC().Format(time.RFC3339),
		}
		errorMessage := preflight.ErrorMessage
		baseResult, resultMeta := runner.BuildExecutionResultV1WithMeta(false, errorMessage, 1)
		structuredResult := runner.MergeGitResult(
			baseResult,
			failedGitSnapshot,
		)
		persistedOutput := buildPersistedExecutionOutput("", errorMessage, "", structuredResult)
		_, _ = api.FinalizeExecution(client, claimed.Execution.ID, api.FinalizeExecutionParams{
			Status:        "FAILED",
			Output:        persistedOutput,
			ResultSummary: truncate(errorMessage, 500),
			Result:        structuredResult,
			ErrorMessage:  truncate(errorMessage, 2000),
			ExitCode:      1,
			Duration:      0,
			NextStatus:    defaultStr(agent.ClaimStatus, "DOING"),
			BlockReason:   nullableString(errorMessage),
			Comment:       runner.FormatExecutionComment(agent.Name, agent.Tool, false, 0, errorMessage, 1),
			Metadata: map[string]interface{}{
				"tool":  agent.Tool,
				"model": agent.Model,
				"git":   runner.GitMetadataMap(failedGitSnapshot),
				"outputContract": outputContractMetadata(resultMeta),
				"preflight": map[string]interface{}{
					"ok":          preflight.OK,
					"branch":      preflight.CurrentBranch,
					"isProtected": preflight.IsProtected,
					"isDirty":     preflight.IsDirty,
					"error":       preflight.ErrorMessage,
				},
			},
		})
		runner.SendHeartbeat(client, agent, "ONLINE")
		return
	}
	logging.Debugf("worker[%s] preflight OK branch=%q dirty=%t protected=%t", agent.Name, preflight.CurrentBranch, preflight.IsDirty, preflight.IsProtected)

	runner.SendHeartbeat(client, agent, "BUSY")

	execMetadata := map[string]interface{}{"git": runner.GitMetadataMap(runner.GitSnapshot{
		Branch:     preparedGit.Branch,
		BaseBranch: preparedGit.BaseBranch,
		CommitShas: preparedGit.CommitShas,
		PRUrl:      preparedGit.PRUrl,
		PRNumber:   preparedGit.PRNumber,
		Mode:       string(preparedGit.Mode),
		CapturedAt: time.Now().UTC().Format(time.RFC3339),
	})}
	_ = api.UpdateExecution(client, claimed.Execution.ID, map[string]interface{}{
		"status":          "RUNNING",
		"lastHeartbeatAt": time.Now().UTC().Format(time.RFC3339),
		"metadata":        execMetadata,
	})

	_, _ = client.Post("/tasks/"+claimed.Task.ID+"/comments", map[string]interface{}{
		"content": fmt.Sprintf("## Execution Started\n\n**Agent:** %s  \n**Tool:** %s  \n**Model:** %s  \n**Git Policy:** %s  \n**Branch:** %s", agent.Name, agent.Tool, agent.Model, gitPolicy, preparedGit.Branch),
		"agentId": agent.ID,
	})

	var previousExecution *runner.PreviousExecutionContext
	if claimed.PreviousExecution != nil {
		previousExecution = &runner.PreviousExecutionContext{
			ID:            claimed.PreviousExecution.ID,
			Status:        claimed.PreviousExecution.Status,
			ResultSummary: claimed.PreviousExecution.ResultSummary,
			ErrorMessage:  claimed.PreviousExecution.ErrorMessage,
			OutputExcerpt: claimed.PreviousExecution.OutputExcerpt,
			ExitCode:      claimed.PreviousExecution.ExitCode,
			Duration:      claimed.PreviousExecution.Duration,
			StartedAt:     claimed.PreviousExecution.StartedAt,
			FinishedAt:    claimed.PreviousExecution.FinishedAt,
		}
		if claimed.PreviousExecution.Git != nil {
			previousExecution.Git = &runner.PreviousExecutionGitContext{
				Mode:       claimed.PreviousExecution.Git.Mode,
				BaseBranch: claimed.PreviousExecution.Git.BaseBranch,
				Branch:     claimed.PreviousExecution.Git.Branch,
				CommitShas: claimed.PreviousExecution.Git.CommitShas,
				PRUrl:      claimed.PreviousExecution.Git.PRUrl,
				PRNumber:   claimed.PreviousExecution.Git.PRNumber,
			}
		}
	}

	retrievedMemory := make([]runner.RetrievedProjectMemoryContext, 0, len(claimed.RetrievedMemory))
	for _, memory := range claimed.RetrievedMemory {
		retrievedMemory = append(retrievedMemory, runner.RetrievedProjectMemoryContext{
			ID:      memory.ID,
			Kind:    memory.Kind,
			Title:   memory.Title,
			Content: memory.Content,
			Source:  memory.Source,
		})
	}

	prompt := runner.BuildPromptWithExecutionContext(runner.Task{
		ID:          claimed.Task.ID,
		Title:       claimed.Task.Title,
		Description: claimed.Task.Description,
		Priority:    claimed.Task.Priority,
		Type:        claimed.Task.Type,
		ProjectID:   claimed.Task.ProjectID,
		Status:      claimed.Task.Status,
	}, agent, previousExecution, retrievedMemory)

	var exec executor.Executor
	switch agent.Tool {
	case "claude":
		exec = &executor.ClaudeExecutor{Config: agent}
	default:
		exec = &executor.OpenCodeExecutor{Config: agent}
	}

	timeout := time.Duration(agent.Timeout) * time.Second
	if timeout <= 0 {
		timeout = 900 * time.Second
	}
	logging.Debugf("worker[%s] executing tool=%s model=%s timeout=%s workdir=%q", agent.Name, agent.Tool, agent.Model, timeout, workdir)

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
		ticker := time.NewTicker(executionHeartbeatInterval())
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

	result := exec.Execute(execCtx, prompt, workdir, timeout, func(event executor.StreamEvent) {
		content := strings.TrimSpace(event.Content)
		if content == "" {
			return
		}
		logging.Debugf("worker[%s] stream[%s] %s", agent.Name, event.Kind, truncate(content, 240))
		formattedContent := runner.FormatExecutionEvent(event.Kind, content)
		eventMu.Lock()
		pendingEvents = append(pendingEvents, api.ExecutionEvent{
			Seq:     event.Seq,
			Kind:    event.Kind,
			Content: formattedContent,
			Metadata: map[string]interface{}{
				"raw": content,
			},
		})
		fullOutput = append(fullOutput, content)
		eventMu.Unlock()
		flushEvents(false)
	})
	execCancel()
	<-heartbeatDone
	flushEvents(true)
	logging.Debugf("worker[%s] execution finished success=%t exitCode=%d timedOut=%t canceled=%t", agent.Name, result.Success, result.ExitCode, result.TimedOut, result.Canceled)

	duration := int(time.Since(start).Seconds())
	rawOutput := strings.Join(fullOutput, "\n")
	if strings.TrimSpace(result.Output) != "" {
		if strings.TrimSpace(rawOutput) == "" {
			rawOutput = result.Output
		} else if !strings.Contains(rawOutput, strings.TrimSpace(result.Output)) {
			rawOutput = strings.TrimSpace(rawOutput + "\n" + result.Output)
		}
	}
	readableOutput := runner.ExtractReadableOutput(rawOutput)
	strippedOutput := runner.StripStructuredResultBlock(readableOutput)
	failureHeadline := ""
	structuredOutput := readableOutput
	errorMessage := ""
	blockReason := ""
	if !result.Success {
		structuredOutput, failureHeadline, errorMessage, blockReason = buildFailureExecutionDetails(agent.Name, agent.Tool, result, readableOutput, timeout)
	}
	structuredResult, resultMeta := runner.BuildExecutionResultV1WithMeta(result.Success, structuredOutput, result.ExitCode)
	persistedOutput := buildPersistedExecutionOutput(rawOutput, readableOutput, failureHeadline, structuredResult)
	structuredSummary := runner.ExecutionResultSummary(structuredResult)
	commentOutput := rawOutput
	if failureHeadline != "" {
		commentOutput = strings.TrimSpace(failureHeadline + "\n\n" + commentOutput)
	}
	if commentOutput == "" {
		commentOutput = persistedOutput
	}
	comment := runner.FormatExecutionComment(agent.Name, agent.Tool, result.Success, float64(duration), commentOutput, result.ExitCode)

	gitSnapshot := runner.CaptureGitSnapshot(workdir, preparedGit)

	if result.Success && gitPolicy != runner.GitPolicyNoWrite && preparedGit.Branch != "" {
		if commitSHA, err := runner.CommitChanges(workdir, preparedGit.Branch, claimed.Task.ID, claimed.Task.Title); err != nil {
			fmt.Printf("[%s] post-exec commit error: %v\n", agent.Name, err)
		} else if commitSHA != "" {
			logging.Debugf("worker[%s] committed changes sha=%s", agent.Name, commitSHA)
			gitSnapshot = runner.CaptureGitSnapshot(workdir, preparedGit)
		}

		if gitPolicy == runner.GitPolicyBranchCommitPR {
			if err := runner.PushBranch(workdir, preparedGit.Branch); err != nil {
				fmt.Printf("[%s] push error: %v\n", agent.Name, err)
			} else {
				logging.Debugf("worker[%s] pushed branch %s", agent.Name, preparedGit.Branch)
				isDraftPR := strings.EqualFold(claimed.RuntimeBinding.PRPolicy, "draft")
				prTitle := fmt.Sprintf("[%s] %s", claimed.Task.Type, claimed.Task.Title)
				if len(prTitle) > 72 {
					prTitle = prTitle[:72]
				}
				prBody := fmt.Sprintf("Automated execution by **%s** (%s).\n\n**Task:** %s\n**Task ID:** %s", agent.Name, agent.Tool, claimed.Task.Title, claimed.Task.ID)
				prResult, err := runner.CreatePullRequest(workdir, runner.CreatePROptions{
					BaseBranch: gitBaseBranch,
					Title:      prTitle,
					Body:       prBody,
					Draft:      isDraftPR,
				})
				if err != nil {
					fmt.Printf("[%s] PR creation error: %v\n", agent.Name, err)
				} else if prResult != nil {
					logging.Debugf("worker[%s] created PR #%d %s", agent.Name, prResult.Number, prResult.URL)
					gitSnapshot.PRUrl = &prResult.URL
					prNum := prResult.Number
					gitSnapshot.PRNumber = &prNum
				}
			}
		}
	}

	structuredResult = runner.MergeGitResult(structuredResult, gitSnapshot)

	status := "FAILED"
	nextStatus := defaultStr(agent.ClaimStatus, "DOING")
	var nextAssignee *string
	if result.Success {
		status = "SUCCESS"
		nextStatus = defaultStr(agent.DoneStatus, "DONE")
		errorMessage = ""
		if agent.NextAssigneeID != "" {
			nextAssignee = &agent.NextAssigneeID
		}
		blockReason = ""
	}

	finalizeParams := api.FinalizeExecutionParams{
		Status:              status,
		Output:              persistedOutput,
		ResultSummary:       truncate(defaultStr(structuredSummary, strippedOutput), 500),
		Result:              structuredResult,
		ErrorMessage:        errorMessage,
		ExitCode:            result.ExitCode,
		Duration:            duration,
		NextStatus:          nextStatus,
		NextAssigneeAgentID: nextAssignee,
		BlockReason:         nullableString(blockReason),
		Comment:             comment,
		Metadata: map[string]interface{}{
			"tool":  agent.Tool,
			"model": agent.Model,
			"git":   runner.GitMetadataMap(gitSnapshot),
			"execution": map[string]interface{}{
				"timeoutSeconds": int(timeout.Seconds()),
				"timedOut":       result.TimedOut,
				"canceled":       result.Canceled,
			},
			"outputContract": outputContractMetadata(resultMeta),
			"runtimeBinding": map[string]interface{}{
				"id":                  claimed.RuntimeBinding.ID,
				"projectId":           claimed.RuntimeBinding.ProjectID,
				"runnerProfile":       claimed.RuntimeBinding.RunnerProfile,
				"hostOs":              claimed.RuntimeBinding.HostOS,
				"repoPath":            claimed.RuntimeBinding.RepoPath,
				"defaultBaseBranch":   claimed.RuntimeBinding.DefaultBaseBranch,
				"allowedBranchPrefix": claimed.RuntimeBinding.AllowedBranchPrefix,
				"executionMode":       claimed.RuntimeBinding.ExecutionMode,
				"gitProvider":         claimed.RuntimeBinding.GitProvider,
				"prPolicy":            claimed.RuntimeBinding.PRPolicy,
				"gitPolicy":           claimed.RuntimeBinding.GitPolicy,
				"metadata":            claimed.RuntimeBinding.Metadata,
			},
		},
	}
	logging.Debugf("worker[%s] finalizing execution=%s status=%s nextStatus=%s duration=%ds", agent.Name, claimed.Execution.ID, status, nextStatus, duration)

	_, err = api.FinalizeExecution(client, claimed.Execution.ID, finalizeParams)
	if err != nil {
		fmt.Printf("[%s] finalize error: %v\n", agent.Name, err)
	}

	if result.Success && gitSnapshot.PRUrl != nil && *gitSnapshot.PRUrl != "" {
		prComment := fmt.Sprintf("## Pull Request Created\n\n**PR:** [#%d](%s)\n**Branch:** %s\n**Base:** %s", func() int {
			if gitSnapshot.PRNumber != nil {
				return *gitSnapshot.PRNumber
			}
			return 0
		}(), *gitSnapshot.PRUrl, preparedGit.Branch, gitBaseBranch)
		_, _ = client.Post("/tasks/"+claimed.Task.ID+"/comments", map[string]interface{}{
			"content": prComment,
			"agentId": agent.ID,
		})

		taskPatch := map[string]interface{}{
			"prUrl": *gitSnapshot.PRUrl,
			"prNumber": func() int {
				if gitSnapshot.PRNumber != nil {
					return *gitSnapshot.PRNumber
				}
				return 0
			}(),
		}
		_, _ = client.Patch("/tasks/"+claimed.Task.ID, taskPatch)
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

func outputContractMetadata(meta runner.ExecutionResultBuildMeta) map[string]interface{} {
	return map[string]interface{}{
		"source":        string(meta.Source),
		"hadMarkers":    meta.HadMarkers,
		"repairApplied": meta.RepairApplied,
		"parseError":    nullableString(meta.ParseError),
	}
}

func buildFailureExecutionDetails(agentName, tool string, result executor.Result, readableOutput string, timeout time.Duration) (structuredOutput string, headline string, errorMessage string, blockReason string) {
	headline = executionFailureHeadline(result, timeout)
	structuredOutput = headline
	fullReadableOutput := strings.TrimSpace(readableOutput)
	visibleReadableOutput := strings.TrimSpace(runner.StripStructuredResultBlock(readableOutput))
	if fullReadableOutput != "" && fullReadableOutput != headline {
		structuredOutput = headline + "\n\n" + fullReadableOutput
	}
	errorBody := headline
	if visibleReadableOutput != "" && visibleReadableOutput != headline {
		errorBody = headline + "\n\nLast readable output:\n" + visibleReadableOutput
	}
	errorMessage = truncate(errorBody, 2000)

	switch {
	case result.TimedOut:
		blockReason = fmt.Sprintf("Agent %s hit the configured timeout (%s) while running %s.", agentName, runner.FormatDuration(timeout.Seconds()), tool)
	case result.Canceled:
		blockReason = fmt.Sprintf("Agent %s was canceled while running %s.", agentName, tool)
	default:
		blockReason = fmt.Sprintf("Agent %s failed while running %s.", agentName, tool)
	}

	return structuredOutput, headline, errorMessage, blockReason
}

func executionFailureHeadline(result executor.Result, timeout time.Duration) string {
	switch {
	case result.TimedOut:
		return fmt.Sprintf("Execution timed out after %s.", runner.FormatDuration(timeout.Seconds()))
	case result.Canceled:
		return "Execution was canceled before completion."
	case result.ExitCode != 0:
		return fmt.Sprintf("Execution failed with exit code %d.", result.ExitCode)
	default:
		return "Execution failed."
	}
}

func buildPersistedExecutionOutput(rawOutput, readableOutput, failureHeadline string, structuredResult map[string]interface{}) string {
	sanitizedRawOutput := runner.StripStructuredResultBlock(rawOutput)
	persisted := strings.TrimSpace(runner.FormatStreamForDisplay(sanitizedRawOutput))
	if persisted == "" {
		persisted = strings.TrimSpace(runner.StripStructuredResultBlock(readableOutput))
	}
	if persisted == "" {
		persisted = strings.TrimSpace(sanitizedRawOutput)
	}
	persisted = strings.TrimSpace(runner.StripStructuredResultBlock(persisted))
	if serialized := runner.SerializeExecutionResultV1(structuredResult); serialized != "" {
		if persisted == "" {
			persisted = serialized
		} else {
			persisted = strings.TrimSpace(persisted + "\n\n" + serialized)
		}
	}
	if failureHeadline == "" || strings.HasPrefix(persisted, failureHeadline) {
		return persisted
	}
	if persisted == "" {
		return failureHeadline
	}
	return failureHeadline + "\n\n" + persisted
}
