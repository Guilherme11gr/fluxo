package runner

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBuildBranchNameWithExecID(t *testing.T) {
	tests := []struct {
		name          string
		taskID        string
		taskType      string
		agentName     string
		allowedPrefix string
		execID        string
		want          string
	}{
		{
			name:      "with exec ID",
			taskID:    "3044ff8c-73b9-40ae-b7fb-a9c6837baf1f",
			taskType:  "TASK",
			agentName: "builder",
			execID:    "b0514112-952d-4cab-a9d4-d3ba83003d50",
			want:      "builder/task-3044ff8c-b0514112",
		},
		{
			name:          "with exec ID and allowed prefix",
			taskID:        "abc12345-xxxx",
			taskType:      "BUG",
			agentName:     "my-agent",
			allowedPrefix: "agent/",
			execID:        "exec1234",
			want:          "agent/bug-abc12345-exec1234",
		},
		{
			name:      "without exec ID falls back to base",
			taskID:    "3044ff8c-73b9-40ae-b7fb-a9c6837baf1f",
			taskType:  "TASK",
			agentName: "builder",
			execID:    "",
			want:      "builder/task-3044ff8c",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BuildBranchNameWithExecID(tt.taskID, tt.taskType, tt.agentName, tt.allowedPrefix, tt.execID)
			if got != tt.want {
				t.Fatalf("BuildBranchNameWithExecID() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestBuildBranchNameBackwardsCompat(t *testing.T) {
	got := BuildBranchName("3044ff8c-73b9-40ae-b7fb-a9c6837baf1f", "TASK", "builder", "")
	want := "builder/task-3044ff8c"
	if got != want {
		t.Fatalf("BuildBranchName() backwards compat = %q, want %q", got, want)
	}
}

func TestResolveGitPolicy(t *testing.T) {
	if got := ResolveGitPolicy("branch_only", GitPolicyNoWrite); got != GitPolicyBranchOnly {
		t.Fatalf("expected branch_only, got %q", got)
	}
	if got := ResolveGitPolicy("branch_commit_pr", GitPolicyNoWrite); got != GitPolicyBranchCommitPR {
		t.Fatalf("expected branch_commit_pr, got %q", got)
	}
	if got := ResolveGitPolicy("", GitPolicyBranchOnly); got != GitPolicyBranchOnly {
		t.Fatalf("expected default branch_only when empty string, got %q", got)
	}
	if got := ResolveGitPolicy("no_write", GitPolicyBranchOnly); got != GitPolicyNoWrite {
		t.Fatalf("expected no_write when explicitly set, got %q", got)
	}
	if got := ResolveGitPolicy("unknown", GitPolicyNoWrite); got != GitPolicyNoWrite {
		t.Fatalf("expected no_write fallback, got %q", got)
	}
}

func TestPolicyRequiresBranch(t *testing.T) {
	if PolicyRequiresBranch(GitPolicyNoWrite) {
		t.Fatal("no_write should not require branch")
	}
	if !PolicyRequiresBranch(GitPolicyBranchOnly) {
		t.Fatal("branch_only should require branch")
	}
	if !PolicyRequiresBranch(GitPolicyBranchCommitPR) {
		t.Fatal("branch_commit_pr should require branch")
	}
}

func TestPolicyRequiresCommit(t *testing.T) {
	if PolicyRequiresCommit(GitPolicyNoWrite) {
		t.Fatal("no_write should not require commit")
	}
	if !PolicyRequiresCommit(GitPolicyBranchOnly) {
		t.Fatal("branch_only should require commit")
	}
	if !PolicyRequiresCommit(GitPolicyBranchCommitPR) {
		t.Fatal("branch_commit_pr should require commit")
	}
}

func TestPolicyRequiresPush(t *testing.T) {
	if PolicyRequiresPush(GitPolicyNoWrite) {
		t.Fatal("no_write should not require push")
	}
	if PolicyRequiresPush(GitPolicyBranchOnly) {
		t.Fatal("branch_only should not require push")
	}
	if !PolicyRequiresPush(GitPolicyBranchCommitPR) {
		t.Fatal("branch_commit_pr should require push")
	}
}

func TestPolicyRequiresPR(t *testing.T) {
	if PolicyRequiresPR(GitPolicyNoWrite) {
		t.Fatal("no_write should not require PR")
	}
	if PolicyRequiresPR(GitPolicyBranchOnly) {
		t.Fatal("branch_only should not require PR")
	}
	if !PolicyRequiresPR(GitPolicyBranchCommitPR) {
		t.Fatal("branch_commit_pr should require PR")
	}
}

func TestExecuteGitWorkflowNoWrite(t *testing.T) {
	cfg := GitWorkflowConfig{
		Policy:   GitPolicyNoWrite,
		TaskID:   "abc12345",
		TaskType: "TASK",
		AgentName: "builder",
		Workdir:  "",
	}
	result := ExecuteGitWorkflow(cfg)
	if !result.PreflightOK {
		t.Fatalf("expected OK for no_write, got error: %v", result.Error)
	}
	if result.Preparation.Mode != GitPolicyNoWrite {
		t.Fatalf("expected no_write mode, got %q", result.Preparation.Mode)
	}
	if result.BranchName != "" {
		t.Fatalf("expected empty branch for no_write, got %q", result.BranchName)
	}
}

func TestExecuteGitWorkflowBranchOnly(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	cfg := GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		AgentName: "builder",
		ExecID:   "exec12345",
		Workdir:  dir,
	}
	result := ExecuteGitWorkflow(cfg)
	if !result.PreflightOK {
		t.Fatalf("expected OK, got error: %v", result.Error)
	}
	if result.BranchName == "" {
		t.Fatal("expected non-empty branch name")
	}
	if result.Preparation.Branch == "" {
		t.Fatal("expected non-empty preparation branch")
	}
	if result.Preparation.Mode != GitPolicyBranchOnly {
		t.Fatalf("expected branch_only mode, got %q", result.Preparation.Mode)
	}
	if result.Preparation.Branch == "main" || result.Preparation.Branch == "master" {
		t.Fatalf("should not be on protected branch after preparation, got %q", result.Preparation.Branch)
	}
}

func TestExecuteGitWorkflowPreflightFailsOnProtected(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	gitCommand(dir, "checkout", "-b", "main")

	cfg := GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		AgentName: "builder",
		Workdir:  dir,
	}
	result := ExecuteGitWorkflow(cfg)
	if !result.PreflightOK {
		t.Fatalf("expected workflow to succeed by auto-creating branch, got error: %v", result.Error)
	}
	if result.Preparation.Branch == "main" {
		t.Fatal("expected workflow to switch away from protected branch")
	}
}

func TestFinalizeGitWorkflowNoCommit(t *testing.T) {
	cfg := GitWorkflowConfig{
		Policy:   GitPolicyNoWrite,
		TaskID:   "abc12345",
		TaskType: "TASK",
		TaskTitle: "Test Task",
		AgentName: "builder",
		Workdir:  "",
	}
	prep := GitPreparation{
		Mode:       GitPolicyNoWrite,
		BaseBranch: "main",
		CommitShas: []string{},
	}
	result := FinalizeGitWorkflow(cfg, prep)
	if result.Error != nil {
		t.Fatalf("expected no error for no_write finalize, got %v", result.Error)
	}
}

func TestFinalizeGitWorkflowBranchOnlyCommit(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prepResult := ExecuteGitWorkflow(GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		AgentName: "builder",
		ExecID:   "exec1",
		Workdir:  dir,
	})
	if prepResult.Error != nil {
		t.Fatalf("ExecuteGitWorkflow failed: %v", prepResult.Error)
	}

	if err := os.WriteFile(filepath.Join(dir, "test.txt"), []byte("hello workflow"), 0644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	cfg := GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		TaskTitle: "Test Task Title",
		AgentName: "builder",
		Workdir:  dir,
	}

	finalResult := FinalizeGitWorkflow(cfg, prepResult.Preparation)
	if finalResult.Error != nil {
		t.Fatalf("FinalizeGitWorkflow failed: %v", finalResult.Error)
	}
	if len(finalResult.CommitShas) == 0 {
		t.Fatal("expected at least one commit SHA")
	}
	if finalResult.Snapshot.Branch == "" {
		t.Fatal("expected non-empty branch in snapshot")
	}
	if finalResult.Snapshot.Mode != string(GitPolicyBranchOnly) {
		t.Fatalf("expected branch_only mode in snapshot, got %q", finalResult.Snapshot.Mode)
	}
}

func TestFinalizeGitWorkflowNoChanges(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prepResult := ExecuteGitWorkflow(GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		AgentName: "builder",
		ExecID:   "exec1",
		Workdir:  dir,
	})
	if prepResult.Error != nil {
		t.Fatalf("ExecuteGitWorkflow failed: %v", prepResult.Error)
	}

	cfg := GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		TaskTitle: "No Changes Task",
		AgentName: "builder",
		Workdir:  dir,
	}

	finalResult := FinalizeGitWorkflow(cfg, prepResult.Preparation)
	if finalResult.Error != nil {
		t.Fatalf("FinalizeGitWorkflow with no changes failed: %v", finalResult.Error)
	}
	if len(finalResult.CommitShas) != 0 {
		t.Fatalf("expected no commits with no changes, got %d", len(finalResult.CommitShas))
	}
}

