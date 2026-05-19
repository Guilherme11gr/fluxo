package runner

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

const defaultBaseBranch = "main"

var safeBranchRe = regexp.MustCompile(`[^a-zA-Z0-9/_\-]`)
var safeBranchSegmentRe = regexp.MustCompile(`[^a-zA-Z0-9_\-]`)

type GitPolicy string

const (
	GitPolicyNoWrite        GitPolicy = "no_write"
	GitPolicyBranchOnly     GitPolicy = "branch_only"
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

type PreflightResult struct {
	OK            bool
	CurrentBranch string
	BaseBranch    string
	IsProtected   bool
	IsDirty       bool
	ErrorMessage  string
}

func BuildBranchName(taskID, taskType, agentName, allowedPrefix string) string {
	return BuildBranchNameWithExecID(taskID, taskType, agentName, allowedPrefix, "")
}

func BuildBranchNameWithExecID(taskID, taskType, agentName, allowedPrefix, execID string) string {
	shortID := taskID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}

	shortExecID := ""
	if execID != "" {
		shortExecID = execID
		if len(shortExecID) > 8 {
			shortExecID = shortExecID[:8]
		}
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

	var name string
	if shortExecID != "" {
		name = fmt.Sprintf("%s/%s-%s-%s", agentSlug, typeSlug, shortID, shortExecID)
	} else {
		name = fmt.Sprintf("%s/%s-%s", agentSlug, typeSlug, shortID)
	}
	if allowedPrefix != "" {
		prefix := strings.Trim(strings.TrimSpace(allowedPrefix), "/")
		if prefix != "" {
			if shortExecID != "" {
				name = prefix + "/" + typeSlug + "-" + shortID + "-" + shortExecID
			} else {
				name = prefix + "/" + typeSlug + "-" + shortID
			}
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

func BuildTaskBranchName(taskID, taskType, agentName, allowedPrefix string, localID int, projectKey, taskTitle string) string {
	if localID <= 0 {
		return BuildBranchName(taskID, taskType, agentName, allowedPrefix)
	}

	agentSlug := branchSegment(agentName, "agent")
	typeSlug := branchSegment(taskType, "task")
	projectSlug := branchSegment(projectKey, "")

	readableID := strconv.Itoa(localID)
	if projectSlug != "" {
		readableID = projectSlug + "-" + readableID
	}

	titleSlug := branchSegment(taskTitle, "")
	if len(titleSlug) > 56 {
		titleSlug = strings.Trim(titleSlug[:56], "-")
	}

	leaf := typeSlug + "-" + readableID
	if titleSlug != "" {
		leaf += "-" + titleSlug
	}

	prefix := strings.Trim(strings.TrimSpace(allowedPrefix), "/")
	var name string
	if prefix != "" {
		name = prefix + "/" + agentSlug + "/" + leaf
	} else {
		name = agentSlug + "/" + leaf
	}

	return normalizeBranchName(name)
}

func branchSegment(value, fallback string) string {
	slug := safeBranchSegmentRe.ReplaceAllString(strings.ToLower(strings.TrimSpace(value)), "-")
	slug = regexp.MustCompile(`-+`).ReplaceAllString(slug, "-")
	slug = strings.Trim(slug, "-")
	if slug == "" {
		return fallback
	}
	return slug
}

func normalizeBranchName(name string) string {
	name = safeBranchRe.ReplaceAllString(name, "-")
	name = regexp.MustCompile(`-+`).ReplaceAllString(name, "-")
	name = regexp.MustCompile(`/+`).ReplaceAllString(name, "/")
	name = strings.Trim(name, "-/")
	if len(name) > 128 {
		name = strings.TrimRight(name[:128], "-/")
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

func runnerStateRootForRepo(baseRepoPath string) string {
	trimmed := strings.TrimSpace(baseRepoPath)
	cacheDir, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(cacheDir) == "" {
		cacheDir = os.TempDir()
	}
	hash := sha256.Sum256([]byte(trimmed))
	return filepath.Join(cacheDir, "fluxo-runner", hex.EncodeToString(hash[:8]))
}

func WorktreesRootForRepo(baseRepoPath string) string {
	return filepath.Join(runnerStateRootForRepo(baseRepoPath), "worktrees")
}

func ProvisionCacheRootForRepo(baseRepoPath string) string {
	return filepath.Join(runnerStateRootForRepo(baseRepoPath), "provision")
}

func CreateExecutionWorktree(baseRepoPath, worktreesRoot, executionID, baseBranch string) (string, error) {
	baseRepoPath = strings.TrimSpace(baseRepoPath)
	worktreesRoot = strings.TrimSpace(worktreesRoot)
	executionID = strings.TrimSpace(executionID)
	baseBranch = normalizeBaseBranch(baseBranch)

	if baseRepoPath == "" {
		return "", fmt.Errorf("create worktree: base repo path is required")
	}
	if worktreesRoot == "" {
		return "", fmt.Errorf("create worktree: worktrees root is required")
	}
	if executionID == "" {
		return "", fmt.Errorf("create worktree: execution ID is required")
	}
	if err := os.MkdirAll(worktreesRoot, 0o755); err != nil {
		return "", fmt.Errorf("create worktree root: %w", err)
	}

	worktreePath := filepath.Join(worktreesRoot, executionID)
	_ = os.RemoveAll(worktreePath)
	if _, err := gitCommand(baseRepoPath, "worktree", "add", "--detach", worktreePath, baseBranch); err != nil {
		return "", fmt.Errorf("create worktree %q from %q: %w", worktreePath, baseBranch, err)
	}

	return worktreePath, nil
}

func SwitchToTaskBranch(worktreePath, branch, baseBranch, allowedPrefix string) error {
	return SwitchToTaskBranchFromRemote(worktreePath, branch, baseBranch, allowedPrefix, "")
}

func SwitchToTaskBranchFromRemote(worktreePath, branch, baseBranch, allowedPrefix, baseRepoPath string) error {
	if strings.TrimSpace(worktreePath) == "" {
		return fmt.Errorf("switch branch: worktree path is required")
	}
	branch = strings.TrimSpace(branch)
	if branch == "" {
		return fmt.Errorf("switch branch: branch is required")
	}
	if err := validatePreparedBranch(GitPolicyBranchOnly, branch, baseBranch, allowedPrefix); err != nil {
		return err
	}

	baseBranch = normalizeBaseBranch(baseBranch)

	if baseRepoPath != "" {
		remoteExists, _ := RemoteBranchExists(baseRepoPath, branch)
		if remoteExists {
			if _, err := gitCommand(worktreePath, "fetch", "origin", branch); err != nil {
				return fmt.Errorf("fetch remote branch %q: %w", branch, err)
			}
			if _, err := gitCommand(worktreePath, "checkout", "-B", branch, "origin/"+branch); err != nil {
				return fmt.Errorf("checkout branch %q from origin/%s: %w", branch, branch, err)
			}
			return nil
		}
	}

	if _, err := gitCommand(worktreePath, "fetch", "origin", baseBranch); err != nil {
		return fmt.Errorf("fetch base branch %q: %w", baseBranch, err)
	}
	if _, err := gitCommand(worktreePath, "checkout", "-B", branch, "origin/"+baseBranch); err != nil {
		return fmt.Errorf("checkout branch %q from origin/%s: %w", branch, baseBranch, err)
	}

	return nil
}

func RemoteBranchExists(repoPath, branch string) (bool, error) {
	repoPath = strings.TrimSpace(repoPath)
	branch = strings.TrimSpace(branch)
	if repoPath == "" || branch == "" {
		return false, fmt.Errorf("remote branch check: repo path and branch are required")
	}

	output, err := gitCommand(repoPath, "ls-remote", "--heads", "origin", branch)
	if err != nil {
		return false, err
	}

	lines := strings.Split(strings.TrimSpace(output), "\n")
	for _, line := range lines {
		fields := strings.Fields(line)
		if len(fields) >= 2 && strings.HasSuffix(fields[1], "refs/heads/"+branch) {
			return true, nil
		}
	}
	return false, nil
}

func ResolveCanonicalBranch(featureID, taskID, taskType, agentName, allowedPrefix string) string {
	idToUse := featureID
	if strings.TrimSpace(idToUse) == "" {
		idToUse = taskID
	}
	return BuildBranchName(idToUse, taskType, agentName, allowedPrefix)
}

func ResolveTaskBranch(taskID, taskType, agentName, allowedPrefix string, localID int, projectKey, taskTitle string) string {
	return BuildTaskBranchName(taskID, taskType, agentName, allowedPrefix, localID, projectKey, taskTitle)
}

func RemoveExecutionWorktree(baseRepoPath, worktreePath, branch string) error {
	baseRepoPath = strings.TrimSpace(baseRepoPath)
	worktreePath = strings.TrimSpace(worktreePath)
	branch = strings.TrimSpace(branch)

	if baseRepoPath == "" || worktreePath == "" {
		return nil
	}

	status, err := gitCommand(worktreePath, "status", "--porcelain")
	if err != nil {
		return fmt.Errorf("remove worktree: status check failed: %w", err)
	}
	if strings.TrimSpace(status) != "" {
		return fmt.Errorf("remove worktree: worktree %q is dirty", worktreePath)
	}

	if branch != "" {
		localSHA, err := gitCommand(worktreePath, "rev-parse", "HEAD")
		if err != nil {
			return fmt.Errorf("remove worktree: read local HEAD failed: %w", err)
		}
		remoteOutput, err := gitCommand(baseRepoPath, "ls-remote", "origin", "refs/heads/"+branch)
		if err != nil {
			return fmt.Errorf("remove worktree: ls-remote failed: %w", err)
		}
		remoteFields := strings.Fields(remoteOutput)
		if len(remoteFields) == 0 {
			return fmt.Errorf("remove worktree: remote branch %q not found", branch)
		}
		if strings.TrimSpace(localSHA) != strings.TrimSpace(remoteFields[0]) {
			return fmt.Errorf("remove worktree: local SHA %q does not match remote SHA %q", localSHA, remoteFields[0])
		}
	}

	if _, err := gitCommand(baseRepoPath, "worktree", "remove", worktreePath); err != nil {
		return fmt.Errorf("remove worktree: %w", err)
	}
	if _, err := gitCommand(baseRepoPath, "worktree", "prune"); err != nil {
		return fmt.Errorf("prune worktrees: %w", err)
	}

	return nil
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

func PreflightGitCheck(workdir string, policy GitPolicy, baseBranch, allowedPrefix string) PreflightResult {
	result := PreflightResult{
		BaseBranch: normalizeBaseBranch(baseBranch),
	}

	if policy == GitPolicyNoWrite {
		result.OK = true
		return result
	}

	if strings.TrimSpace(workdir) == "" {
		result.OK = true
		return result
	}

	currentBranch, err := gitCommand(workdir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("cannot determine current branch: %v", err)
		return result
	}
	result.CurrentBranch = currentBranch

	if isProtectedBranch(currentBranch, result.BaseBranch) {
		result.IsProtected = true
		result.ErrorMessage = fmt.Sprintf("git policy %s: current branch %q is protected", policy, currentBranch)
		return result
	}

	if allowedPrefix != "" {
		prefix := strings.Trim(strings.TrimSpace(allowedPrefix), "/") + "/"
		if !strings.HasPrefix(currentBranch, prefix) {
			result.ErrorMessage = fmt.Sprintf("git policy %s: branch %q does not match allowed prefix %q", policy, currentBranch, allowedPrefix)
			return result
		}
	}

	status, err := gitCommand(workdir, "status", "--porcelain")
	if err != nil {
		result.ErrorMessage = fmt.Sprintf("cannot check working tree status: %v", err)
		return result
	}
	result.IsDirty = strings.TrimSpace(status) != ""

	result.OK = true
	return result
}

func isProtectedBranch(branch, baseBranch string) bool {
	normalized := normalizeBaseBranch(baseBranch)
	return branch == normalized || branch == "main" || branch == "master"
}

func CommitChanges(workdir, branchName, taskID, taskTitle string) (string, error) {
	if strings.TrimSpace(workdir) == "" {
		return "", nil
	}

	currentBranch, err := gitCommand(workdir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return "", fmt.Errorf("commit: cannot determine branch: %w", err)
	}
	if isProtectedBranch(currentBranch, defaultBaseBranch) {
		return "", fmt.Errorf("commit: refusing to commit on protected branch %q", currentBranch)
	}

	status, err := gitCommand(workdir, "status", "--porcelain")
	if err != nil {
		return "", fmt.Errorf("commit: cannot check status: %w", err)
	}
	if strings.TrimSpace(status) == "" {
		return "", nil
	}

	if _, err := gitCommand(workdir, "add", "-A"); err != nil {
		return "", fmt.Errorf("commit: git add failed: %w", err)
	}

	shortID := taskID
	if len(shortID) > 8 {
		shortID = shortID[:8]
	}
	titleLine := taskTitle
	if len(titleLine) > 72 {
		titleLine = titleLine[:72]
	}
	commitMsg := fmt.Sprintf("[%s] %s\n\nTask: %s", shortID, titleLine, taskID)

	output, err := gitCommand(workdir, "commit", "-m", commitMsg)
	if err != nil {
		return "", fmt.Errorf("commit: git commit failed: %w", err)
	}

	headSHA, err := gitCommand(workdir, "rev-parse", "HEAD")
	if err != nil {
		return "", fmt.Errorf("commit: cannot read HEAD after commit: %w", err)
	}

	_ = output
	return headSHA, nil
}

func CollectNewCommitSHAs(workdir, baseSHA string) ([]string, error) {
	if strings.TrimSpace(workdir) == "" || strings.TrimSpace(baseSHA) == "" {
		return []string{}, nil
	}

	currentBranch, err := gitCommand(workdir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("collect commits: cannot determine branch: %w", err)
	}
	if isProtectedBranch(currentBranch, defaultBaseBranch) {
		return []string{}, nil
	}

	log, err := gitCommand(workdir, "log", "--format=%H", baseSHA+"..HEAD")
	if err != nil {
		return nil, fmt.Errorf("collect commits: git log failed: %w", err)
	}

	lines := strings.Split(strings.TrimSpace(log), "\n")
	var shas []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			shas = append(shas, line)
		}
	}
	if len(shas) == 0 {
		return []string{}, nil
	}
	return shas, nil
}

func CollectChangedFilesSince(workdir, baseSHA string) ([]string, error) {
	if strings.TrimSpace(workdir) == "" || strings.TrimSpace(baseSHA) == "" {
		return []string{}, nil
	}

	output, err := gitCommand(workdir, "diff", "--name-only", baseSHA+"..HEAD")
	if err != nil {
		return nil, fmt.Errorf("collect changed files: git diff failed: %w", err)
	}

	files := []string{}
	seen := map[string]struct{}{}
	for _, line := range strings.Split(strings.TrimSpace(output), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if _, ok := seen[line]; ok {
			continue
		}
		seen[line] = struct{}{}
		files = append(files, line)
	}

	return files, nil
}

func PushBranch(workdir, branch string) error {
	if strings.TrimSpace(workdir) == "" || strings.TrimSpace(branch) == "" {
		return nil
	}
	if isProtectedBranch(branch, defaultBaseBranch) {
		return fmt.Errorf("push: refusing to push protected branch %q", branch)
	}
	_, err := gitCommand(workdir, "push", "-u", "origin", branch)
	if err != nil {
		return fmt.Errorf("push: git push origin %s failed: %w", branch, err)
	}
	return nil
}

type CreatePROptions struct {
	BaseBranch string
	Title      string
	Body       string
	Draft      bool
}

type CreatePRResult struct {
	URL    string
	Number int
}

func CreatePullRequest(workdir string, opts CreatePROptions) (*CreatePRResult, error) {
	if strings.TrimSpace(workdir) == "" {
		return nil, nil
	}

	currentBranch, err := gitCommand(workdir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		return nil, fmt.Errorf("create pr: cannot determine branch: %w", err)
	}
	if isProtectedBranch(currentBranch, defaultBaseBranch) {
		return nil, fmt.Errorf("create pr: refusing on protected branch %q", currentBranch)
	}

	baseBranch := opts.BaseBranch
	if strings.TrimSpace(baseBranch) == "" {
		baseBranch = defaultBaseBranch
	}

	args := []string{"pr", "create", "--base", baseBranch, "--head", currentBranch}
	if opts.Draft {
		args = append(args, "--draft")
	}
	title := opts.Title
	if strings.TrimSpace(title) == "" {
		title = currentBranch
	}
	args = append(args, "--title", title)
	if strings.TrimSpace(opts.Body) != "" {
		args = append(args, "--body", opts.Body)
	}

	output, err := ghCommand(workdir, args...)
	if err != nil {
		return nil, fmt.Errorf("create pr: gh pr create failed: %w", err)
	}

	url, number := parseGHPROutput(output)
	if url == "" {
		return nil, nil
	}
	return &CreatePRResult{URL: url, Number: number}, nil
}

func parseGHPROutput(output string) (string, int) {
	lines := strings.Split(strings.TrimSpace(output), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "http://") || strings.HasPrefix(line, "https://") {
			number := extractPRNumberFromURL(line)
			return line, number
		}
	}
	return "", 0
}

func extractPRNumberFromURL(url string) int {
	trimmed := strings.TrimRight(url, "/")
	parts := strings.Split(trimmed, "/")
	if len(parts) >= 1 {
		last := parts[len(parts)-1]
		var num int
		for _, ch := range last {
			if ch >= '0' && ch <= '9' {
				num = num*10 + int(ch-'0')
			} else {
				break
			}
		}
		return num
	}
	return 0
}

func ghCommand(workdir string, args ...string) (string, error) {
	cmd := exec.Command("gh", append([]string{"-C", workdir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("gh %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

func gitCommand(workdir string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", workdir}, args...)...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return "", fmt.Errorf("git %s failed: %s", strings.Join(args, " "), strings.TrimSpace(string(out)))
	}
	return strings.TrimSpace(string(out)), nil
}

type GitWorkflowResult struct {
	Preparation GitPreparation
	Preflight   PreflightResult
	Snapshot    GitSnapshot
	BranchName  string
	CommitShas  []string
	PRUrl       *string
	PRNumber    *int
	PreflightOK bool
	Error       error
}

func ResolveGitPolicy(policyStr string, defaultPolicy GitPolicy) GitPolicy {
	parsed := ParseGitPolicy(policyStr)
	if parsed != GitPolicyNoWrite {
		return parsed
	}
	if strings.TrimSpace(policyStr) == "" {
		return defaultPolicy
	}
	return GitPolicyNoWrite
}

func PolicyRequiresBranch(policy GitPolicy) bool {
	return policy == GitPolicyBranchOnly || policy == GitPolicyBranchCommitPR
}

func PolicyRequiresCommit(policy GitPolicy) bool {
	return policy == GitPolicyBranchOnly || policy == GitPolicyBranchCommitPR
}

func PolicyRequiresPush(policy GitPolicy) bool {
	return policy == GitPolicyBranchOnly || policy == GitPolicyBranchCommitPR
}

func PolicyRequiresPR(policy GitPolicy) bool {
	return policy == GitPolicyBranchCommitPR
}

func ExecuteGitWorkflow(cfg GitWorkflowConfig) GitWorkflowResult {
	result := GitWorkflowResult{
		CommitShas: []string{},
	}

	if cfg.Policy == GitPolicyNoWrite {
		result.PreflightOK = true
		result.Preparation = GitPreparation{
			Mode:       GitPolicyNoWrite,
			BaseBranch: normalizeBaseBranch(cfg.BaseBranch),
			CommitShas: []string{},
		}
		snapshot := CaptureGitSnapshot(cfg.Workdir, result.Preparation)
		result.Snapshot = snapshot
		return result
	}

	if strings.TrimSpace(cfg.Workdir) == "" {
		result.PreflightOK = true
		result.Preparation = GitPreparation{
			Mode:       cfg.Policy,
			BaseBranch: normalizeBaseBranch(cfg.BaseBranch),
			CommitShas: []string{},
		}
		snapshot := CaptureGitSnapshot(cfg.Workdir, result.Preparation)
		result.Snapshot = snapshot
		return result
	}

	branchName := BuildBranchNameWithExecID(cfg.TaskID, cfg.TaskType, cfg.AgentName, cfg.AllowedPrefix, cfg.ExecID)
	result.BranchName = branchName

	currentBranch, err := gitCommand(cfg.Workdir, "rev-parse", "--abbrev-ref", "HEAD")
	if err != nil {
		result.PreflightOK = false
		result.Error = fmt.Errorf("cannot determine current branch: %w", err)
		result.Preparation = GitPreparation{
			Mode:       cfg.Policy,
			BaseBranch: normalizeBaseBranch(cfg.BaseBranch),
			CommitShas: []string{},
		}
		result.Preflight = PreflightResult{
			OK:            false,
			BaseBranch:    normalizeBaseBranch(cfg.BaseBranch),
			CurrentBranch: currentBranch,
			ErrorMessage:  fmt.Sprintf("cannot determine current branch: %v", err),
		}
		snapshot := CaptureGitSnapshot(cfg.Workdir, result.Preparation)
		result.Snapshot = snapshot
		return result
	}

	normalizedBase := normalizeBaseBranch(cfg.BaseBranch)

	if isProtectedBranch(currentBranch, normalizedBase) {
		preflightResult := PreflightResult{
			OK:            false,
			CurrentBranch: currentBranch,
			BaseBranch:    normalizedBase,
			IsProtected:   true,
			ErrorMessage:  fmt.Sprintf("on protected branch %q, will create feature branch", currentBranch),
		}
		result.Preflight = preflightResult

		prep, prepareErr := PrepareGitBranch(cfg.Workdir, cfg.Policy, branchName, cfg.BaseBranch, cfg.AllowedPrefix)
		if prepareErr != nil {
			result.PreflightOK = false
			result.Error = fmt.Errorf("prepare branch from protected: %w", prepareErr)
			snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
			result.Snapshot = snapshot
			result.Preparation = prep
			return result
		}

		result.PreflightOK = true
		result.Preparation = prep
		snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
		result.Snapshot = snapshot
		return result
	}

	preflightResult := PreflightGitCheck(cfg.Workdir, cfg.Policy, cfg.BaseBranch, cfg.AllowedPrefix)
	result.Preflight = preflightResult

	if !preflightResult.OK {
		result.PreflightOK = false
		result.Error = fmt.Errorf("preflight failed: %s", preflightResult.ErrorMessage)
		result.Preparation = GitPreparation{
			Mode:       cfg.Policy,
			BaseBranch: normalizeBaseBranch(cfg.BaseBranch),
			CommitShas: []string{},
		}
		snapshot := CaptureGitSnapshot(cfg.Workdir, result.Preparation)
		result.Snapshot = snapshot
		return result
	}

	result.PreflightOK = true

	prep, err := PrepareGitBranch(cfg.Workdir, cfg.Policy, branchName, cfg.BaseBranch, cfg.AllowedPrefix)
	if err != nil {
		result.Error = fmt.Errorf("prepare branch failed: %w", err)
		snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
		result.Snapshot = snapshot
		result.Preparation = prep
		return result
	}
	result.Preparation = prep
	snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
	result.Snapshot = snapshot

	return result
}

func FinalizeGitWorkflow(cfg GitWorkflowConfig, prep GitPreparation) GitWorkflowResult {
	result := GitWorkflowResult{
		Preparation: prep,
		PreflightOK: true,
		BranchName:  prep.Branch,
		CommitShas:  []string{},
	}

	if !PolicyRequiresCommit(cfg.Policy) || strings.TrimSpace(cfg.Workdir) == "" {
		snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
		result.Snapshot = snapshot
		return result
	}

	headSHA, err := CommitChanges(cfg.Workdir, prep.Branch, cfg.TaskID, cfg.TaskTitle)
	if err != nil {
		result.Error = fmt.Errorf("commit failed: %w", err)
		snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
		result.Snapshot = snapshot
		return result
	}

	if headSHA != "" {
		result.CommitShas = append(result.CommitShas, headSHA)
	} else {
		result.Error = fmt.Errorf("commit produced no changes")
		snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
		result.Snapshot = snapshot
		return result
	}

	if len(prep.CommitShas) > 0 {
		newSHAs, err := CollectNewCommitSHAs(cfg.Workdir, prep.CommitShas[0])
		if err == nil && len(newSHAs) > 0 {
			result.CommitShas = newSHAs
		}
	}

	if PolicyRequiresPush(cfg.Policy) || cfg.PushAfterCommit {
		if err := PushBranch(cfg.Workdir, prep.Branch); err != nil {
			result.Error = fmt.Errorf("push failed: %w", err)
			snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
			result.Snapshot = snapshot
			return result
		}
	}

	if PolicyRequiresPR(cfg.Policy) || cfg.CreatePR {
		prResult, err := CreatePullRequest(cfg.Workdir, CreatePROptions{
			BaseBranch: prep.BaseBranch,
			Title:      fmt.Sprintf("[%s] %s", cfg.TaskID[:min(8, len(cfg.TaskID))], cfg.TaskTitle),
			Body:       fmt.Sprintf("Task: %s\nAgent: %s", cfg.TaskID, cfg.AgentName),
			Draft:      cfg.PRDraft,
		})
		if err != nil {
			result.Error = fmt.Errorf("create PR failed: %w", err)
			snapshot := CaptureGitSnapshot(cfg.Workdir, prep)
			result.Snapshot = snapshot
			return result
		}
		if prResult != nil {
			result.PRUrl = &prResult.URL
			result.PRNumber = &prResult.Number
		}
	}

	var prURLPtr *string
	var prNumPtr *int
	if result.PRUrl != nil {
		prURLPtr = result.PRUrl
	}
	if result.PRNumber != nil {
		prNumPtr = result.PRNumber
	}

	finalPrep := prep
	finalPrep.PRUrl = prURLPtr
	finalPrep.PRNumber = prNumPtr
	if len(result.CommitShas) > 0 {
		finalPrep.CommitShas = result.CommitShas
	}
	result.Preparation = finalPrep

	snapshot := CaptureGitSnapshot(cfg.Workdir, finalPrep)
	result.Snapshot = snapshot

	return result
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
