package runner

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
	if len(snapshot.CommitShas) != 0 {
		t.Fatalf("expected no new commit shas before work starts, got %v", snapshot.CommitShas)
	}
	if snapshot.BaselineHeadSHA != "abc123" || snapshot.FinalHeadSHA != "abc123" {
		t.Fatalf("expected baseline/final from prep, got baseline=%q final=%q", snapshot.BaselineHeadSHA, snapshot.FinalHeadSHA)
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
	if len(snapshot.CommitShas) != 0 {
		t.Fatalf("expected no new commit SHA before changes, got %v", snapshot.CommitShas)
	}
	if snapshot.BaselineHeadSHA == "" || snapshot.FinalHeadSHA == "" {
		t.Fatalf("expected baseline/final HEADs, got baseline=%q final=%q", snapshot.BaselineHeadSHA, snapshot.FinalHeadSHA)
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
	if !snapshot.HasVerifiableDelta {
		t.Fatalf("expected verifiable delta, got %#v", snapshot)
	}
	if len(snapshot.NewCommitSHAs) == 0 {
		t.Fatal("expected newCommitShas after commit")
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

func TestGitEvidenceMapIncludesArtifactFields(t *testing.T) {
	snapshot := GitSnapshot{
		Branch:             "agent/task-1",
		BaseBranch:         "main",
		BaselineHeadSHA:    "abc",
		FinalHeadSHA:       "def",
		NewCommitSHAs:      []string{"def"},
		ChangedFiles:       []string{"src/foo.ts"},
		HasVerifiableDelta: true,
		PolicyVerified:     true,
		Mode:               "branch_only",
	}

	evidence := GitEvidenceMap(snapshot)
	if evidence["gitPolicy"] != "branch_only" {
		t.Fatalf("expected gitPolicy=branch_only, got %#v", evidence["gitPolicy"])
	}
	if evidence["hasVerifiableDelta"] != true {
		t.Fatalf("expected hasVerifiableDelta=true, got %#v", evidence["hasVerifiableDelta"])
	}
	if evidence["baselineHeadSha"] != "abc" || evidence["finalHeadSha"] != "def" {
		t.Fatalf("expected baseline/final shas, got %#v", evidence)
	}
}

func TestNormalizeGitRemoteURL(t *testing.T) {
	tests := []struct {
		name   string
		remote string
		want   string
	}{
		{
			name:   "https remote",
			remote: "https://github.com/org/repo.git",
			want:   "https://github.com/org/repo",
		},
		{
			name:   "ssh remote",
			remote: "git@github.com:org/repo.git",
			want:   "https://github.com/org/repo",
		},
		{
			name:   "non github remote ignored",
			remote: "https://gitlab.com/org/repo.git",
			want:   "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := normalizeGitRemoteURL(tt.remote); got != tt.want {
				t.Fatalf("normalizeGitRemoteURL() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestBuildGitLinks(t *testing.T) {
	repo := initTestGitRepo(t)
	defer os.RemoveAll(repo)
	if _, err := gitCommand(repo, "remote", "add", "origin", "git@github.com:org/repo.git"); err != nil {
		t.Fatalf("add origin: %v", err)
	}

	snapshot := GitSnapshot{
		Branch:          "agent/codex/task-flxo-387-runner-worktree-fix-validation",
		BaseBranch:      "main",
		BaselineHeadSHA: "1111111111111111111111111111111111111111",
		FinalHeadSHA:    "2222222222222222222222222222222222222222",
		NewCommitSHAs: []string{
			"2222222222222222222222222222222222222222",
		},
	}

	links := BuildGitLinks(repo, snapshot)
	if links.Repository != "https://github.com/org/repo" {
		t.Fatalf("expected repository link, got %q", links.Repository)
	}
	if !strings.Contains(links.Branch, "agent%2Fcodex%2Ftask-flxo-387-runner-worktree-fix-validation") {
		t.Fatalf("expected escaped branch link, got %q", links.Branch)
	}
	if !strings.Contains(links.Compare, "11111111") || !strings.Contains(links.Compare, "22222222") {
		t.Fatalf("expected compare link with SHAs, got %q", links.Compare)
	}
	if len(links.Commits) != 1 || !strings.Contains(links.Commits[0], "/commit/22222222") {
		t.Fatalf("expected commit link, got %#v", links.Commits)
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

func TestCaptureWorktreeSnapshotAndDiffWorktreeFiles(t *testing.T) {
	dir := initTestGitRepo(t)
	defer os.RemoveAll(dir)

	before := CaptureWorktreeSnapshot(dir)
	if err := os.WriteFile(filepath.Join(dir, "feature.txt"), []byte("hello"), 0644); err != nil {
		t.Fatalf("write feature file: %v", err)
	}

	after := CaptureWorktreeSnapshot(dir)
	files := DiffWorktreeFiles(before, after)
	if len(files) != 1 || files[0] != "feature.txt" {
		t.Fatalf("expected feature.txt diff, got %#v", files)
	}

	if err := os.WriteFile(filepath.Join(dir, "README.md"), []byte("# changed"), 0644); err != nil {
		t.Fatalf("rewrite readme: %v", err)
	}
	after = CaptureWorktreeSnapshot(dir)
	files = DiffWorktreeFiles(before, after)
	if len(files) != 2 {
		t.Fatalf("expected two changed files, got %#v", files)
	}
}
