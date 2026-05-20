package featurelock

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	defaultLockTimeout = 5 * time.Minute
	lockFileExt        = ".lock"
	staleThreshold     = 2 * time.Minute
)

var (
	processLocks   = make(map[string]*sync.Mutex)
	processLocksMu sync.Mutex
)

func getProcessLock(key string) *sync.Mutex {
	processLocksMu.Lock()
	defer processLocksMu.Unlock()
	if mu, ok := processLocks[key]; ok {
		return mu
	}
	mu := &sync.Mutex{}
	processLocks[key] = mu
	return mu
}

type LockInfo struct {
	FeatureID   string `json:"featureId"`
	ExecutionID string `json:"executionId"`
	AgentName   string `json:"agentName"`
	AcquiredAt  string `json:"acquiredAt"`
	PID         int    `json:"pid"`
}

type FeatureLock struct {
	lockPath string
	info     LockInfo
}

type LockRecord struct {
	Path string
	Info LockInfo
}

func lockDirForRepo(repoPath string) string {
	trimmed := strings.TrimSpace(repoPath)
	cacheDir, err := os.UserCacheDir()
	if err != nil || strings.TrimSpace(cacheDir) == "" {
		cacheDir = os.TempDir()
	}
	hash := sha256.Sum256([]byte(trimmed))
	return filepath.Join(cacheDir, "fluxo-runner", hex.EncodeToString(hash[:8]), "locks")
}

func lockFilePath(repoPath, featureID string) string {
	dir := lockDirForRepo(repoPath)
	safeFeatureID := strings.ReplaceAll(featureID, "/", "_")
	return filepath.Join(dir, safeFeatureID+lockFileExt)
}

func AcquireLock(repoPath, featureID, executionID, agentName string) (*FeatureLock, error) {
	return AcquireLockWithTimeout(repoPath, featureID, executionID, agentName, defaultLockTimeout)
}

func AcquireLockWithTimeout(repoPath, featureID, executionID, agentName string, timeout time.Duration) (*FeatureLock, error) {
	repoPath = strings.TrimSpace(repoPath)
	featureID = strings.TrimSpace(featureID)
	executionID = strings.TrimSpace(executionID)
	agentName = strings.TrimSpace(agentName)

	if repoPath == "" {
		return nil, fmt.Errorf("feature lock: repo path is required")
	}
	if featureID == "" {
		return nil, fmt.Errorf("feature lock: feature ID is required")
	}
	if executionID == "" {
		return nil, fmt.Errorf("feature lock: execution ID is required")
	}

	dir := lockDirForRepo(repoPath)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, fmt.Errorf("feature lock: create lock dir: %w", err)
	}

	path := lockFilePath(repoPath, featureID)

	deadline := time.Now().Add(timeout)
	for attempt := 0; ; attempt++ {
		acquired, err := tryAcquire(path, featureID, executionID, agentName)
		if acquired {
			return &FeatureLock{
				lockPath: path,
				info: LockInfo{
					FeatureID:   featureID,
					ExecutionID: executionID,
					AgentName:   agentName,
					AcquiredAt:  time.Now().UTC().Format(time.RFC3339),
					PID:         os.Getpid(),
				},
			}, nil
		}

		if err != nil {
			_, isLockHeld := err.(*LockHeldError)
			if !isLockHeld {
				return nil, fmt.Errorf("feature lock: %w", err)
			}

			if isStaleLock(err, path) {
				if staleErr := forceRemoveLock(path); staleErr != nil {
					return nil, fmt.Errorf("feature lock: remove stale lock: %w", staleErr)
				}
				continue
			}
		}

		if time.Now().After(deadline) {
			holder, _ := readLockInfo(path)
			holderDesc := "unknown"
			if holder != nil {
				holderDesc = fmt.Sprintf("agent=%s exec=%s pid=%d at=%s", holder.AgentName, holder.ExecutionID, holder.PID, holder.AcquiredAt)
			}
			return nil, fmt.Errorf("feature lock: timeout waiting for lock on feature %q (held by: %s)", featureID, holderDesc)
		}

		remaining := time.Until(deadline)
		sleepDur := 500 * time.Millisecond
		if remaining < sleepDur {
			sleepDur = remaining
		}
		if sleepDur > 0 {
			time.Sleep(sleepDur)
		} else {
			return nil, fmt.Errorf("feature lock: timeout waiting for lock on feature %q", featureID)
		}
	}
}

