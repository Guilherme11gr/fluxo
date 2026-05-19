package runner

import (
	"fmt"
	"net/url"
	"sort"
	"strings"
	"time"
)

type GitSnapshot struct {
	Branch             string   `json:"branch"`
	BaseBranch         string   `json:"baseBranch"`
	CommitShas         []string `json:"commitShas"`
	NewCommitSHAs      []string `json:"newCommitShas"`
	ChangedFiles       []string `json:"changedFiles"`
	BaselineHeadSHA    string   `json:"baselineHeadSha"`
	FinalHeadSHA       string   `json:"finalHeadSha"`
	HasVerifiableDelta bool     `json:"hasVerifiableDelta"`
	PolicyVerified     bool     `json:"policyVerified"`
	VerificationErrors []string `json:"verificationErrors"`
	PRUrl              *string  `json:"prUrl"`
	PRNumber           *int     `json:"prNumber"`
	Links              GitLinks `json:"links"`
	Mode               string   `json:"mode"`
	CapturedAt         string   `json:"capturedAt"`
}

type GitLinks struct {
	Repository string   `json:"repository,omitempty"`
	Branch     string   `json:"branch,omitempty"`
	Compare    string   `json:"compare,omitempty"`
	Commits    []string `json:"commits,omitempty"`
}

type WorktreeSnapshot struct {
	Files map[string]string
}

func CaptureGitSnapshot(workdir string, prepared GitPreparation) GitSnapshot {
	baselineHeadSHA := ""
	if len(prepared.CommitShas) > 0 {
		baselineHeadSHA = strings.TrimSpace(prepared.CommitShas[0])
	}

	snapshot := GitSnapshot{
		Branch:          prepared.Branch,
		BaseBranch:      normalizeBaseBranch(prepared.BaseBranch),
		CommitShas:      []string{},
		NewCommitSHAs:   []string{},
		ChangedFiles:    []string{},
		BaselineHeadSHA: baselineHeadSHA,
		FinalHeadSHA:    baselineHeadSHA,
		PRUrl:           prepared.PRUrl,
		PRNumber:        prepared.PRNumber,
		Mode:            string(prepared.Mode),
		CapturedAt:      time.Now().UTC().Format(time.RFC3339),
	}

	if strings.TrimSpace(workdir) == "" {
		snapshot.PolicyVerified = prepared.Mode == GitPolicyNoWrite
		return snapshot
	}

	if branch, err := gitCommand(workdir, "rev-parse", "--abbrev-ref", "HEAD"); err == nil && branch != "" {
		snapshot.Branch = branch
	}
	if headSHA, err := gitCommand(workdir, "rev-parse", "HEAD"); err == nil && headSHA != "" {
		snapshot.FinalHeadSHA = strings.TrimSpace(headSHA)
	}

	if snapshot.BaselineHeadSHA != "" {
		if newSHAs, err := CollectNewCommitSHAs(workdir, snapshot.BaselineHeadSHA); err == nil {
			snapshot.NewCommitSHAs = newSHAs
			snapshot.CommitShas = newSHAs
		} else {
			snapshot.VerificationErrors = append(snapshot.VerificationErrors, err.Error())
		}

		if changedFiles, err := CollectChangedFilesSince(workdir, snapshot.BaselineHeadSHA); err == nil {
			snapshot.ChangedFiles = changedFiles
		} else {
			snapshot.VerificationErrors = append(snapshot.VerificationErrors, err.Error())
		}
	}

	snapshot.HasVerifiableDelta =
		snapshot.BaselineHeadSHA != "" &&
			snapshot.FinalHeadSHA != "" &&
			snapshot.BaselineHeadSHA != snapshot.FinalHeadSHA &&
			len(snapshot.NewCommitSHAs) > 0

	snapshot.PolicyVerified =
		prepared.Mode == GitPolicyNoWrite ||
			(snapshot.Branch != "" && !isProtectedBranch(snapshot.Branch, snapshot.BaseBranch))

	if prepared.Mode != GitPolicyNoWrite && snapshot.Branch == "" {
		snapshot.VerificationErrors = append(snapshot.VerificationErrors, "git branch is empty")
	}
	if prepared.Mode != GitPolicyNoWrite && isProtectedBranch(snapshot.Branch, snapshot.BaseBranch) {
		snapshot.VerificationErrors = append(snapshot.VerificationErrors, fmt.Sprintf("git branch %q is protected", snapshot.Branch))
	}

	snapshot.Links = BuildGitLinks(workdir, snapshot)

	return snapshot
}

