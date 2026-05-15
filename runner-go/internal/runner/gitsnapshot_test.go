package runner

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestCaptureGitSnapshotEmptyWorkdir(t *testing.T) {
	prep := GitPreparation{
		Mode:       GitPolicyBranchOnly,
		BaseBranch: "main",
		Branch:     "builder/task-test",
		CommitShas: []string{"abc123"},
	}
	snapshot := CaptureGitSnapshot("", prep)
	if snapshot.Branch != "builder/task-test" {
		t.Fatalf("expected branch from prep, got %q", snapshot.Branch)
	}
	if snapshot.BaseBranch != "main" {
		t.Fatalf("expected base from prep, got %q", snapshot.BaseBranch)
	}
	if len(snapshot.CommitShas) != 1 || snapshot.CommitShas[0] != "abc123" {
		t.Fatalf("expected prep commit shas, got %v", snapshot.CommitShas)
	}
	if snapshot.Mode != string(GitPolicyBranchOnly) {
		t.Fatalf("expected mode from prep, got %q", snapshot.Mode)
	}
}

func TestCaptureGitSnapshotFromWorkdir(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prep, _ := PrepareGitBranch(dir, GitPolicyBranchOnly, "builder/task-snap", "main", "")

	snapshot := CaptureGitSnapshot(dir, prep)
	if snapshot.Branch == "" {
		t.Fatal("expected non-empty branch from workdir")
	}
	if snapshot.BaseBranch != "main" {
		t.Fatalf("expected base=main, got %q", snapshot.BaseBranch)
	}
	if len(snapshot.CommitShas) == 0 {
		t.Fatal("expected at least one commit SHA")
	}
	if snapshot.CapturedAt == "" {
		t.Fatal("expected non-empty capturedAt")
	}
}

func TestCaptureGitSnapshotDetectsNewCommits(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	prep, _ := PrepareGitBranch(dir, GitPolicyBranchOnly, "builder/task-snap2", "main", "")

	if err := os.WriteFile(filepath.Join(dir, "newfile.txt"), []byte("content"), 0644); err != nil {
		t.Fatal(err)
	}
	CommitChanges(dir, prep.Branch, "task-new", "New commit")

	snapshot := CaptureGitSnapshot(dir, prep)
	if len(snapshot.CommitShas) == 0 {
		t.Fatal("expected new commit SHAs after commit")
	}

	shas, err := CollectNewCommitSHAs(dir, prep.CommitShas[0])
	if err != nil {
		t.Fatalf("CollectNewCommitSHAs error: %v", err)
	}
	if len(shas) < 1 {
		t.Fatalf("expected at least 1 new commit, got %d", len(shas))
	}
}

func TestMergeGitResultWithPRFields(t *testing.T) {
	prURL := "https://github.com/org/repo/pull/5"
	prNum := 5
	snapshot := GitSnapshot{
		Branch:     "builder/task-pr",
		BaseBranch: "main",
		CommitShas: []string{"sha1"},
		PRUrl:      &prURL,
		PRNumber:   &prNum,
		Mode:       "branch_commit_pr",
		CapturedAt: "2026-01-01T00:00:00Z",
	}

	result := MergeGitResult(map[string]interface{}{"status": "success"}, snapshot)
	gitMap, ok := result["git"].(map[string]interface{})
	if !ok {
		t.Fatal("expected git map in result")
	}
	if prUrlPtr, ok := gitMap["prUrl"].(*string); !ok || *prUrlPtr != prURL {
		t.Fatalf("expected prUrl=%q, got %v", prURL, gitMap["prUrl"])
	}
	if gitMap["mode"] != "branch_commit_pr" {
		t.Fatalf("expected mode=branch_commit_pr, got %v", gitMap["mode"])
	}
}

func TestGitMetadataMapWithPR(t *testing.T) {
	prURL := "https://github.com/org/repo/pull/10"
	prNum := 10
	snapshot := GitSnapshot{
		Branch:     "agent/feat-abc",
		BaseBranch: "develop",
		CommitShas: []string{"sha1", "sha2"},
		PRUrl:      &prURL,
		PRNumber:   &prNum,
		Mode:       "branch_commit_pr",
		CapturedAt: "2026-05-14T00:00:00Z",
	}

	meta := GitMetadataMap(snapshot)
	if meta["branch"] != "agent/feat-abc" {
		t.Fatalf("expected branch, got %v", meta["branch"])
	}
	if prUrlPtr, ok := meta["prUrl"].(*string); !ok || *prUrlPtr != prURL {
		t.Fatalf("expected prUrl, got %v", meta["prUrl"])
	}
	if meta["capturedAt"] != "2026-05-14T00:00:00Z" {
		t.Fatalf("expected capturedAt, got %v", meta["capturedAt"])
	}
}

func TestMergeGitResultNilInput(t *testing.T) {
	result := MergeGitResult(nil, GitSnapshot{})
	if result != nil {
		t.Fatalf("expected nil for nil input, got %v", result)
	}
}

func TestFormatGitPreparationError(t *testing.T) {
	snapshot := GitSnapshot{Branch: "feat/x", BaseBranch: "main"}
	msg := FormatGitPreparationError(fmt.Errorf("something bad"), snapshot)
	if msg == "" {
		t.Fatal("expected non-empty error message")
	}

	msg2 := FormatGitPreparationError(nil, snapshot)
	if msg2 != "" {
		t.Fatalf("expected empty for nil error, got %q", msg2)
	}
}