func TestGitWorkflowResultSnapshotPersistence(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prepResult := ExecuteGitWorkflow(GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		AgentName: "builder",
		ExecID:   "exec1",
		Workdir:  dir,
	})
	if prepResult.Error != nil {
		t.Fatalf("ExecuteGitWorkflow failed: %v", prepResult.Error)
	}

	if err := os.WriteFile(filepath.Join(dir, "newfile.go"), []byte("package main"), 0644); err != nil {
		t.Fatal(err)
	}

	cfg := GitWorkflowConfig{
		Policy:   GitPolicyBranchOnly,
		BaseBranch: "main",
		TaskID:   "abc12345",
		TaskType: "TASK",
		TaskTitle: "Snapshot test",
		AgentName: "builder",
		Workdir:  dir,
	}

	finalResult := FinalizeGitWorkflow(cfg, prepResult.Preparation)
	if finalResult.Error != nil {
		t.Fatalf("FinalizeGitWorkflow failed: %v", finalResult.Error)
	}

	gitMeta := GitMetadataMap(finalResult.Snapshot)
	if gitMeta["branch"] == nil || gitMeta["branch"] == "" {
		t.Fatal("expected branch in git metadata")
	}
	if gitMeta["mode"] == nil || gitMeta["mode"] == "" {
		t.Fatal("expected mode in git metadata")
	}
	if gitMeta["baseBranch"] == nil {
		t.Fatal("expected baseBranch in git metadata")
	}

	resultMap := MergeGitResult(map[string]interface{}{"status": "success"}, finalResult.Snapshot)
	gitMap, ok := resultMap["git"].(map[string]interface{})
	if !ok {
		t.Fatal("expected git map in merged result")
	}
	if gitMap["branch"] == nil {
		t.Fatal("expected branch in merged result git")
	}
	if gitMap["mode"] == nil {
		t.Fatal("expected mode in merged result git")
	}
}

