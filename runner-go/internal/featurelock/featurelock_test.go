package featurelock

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"testing"
	"time"
)

func TestAcquireAndReleaseLock(t *testing.T) {
	repoPath := t.TempDir()
	featureID := "feature-abc123"
	executionID := "exec-001"
	agentName := "builder"

	lock, err := AcquireLock(repoPath, featureID, executionID, agentName)
	if err != nil {
		t.Fatalf("AcquireLock failed: %v", err)
	}
	if lock == nil {
		t.Fatal("expected non-nil lock")
	}

	info := lock.Info()
	if info.FeatureID != featureID {
		t.Fatalf("expected featureId=%q, got %q", featureID, info.FeatureID)
	}
	if info.ExecutionID != executionID {
		t.Fatalf("expected executionId=%q, got %q", executionID, info.ExecutionID)
	}
	if info.AgentName != agentName {
		t.Fatalf("expected agentName=%q, got %q", agentName, info.AgentName)
	}

	if !IsLocked(repoPath, featureID) {
		t.Fatal("expected IsLocked=true after acquire")
	}

	if err := lock.Release(); err != nil {
		t.Fatalf("Release failed: %v", err)
	}

	if IsLocked(repoPath, featureID) {
		t.Fatal("expected IsLocked=false after release")
	}
}

func TestSecondAcquireFailsWhileLocked(t *testing.T) {
	repoPath := t.TempDir()
	featureID := "feature-abc123"

	lock1, err := AcquireLock(repoPath, featureID, "exec-001", "builder")
	if err != nil {
		t.Fatalf("first AcquireLock failed: %v", err)
	}

	_, err = AcquireLockWithTimeout(repoPath, featureID, "exec-002", "reviewer", 200*time.Millisecond)
	if err == nil {
		lock1.Release()
		t.Fatal("expected second acquire to fail while lock is held")
	}

	lock1.Release()
}

func TestStaleLockIsRemoved(t *testing.T) {
	repoPath := t.TempDir()
	featureID := "feature-stale"

	dir := lockDirForRepo(repoPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create lock dir: %v", err)
	}

	path := lockFilePath(repoPath, featureID)
	staleInfo := LockInfo{
		FeatureID:   featureID,
		ExecutionID: "exec-old",
		AgentName:   "old-agent",
		AcquiredAt:  time.Now().Add(-3 * time.Minute).UTC().Format(time.RFC3339),
		PID:         99999,
	}
	data, _ := json.Marshal(staleInfo)
	if err := os.WriteFile(path, data, 0o644); err != nil {
		t.Fatalf("write stale lock: %v", err)
	}

	lock, err := AcquireLockWithTimeout(repoPath, featureID, "exec-new", "new-agent", 2*time.Second)
	if err != nil {
		t.Fatalf("expected stale lock to be removed and new lock acquired, got: %v", err)
	}
	defer lock.Release()

	info := lock.Info()
	if info.ExecutionID != "exec-new" {
		t.Fatalf("expected new executionId, got %q", info.ExecutionID)
	}
}

func TestConcurrentAcquireSerializes(t *testing.T) {
	repoPath := t.TempDir()
	featureID := "feature-concurrent"

	var wg sync.WaitGroup
	var mu sync.Mutex
	orderedExecIDs := []string{}
	errors := []error{}

	for i := 0; i < 3; i++ {
		wg.Add(1)
		execID := "exec-" + string(rune('A'+i))
		go func(id string) {
			defer wg.Done()
			lock, err := AcquireLockWithTimeout(repoPath, featureID, id, "builder", 10*time.Second)
			if err != nil {
				mu.Lock()
				errors = append(errors, fmt.Errorf("acquire failed for %s: %v", id, err))
				mu.Unlock()
				return
			}

			mu.Lock()
			orderedExecIDs = append(orderedExecIDs, id)
			mu.Unlock()

			time.Sleep(100 * time.Millisecond)

			if err := lock.Release(); err != nil {
				mu.Lock()
				errors = append(errors, fmt.Errorf("release failed for %s: %v", id, err))
				mu.Unlock()
			}
		}(execID)
	}

	wg.Wait()

	if len(errors) > 0 {
		t.Fatalf("errors during concurrent acquire: %v", errors)
	}

	if len(orderedExecIDs) != 3 {
		t.Fatalf("expected 3 executions, got %d: %v", len(orderedExecIDs), orderedExecIDs)
	}

	seen := map[string]bool{}
	for _, id := range orderedExecIDs {
		if seen[id] {
			t.Fatalf("duplicate execution in order: %s", id)
		}
		seen[id] = true
	}
}

func TestLockRequiresRepoPath(t *testing.T) {
	_, err := AcquireLock("", "feature-1", "exec-1", "builder")
	if err == nil {
		t.Fatal("expected error for empty repo path")
	}
}

func TestLockRequiresFeatureID(t *testing.T) {
	_, err := AcquireLock(t.TempDir(), "", "exec-1", "builder")
	if err == nil {
		t.Fatal("expected error for empty feature ID")
	}
}

func TestLockRequiresExecutionID(t *testing.T) {
	_, err := AcquireLock(t.TempDir(), "feature-1", "", "builder")
	if err == nil {
		t.Fatal("expected error for empty execution ID")
	}
}

func TestIsLockedReturnsFalseForNonExistent(t *testing.T) {
	repoPath := t.TempDir()
	if IsLocked(repoPath, "nonexistent") {
		t.Fatal("expected IsLocked=false for non-existent lock")
	}
}

func TestNilLockReleaseIsSafe(t *testing.T) {
	var lock *FeatureLock
	if err := lock.Release(); err != nil {
		t.Fatalf("nil lock release should be no-op, got: %v", err)
	}
}

func TestLockFilePersistsInfo(t *testing.T) {
	repoPath := t.TempDir()
	featureID := "feature-persist"
	executionID := "exec-persist"
	agentName := "builder"

	lock, err := AcquireLock(repoPath, featureID, executionID, agentName)
	if err != nil {
		t.Fatalf("AcquireLock failed: %v", err)
	}

	path := lockFilePath(repoPath, featureID)
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read lock file: %v", err)
	}

	var info LockInfo
	if err := json.Unmarshal(data, &info); err != nil {
		t.Fatalf("unmarshal lock file: %v", err)
	}

	if info.FeatureID != featureID {
		t.Fatalf("persisted featureId mismatch: got %q", info.FeatureID)
	}
	if info.ExecutionID != executionID {
		t.Fatalf("persisted executionId mismatch: got %q", info.ExecutionID)
	}
	if info.AgentName != agentName {
		t.Fatalf("persisted agentName mismatch: got %q", info.AgentName)
	}

	lock.Release()
}
