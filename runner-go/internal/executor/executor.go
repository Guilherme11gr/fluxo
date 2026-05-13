package executor

import (
	"bytes"
	"context"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/config"
)

type Result struct {
	Success   bool
	Output    string
	ExitCode  int
	SessionID string
}

type Executor interface {
	Execute(ctx context.Context, prompt, workdir string, timeout time.Duration) Result
	Name() string
}

func runCommand(ctx context.Context, command string, args []string, stdinStr, workdir string, env []string) Result {
	cmd := exec.CommandContext(ctx, command, args...)
	cmd.Dir = workdir
	if env != nil {
		cmd.Env = env
	} else {
		cmd.Env = os.Environ()
	}
	cmd.Stdin = strings.NewReader(stdinStr)

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	err := cmd.Run()

	output := stripANSI(strings.TrimSpace(stdout.String()))
	errOutput := stripANSI(strings.TrimSpace(stderr.String()))

	if err != nil {
		exitCode := 1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		}
		combined := output
		if errOutput != "" {
			if combined != "" {
				combined += "\n"
			}
			combined += errOutput
		}
		return Result{
			Success:  false,
			Output:   combined,
			ExitCode: exitCode,
		}
	}

	return Result{
		Success: true,
		Output:  output,
	}
}

type ClaudeExecutor struct {
	Config config.AgentConfig
}

func (e *ClaudeExecutor) Name() string { return "claude" }

func (e *ClaudeExecutor) Execute(ctx context.Context, prompt, workdir string, timeout time.Duration) Result {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	args := []string{
		"--print", "-",
		"--output-format", "stream-json",
		"--verbose",
		"--dangerously-skip-permissions",
	}
	if e.Config.Model != "" {
		args = append(args, "--model", e.Config.Model)
	}

	env := os.Environ()
	return runCommand(ctx, "claude", args, prompt, workdir, env)
}

type OpenCodeExecutor struct {
	Config config.AgentConfig
}

func (e *OpenCodeExecutor) Name() string { return "opencode" }

func (e *OpenCodeExecutor) Execute(ctx context.Context, prompt, workdir string, timeout time.Duration) Result {
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	args := []string{
		"run",
		"--format", "json",
	}
	if e.Config.Model != "" {
		args = append(args, "--model", e.Config.Model)
	}
	if e.Config.AgentType != "" {
		args = append(args, "--agent", e.Config.AgentType)
	}
	if e.Config.Variant != "" {
		args = append(args, "--variant", e.Config.Variant)
	}

	env := make([]string, len(os.Environ()))
	copy(env, os.Environ())
	env = append(env, "OPENCODE_DISABLE_PROJECT_CONFIG=true")

	return runCommand(ctx, "opencode", args, prompt, workdir, env)
}

func stripANSI(s string) string {
	re := regexp.MustCompile("\x1b\\[[0-9;]*[a-zA-Z]")
	return re.ReplaceAllString(s, "")
}