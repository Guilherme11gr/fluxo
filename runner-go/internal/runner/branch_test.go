package runner

import (
	"testing"
)

func TestBuildBranchName(t *testing.T) {
	tests := []struct {
		name          string
		taskID        string
		taskType      string
		agentName     string
		allowedPrefix string
		wantPattern   string
	}{
		{
			name:          "basic branch name",
			taskID:        "3044ff8c-73b9-40ae-b7fb-a9c6837baf1f",
			taskType:      "TASK",
			agentName:     "builder",
			allowedPrefix: "",
			wantPattern:   "builder/task-3044ff8c",
		},
		{
			name:          "with allowed prefix",
			taskID:        "abc12345-xxxx",
			taskType:      "BUG",
			agentName:     "my-agent",
			allowedPrefix: "agent/",
			wantPattern:   "agent/bug-abc12345",
		},
		{
			name:          "no write policy still builds name",
			taskID:        "shortid",
			taskType:      "FEATURE",
			agentName:     "Test Agent!",
			allowedPrefix: "",
			wantPattern:   "test-agent/feature-shortid",
		},
		{
			name:          "special chars stripped",
			taskID:        "a1b2c3d4",
			taskType:      "TASK",
			agentName:     "flu xo@app",
			allowedPrefix: "",
			wantPattern:   "flu-xo-app/task-a1b2c3d4",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := BuildBranchName(tt.taskID, tt.taskType, tt.agentName, tt.allowedPrefix)
			if got != tt.wantPattern {
				t.Errorf("BuildBranchName(%q, %q, %q, %q) = %q, want %q",
					tt.taskID, tt.taskType, tt.agentName, tt.allowedPrefix, got, tt.wantPattern)
			}
		})
	}
}

func TestBuildBranchNameDeterministic(t *testing.T) {
	name1 := BuildBranchName("3044ff8c-73b9", "TASK", "builder", "")
	name2 := BuildBranchName("3044ff8c-73b9", "TASK", "builder", "")
	if name1 != name2 {
		t.Errorf("BuildBranchName should be deterministic: got %q then %q", name1, name2)
	}
}

func TestBuildBranchNameTruncation(t *testing.T) {
	longID := "abcdefghijklmnopqrstuvwxyz0123456789-very-long-id"
	name := BuildBranchName(longID, "TASK", "builder", "")
	if len(name) > 128 {
		t.Errorf("Branch name too long: %d chars: %q", len(name), name)
	}
	if name[len(name)-1] == '-' {
		t.Errorf("Branch name should not end with dash: %q", name)
	}
}

func TestParseGitPolicy(t *testing.T) {
	tests := []struct {
		input string
		want  GitPolicy
	}{
		{"branch_only", GitPolicyBranchOnly},
		{"BRANCH_ONLY", GitPolicyBranchOnly},
		{" branch_only ", GitPolicyBranchOnly},
		{"branch_commit_pr", GitPolicyBranchCommitPR},
		{"no_write", GitPolicyNoWrite},
		{"", GitPolicyNoWrite},
		{"unknown", GitPolicyNoWrite},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got := ParseGitPolicy(tt.input)
			if got != tt.want {
				t.Errorf("ParseGitPolicy(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestPreflightGitCheck(t *testing.T) {
	tests := []struct {
		name          string
		policy        GitPolicy
		currentBranch string
		baseBranch    string
		allowedPrefix string
		wantErr       bool
	}{
		{
			name:          "no_write always fails",
			policy:        GitPolicyNoWrite,
			currentBranch: "feature/test",
			baseBranch:    "main",
			allowedPrefix: "",
			wantErr:       true,
		},
		{
			name:          "branch_only on feature branch passes",
			policy:        GitPolicyBranchOnly,
			currentBranch: "feature/test",
			baseBranch:    "main",
			allowedPrefix: "",
			wantErr:       false,
		},
		{
			name:          "branch_only on main fails",
			policy:        GitPolicyBranchOnly,
			currentBranch: "main",
			baseBranch:    "main",
			allowedPrefix: "",
			wantErr:       true,
		},
		{
			name:          "branch_commit_pr on main fails",
			policy:        GitPolicyBranchCommitPR,
			currentBranch: "main",
			baseBranch:    "main",
			allowedPrefix: "",
			wantErr:       true,
		},
		{
			name:          "branch_commit_pr on feature branch passes",
			policy:        GitPolicyBranchCommitPR,
			currentBranch: "feature/test",
			baseBranch:    "main",
			allowedPrefix: "",
			wantErr:       false,
		},
		{
			name:          "branch_only with prefix mismatch fails",
			policy:        GitPolicyBranchOnly,
			currentBranch: "wrong/test",
			baseBranch:    "main",
			allowedPrefix: "agent/",
			wantErr:       true,
		},
		{
			name:          "branch_only with prefix match passes",
			policy:        GitPolicyBranchOnly,
			currentBranch: "agent/test",
			baseBranch:    "main",
			allowedPrefix: "agent/",
			wantErr:       false,
		},
		{
			name:          "master is protected even when base is different",
			policy:        GitPolicyBranchOnly,
			currentBranch: "master",
			baseBranch:    "develop",
			allowedPrefix: "",
			wantErr:       true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := PreflightGitCheck(tt.policy, tt.currentBranch, tt.baseBranch, tt.allowedPrefix)
			if (err != nil) != tt.wantErr {
				t.Errorf("PreflightGitCheck(...) error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestPreflightGitCheckNoWritePolicy(t *testing.T) {
	err := PreflightGitCheck(GitPolicyNoWrite, "feature/test", "main", "")
	if err == nil {
		t.Error("expected error for no_write policy")
	}
}