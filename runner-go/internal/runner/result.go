package runner

import (
	"encoding/json"
	"fmt"
	"strings"
)

type StructuredResultSource string

const (
	StructuredResultSourceModel    StructuredResultSource = "model"
	StructuredResultSourceRepaired StructuredResultSource = "repaired"
	StructuredResultSourceDerived  StructuredResultSource = "derived"
)

type ExecutionResultBuildMeta struct {
	Source        StructuredResultSource
	HadMarkers    bool
	RepairApplied bool
	ParseError    string
}

type executionResultParseMeta struct {
	Source        StructuredResultSource
	HadMarkers    bool
	RepairApplied bool
	ParseError    string
}

func SerializeExecutionResultV1(result map[string]interface{}) string {
	data, err := json.MarshalIndent(result, "", "  ")
	if err != nil {
		return ""
	}

	return strings.TrimSpace(ResultStartMarker + "\n" + string(data) + "\n" + ResultEndMarker)
}

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
	SchemaVersion    string                          `json:"schemaVersion"`
	Status           string                          `json:"status"`
	Summary          string                          `json:"summary"`
	WhatChanged      []string                        `json:"whatChanged"`
	Decisions        []string                        `json:"decisions"`
	Risks            []string                        `json:"risks"`
	ChecksRun        []ExecutionResultCheck          `json:"checksRun"`
	FilesTouched     []string                        `json:"filesTouched"`
	Git              ExecutionResultGit              `json:"git"`
	Followups        []string                        `json:"followups"`
	MemoryCandidates []string                        `json:"memoryCandidates"`
	SkillCandidates []ExecutionResultSkillCandidate `json:"skillCandidates"`
}

func BuildExecutionResultV1(success bool, readableOutput string, exitCode int) map[string]interface{} {
	result, _ := BuildExecutionResultV1WithMeta(success, readableOutput, exitCode)
	return result
}

func BuildExecutionResultV1WithMeta(success bool, readableOutput string, exitCode int) (map[string]interface{}, ExecutionResultBuildMeta) {
	strippedOutput := strings.TrimSpace(StripStructuredResultBlock(readableOutput))
	if parsed, meta, err := ParseExecutionResultV1Detailed(readableOutput); err == nil && parsed != nil {
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
		return parsed.toMap(), ExecutionResultBuildMeta{
			Source:        meta.Source,
			HadMarkers:    meta.HadMarkers,
			RepairApplied: meta.RepairApplied,
			ParseError:    meta.ParseError,
		}
	} else if err != nil {
		return buildDerivedExecutionResult(success, strippedOutput, readableOutput, exitCode, meta)
	}

	return buildDerivedExecutionResult(success, strippedOutput, readableOutput, exitCode, ExecutionResultBuildMeta{})
}

func buildDerivedExecutionResult(success bool, strippedOutput, readableOutput string, exitCode int, meta ExecutionResultBuildMeta) (map[string]interface{}, ExecutionResultBuildMeta) {
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
	meta.Source = StructuredResultSourceDerived
	if !meta.HadMarkers {
		meta.HadMarkers = strings.Contains(readableOutput, ResultStartMarker) || strings.Contains(readableOutput, ResultEndMarker)
	}
	return result.toMap(), meta
}

func ParseExecutionResultV1(text string) (*ExecutionResultV1, error) {
	result, _, err := ParseExecutionResultV1Detailed(text)
	return result, err
}

func ParseExecutionResultV1Detailed(text string) (*ExecutionResultV1, ExecutionResultBuildMeta, error) {
	jsonBlock, meta, ok := extractStructuredResultJSON(text)
	if !ok {
		return nil, ExecutionResultBuildMeta{Source: StructuredResultSourceDerived}, fmt.Errorf("structured result block not found")
	}

	var result ExecutionResultV1
	if err := json.Unmarshal([]byte(jsonBlock), &result); err != nil {
		meta.ParseError = err.Error()
		repaired, repairedOK := repairStructuredResultJSON(jsonBlock)
		if !repairedOK {
			return nil, ExecutionResultBuildMeta{
				Source:        StructuredResultSourceDerived,
				HadMarkers:    meta.HadMarkers,
				RepairApplied: meta.RepairApplied,
				ParseError:    meta.ParseError,
			}, err
		}
		if repairErr := json.Unmarshal([]byte(repaired), &result); repairErr != nil {
			meta.ParseError = repairErr.Error()
			return nil, ExecutionResultBuildMeta{
				Source:        StructuredResultSourceDerived,
				HadMarkers:    meta.HadMarkers,
				RepairApplied: true,
				ParseError:    meta.ParseError,
			}, repairErr
		}
		meta.Source = StructuredResultSourceRepaired
		meta.RepairApplied = true
	}
	if meta.Source == "" {
		meta.Source = StructuredResultSourceModel
	}
	ensureExecutionResultDefaults(&result)
	return &result, meta.toBuildMeta(), nil
}

