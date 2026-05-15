package executor

import (
	"bytes"
	"bufio"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"sync"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/config"
)

type Result struct {
	Success   bool
	Output    string
	ExitCode  int
	SessionID string
	TimedOut  bool
	Canceled  bool
}

type StreamEvent struct {
	Seq       int
	Kind      string
	Content   string
	Timestamp time.Time
}

type StreamFunc func(StreamEvent)

type Executor interface {
	Execute(ctx context.Context, prompt, workdir string, timeout time.Duration, stream StreamFunc) Result
	Name() string
}

func runCommand(ctx context.Context, command string, args []string, stdinStr, workdir string, env []string, stream StreamFunc) Result {
	if ctxErr := ctx.Err(); ctxErr != nil {
		return contextResult(ctxErr, "")
	}

	cmd := exec.Command(command, args...)
	cmd.Dir = workdir
	if env != nil {
		cmd.Env = env
	} else {
		cmd.Env = os.Environ()
	}
	cmd.Stdin = strings.NewReader(stdinStr)

	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		return Result{Success: false, Output: err.Error(), ExitCode: 1}
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		return Result{Success: false, Output: err.Error(), ExitCode: 1}
	}

	var stdout, stderr bytes.Buffer
	var seqMu sync.Mutex
	seq := 0
	nextSeq := func() int {
		seqMu.Lock()
		defer seqMu.Unlock()
		seq++
		return seq
	}

	readPipe := func(kind string, reader io.Reader, buffer *bytes.Buffer, wg *sync.WaitGroup) {
		defer wg.Done()
		scanner := bufio.NewScanner(reader)
		buf := make([]byte, 0, 64*1024)
		scanner.Buffer(buf, 1024*1024)
		for scanner.Scan() {
			line := stripANSI(scanner.Text())
			if buffer.Len() > 0 {
				buffer.WriteString("\n")
			}
			buffer.WriteString(line)
			if stream != nil {
				stream(StreamEvent{
					Seq:       nextSeq(),
					Kind:      kind,
					Content:   line,
					Timestamp: time.Now().UTC(),
				})
			}
		}
	}

	if err := cmd.Start(); err != nil {
		return Result{Success: false, Output: err.Error(), ExitCode: 1}
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go readPipe("stdout", stdoutPipe, &stdout, &wg)
	go readPipe("stderr", stderrPipe, &stderr, &wg)

	waitCh := make(chan error, 1)
	go func() {
		waitCh <- cmd.Wait()
	}()

	terminatedByContext := false
	select {
	case err = <-waitCh:
	case <-ctx.Done():
		select {
		case err = <-waitCh:
		default:
			terminatedByContext = true
			if cmd.Process != nil {
				_ = cmd.Process.Kill()
			}
			err = <-waitCh
		}
	}
	wg.Wait()

	output := stripANSI(strings.TrimSpace(stdout.String()))
	errOutput := stripANSI(strings.TrimSpace(stderr.String()))
	combined := combineCommandOutput(output, errOutput)

	if err != nil {
		if terminatedByContext {
			return contextResult(ctx.Err(), combined)
		}

		exitCode := 1
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
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

func (e *ClaudeExecutor) Execute(ctx context.Context, prompt, workdir string, timeout time.Duration, stream StreamFunc) Result {
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
	return runCommand(ctx, "claude", args, prompt, workdir, env, stream)
}

type OpenCodeExecutor struct {
	Config config.AgentConfig
}

func (e *OpenCodeExecutor) Name() string { return "opencode" }

func (e *OpenCodeExecutor) Execute(ctx context.Context, prompt, workdir string, timeout time.Duration, stream StreamFunc) Result {
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

	return runCommand(ctx, "opencode", args, prompt, workdir, env, stream)
}

func stripANSI(s string) string {
	re := regexp.MustCompile("\x1b\\[[0-9;]*[a-zA-Z]")
	return re.ReplaceAllString(s, "")
}

func combineCommandOutput(output, errOutput string) string {
	combined := output
	if errOutput == "" {
		return combined
	}
	if combined != "" {
		combined += "\n"
	}
	combined += errOutput
	return combined
}

func contextResult(ctxErr error, output string) Result {
	switch {
	case errors.Is(ctxErr, context.DeadlineExceeded):
		return Result{
			Success:  false,
			Output:   output,
			ExitCode: 124,
			TimedOut: true,
		}
	case errors.Is(ctxErr, context.Canceled):
		return Result{
			Success:  false,
			Output:   output,
			ExitCode: 130,
			Canceled: true,
		}
	default:
		return Result{
			Success:  false,
			Output:   output,
			ExitCode: 1,
		}
	}
}
