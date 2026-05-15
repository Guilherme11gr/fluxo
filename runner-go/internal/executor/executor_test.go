package executor

import (
	"context"
	"fmt"
	"os"
	"testing"
	"time"
)

func TestRunCommandClassifiesTimeout(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()

	result := runCommand(
		ctx,
		os.Args[0],
		[]string{"-test.run=TestExecutorHelperProcess", "--", "sleep"},
		"",
		"",
		append(os.Environ(), "GO_WANT_EXECUTOR_HELPER_PROCESS=1"),
		nil,
	)

	if result.Success {
		t.Fatal("expected timed out execution to fail")
	}
	if !result.TimedOut {
		t.Fatalf("expected TimedOut to be true, got %#v", result)
	}
	if result.Canceled {
		t.Fatalf("expected Canceled to be false, got %#v", result)
	}
	if result.ExitCode != 124 {
		t.Fatalf("expected timeout exit code 124, got %d", result.ExitCode)
	}
}

func TestRunCommandClassifiesCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	time.AfterFunc(50*time.Millisecond, cancel)

	result := runCommand(
		ctx,
		os.Args[0],
		[]string{"-test.run=TestExecutorHelperProcess", "--", "sleep"},
		"",
		"",
		append(os.Environ(), "GO_WANT_EXECUTOR_HELPER_PROCESS=1"),
		nil,
	)

	if result.Success {
		t.Fatal("expected canceled execution to fail")
	}
	if !result.Canceled {
		t.Fatalf("expected Canceled to be true, got %#v", result)
	}
	if result.TimedOut {
		t.Fatalf("expected TimedOut to be false, got %#v", result)
	}
	if result.ExitCode != 130 {
		t.Fatalf("expected cancel exit code 130, got %d", result.ExitCode)
	}
}

func TestRunCommandPreservesProcessExitCode(t *testing.T) {
	result := runCommand(
		context.Background(),
		os.Args[0],
		[]string{"-test.run=TestExecutorHelperProcess", "--", "fail"},
		"",
		"",
		append(os.Environ(), "GO_WANT_EXECUTOR_HELPER_PROCESS=1"),
		nil,
	)

	if result.Success {
		t.Fatal("expected non-zero exit to fail")
	}
	if result.TimedOut || result.Canceled {
		t.Fatalf("expected normal process failure, got %#v", result)
	}
	if result.ExitCode != 7 {
		t.Fatalf("expected process exit code 7, got %d", result.ExitCode)
	}
}

func TestExecutorHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_EXECUTOR_HELPER_PROCESS") != "1" {
		return
	}

	fmt.Fprintln(os.Stdout, "starting helper process")
	switch os.Args[len(os.Args)-1] {
	case "sleep":
		time.Sleep(500 * time.Millisecond)
		os.Exit(0)
	case "fail":
		fmt.Fprintln(os.Stderr, "helper failed")
		os.Exit(7)
	default:
		os.Exit(0)
	}
}