func StripStructuredResultBlock(text string) string {
	return stripAllStructuredResultBlocks(text)
}

func stripAllStructuredResultBlocks(text string) string {
	text = strings.TrimSpace(text)
	for {
		span, ok := extractStructuredResultSpan(text)
		if !ok {
			return strings.TrimSpace(text)
		}

		before := strings.TrimSpace(text[:span.start])
		after := strings.TrimSpace(text[span.end:])
		switch {
		case before == "":
			text = after
		case after == "":
			text = before
		default:
			text = strings.TrimSpace(before + "\n\n" + after)
		}
	}
}

func StripLastStructuredResultBlock(text string) string {
	span, ok := extractStructuredResultSpan(text)
	if !ok {
		return strings.TrimSpace(text)
	}

	before := strings.TrimSpace(text[:span.start])
	after := strings.TrimSpace(text[span.end:])
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

type structuredResultSpan struct {
	start int
	end   int
}

func extractStructuredResultJSON(text string) (string, executionResultParseMeta, bool) {
	block, _, meta, ok := extractStructuredResultJSONWithMeta(text)
	return block, meta, ok

}

func extractStructuredResultJSONWithMeta(text string) (string, structuredResultSpan, executionResultParseMeta, bool) {
	span, ok := extractStructuredResultSpan(text)
	if !ok {
		return "", structuredResultSpan{}, executionResultParseMeta{}, false
	}

	block := strings.TrimSpace(text[span.start+len(ResultStartMarker) : span.end-len(ResultEndMarker)])
	meta := executionResultParseMeta{HadMarkers: true, Source: StructuredResultSourceModel}
	block = strings.TrimPrefix(block, "```json")
	block = strings.TrimPrefix(block, "```")
	block = strings.TrimSuffix(strings.TrimSpace(block), "```")
	block = strings.TrimSpace(block)
	if block == "" {
		return "", structuredResultSpan{}, meta, false
	}
	return block, span, meta, true

}

func extractStructuredResultSpan(text string) (structuredResultSpan, bool) {
	start := strings.LastIndex(text, ResultStartMarker)
	end := strings.LastIndex(text, ResultEndMarker)
	if start == -1 || end == -1 || end < start {
		return structuredResultSpan{}, false
	}
	return structuredResultSpan{
		start: start,
		end:   end + len(ResultEndMarker),
	}, true

}

func repairStructuredResultJSON(block string) (string, bool) {
	trimmed := strings.TrimSpace(block)
	trimmed = strings.TrimPrefix(trimmed, "```json")
	trimmed = strings.TrimPrefix(trimmed, "```")
	trimmed = strings.TrimSuffix(strings.TrimSpace(trimmed), "```")
	trimmed = strings.TrimSpace(trimmed)
	if trimmed == "" {
		return "", false
	}

	start := strings.Index(trimmed, "{")
	end := strings.LastIndex(trimmed, "}")
	if start == -1 || end == -1 || end < start {
		return "", false
	}

	repaired := strings.TrimSpace(trimmed[start : end+1])
	if repaired == "" {
		return "", false
	}
	return repaired, true

}

func (m executionResultParseMeta) toBuildMeta() ExecutionResultBuildMeta {
	return ExecutionResultBuildMeta{
		Source:        m.Source,
		HadMarkers:    m.HadMarkers,
		RepairApplied: m.RepairApplied,
		ParseError:    m.ParseError,
	}
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
