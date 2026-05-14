package runner

import (
	"fmt"
	"os/exec"
	"strings"
	"time"
)

type GitSnapshot struct {
	Branch     string    `json:"branch"`
	BaseBranch string    `json:"baseBranch"`
	CommitShas []string  `json:"commitShas"`
	PRUrl     *string   `json:"prUrl"`
	PRNumber  *int      `json:"prNumber"`
	Mode      string    `json:"mode"`
	CapturedAt string   `json:"capturedAt"`
}

func CaptureGitSnapshot(workdir string) GitSnapshot {
	snap := GitSnapshot{
		Mode:       "manual",
		CommitShas: []string{},
		CapturedAt: time.Now().UTC().Format(time.RFC3339),
	}

	snap.Branch = gitCurrentBranch(workdir)
	snap.BaseBranch = gitDefaultBranch(workdir)
	snap.CommitShas = gitRecentCommits(workdir, 10)

	return snap
}

func GitCurrentBranch(workdir string) string {
	return gitCurrentBranch(workdir)
}

func gitCurrentBranch(workdir string) string {
	out, err := exec.Command("git", "-C", workdir, "rev-parse", "--abbrev-ref", "HEAD").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func gitDefaultBranch(workdir string) string {
	out, err := exec.Command("git", "-C", workdir, "symbolic-ref", "--short", "refs/remotes/origin/HEAD").Output()
	if err != nil {
		out, err = exec.Command("git", "-C", workdir, "config", "init.defaultBranch").Output()
		if err != nil {
			return defaultBaseBranch
		}
	}
	ref := strings.TrimSpace(string(out))
	ref = strings.TrimPrefix(ref, "origin/")
	if ref == "" {
		return defaultBaseBranch
	}
	return ref
}

func gitRecentCommits(workdir string, limit int) []string {
	out, err := exec.Command("git", "-C", workdir, "log", fmt.Sprintf("--max-count=%d", limit), "--format=%H").Output()
	if err != nil {
		return []string{}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	var shas []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			shas = append(shas, line)
		}
	}
	if len(shas) == 0 {
		return []string{}
	}
	return shas
}