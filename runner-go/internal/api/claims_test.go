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
}