func tryAcquire(path, featureID, executionID, agentName string) (bool, error) {
	processMu := getProcessLock(path)
	processMu.Lock()

	_, statErr := os.Stat(path)
	fileExists := statErr == nil

	fd, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
	if err != nil {
		processMu.Unlock()
		if os.IsExist(err) || fileExists {
			return false, &LockHeldError{path: path}
		}
		return false, fmt.Errorf("create lock file: %w", err)
	}

	info := LockInfo{
		FeatureID:   featureID,
		ExecutionID: executionID,
		AgentName:   agentName,
		AcquiredAt:  time.Now().UTC().Format(time.RFC3339),
		PID:         os.Getpid(),
	}

	data, err := json.Marshal(info)
	if err != nil {
		_ = fd.Close()
		_ = os.Remove(path)
		processMu.Unlock()
		return false, fmt.Errorf("marshal lock info: %w", err)
	}

	if _, err := fd.Write(data); err != nil {
		_ = fd.Close()
		_ = os.Remove(path)
		processMu.Unlock()
		return false, fmt.Errorf("write lock file: %w", err)
	}

	if err := fd.Close(); err != nil {
		_ = os.Remove(path)
		processMu.Unlock()
		return false, fmt.Errorf("close lock file: %w", err)
	}

	processMu.Unlock()
	return true, nil
}

func (l *FeatureLock) Release() error {
	if l == nil || l.lockPath == "" {
		return nil
	}
	processMu := getProcessLock(l.lockPath)
	processMu.Lock()
	defer processMu.Unlock()

	err := os.Remove(l.lockPath)

	processLocksMu.Lock()
	delete(processLocks, l.lockPath)
	processLocksMu.Unlock()

	return err
}

func (l *FeatureLock) Info() LockInfo {
	if l == nil {
		return LockInfo{}
	}
	return l.info
}

func IsLocked(repoPath, featureID string) bool {
	path := lockFilePath(repoPath, featureID)
	_, err := os.Stat(path)
	return err == nil
}

func ListLocks(repoPath string) ([]LockRecord, error) {
	dir := lockDirForRepo(repoPath)
	entries, err := os.ReadDir(dir)
	if err != nil {
		if os.IsNotExist(err) {
			return []LockRecord{}, nil
		}
		return nil, err
	}

	records := []LockRecord{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), lockFileExt) {
			continue
		}
		path := filepath.Join(dir, entry.Name())
		info, err := readLockInfo(path)
		if err != nil {
			continue
		}
		records = append(records, LockRecord{Path: path, Info: *info})
	}
	return records, nil
}

func RemoveLockRecord(record LockRecord) error {
	if strings.TrimSpace(record.Path) == "" {
		return nil
	}
	return forceRemoveLock(record.Path)
}

func readLockInfo(path string) (*LockInfo, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	var info LockInfo
	if err := json.Unmarshal(data, &info); err != nil {
		return nil, err
	}
	return &info, nil
}

func isStaleLock(err error, path string) bool {
	if err == nil {
		return false
	}

	_, isLockHeld := err.(*LockHeldError)
	if !isLockHeld {
		return false
	}

	info, readErr := readLockInfo(path)
	if readErr != nil {
		return false
	}

	acquiredAt, parseErr := time.Parse(time.RFC3339, info.AcquiredAt)
	if parseErr != nil {
		return false
	}

	return time.Since(acquiredAt) > staleThreshold
}

func forceRemoveLock(path string) error {
	processMu := getProcessLock(path)
	processMu.Lock()
	defer processMu.Unlock()

	err := os.Remove(path)

	processLocksMu.Lock()
	delete(processLocks, path)
	processLocksMu.Unlock()

	return err
}

type LockHeldError struct {
	path string
}

func (e *LockHeldError) Error() string {
	return fmt.Sprintf("feature lock held: %s", e.path)
}
