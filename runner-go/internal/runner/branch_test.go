package runner

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildBranchName(t *testing.T) {
	tests := []struct {
		name          string
		taskID        string
		taskType      string
		agentName     string
		allowedPrefix string
		want          string
	}{
		{
			name:      "basic branch name",
			taskID:    "3044ff8c-73b9-40ae-b7fb-a9c6837baf1f",
			taskType:  "TASK",
			agentName: "builder",
			want:      "builder/task-3044ff8c",
		},
		{
			name:          "with allowed prefix",
			taskID:        "abc12345-xxxx",
			taskType:      "BUG",
			agentName:     "my-agent",
			allowedPrefix: "agent/",
			want:          "agent/bug-abc12345",
		},
		{
			name:      "special chars stripped",
			taskID:    "shortid",
			taskType:  "FEATURE",
			agentName: "FluXo@app!",
			want:      "fluxo-app/feature-shortid",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BuildBranchName(tt.taskID, tt.taskType, tt.agentName, tt.allowedPrefix)
			if got != tt.want {
				t.Fatalf("BuildBranchName() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestParseGitPolicy(t *testing.T) {
	if got := ParseGitPolicy("branch_commit_pr"); got != GitPolicyBranchCommitPR {
		t.Fatalf("expected branch_commit_pr, got %q", got)
	}
	if got := ParseGitPolicy("branch_only"); got != GitPolicyBranchOnly {
		t.Fatalf("expected branch_only, got %q", got)
	}
	if got := ParseGitPolicy("no_write"); got != GitPolicyNoWrite {
		t.Fatalf("expected no_write, got %q", got)
	}
	if got := ParseGitPolicy("unknown"); got != GitPolicyNoWrite {
		t.Fatalf("expected no_write fallback, got %q", got)
	}
	if got := ParseGitPolicy(""); got != GitPolicyNoWrite {
		t.Fatalf("expected no_write fallback for empty, got %q", got)
	}
}

func TestValidatePreparedBranch(t *testing.T) {
	if err := validatePreparedBranch(GitPolicyBranchOnly, "main", "main", ""); err == nil {
		t.Fatal("expected protected branch check to fail")
	}
	if err := validatePreparedBranch(GitPolicyBranchCommitPR, "agent/task-123", "main", "agent/"); err != nil {
		t.Fatalf("expected allowed branch to pass, got %v", err)
	}
	if err := validatePreparedBranch(GitPolicyBranchOnly, "feature/task-123", "main", "agent/"); err == nil {
		t.Fatal("expected prefix mismatch to fail")
	}
}

func TestPrepareGitBranchNoWriteKeepsBranchEmpty(t *testing.T) {
	prep, err := PrepareGitBranch("/tmp/project", GitPolicyNoWrite, "agent/task-123", "main", "agent/")
	if err != nil {
		t.Fatalf("expected no error, got %v", err)
	}
	if prep.Branch != "" {
		t.Fatalf("expected empty branch for no_write, got %q", prep.Branch)
	}
	if prep.BaseBranch != "main" {
		t.Fatalf("expected base branch to be main, got %q", prep.BaseBranch)
	}
}

func TestIsProtectedBranch(t *testing.T) {
	tests := []struct {
		branch     string
		baseBranch string
		want       bool
	}{
		{"main", "main", true},
		{"master", "main", true},
		{"develop", "main", false},
		{"feature/x", "main", false},
		{"custom-base", "custom-base", true},
	}
	for _, tt := range tests {
		got := isProtectedBranch(tt.branch, tt.baseBranch)
		if got != tt.want {
			t.Errorf("isProtectedBranch(%q, %q) = %v, want %v", tt.branch, tt.baseBranch, got, tt.want)
		}
	}
}

func TestPreflightGitCheckNoWriteAlwaysOK(t *testing.T) {
	result := PreflightGitCheck("", GitPolicyNoWrite, "main", "")
	if !result.OK {
		t.Fatalf("expected OK for no_write, got error: %s", result.ErrorMessage)
	}
}

func TestPreflightGitCheckEmptyWorkdirOK(t *testing.T) {
	result := PreflightGitCheck("", GitPolicyBranchOnly, "main", "")
	if !result.OK {
		t.Fatalf("expected OK for empty workdir, got error: %s", result.ErrorMessage)
	}
}

func TestPreflightGitCheckOnFeatureBranch(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	_, err := PrepareGitBranch(dir, GitPolicyBranchOnly, "builder/task-abc1", "main", "")
	if err != nil {
		t.Fatalf("PrepareGitBranch failed: %v", err)
	}

	result := PreflightGitCheck(dir, GitPolicyBranchOnly, "main", "")
	if !result.OK {
		t.Fatalf("expected OK on feature branch, got error: %s", result.ErrorMessage)
	}
	if result.IsProtected {
		t.Fatal("expected IsProtected=false on feature branch")
	}
}

func TestPreflightGitCheckOnProtectedBranch(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	result := PreflightGitCheck(dir, GitPolicyBranchOnly, "main", "")
	if result.OK {
		t.Fatal("expected NOT OK on protected branch")
	}
	if !result.IsProtected {
		t.Fatal("expected IsProtected=true on main")
	}
}

func TestPreflightGitCheckPrefixEnforcement(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	_, err := PrepareGitBranch(dir, GitPolicyBranchOnly, "agent/task-test", "main", "agent/")
	if err != nil {
		t.Fatalf("PrepareGitBranch failed: %v", err)
	}

	result := PreflightGitCheck(dir, GitPolicyBranchOnly, "main", "wrong/")
	if result.OK {
		t.Fatal("expected NOT OK with mismatched prefix")
	}
	if result.ErrorMessage == "" {
		t.Fatal("expected error message for prefix mismatch")
	}
}

func TestCommitChangesNoWorkdir(t *testing.T) {
	sha, err := CommitChanges("", "branch", "task-123", "title")
	if err != nil {
		t.Fatalf("expected no error for empty workdir, got %v", err)
	}
	if sha != "" {
		t.Fatalf("expected empty sha for empty workdir, got %q", sha)
	}
}

func TestCommitChangesNoChanges(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prep, _ := PrepareGitBranch(dir, GitPolicyBranchOnly, "builder/task-test", "main", "")

	sha, err := CommitChanges(dir, prep.Branch, "task-test", "Test Task")
	if err != nil {
		t.Fatalf("expected no error when no changes, got %v", err)
	}
	if sha != "" {
		t.Fatalf("expected empty sha when no changes, got %q", sha)
	}
}

func TestCommitChangesWithChanges(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prep, _ := PrepareGitBranch(dir, GitPolicyBranchOnly, "builder/task-test", "main", "")

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello"), 0644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	sha, err := CommitChanges(dir, prep.Branch, "abc12345", "My Task")
	if err != nil {
		t.Fatalf("CommitChanges failed: %v", err)
	}
	if sha == "" {
		t.Fatal("expected non-empty sha after commit")
	}
	if len(sha) != 40 {
		t.Fatalf("expected 40-char SHA, got %d chars: %q", len(sha), sha)
	}
}

func TestCommitChangesRefusesProtectedBranch(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	testFile := filepath.Join(dir, "test.txt")
	if err := os.WriteFile(testFile, []byte("hello"), 0644); err != nil {
		t.Fatalf("write test file: %v", err)
	}

	_, err := CommitChanges(dir, "main", "task-123", "title")
	if err == nil {
		t.Fatal("expected error committing on protected branch")
	}
}

func TestCollectNewCommitSHAsNoWorkdir(t *testing.T) {
	shas, err := CollectNewCommitSHAs("", "abc123")
	if err != nil {
		t.Fatalf("expected no error for empty workdir, got %v", err)
	}
	if len(shas) != 0 {
		t.Fatalf("expected empty shas, got %v", shas)
	}
}

func TestCollectNewCommitSHAsNoBaseSHA(t *testing.T) {
	shas, err := CollectNewCommitSHAs("/tmp", "")
	if err != nil {
		t.Fatalf("expected no error for empty baseSHA, got %v", err)
	}
	if len(shas) != 0 {
		t.Fatalf("expected empty shas, got %v", shas)
	}
}

func TestCollectNewCommitSHAsWithNewCommits(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prep, _ := PrepareGitBranch(dir, GitPolicyBranchOnly, "builder/task-test", "main", "")

	baseSHA := prep.CommitShas[0]

	if err := os.WriteFile(filepath.Join(dir, "file1.txt"), []byte("content1"), 0644); err != nil {
		t.Fatal(err)
	}
	CommitChanges(dir, prep.Branch, "task-1", "First commit")

	if err := os.WriteFile(filepath.Join(dir, "file2.txt"), []byte("content2"), 0644); err != nil {
		t.Fatal(err)
	}
	CommitChanges(dir, prep.Branch, "task-2", "Second commit")

	shas, err := CollectNewCommitSHAs(dir, baseSHA)
	if err != nil {
		t.Fatalf("CollectNewCommitSHAs failed: %v", err)
	}
	if len(shas) < 2 {
		t.Fatalf("expected at least 2 new commits, got %d: %v", len(shas), shas)
	}
}

func TestPushBranchNoWorkdir(t *testing.T) {
	err := PushBranch("", "branch")
	if err != nil {
		t.Fatalf("expected no error for empty workdir, got %v", err)
	}
}

func TestPushBranchNoBranch(t *testing.T) {
	err := PushBranch("/tmp", "")
	if err != nil {
		t.Fatalf("expected no error for empty branch, got %v", err)
	}
}

func TestPushBranchRefusesProtected(t *testing.T) {
	err := PushBranch("/tmp", "main")
	if err == nil {
		t.Fatal("expected error pushing to protected branch")
	}
}

func TestCreateExecutionWorktreeAndSwitchToTaskBranch(t *testing.T) {
	baseRepo := initTestGitRepoWithRemote(t)
	worktreesRoot := filepath.Join(t.TempDir(), "worktrees")
	worktreePath, err := CreateExecutionWorktree(baseRepo, worktreesRoot, "exec-123", "main")
	if err != nil {
		t.Fatalf("CreateExecutionWorktree failed: %v", err)
	}

	branch := "agent/task-123"
	if err := SwitchToTaskBranch(worktreePath, branch, "main", "agent/"); err != nil {
		t.Fatalf("SwitchToTaskBranch failed: %v", err)
	}

	currentBranch, err := gitCommand(worktreePath, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		t.Fatalf("read current branch: %v", err)
	}
	if currentBranch != branch {
		t.Fatalf("expected branch %q, got %q", branch, currentBranch)
	}
}

func TestRemoveExecutionWorktreeRejectsDirtyTree(t *testing.T) {
	baseRepo := initTestGitRepoWithRemote(t)
	worktreesRoot := filepath.Join(t.TempDir(), "worktrees")
	worktreePath, err := CreateExecutionWorktree(baseRepo, worktreesRoot, "exec-dirty", "main")
	if err != nil {
		t.Fatalf("CreateExecutionWorktree failed: %v", err)
	}
	branch := "agent/task-dirty"
	if err := SwitchToTaskBranch(worktreePath, branch, "main", "agent/"); err != nil {
		t.Fatalf("SwitchToTaskBranch failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(worktreePath, "dirty.txt"), []byte("dirty"), 0644); err != nil {
		t.Fatalf("write dirty file: %v", err)
	}

	err = RemoveExecutionWorktree(baseRepo, worktreePath, branch)
	if err == nil || !strings.Contains(err.Error(), "dirty") {
		t.Fatalf("expected dirty worktree error, got %v", err)
	}
}

func TestRemoveExecutionWorktreeRejectsWhenRemoteIsBehind(t *testing.T) {
	baseRepo := initTestGitRepoWithRemote(t)
	worktreesRoot := filepath.Join(t.TempDir(), "worktrees")
	worktreePath, err := CreateExecutionWorktree(baseRepo, worktreesRoot, "exec-unpushed", "main")
	if err != nil {
		t.Fatalf("CreateExecutionWorktree failed: %v", err)
	}
	branch := "agent/task-unpushed"
	if err := SwitchToTaskBranch(worktreePath, branch, "main", "agent/"); err != nil {
		t.Fatalf("SwitchToTaskBranch failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(worktreePath, "commit.txt"), []byte("hello"), 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if _, err := CommitChanges(worktreePath, branch, "task-unpushed", "unpushed"); err != nil {
		t.Fatalf("CommitChanges failed: %v", err)
	}

	err = RemoveExecutionWorktree(baseRepo, worktreePath, branch)
	if err == nil || !strings.Contains(err.Error(), "remote branch") {
		t.Fatalf("expected remote mismatch error, got %v", err)
	}
}

func TestRemoveExecutionWorktreeRemovesCleanPushedWorktree(t *testing.T) {
	baseRepo := initTestGitRepoWithRemote(t)
	worktreesRoot := filepath.Join(t.TempDir(), "worktrees")
	worktreePath, err := CreateExecutionWorktree(baseRepo, worktreesRoot, "exec-clean", "main")
	if err != nil {
		t.Fatalf("CreateExecutionWorktree failed: %v", err)
	}
	branch := "agent/task-clean"
	if err := SwitchToTaskBranch(worktreePath, branch, "main", "agent/"); err != nil {
		t.Fatalf("SwitchToTaskBranch failed: %v", err)
	}
	if err := os.WriteFile(filepath.Join(worktreePath, "commit.txt"), []byte("hello"), 0644); err != nil {
		t.Fatalf("write file: %v", err)
	}
	if _, err := CommitChanges(worktreePath, branch, "task-clean", "clean"); err != nil {
		t.Fatalf("CommitChanges failed: %v", err)
	}
	if err := PushBranch(worktreePath, branch); err != nil {
		t.Fatalf("PushBranch failed: %v", err)
	}

	if err := RemoveExecutionWorktree(baseRepo, worktreePath, branch); err != nil {
		t.Fatalf("RemoveExecutionWorktree failed: %v", err)
	}
	if _, err := os.Stat(worktreePath); !os.IsNotExist(err) {
		t.Fatalf("expected worktree to be removed, stat err=%v", err)
	}
}

func TestParseGHPROutput(t *testing.T) {
	tests := []struct {
		name  string
		input string
		url   string
		num   int
	}{
		{
			name:  "standard gh output",
			input: "https://github.com/org/repo/pull/42",
			url:   "https://github.com/org/repo/pull/42",
			num:   42,
		},
		{
			name:  "multiline with URL at end",
			input: "Creating PR...\nhttps://github.com/org/repo/pull/7",
			url:   "https://github.com/org/repo/pull/7",
			num:   7,
		},
		{
			name:  "no URL",
			input: "error: no remote",
			url:   "",
			num:   0,
		},
		{
			name:  "http URL",
			input: "http://git.example.com/pr/123",
			url:   "http://git.example.com/pr/123",
			num:   123,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			url, num := parseGHPROutput(tt.input)
			if url != tt.url {
				t.Errorf("url = %q, want %q", url, tt.url)
			}
			if num != tt.num {
				t.Errorf("num = %d, want %d", num, tt.num)
			}
		})
	}
}

func TestExtractPRNumberFromURL(t *testing.T) {
	tests := []struct {
		url  string
		want int
	}{
		{"https://github.com/org/repo/pull/42", 42},
		{"https://github.com/org/repo/pull/1", 1},
		{"https://github.com/org/repo/pull/999", 999},
		{"https://github.com/org/repo/pull/", 0},
		{"https://github.com/org/repo/pull/abc", 0},
	}
	for _, tt := range tests {
		got := extractPRNumberFromURL(tt.url)
		if got != tt.want {
			t.Errorf("extractPRNumberFromURL(%q) = %d, want %d", tt.url, got, tt.want)
		}
	}
}

func initTestGitRepo(t *testing.T) string {
	t.Helper()
	dir, err := os.MkdirTemp("", "fluxo-runner-test-")
	if err != nil {
		t.Fatalf("create temp dir: %v", err)
	}
	gitCommand(dir, "init")
	gitCommand(dir, "config", "user.email", "test@fluxo.dev")
	gitCommand(dir, "config", "user.name", "Test")
	gitCommand(dir, "checkout", "-b", "main")
	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("# test"), 0644); err != nil {
		t.Fatalf("write readme: %v", err)
	}
	gitCommand(dir, "add", "-A")
	gitCommand(dir, "commit", "-m", "initial")
	return dir
}

func initTestGitRepoWithRemote(t *testing.T) string {
	t.Helper()
	remoteDir, err := os.MkdirTemp("", "fluxo-runner-remote-")
	if err != nil {
		t.Fatalf("create remote dir: %v", err)
	}
	if _, err := gitCommand(remoteDir, "init", "--bare"); err != nil {
		t.Fatalf("init bare remote: %v", err)
	}

	repoDir := initTestGitRepo(t)
	if _, err := gitCommand(repoDir, "remote", "add", "origin", remoteDir); err != nil {
		t.Fatalf("add origin: %v", err)
	}
	if _, err := gitCommand(repoDir, "push", "-u", "origin", "main"); err != nil {
		t.Fatalf("push main: %v", err)
	}
	return repoDir
}
