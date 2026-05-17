package runner

import (
	"fmt"
	"sort"
	"strings"
	"time"
)

type GitSnapshot struct {
	Branch     string   `json:"branch"`
	BaseBranch string   `json:"baseBranch"`
	CommitShas []string `json:"commitShas"`
	PRUrl      *string  `json:"prUrl"`
	PRNumber   *int     `json:"prNumber"`
	Mode       string   `json:"mode"`
	CapturedAt string   `json:"capturedAt"`
}

type WorktreeSnapshot struct {
	Files map[string]string
}

func CaptureGitSnapshot(workdir string, prepared GitPreparation) GitSnapshot {
	snapshot := GitSnapshot{
		Branch:     prepared.Branch,
		BaseBranch: normalizeBaseBranch(prepared.BaseBranch),
		CommitShas: append([]string{}, prepared.CommitShas...),
		PRUrl:      prepared.PRUrl,
		PRNumber:   prepared.PRNumber,
		Mode:       string(prepared.Mode),
		CapturedAt: time.Now().UTC().Format(time.RFC3339),
	}

	if strings.TrimSpace(workdir) == "" {
		return snapshot
	}

	if branch, err := gitCommand(workdir, "rev-parse", "--abbrev-ref", "HEAD"); err == nil && branch != "" {
		snapshot.Branch = branch
	}
	if headSHA, err := gitCommand(workdir, "rev-parse", "HEAD"); err == nil && headSHA != "" {
		snapshot.CommitShas = []string{headSHA}
	}

	if len(prepared.CommitShas) > 0 {
		baseSHA := prepared.CommitShas[0]
		if newSHAs, err := CollectNewCommitSHAs(workdir, baseSHA); err == nil && len(newSHAs) > 0 {
			snapshot.CommitShas = newSHAs
		}
	}

	return snapshot
}

func MergeGitResult(result map[string]interface{}, snapshot GitSnapshot) map[string]interface{} {
	if result == nil {
		return nil
	}

	result["git"] = map[string]interface{}{
		"mode":       defaultGitMode(snapshot.Mode),
		"baseBranch": nullableString(snapshot.BaseBranch),
		"branch":     nullableString(snapshot.Branch),
		"commitShas": snapshot.CommitShas,
		"prUrl":      snapshot.PRUrl,
		"prNumber":   snapshot.PRNumber,
	}

	return result
}

func GitMetadataMap(snapshot GitSnapshot) map[string]interface{} {
	return map[string]interface{}{
		"mode":       defaultGitMode(snapshot.Mode),
		"baseBranch": nullableString(snapshot.BaseBranch),
		"branch":     nullableString(snapshot.Branch),
		"commitShas": snapshot.CommitShas,
		"prUrl":      snapshot.PRUrl,
		"prNumber":   snapshot.PRNumber,
		"capturedAt": snapshot.CapturedAt,
	}
}

func CaptureWorktreeSnapshot(workdir string) WorktreeSnapshot {
	snapshot := WorktreeSnapshot{Files: map[string]string{}}
	if strings.TrimSpace(workdir) == "" {
		return snapshot
	}

	status, err := gitCommand(workdir, "status", "--porcelain")
	if err != nil {
		return snapshot
	}

	for _, line := range strings.Split(status, "\n") {
		line = strings.TrimRight(line, "\r")
		if len(line) < 4 {
			continue
		}

		path := strings.TrimSpace(line[3:])
		if path == "" {
			continue
		}
		if idx := strings.LastIndex(path, " -> "); idx >= 0 {
			path = strings.TrimSpace(path[idx+4:])
		}
		if path == "" {
			continue
		}

		snapshot.Files[path] = line[:2]
	}

	return snapshot
}

func DiffWorktreeFiles(before, after WorktreeSnapshot) []string {
	if len(after.Files) == 0 {
		return []string{}
	}

	files := make([]string, 0, len(after.Files))
	for path, status := range after.Files {
		if beforeStatus, exists := before.Files[path]; exists && beforeStatus == status {
			continue
		}
		files = append(files, path)
	}

	sort.Strings(files)
	return files
}

func defaultGitMode(mode string) string {
	if strings.TrimSpace(mode) == "" {
		return "manual"
	}
	return mode
}

func nullableString(value string) interface{} {
	if strings.TrimSpace(value) == "" {
		return nil
	}
	return value
}

func FormatGitPreparationError(err error, snapshot GitSnapshot) string {
	if err == nil {
		return ""
	}
	return fmt.Sprintf("git preflight failed on branch %q (base %q): %v", snapshot.Branch, snapshot.BaseBranch, err)
}
