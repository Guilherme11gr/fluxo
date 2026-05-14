package runner

import "testing"

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
	if got := ParseGitPolicy("unknown"); got != GitPolicyNoWrite {
		t.Fatalf("expected no_write fallback, got %q", got)
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
