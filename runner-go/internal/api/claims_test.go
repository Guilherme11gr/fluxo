package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestClaimNextTaskParsesRuntimeBinding(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"data": {
				"task": {
					"id": "task-1",
					"orgId": "org-1",
					"projectId": "project-1",
					"featureId": "feature-1",
					"localId": 12,
					"title": "Implement runtime binding",
					"description": "desc",
					"status": "DOING",
					"type": "TASK",
					"priority": "HIGH"
				},
				"execution": {
					"id": "exec-1",
					"orgId": "org-1",
					"taskId": "task-1",
					"projectId": "project-1",
					"agentId": "agent-1",
					"runnerInstanceId": "runner-1",
					"status": "CLAIMED",
					"tool": "opencode",
					"model": "glm-5.1",
					"metadata": {},
					"startedAt": "2026-05-14T00:00:00Z"
				},
				"lease": {
					"id": "lease-1",
					"projectId": "project-1",
					"executionId": "exec-1",
					"expiresAt": "2026-05-14T00:01:00Z"
				},
				"runtimeBinding": {
					"id": "binding-1",
					"projectId": "project-1",
					"runnerProfile": "windows-dev",
					"hostOs": "windows",
					"repoPath": "D:/code/fluxo",
					"defaultBaseBranch": "main",
					"allowedBranchPrefix": "agent/",
					"executionMode": "branch_per_task",
					"gitProvider": "github",
					"prPolicy": "draft",
					"gitPolicy": "branch_commit_pr",
					"provisionCommand": "npm ci",
					"provisionCacheKey": "package-lock.json",
					"metadata": {"workspaceRef": "repo"}
				}
			}
		}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key", "runner")
	claimed, err := ClaimNextTask(client, ClaimNextTaskParams{
		AgentID:          "agent-1",
		RunnerInstanceID: "runner-1",
	})
	if err != nil {
		t.Fatalf("ClaimNextTask returned error: %v", err)
	}
	if claimed == nil {
		t.Fatal("expected claimed task, got nil")
	}
	if claimed.RuntimeBinding.RepoPath != "D:/code/fluxo" {
		t.Fatalf("expected repo path to be parsed, got %q", claimed.RuntimeBinding.RepoPath)
	}
	if claimed.RuntimeBinding.GitPolicy != "branch_commit_pr" {
		t.Fatalf("expected git policy to be parsed, got %q", claimed.RuntimeBinding.GitPolicy)
	}
	if claimed.RuntimeBinding.ProvisionCommand != "npm ci" {
		t.Fatalf("expected provision command to be parsed, got %q", claimed.RuntimeBinding.ProvisionCommand)
	}
	if claimed.RuntimeBinding.ProvisionCacheKey != "package-lock.json" {
		t.Fatalf("expected provision cache key to be parsed, got %q", claimed.RuntimeBinding.ProvisionCacheKey)
	}
}

