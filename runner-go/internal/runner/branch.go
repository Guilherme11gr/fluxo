package runner

import (
	"fmt"
	"os/exec"
	"regexp"
	"strings"
)

const defaultBaseBranch = "main"

var safeBranchRe = regexp.MustCompile(`[^a-zA-Z0-9/_\-]`)

type GitPolicy string

const (
	GitPolicyNoWrite       GitPolicy = "no_write"
	GitPolicyBranchOnly    GitPolicy = "branch_only"
	GitPolicyBranchCommitPR GitPolicy = "branch_commit_pr"
)

type GitPreparation struct {
	Mode       GitPolicy
	BaseBranch string
	Branch     string
	PRUrl      *string
	PRNumber   *int
	CommitShas []string
}

func BuildBranchName(taskID, taskType, agentName, allowedPrefix string) string {
	shortID := taskID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}

	agentSlug := safeBranchRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(agentName)), "-")
	agentSlug = strings.Trim(agentSlug, "-")
	if agentSlug == "" {
		agentSlug = "agent"
	}

	typeSlug := strings.ToLower(strings.TrimSpace(taskType))
	if typeSlug == "" {
		typeSlug = "task"
	}

	name := fmt.Sprintf("%s/%s-%s", agentSlug, typeSlug, shortID)
	if allowedPrefix != "" {
		prefix := strings.Trim(strings.TrimSpace(allowedPrefix), "/")
		if prefix != "" {
			name = prefix + "/" + typeSlug + "-" + shortID
		}
	}

	name = safeBranchRe.ReplaceAllString(name, "-")
	name = regexp.MustCompile(`-+`).ReplaceAllString(name, "-")
	name = strings.Trim(name, "-")
	if len(name) > 128 {
		name = strings.TrimRight(name[:128], "-")
	}

	return name
}

func ParseGitPolicy(raw string) GitPolicy {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "branch_only":
		return GitPolicyBranchOnly
	case "branch_commit_pr":
		return GitPolicyBranchCommitPR
	default:
		return GitPolicyNoWrite
	}
}

func PrepareGitBranch(workdir string, policy GitPolicy, desiredBranch, baseBranch, allowedPrefix string) (GitPreparation, error) {
	prep := GitPreparation{
		Mode:       policy,
		BaseBranch: normalizeBaseBranch(baseBranch),
		Branch:     strings.TrimSpace(desiredBranch),
		CommitShas: []string{},
	}

	if policy == GitPolicyNoWrite {
		prep.Branch = ""
		return prep, nil
	}

	if strings.TrimSpace(workdir) == "" {
		return prep, nil
	}

	currentBranch, err := gitCommand(workdir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return prep, err
	}

	if currentBranch == prep.BaseBranch || currentBranch == "main" || currentBranch == "master" {
		if strings.TrimSpace(desiredBranch) == "" {
			return prep, fmt.Errorf("git policy %s requires a non-default branch", policy)
		}
		if _, err := gitCommand(workdir, "checkout", "-B", desiredBranch); err != nil {
			return prep, fmt.Errorf("create/switch branch %q: %w", desiredBranch, err)
		}
		currentBranch = desiredBranch
	}

	if err := validatePreparedBranch(policy, currentBranch, prep.BaseBranch, allowedPrefix); err != nil {
		return prep, err
	}

	headSHA, err := gitCommand(workdir, "rev-parse", "HEAD")
	if err == nil && headSHA != "" {
		prep.CommitShas = []string{headSHA}
	}
	prep.Branch = currentBranch

	return prep, nil
}

func normalizeBaseBranch(baseBranch string) string {
	if strings.TrimSpace(baseBranch) == "" {
		return defaultBaseBranch
	}
	return strings.TrimSpace(baseBranch)
}

func validatePreparedBranch(policy GitPolicy, currentBranch, baseBranch, allowedPrefix string) error {
	if policy == GitPolicyNoWrite {
		return nil
	}

	if currentBranch == normalizeBaseBranch(baseBranch) || currentBranch == "main" || currentBranch == "master" {
		return fmt.Errorf("git policy %s: cannot operate on protected branch %q", policy, currentBranch)
	}

	if allowedPrefix != "" {
		prefix := strings.Trim(strings.TrimSpace(allowedPrefix), "/") + "/"
		if !strings.HasPrefix(currentBranch, prefix) {
			return fmt.Errorf("git policy %s: branch %q does not match allowed prefix %q", policy, currentBranch, allowedPrefix)
		}
	}

	return nil
}

func gitCommand(workdir string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", workdir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}