func TestGitWorkflowConfigFromAgentConfig(t *testing.T) {
	cfg := GitWorkflowConfig{
		Policy:        ResolveGitPolicy("branch_commit_pr", GitPolicyNoWrite),
		BaseBranch:    "develop",
		AllowedPrefix: "agent/",
		AgentName:     "builder",
		TaskID:        "5223add6-34fb-4088-aa3f-329d81fad580",
		TaskType:      "TASK",
		TaskTitle:     "Implement git workflow",
		ExecID:        "b0514112-952d-4cab-a9d4",
		Workdir:       "/tmp/repo",
		PushAfterCommit: PolicyRequiresPush(ResolveGitPolicy("branch_commit_pr", GitPolicyNoWrite)),
		CreatePR:      PolicyRequiresPR(ResolveGitPolicy("branch_commit_pr", GitPolicyNoWrite)),
		PRDraft:       true,
	}
	if cfg.Policy != GitPolicyBranchCommitPR {
		t.Fatalf("expected branch_commit_pr, got %q", cfg.Policy)
	}
	if !cfg.PushAfterCommit {
		t.Fatal("expected PushAfterCommit=true for branch_commit_pr")
	}
	if !cfg.CreatePR {
		t.Fatal("expected CreatePR=true for branch_commit_pr")
	}

	branchName := BuildBranchNameWithExecID(cfg.TaskID, cfg.TaskType, cfg.AgentName, cfg.AllowedPrefix, cfg.ExecID)
	expectedPrefix := "agent/task-5223add6"
	if !hasPrefix(branchName, expectedPrefix) {
		t.Fatalf("expected branch name to start with %q, got %q", expectedPrefix, branchName)
	}
}

func hasPrefix(s, prefix string) bool {
	return len(s) >= len(prefix) && s[:len(prefix)] == prefix
}