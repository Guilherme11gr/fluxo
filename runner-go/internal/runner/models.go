package runner

import (
	"bytes"
	"os"
	"os/exec"
	"sort"
	"strings"
	"sync"
)

var (
	detectedModels []string
	modelsOnce     sync.Once
)

// DiscoverModels detects available models from installed tools (opencode, claude).
// Returns a deduplicated, sorted list. Caches after first call.
func DiscoverModels() []string {
	modelsOnce.Do(func() {
		detectedModels = doDiscoverModels()
	})
	return detectedModels
}

// RediscoverModels forces re-detection of available models.
func RediscoverModels() []string {
	detectedModels = doDiscoverModels()
	modelsOnce = sync.Once{}
	return detectedModels
}

func doDiscoverModels() []string {
	seen := map[string]bool{}
	var result []string

	if models := runModelCmd("opencode", "models"); len(models) > 0 {
		for _, m := range models {
			if !seen[m] {
				seen[m] = true
				result = append(result, m)
			}
		}
	}

	if models := runModelCmd("claude", "--print", "list", "models"); len(models) > 0 {
		for _, m := range models {
			if !seen[m] {
				seen[m] = true
				result = append(result, m)
			}
		}
	}

	sort.Strings(result)
	return result
}

func runModelCmd(name string, args ...string) []string {
	cmd := exec.Command(name, args...)
	cmd.Env = os.Environ()

	var stdout bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = bytes.NewBuffer(nil)

	if err := cmd.Run(); err != nil {
		return nil
	}

	var models []string
	for _, line := range strings.Split(stdout.String(), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "{") || strings.HasPrefix(line, "[") {
			continue
		}
		models = append(models, line)
	}
	return models
}