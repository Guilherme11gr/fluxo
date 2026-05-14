package runner

import (
	"encoding/json"
	"fmt"
	"strings"
)

type ExecutionResultCheck struct {
	Name    string  `json:"name"`
	Status  string  `json:"status"`
	Details *string `json:"details"`
}

type ExecutionResultSkillCandidate struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

type ExecutionResultGit struct {
	Mode       string   `json:"mode"`
	BaseBranch *string  `json:"baseBranch"`
	Branch     *string  `json:"branch"`
	CommitShas []string `json:"commitShas"`
	PRUrl      *string  `json:"prUrl"`
	PRNumber   *int     `json:"prNumber"`
}

type ExecutionResultV1 struct {
	SchemaVersion   string                         `json:"schemaVersion"`
	Status          string                         `json:"status"`
	Summary         string                         `json:"summary"`
	WhatChanged     []string                       `json:"whatChanged"`
	Decisions       []string                       `json:"decisions"`
	Risks           []string                       `json:"risks"`
	ChecksRun       []ExecutionResultCheck         `json:"checksRun"`
	FilesTouched    []string                       `json:"filesTouched"`
	Git             ExecutionResultGit             `json:"git"`
	Followups       []string                       `json:"followups"`
	MemoryCandidates []string                      `json:"memoryCandidates"`
	SkillCandidates []ExecutionResultSkillCandidate `json:"skillCandidates"`
}

func BuildExecutionResultV1(success bool, readableOutput string, exitCode int) map[string]interface{} {
	strippedOutput := strings.TrimSpace(StripStructuredResultBlock(readableOutput))
	if parsed, err := ParseExecutionResultV1(readableOutput); err == nil && parsed != nil {
		if parsed.Summary == "" {
			parsed.Summary = defaultExecutionSummary(success, strippedOutput, exitCode)
		}
		if parsed.Status == "" {
			parsed.Status = executionStatusValue(success)
		}
		if parsed.SchemaVersion == "" {
			parsed.SchemaVersion = "v1"
		}
		if parsed.Git.Mode == "" {
			parsed.Git.Mode = "manual"
		}
		ensureExecutionResultDefaults(parsed)
		return parsed.toMap()
	}

	result := ExecutionResultV1{
		SchemaVersion: "v1",
		Status:        executionStatusValue(success),
		Summary:       defaultExecutionSummary(success, strippedOutput, exitCode),
		WhatChanged:   []string{},
		Decisions:     []string{},
		Risks:         []string{},
		ChecksRun:     []ExecutionResultCheck{},
		FilesTouched:  []string{},
		Git: ExecutionResultGit{
			Mode:       "manual",
			CommitShas: []string{},
		},
		Followups:        []string{},
		MemoryCandidates: []string{},
		SkillCandidates:  []ExecutionResultSkillCandidate{},
	}
	if !success && exitCode != 0 {
		result.Risks = []string{fmt.Sprintf("Execution failed with exit code %d.", exitCode)}
	}
	return result.toMap()
}

func ParseExecutionResultV1(text string) (*ExecutionResultV1, error) {
	jsonBlock, ok := extractStructuredResultJSON(text)
	if !ok {
		return nil, fmt.Errorf("structured result block not found")
	}

	var result ExecutionResultV1
	if err := json.Unmarshal([]byte(jsonBlock), &result); err != nil {
		return nil, err
	}
	ensureExecutionResultDefaults(&result)
	return &result, nil
}

func StripStructuredResultBlock(text string) string {
	start := strings.LastIndex(text, ResultStartMarker)
	end := strings.LastIndex(text, ResultEndMarker)
	if start == -1 || end == -1 || end < start {
		return strings.TrimSpace(text)
	}

	before := strings.TrimSpace(text[:start])
	after := strings.TrimSpace(text[end+len(ResultEndMarker):])
	if before == "" {
		return after
	}
	if after == "" {
		return before
	}
	return strings.TrimSpace(before + "\n\n" + after)
}

func ExecutionResultSummary(result map[string]interface{}) string {
	if summary, ok := result["summary"].(string); ok {
		return strings.TrimSpace(summary)
	}
	return ""
}

func ensureExecutionResultDefaults(result *ExecutionResultV1) {
	if result.WhatChanged == nil {
		result.WhatChanged = []string{}
	}
	if result.Decisions == nil {
		result.Decisions = []string{}
	}
	if result.Risks == nil {
		result.Risks = []string{}
	}
	if result.ChecksRun == nil {
		result.ChecksRun = []ExecutionResultCheck{}
	}
	if result.FilesTouched == nil {
		result.FilesTouched = []string{}
	}
	if result.Git.CommitShas == nil {
		result.Git.CommitShas = []string{}
	}
	if result.Followups == nil {
		result.Followups = []string{}
	}
	if result.MemoryCandidates == nil {
		result.MemoryCandidates = []string{}
	}
	if result.SkillCandidates == nil {
		result.SkillCandidates = []ExecutionResultSkillCandidate{}
	}
}

func (r ExecutionResultV1) toMap() map[string]interface{} {
	data, _ := json.Marshal(r)
	var out map[string]interface{}
	_ = json.Unmarshal(data, &out)
	return out
}

func extractStructuredResultJSON(text string) (string, bool) {
	start := strings.LastIndex(text, ResultStartMarker)
	end := strings.LastIndex(text, ResultEndMarker)
	if start == -1 || end == -1 || end < start {
		return "", false
	}

	block := strings.TrimSpace(text[start+len(ResultStartMarker) : end])
	block = strings.TrimPrefix(block, "```json")
	block = strings.TrimPrefix(block, "```")
	block = strings.TrimSuffix(strings.TrimSpace(block), "```")
	block = strings.TrimSpace(block)
	if block == "" {
		return "", false
	}
	return block, true
}

func executionStatusValue(success bool) string {
	if success {
		return "success"
	}
	return "failed"
}

func defaultExecutionSummary(success bool, readableOutput string, exitCode int) string {
	if readableOutput != "" {
		if len(readableOutput) > 500 {
			return readableOutput[:500]
		}
		return readableOutput
	}
	if success {
		return "Task executed successfully."
	}
	if exitCode != 0 {
		return fmt.Sprintf("Execution failed with exit code %d.", exitCode)
	}
	return "Execution failed."
}