func BuildGitLinks(workdir string, snapshot GitSnapshot) GitLinks {
	repositoryURL := ResolveGitRepositoryURL(workdir)
	if repositoryURL == "" {
		return GitLinks{}
	}

	links := GitLinks{
		Repository: repositoryURL,
		Commits:    []string{},
	}
	if snapshot.Branch != "" {
		links.Branch = repositoryURL + "/tree/" + url.PathEscape(snapshot.Branch)
	}
	if snapshot.BaselineHeadSHA != "" && snapshot.FinalHeadSHA != "" && snapshot.BaselineHeadSHA != snapshot.FinalHeadSHA {
		links.Compare = repositoryURL + "/compare/" + url.PathEscape(snapshot.BaselineHeadSHA+"..."+snapshot.FinalHeadSHA)
	}
	for _, sha := range snapshot.NewCommitSHAs {
		sha = strings.TrimSpace(sha)
		if sha == "" {
			continue
		}
		links.Commits = append(links.Commits, repositoryURL+"/commit/"+url.PathEscape(sha))
	}
	return links
}

func ResolveGitRepositoryURL(workdir string) string {
	if strings.TrimSpace(workdir) == "" {
		return ""
	}
	remote, err := gitCommand(workdir, "remote", "get-url", "origin")
	if err != nil {
		return ""
	}
	return normalizeGitRemoteURL(remote)
}

func normalizeGitRemoteURL(remote string) string {
	remote = strings.TrimSpace(remote)
	remote = strings.TrimSuffix(remote, ".git")
	if remote == "" {
		return ""
	}

	if strings.HasPrefix(remote, "git@github.com:") {
		path := strings.TrimPrefix(remote, "git@github.com:")
		if path == "" {
			return ""
		}
		return "https://github.com/" + strings.Trim(path, "/")
	}

	if strings.HasPrefix(remote, "ssh://git@github.com/") {
		path := strings.TrimPrefix(remote, "ssh://git@github.com/")
		if path == "" {
			return ""
		}
		return "https://github.com/" + strings.Trim(path, "/")
	}

	parsed, err := url.Parse(remote)
	if err != nil || parsed.Host == "" {
		return ""
	}
	host := strings.TrimPrefix(parsed.Host, "www.")
	if host != "github.com" {
		return ""
	}
	path := strings.Trim(parsed.Path, "/")
	if path == "" {
		return ""
	}
	return "https://github.com/" + path
}

func MergeGitResult(result map[string]interface{}, snapshot GitSnapshot) map[string]interface{} {
	if result == nil {
		return nil
	}

	result["git"] = map[string]interface{}{
		"mode":               defaultGitMode(snapshot.Mode),
		"gitPolicy":          defaultGitMode(snapshot.Mode),
		"baseBranch":         nullableString(snapshot.BaseBranch),
		"branch":             nullableString(snapshot.Branch),
		"commitShas":         snapshot.CommitShas,
		"newCommitShas":      snapshot.NewCommitSHAs,
		"changedFiles":       snapshot.ChangedFiles,
		"baselineHeadSha":    nullableString(snapshot.BaselineHeadSHA),
		"finalHeadSha":       nullableString(snapshot.FinalHeadSHA),
		"hasVerifiableDelta": snapshot.HasVerifiableDelta,
		"policyVerified":     snapshot.PolicyVerified,
		"verificationErrors": snapshot.VerificationErrors,
		"prUrl":              snapshot.PRUrl,
		"prNumber":           snapshot.PRNumber,
		"links":              GitLinksMap(snapshot.Links),
	}

	return result
}

func GitMetadataMap(snapshot GitSnapshot) map[string]interface{} {
	return map[string]interface{}{
		"mode":               defaultGitMode(snapshot.Mode),
		"gitPolicy":          defaultGitMode(snapshot.Mode),
		"baseBranch":         nullableString(snapshot.BaseBranch),
		"branch":             nullableString(snapshot.Branch),
		"commitShas":         snapshot.CommitShas,
		"newCommitShas":      snapshot.NewCommitSHAs,
		"changedFiles":       snapshot.ChangedFiles,
		"baselineHeadSha":    nullableString(snapshot.BaselineHeadSHA),
		"finalHeadSha":       nullableString(snapshot.FinalHeadSHA),
		"hasVerifiableDelta": snapshot.HasVerifiableDelta,
		"policyVerified":     snapshot.PolicyVerified,
		"verificationErrors": snapshot.VerificationErrors,
		"prUrl":              snapshot.PRUrl,
		"prNumber":           snapshot.PRNumber,
		"capturedAt":         snapshot.CapturedAt,
		"links":              GitLinksMap(snapshot.Links),
	}
}