func TestClaimNextTaskParsesPreviousExecution(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"data": {
				"task": {
					"id": "task-1",
					"orgId": "org-1",
					"projectId": "project-1",
					"featureId": "feature-1",
					"localId": 12,
					"title": "Retry execution",
					"description": "desc",
					"status": "DOING",
					"type": "TASK",
					"priority": "HIGH"
				},
				"execution": {
					"id": "exec-2",
					"orgId": "org-1",
					"taskId": "task-1",
					"projectId": "project-1",
					"agentId": "agent-1",
					"runnerInstanceId": "runner-1",
					"status": "CLAIMED",
					"tool": "opencode",
					"model": "glm-5.1",
					"metadata": {},
					"startedAt": "2026-05-14T00:10:00Z"
				},
				"lease": {
					"id": "lease-1",
					"projectId": "project-1",
					"executionId": "exec-2",
					"expiresAt": "2026-05-14T00:11:00Z"
				},
				"runtimeBinding": {
					"id": "binding-1",
					"projectId": "project-1",
					"runnerProfile": "windows-dev",
					"hostOs": "windows",
					"repoPath": "D:/code/fluxo",
					"defaultBaseBranch": "main",
					"allowedBranchPrefix": "agent/",
					"executionMode": "branch_per_task",
					"gitProvider": "github",
					"prPolicy": "draft",
					"gitPolicy": "branch_commit_pr",
					"metadata": {}
				},
				"previousExecution": {
					"id": "exec-1",
					"status": "FAILED",
					"resultSummary": "Could not finish",
					"errorMessage": "command failed",
					"outputExcerpt": "stack trace excerpt",
					"exitCode": 1,
					"duration": 48,
					"startedAt": "2026-05-14T00:00:00Z",
					"finishedAt": "2026-05-14T00:00:48Z",
					"git": {
						"mode": "branch_commit_pr",
						"baseBranch": "main",
						"branch": "agent/task-123",
						"commitShas": ["abc123"],
						"prUrl": "https://example.com/pr/1",
						"prNumber": 1
					}
				}
			}
		}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key", "runner")
	claimed, err := ClaimNextTask(client, ClaimNextTaskParams{
		AgentID:          "agent-1",
		RunnerInstanceID: "runner-1",
	})
	if err != nil {
		t.Fatalf("ClaimNextTask returned error: %v", err)
	}
	if claimed == nil || claimed.PreviousExecution == nil {
		t.Fatal("expected previous execution, got nil")
	}
	if claimed.PreviousExecution.ErrorMessage != "command failed" {
		t.Fatalf("expected previous error message to be parsed, got %q", claimed.PreviousExecution.ErrorMessage)
	}
	if claimed.PreviousExecution.Git == nil || claimed.PreviousExecution.Git.Branch != "agent/task-123" {
		t.Fatalf("expected previous git branch to be parsed, got %+v", claimed.PreviousExecution.Git)
	}
	if claimed.PreviousExecution.ExitCode == nil || *claimed.PreviousExecution.ExitCode != 1 {
		t.Fatalf("expected previous exit code 1, got %+v", claimed.PreviousExecution.ExitCode)
	}
}

func TestClaimNextTaskParsesRetrievedMemory(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{
			"data": {
				"task": {
					"id": "task-1",
					"orgId": "org-1",
					"projectId": "project-1",
					"featureId": "feature-1",
					"localId": 12,
					"title": "Retry execution",
					"description": "desc",
					"status": "DOING",
					"type": "TASK",
					"priority": "HIGH"
				},
				"execution": {
					"id": "exec-2",
					"orgId": "org-1",
					"taskId": "task-1",
					"projectId": "project-1",
					"agentId": "agent-1",
					"runnerInstanceId": "runner-1",
					"status": "CLAIMED",
					"tool": "opencode",
					"model": "glm-5.1",
					"metadata": {},
					"startedAt": "2026-05-14T00:10:00Z"
				},
				"lease": {
					"id": "lease-1",
					"projectId": "project-1",
					"executionId": "exec-2",
					"expiresAt": "2026-05-14T00:11:00Z"
				},
				"runtimeBinding": {
					"id": "binding-1",
					"projectId": "project-1",
					"runnerProfile": "windows-dev",
					"hostOs": "windows",
					"repoPath": "D:/code/fluxo",
					"defaultBaseBranch": "main",
					"allowedBranchPrefix": "agent/",
					"executionMode": "branch_per_task",
					"gitProvider": "github",
					"prPolicy": "draft",
					"gitPolicy": "branch_commit_pr",
					"metadata": {}
				},
				"retrievedMemory": [
					{
						"id": "memory-1",
						"kind": "memory",
						"title": null,
						"content": "Deploy em VPS usa docker compose no diretorio /srv/app.",
						"source": "execution_result_v1",
						"score": 4.2,
						"metadata": {"candidateType": "memory_candidate"}
					}
				]
			}
		}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key", "runner")
	claimed, err := ClaimNextTask(client, ClaimNextTaskParams{
		AgentID:          "agent-1",
		RunnerInstanceID: "runner-1",
	})
	if err != nil {
		t.Fatalf("ClaimNextTask returned error: %v", err)
	}
	if claimed == nil || len(claimed.RetrievedMemory) != 1 {
		t.Fatalf("expected one retrieved memory, got %+v", claimed)
	}
	if claimed.RetrievedMemory[0].Content != "Deploy em VPS usa docker compose no diretorio /srv/app." {
		t.Fatalf("expected retrieved memory content to be parsed, got %q", claimed.RetrievedMemory[0].Content)
	}
}
