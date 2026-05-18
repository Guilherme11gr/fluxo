package orchestrator

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/executor"
	"github.com/fluxo-app/fluxo-runner/internal/extractor"
	"github.com/fluxo-app/fluxo-runner/internal/logging"
	"github.com/fluxo-app/fluxo-runner/internal/runner"
)

type AgentWorker struct {
	apiURL          string
	apiKey          string
	runnerID        string
	pollInterval    time.Duration
	resultExtractor *config.ResultExtractorConfig
	executorFactory func(agent config.AgentConfig) executor.Executor

	mu     sync.RWMutex
	agent  config.AgentConfig
	stopCh chan struct{}
}

var newStructuredResultExtractor = extractor.NewExtractor

func NewAgentWorker(apiURL, apiKey, runnerID string, agent config.AgentConfig, pollInterval time.Duration, resultExtractor *config.ResultExtractorConfig) *AgentWorker {
	return &AgentWorker{
		apiURL:          apiURL,
		apiKey:          apiKey,
		runnerID:        runnerID,
		pollInterval:    pollInterval,
		resultExtractor: resultExtractor,
		executorFactory: newExecutor,
		agent:           agent,
		stopCh:          make(chan struct{}),
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
				"tool":                 agent.Tool,
				"model":                agent.Model,
				"git":                  runner.GitMetadataMap(runner.GitSnapshot{Mode: string(gitPolicy)}),
				"outputContract":       outputContractMetadata(resultMeta),
				"finalSummarySource":   string(resultMeta.Source),
				"commentSummarySource": "raw",
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
				"tool":                 agent.Tool,
				"model":                agent.Model,
				"git":                  runner.GitMetadataMap(failedGitSnapshot),
				"outputContract":       outputContractMetadata(resultMeta),
				"finalSummarySource":   string(resultMeta.Source),
				"commentSummarySource": "raw",
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
				"tool":                 agent.Tool,
				"model":                agent.Model,
				"git":                  runner.GitMetadataMap(failedGitSnapshot),
				"outputContract":       outputContractMetadata(resultMeta),
				"finalSummarySource":   string(resultMeta.Source),
				"commentSummarySource": "raw",
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
	worktreeBefore := runner.CaptureWorktreeSnapshot(workdir)

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
	exec = w.executorFactory(agent)

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
	flushEventsForKind := func(kind string) {
		if isHighPriorityEventKind(kind) {
			flushEvents(true)
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
		flushEventsForKind(event.Kind)
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
	blockAwareOutput := appendStructuredBlocks(readableOutput, rawOutput)
	strippedOutput := runner.StripStructuredResultBlock(blockAwareOutput)
	failureHeadline := ""
	structuredOutput := blockAwareOutput
	errorMessage := ""
	blockReason := ""
	if !result.Success {
		structuredOutput, failureHeadline, errorMessage, blockReason = buildFailureExecutionDetails(agent.Name, agent.Tool, result, blockAwareOutput, timeout)
	}

	gitSnapshot := runner.CaptureGitSnapshot(workdir, preparedGit)
	filesTouched := runner.DiffWorktreeFiles(worktreeBefore, runner.CaptureWorktreeSnapshot(workdir))

	if result.Success && gitPolicy != runner.GitPolicyNoWrite && preparedGit.Branch != "" {
		if commitSHA, err := runner.CommitChanges(workdir, preparedGit.Branch, claimed.Task.ID, claimed.Task.Title); err != nil {
			fmt.Printf("[%s] post-exec commit error: %v\n", agent.Name, err)
		} else if commitSHA != "" {
			logging.Debugf("worker[%s] committed changes sha=%s", agent.Name, commitSHA)
			gitSnapshot = runner.CaptureGitSnapshot(workdir, preparedGit)
			if len(preparedGit.CommitShas) > 0 {
				if committedFiles, err := runner.CollectChangedFilesSince(workdir, preparedGit.CommitShas[0]); err == nil && len(committedFiles) > 0 {
					filesTouched = committedFiles
				}
			}
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

	structuredResult, resultMeta := runner.BuildExecutionResultV1WithContextAndMeta(result.Success, structuredOutput, result.ExitCode, runner.ExecutionResultDerivedContext{
		FilesTouched: filesTouched,
	})
	extractorMeta := map[string]interface{}{
		"attempted": false,
		"provider":  nil,
		"model":     nil,
		"success":   false,
		"error":     nil,
	}
	if result.Success && resultMeta.Source == runner.StructuredResultSourceDerived {
		if extractedResult, meta, err := w.tryExtractStructuredResult(ctx, agent, *claimed, rawOutput, readableOutput, filesTouched, result); err == nil && extractedResult != nil {
			structuredResult = extractedResult
			resultMeta.Source = runner.StructuredResultSourceExtracted
			extractorMeta = meta
		} else if meta != nil {
			extractorMeta = meta
			if err != nil {
				logging.Debugf("worker[%s] extractor failed: %v", agent.Name, err)
			}
		}
	}

	structuredResult = runner.MergeGitResult(structuredResult, gitSnapshot)

	structuredSummary := runner.ExecutionResultSummary(structuredResult)
	agentSummary := parseAgentSummaryMetadata(rawOutput)

	reviewOutcome := runner.ExecutionReviewOutcome(structuredResult)

	commentSummary := structuredSummary
	if commentSummary == "" && agentSummary != nil {
		commentSummary = agentSummary.Summary
	}

	if reviewOutcome == "rejected" && failureHeadline == "" {
		failureHeadline = "## Review Rejected\n\n" + truncate(structuredSummary, 500)
	}

	commentContent := rawOutput
	if failureHeadline != "" {
		commentContent = strings.TrimSpace(failureHeadline + "\n\n" + commentContent)
	}
	serializedStructuredResult := runner.SerializeExecutionResultV1(structuredResult)
	commentAlreadyHasStructuredResult := serializedStructuredResult != "" && strings.Contains(commentContent, runner.ResultStartMarker)
	if serializedStructuredResult != "" && !commentAlreadyHasStructuredResult {
		if commentContent == "" {
			commentContent = serializedStructuredResult
		} else {
			commentContent = strings.TrimSpace(commentContent + "\n\n" + serializedStructuredResult)
		}
	}
	comment := runner.FormatExecutionCommentWithFinalSummary(agent.Name, agent.Tool, result.Success, float64(duration), commentContent, result.ExitCode, commentSummary)

	persistedOutput := buildPersistedExecutionOutput(rawOutput, readableOutput, failureHeadline, structuredResult)

	finalSummarySource := string(resultMeta.Source)
	commentSummarySource := finalSummarySource
	if commentSummary == "" {
		commentSummarySource = "raw"
	}

	status := "FAILED"
	nextStatus := defaultStr(agent.ClaimStatus, "DOING")
	var nextAssignee *string
	if result.Success && reviewOutcome != "rejected" {
		status = "SUCCESS"
		nextStatus = defaultStr(agent.DoneStatus, "DONE")
		errorMessage = ""
		if agent.NextAssigneeID != "" {
			nextAssignee = &agent.NextAssigneeID
		}
		blockReason = ""
	} else if result.Success && reviewOutcome == "rejected" {
		status = "SUCCESS"
		nextStatus = "TODO"
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
			"tool":               agent.Tool,
			"model":              agent.Model,
			"git":                runner.GitMetadataMap(gitSnapshot),
			"agentSummary":       agentSummaryValue(agentSummary),
			"extractor":          extractorMeta,
			"finalSummarySource": finalSummarySource,
			"commentSummarySource": commentSummarySource,
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

func parseAgentSummaryMetadata(rawOutput string) *runner.AgentSummaryV1 {
	summary, err := runner.ParseAgentSummary(rawOutput)
	if err != nil || summary == nil {
		return nil
	}
	return summary
}

func agentSummaryValue(summary *runner.AgentSummaryV1) interface{} {
	if summary == nil {
		return nil
	}
	return summary.ToMap()
}

func defaultStr(val, def string) string {
	if val == "" {
		return def
	}
	return val
}

func isHighPriorityEventKind(kind string) bool {
	switch kind {
	case "step_start", "step_end", "result", "error":
		return true
	default:
		return false
	}
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

func newExecutor(agent config.AgentConfig) executor.Executor {
	switch agent.Tool {
	case "claude":
		return &executor.ClaudeExecutor{Config: agent}
	default:
		return &executor.OpenCodeExecutor{Config: agent}
	}
}

func (w *AgentWorker) tryExtractStructuredResult(ctx context.Context, agent config.AgentConfig, task api.ClaimedTaskResponse, rawOutput, readableOutput string, filesTouched []string, execResult executor.Result) (map[string]interface{}, map[string]interface{}, error) {
	meta := map[string]interface{}{
		"attempted": false,
		"provider":  nil,
		"model":     nil,
		"success":   false,
		"error":     nil,
	}

	extractorCfg := resolveResultExtractorConfig(w.resultExtractor, agent.ResultExtractor)
	if extractorCfg == nil || !extractorCfg.IsEnabled() {
		return nil, meta, nil
	}

	adapterCfg := extractor.Config{
		Enabled:       extractorCfg.IsEnabled(),
		Provider:      extractorCfg.Provider,
		Model:         extractorCfg.EffectiveModel(),
		APIKeyEnv:     extractorCfg.APIKeyEnv,
		APIKey:        extractorCfg.APIKey,
		TimeoutSec:    extractorCfg.EffectiveTimeoutSec(),
		MaxInputChars: extractorCfg.EffectiveMaxInputChars(),
	}

	resultExtractor, err := newStructuredResultExtractor(adapterCfg)
	meta["attempted"] = true
	meta["provider"] = adapterCfg.Provider
	meta["model"] = adapterCfg.Model
	if err != nil {
		meta["error"] = err.Error()
		return nil, meta, err
	}

	if resultExtractor.Provider() == "noop" {
		return nil, meta, nil
	}

	extracted, err := resultExtractor.Extract(ctx, extractor.ExtractRequest{
		TaskID:          task.Task.ID,
		TaskTitle:       task.Task.Title,
		TaskDescription: task.Task.Description,
		AgentName:       agent.Name,
		Tool:            agent.Tool,
		Model:           agent.Model,
		RawOutput:       rawOutput,
		ReadableOutput:  readableOutput,
		FilesTouched:    filesTouched,
		ExitCode:        execResult.ExitCode,
		Success:         execResult.Success,
	})
	if err != nil {
		meta["error"] = err.Error()
		return nil, meta, err
	}
	if extracted == nil || extracted.Result == nil {
		err := fmt.Errorf("extractor provider returned nil result")
		meta["error"] = err.Error()
		return nil, meta, err
	}

	validated, err := validateExtractedResult(extracted.Result, extractedValidationContext{
		ExecSuccess:  execResult.Success,
		FilesTouched: filesTouched,
		FallbackSummary: runner.ExecutionResultSummary(runner.BuildExecutionResultV1WithContext(execResult.Success, readableOutput, execResult.ExitCode, runner.ExecutionResultDerivedContext{
			FilesTouched: filesTouched,
		})),
	})
	if err != nil {
		meta["error"] = err.Error()
		return nil, meta, err
	}

	meta["success"] = true
	meta["latencyMs"] = extracted.LatencyMs
	meta["inputChars"] = extracted.InputChars
	return validated, meta, nil
}

func resolveResultExtractorConfig(globalCfg, agentCfg *config.ResultExtractorConfig) *config.ResultExtractorConfig {
	return globalCfg.MergedWith(agentCfg)
}

type extractedValidationContext struct {
	ExecSuccess     bool
	FilesTouched    []string
	FallbackSummary string
}

func validateExtractedResult(result map[string]interface{}, ctx extractedValidationContext) (map[string]interface{}, error) {
	if result == nil {
		return nil, fmt.Errorf("extracted result is nil")
	}
	parsed, err := runner.ParseExecutionResultV1Map(result)
	if err != nil {
		return nil, fmt.Errorf("parse extracted result: %w", err)
	}
	if parsed == nil {
		return nil, fmt.Errorf("extracted result parsed to nil")
	}
	if !hasMeaningfulExtractedContent(parsed, ctx) {
		return nil, fmt.Errorf("extracted result did not contain meaningful structured content")
	}
	parsed.SchemaVersion = "v1"
	if ctx.ExecSuccess && parsed.Status != "rejected" {
		parsed.Status = "success"
	}
	runnerFiles := dedupeStrings(ctx.FilesTouched)
	if len(runnerFiles) > 0 {
		parsed.FilesTouched = runnerFiles
	}
	if strings.TrimSpace(parsed.Git.Mode) == "" {
		parsed.Git.Mode = "manual"
	}
	if strings.TrimSpace(parsed.Summary) == "" {
		switch {
		case len(parsed.WhatChanged) > 0 && strings.TrimSpace(parsed.WhatChanged[0]) != "":
			parsed.Summary = strings.TrimSpace(parsed.WhatChanged[0])
		case strings.TrimSpace(ctx.FallbackSummary) != "":
			parsed.Summary = strings.TrimSpace(ctx.FallbackSummary)
		}
	}
	data, err := json.Marshal(parsed)
	if err != nil {
		return nil, fmt.Errorf("marshal validated extracted result: %w", err)
	}
	var normalized map[string]interface{}
	if err := json.Unmarshal(data, &normalized); err != nil {
		return nil, fmt.Errorf("normalize extracted result: %w", err)
	}
	return normalized, nil
}

func hasMeaningfulExtractedContent(result *runner.ExecutionResultV1, ctx extractedValidationContext) bool {
	if result == nil {
		return false
	}
	if strings.TrimSpace(result.Summary) != "" {
		return true
	}
	if len(result.WhatChanged) > 0 {
		return true
	}
	if len(result.Decisions) > 0 {
		return true
	}
	if len(result.Risks) > 0 {
		return true
	}
	if len(result.ChecksRun) > 0 {
		return true
	}
	if len(result.Followups) > 0 {
		return true
	}
	if len(result.MemoryCandidates) > 0 {
		return true
	}
	if len(result.SkillCandidates) > 0 {
		return true
	}
	runnerFiles := dedupeStrings(ctx.FilesTouched)
	if len(result.FilesTouched) > 0 && len(runnerFiles) == 0 {
		return true
	}
	return false
}

func dedupeStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
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
	hasCanonicalStructuredResult := false
	if structured, err := runner.ParseExecutionResultV1(rawOutput); err == nil && structured != nil {
		hasCanonicalStructuredResult = true
	}
	if summaryText := formatAgentSummaryOutput(rawOutput); summaryText != "" && !hasCanonicalStructuredResult && !strings.Contains(persisted, summaryText) {
		if persisted == "" {
			persisted = summaryText
		} else {
			persisted = strings.TrimSpace(summaryText + "\n\n" + persisted)
		}
	}
	if persisted == "" {
		persisted = strings.TrimSpace(runner.StripStructuredResultBlock(readableOutput))
	}
	if summaryText := formatAgentSummaryOutput(readableOutput); summaryText != "" && !hasCanonicalStructuredResult && !strings.Contains(persisted, summaryText) {
		if persisted == "" {
			persisted = summaryText
		} else {
			persisted = strings.TrimSpace(summaryText + "\n\n" + persisted)
		}
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

func appendStructuredBlocks(primaryOutput, rawOutput string) string {
	combined := strings.TrimSpace(primaryOutput)
	appendBlock := func(block string) {
		block = strings.TrimSpace(block)
		if block == "" || strings.Contains(combined, block) {
			return
		}
		if combined == "" {
			combined = block
		} else {
			combined = strings.TrimSpace(combined + "\n\n" + block)
		}
	}
	if summary, err := runner.ParseAgentSummary(rawOutput); err == nil && summary != nil {
		appendBlock(runner.SerializeAgentSummaryV1(summary))
	}
	if structured, err := runner.ParseExecutionResultV1(rawOutput); err == nil && structured != nil {
		appendBlock(runner.SerializeExecutionResultV1(structured.ToMap()))
	}
	return combined
}

func formatAgentSummaryOutput(raw string) string {
	summary, err := runner.ParseAgentSummary(raw)
	if err != nil || summary == nil {
		return ""
	}

	var lines []string
	if text := strings.TrimSpace(summary.Summary); text != "" {
		lines = append(lines, text)
	}
	appendSection := func(title string, items []string) {
		if len(items) == 0 {
			return
		}
		lines = append(lines, title)
		for _, item := range items {
			item = strings.TrimSpace(item)
			if item == "" {
				continue
			}
			lines = append(lines, "- "+item)
		}
	}
	appendSection("What changed:", summary.WhatChanged)
	appendSection("Decisions:", summary.Decisions)
	appendSection("Risks:", summary.Risks)
	appendSection("Followups:", summary.Followups)
	return strings.TrimSpace(strings.Join(lines, "\n"))
}