func GitEvidenceMap(snapshot GitSnapshot) map[string]interface{} {
	return map[string]interface{}{
		"workKind":           gitWorkKind(snapshot.Mode),
		"gitPolicy":          defaultGitMode(snapshot.Mode),
		"baseBranch":         nullableString(snapshot.BaseBranch),
		"branch":             nullableString(snapshot.Branch),
		"baselineHeadSha":    nullableString(snapshot.BaselineHeadSHA),
		"finalHeadSha":       nullableString(snapshot.FinalHeadSHA),
		"newCommitShas":      snapshot.NewCommitSHAs,
		"changedFiles":       snapshot.ChangedFiles,
		"hasVerifiableDelta": snapshot.HasVerifiableDelta,
		"policyVerified":     snapshot.PolicyVerified,
		"verificationErrors": snapshot.VerificationErrors,
		"prUrl":              snapshot.PRUrl,
		"prNumber":           snapshot.PRNumber,
		"links":              GitLinksMap(snapshot.Links),
	}
}

func GitLinksMap(links GitLinks) map[string]interface{} {
	result := map[string]interface{}{}
	if strings.TrimSpace(links.Repository) != "" {
		result["repository"] = links.Repository
	}
	if strings.TrimSpace(links.Branch) != "" {
		result["branch"] = links.Branch
	}
	if strings.TrimSpace(links.Compare) != "" {
		result["compare"] = links.Compare
	}
	if len(links.Commits) > 0 {
		result["commits"] = links.Commits
	}
	return result
}

func FormatGitOperationSummary(snapshot GitSnapshot) string {
	var b strings.Builder
	links := snapshot.Links

	hasAnyLink := strings.TrimSpace(links.Repository) != "" ||
		strings.TrimSpace(links.Branch) != "" ||
		strings.TrimSpace(links.Compare) != "" ||
		len(links.Commits) > 0 ||
		(snapshot.PRUrl != nil && strings.TrimSpace(*snapshot.PRUrl) != "")

	if !hasAnyLink && strings.TrimSpace(snapshot.Branch) == "" && len(snapshot.NewCommitSHAs) == 0 {
		return ""
	}

	b.WriteString("### Git\n\n")
	if links.Repository != "" {
		b.WriteString(fmt.Sprintf("- Repository: %s\n", markdownLink(links.Repository, links.Repository)))
	}
	if snapshot.Branch != "" {
		branch := "`" + snapshot.Branch + "`"
		if links.Branch != "" {
			branch = markdownLink(snapshot.Branch, links.Branch)
		}
		b.WriteString(fmt.Sprintf("- Branch: %s\n", branch))
	}
	if links.Compare != "" {
		b.WriteString(fmt.Sprintf("- Compare: %s\n", markdownLink(shortSHA(snapshot.BaselineHeadSHA)+"..."+shortSHA(snapshot.FinalHeadSHA), links.Compare)))
	}
	if len(snapshot.NewCommitSHAs) > 0 {
		b.WriteString("- Commits:\n")
		for i, sha := range snapshot.NewCommitSHAs {
			label := shortSHA(sha)
			if i < len(links.Commits) && links.Commits[i] != "" {
				label = markdownLink(label, links.Commits[i])
			} else {
				label = "`" + label + "`"
			}
			b.WriteString(fmt.Sprintf("  - %s\n", label))
		}
	}
	if snapshot.PRUrl != nil && strings.TrimSpace(*snapshot.PRUrl) != "" {
		label := "PR"
		if snapshot.PRNumber != nil && *snapshot.PRNumber > 0 {
			label = fmt.Sprintf("PR #%d", *snapshot.PRNumber)
		}
		b.WriteString(fmt.Sprintf("- Pull request: %s\n", markdownLink(label, *snapshot.PRUrl)))
	}

	return strings.TrimSpace(b.String())
}

func markdownLink(label, target string) string {
	return fmt.Sprintf("[%s](%s)", label, target)
}

func shortSHA(sha string) string {
	sha = strings.TrimSpace(sha)
	if len(sha) > 8 {
		return sha[:8]
	}
	return sha
}

func gitWorkKind(mode string) string {
	if defaultGitMode(mode) == string(GitPolicyNoWrite) {
		return "no_write"
	}
	return "write"
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
