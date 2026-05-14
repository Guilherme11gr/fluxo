package runner

import (
	"fmt"
	"regexp"
	"strings"
)

const defaultBaseBranch = "main"

var safeBranchRe = regexp.MustCompile(`[^a-zA-Z0-9/_\-]`)

type GitPolicy string

const (
	GitPolicyNoWrite     GitPolicy = "no_write"
	GitPolicyBranchOnly  GitPolicy = "branch_only"
	GitPolicyBranchCommitPR GitPolicy = "branch_commit_pr"
)

type BranchInfo struct {
	Name       string
	BaseBranch string
	Policy     GitPolicy
}

func BuildBranchName(taskID, taskType, agentName, allowedPrefix string) string {
	shortID := taskID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}

	slug := safeBranchRe.ReplaceAllString(strings.ToLower(agentName), "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		slug = "agent"
	}

	typeSlug := strings.ToLower(taskType)
	if typeSlug == "" {
		typeSlug = "task"
	}

	name := fmt.Sprintf("%s/%s-%s", slug, typeSlug, shortID)

	if allowedPrefix != "" {
		prefix := strings.TrimSuffix(allowedPrefix, "/")
		name = prefix + "/" + name
		if strings.HasPrefix(name, prefix+"/"+slug+"/") {
			name = prefix + "/" + typeSlug + "-" + shortID
		}
	}

	name = safeBranchRe.ReplaceAllString(name, "-")
	name = strings.ReplaceAll(name, "--", "-")
	name = strings.Trim(name, "-")

	if len(name) > 128 {
		name = name[:128]
		name = strings.TrimRight(name, "-")
	}

	return name
}

func PreflightGitCheck(policy GitPolicy, currentBranch, baseBranch, allowedPrefix string) error {
	if policy == GitPolicyNoWrite {
		return fmt.Errorf("git policy is no_write: direct writes are not allowed")
	}

	effectiveBase := baseBranch
	if effectiveBase == "" {
		effectiveBase = defaultBaseBranch
	}

	if policy == GitPolicyBranchOnly || policy == GitPolicyBranchCommitPR {
		if currentBranch == effectiveBase {
			return fmt.Errorf("git policy %s: cannot operate on protected branch %q", policy, effectiveBase)
		}
		if currentBranch == "master" || currentBranch == "main" {
			return fmt.Errorf("git policy %s: cannot operate on default branch %q", policy, currentBranch)
		}
	}

	if allowedPrefix != "" && policy != GitPolicyNoWrite {
		prefix := strings.TrimSuffix(allowedPrefix, "/") + "/"
		if !strings.HasPrefix(currentBranch, prefix) {
			return fmt.Errorf("git policy %s: branch %q does not match allowed prefix %q", policy, currentBranch, allowedPrefix)
		}
	}

	return nil
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