package runner

import (
	"encoding/json"
	"fmt"
	"reflect"
	"slices"
	"strconv"
	"strings"
)

type StructuredResultSource string

const (
	StructuredResultSourceModel     StructuredResultSource = "model"
	StructuredResultSourceRepaired  StructuredResultSource = "repaired"
	StructuredResultSourceSummary   StructuredResultSource = "summary"
	StructuredResultSourceExtracted StructuredResultSource = "extracted"
	StructuredResultSourceDerived   StructuredResultSource = "derived"
)

type ExecutionResultBuildMeta struct {
	Source        StructuredResultSource
	HadMarkers    bool
	RepairApplied bool
	ParseError    string
}

type ExecutionResultDerivedContext struct {
	FilesTouched []string
	ChecksRun    []ExecutionResultCheck
	WhatChanged  []string
}

type AgentSummaryV1 struct {
	Version     string   `json:"version"`
	Summary     string   `json:"summary"`
	WhatChanged []string `json:"whatChanged"`
	Decisions   []string `json:"decisions"`
	Risks       []string `json:"risks"`
	Followups   []string `json:"followups"`
	Raw         string   `json:"raw,omitempty"`
}

func ParseAgentSummary(text string) (*AgentSummaryV1, error) {
	summary, _, err := ParseAgentSummaryDetailed(text)
	return summary, err
}

func ParseAgentSummaryDetailed(text string) (*AgentSummaryV1, ExecutionResultBuildMeta, error) {
	block, span, ok := extractAgentSummaryBlock(text)
	if !ok {
		return nil, ExecutionResultBuildMeta{Source: StructuredResultSourceDerived}, fmt.Errorf("agent summary block not found")
	}

	summary := AgentSummaryV1{
		Version:     "v1",
		WhatChanged: []string{},
		Decisions:   []string{},
		Risks:       []string{},
		Followups:   []string{},
		Raw:         strings.TrimSpace(text[span.start:span.end]),
	}

	currentSection := ""
	for _, rawLine := range strings.Split(block, "\n") {
		line := strings.TrimSpace(rawLine)
		if line == "" {
			continue
		}

		if key, value, ok := parseAgentSummaryField(line); ok {
			switch key {
			case "version":
				summary.Version = defaultStr(value, "v1")
				currentSection = ""
				continue
			case "summary":
				summary.Summary = appendSentence(summary.Summary, value)
				currentSection = ""
				continue
			}
		}

		if section, ok := parseAgentSummarySection(line); ok {
			currentSection = section
			continue
		}

		item := stripSummaryBullet(line)
		if currentSection != "" {
			appendAgentSummaryItem(&summary, currentSection, item)
			continue
		}

		summary.Summary = appendSentence(summary.Summary, item)
	}

	normalizeAgentSummary(&summary)
	if !hasMeaningfulAgentSummary(&summary) {
		err := fmt.Errorf("agent summary block missing meaningful content")
		return nil, ExecutionResultBuildMeta{
			Source:     StructuredResultSourceDerived,
			HadMarkers: true,
			ParseError: err.Error(),
		}, err
	}

	return &summary, ExecutionResultBuildMeta{Source: StructuredResultSourceSummary, HadMarkers: true}, nil
}

func (s AgentSummaryV1) ToMap() map[string]interface{} {
	data, _ := json.Marshal(s)
	var out map[string]interface{}
	_ = json.Unmarshal(data, &out)
	return out
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

func SerializeAgentSummaryV1(summary *AgentSummaryV1) string {
	if summary == nil {
		return ""
	}
	normalized := *summary
	normalizeAgentSummary(&normalized)

	var b strings.Builder
	b.WriteString(SummaryStartMarker)
	b.WriteString("\n")
	b.WriteString("Version: ")
	b.WriteString(defaultStr(normalized.Version, "v1"))
	b.WriteString("\n")
	b.WriteString("Summary: ")
	b.WriteString(normalized.Summary)
	b.WriteString("\n")
	appendSummarySection := func(title string, items []string) {
		b.WriteString(title)
		b.WriteString("\n")
		for _, item := range items {
			b.WriteString("- ")
			b.WriteString(item)
			b.WriteString("\n")
		}
	}
	appendSummarySection("What changed:", normalized.WhatChanged)
	appendSummarySection("Decisions:", normalized.Decisions)
	appendSummarySection("Risks:", normalized.Risks)
	appendSummarySection("Followups:", normalized.Followups)
	b.WriteString(SummaryEndMarker)
	return strings.TrimSpace(b.String())
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
	SkillCandidates  []ExecutionResultSkillCandidate `json:"skillCandidates"`
}

func BuildExecutionResultV1(success bool, readableOutput string, exitCode int) map[string]interface{} {
	result, _ := BuildExecutionResultV1WithMeta(success, readableOutput, exitCode)
	return result
}

func BuildExecutionResultV1WithMeta(success bool, readableOutput string, exitCode int) (map[string]interface{}, ExecutionResultBuildMeta) {
	return BuildExecutionResultV1WithContextAndMeta(success, readableOutput, exitCode, ExecutionResultDerivedContext{})
}

func BuildExecutionResultV1WithContext(success bool, readableOutput string, exitCode int, ctx ExecutionResultDerivedContext) map[string]interface{} {
	result, _ := BuildExecutionResultV1WithContextAndMeta(success, readableOutput, exitCode, ctx)
	return result
}

func BuildExecutionResultV1WithContextAndMeta(success bool, readableOutput string, exitCode int, ctx ExecutionResultDerivedContext) (map[string]interface{}, ExecutionResultBuildMeta) {
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
		if success {
			if summary, summaryMeta, summaryErr := ParseAgentSummaryDetailed(readableOutput); summaryErr == nil && summary != nil {
				return buildSummaryExecutionResult(success, strippedOutput, exitCode, summary, summaryMeta, ctx)
			}
		}
		return buildDerivedExecutionResult(success, strippedOutput, readableOutput, exitCode, meta, ctx)
	}

	if success {
		if summary, summaryMeta, summaryErr := ParseAgentSummaryDetailed(readableOutput); summaryErr == nil && summary != nil {
			return buildSummaryExecutionResult(success, strippedOutput, exitCode, summary, summaryMeta, ctx)
		}
	}

	return buildDerivedExecutionResult(success, strippedOutput, readableOutput, exitCode, ExecutionResultBuildMeta{}, ctx)
}

func buildSummaryExecutionResult(success bool, strippedOutput string, exitCode int, summary *AgentSummaryV1, meta ExecutionResultBuildMeta, ctx ExecutionResultDerivedContext) (map[string]interface{}, ExecutionResultBuildMeta) {
	filesTouched := dedupeAndSortStrings(ctx.FilesTouched)
	checksRun := cloneExecutionChecks(ctx.ChecksRun)
	whatChanged := dedupeStringsPreserveOrder(summary.WhatChanged)
	if len(whatChanged) == 0 {
		whatChanged = dedupeAndSortStrings(ctx.WhatChanged)
	}
	if len(whatChanged) == 0 && len(filesTouched) > 0 {
		whatChanged = append(whatChanged, summarizeFilesTouched(filesTouched))
	}
	risks := dedupeStringsPreserveOrder(summary.Risks)
	if !success && exitCode != 0 && !containsString(risks, fmt.Sprintf("Execution failed with exit code %d.", exitCode)) {
		risks = append(risks, fmt.Sprintf("Execution failed with exit code %d.", exitCode))
	}

	result := ExecutionResultV1{
		SchemaVersion: "v1",
		Status:        executionStatusValue(success),
		Summary:       strings.TrimSpace(summary.Summary),
		WhatChanged:   whatChanged,
		Decisions:     dedupeStringsPreserveOrder(summary.Decisions),
		Risks:         risks,
		ChecksRun:     checksRun,
		FilesTouched:  filesTouched,
		Git: ExecutionResultGit{
			Mode:       "manual",
			CommitShas: []string{},
		},
		Followups:        dedupeStringsPreserveOrder(summary.Followups),
		MemoryCandidates: []string{},
		SkillCandidates:  []ExecutionResultSkillCandidate{},
	}
	if result.Summary == "" {
		switch {
		case len(result.WhatChanged) > 0:
			result.Summary = result.WhatChanged[0]
		default:
			result.Summary = defaultDerivedExecutionSummary(success, strippedOutput, exitCode, filesTouched)
		}
	}
	if meta.Source == "" {
		meta.Source = StructuredResultSourceSummary
	}
	if !meta.HadMarkers {
		meta.HadMarkers = strings.Contains(strippedOutput, SummaryStartMarker) || strings.Contains(strippedOutput, SummaryEndMarker)
	}
	ensureExecutionResultDefaults(&result)
	return result.toMap(), meta
}

func buildDerivedExecutionResult(success bool, strippedOutput, readableOutput string, exitCode int, meta ExecutionResultBuildMeta, ctx ExecutionResultDerivedContext) (map[string]interface{}, ExecutionResultBuildMeta) {
	filesTouched := dedupeAndSortStrings(ctx.FilesTouched)
	checksRun := cloneExecutionChecks(ctx.ChecksRun)
	whatChanged := dedupeAndSortStrings(ctx.WhatChanged)
	if len(whatChanged) == 0 && len(filesTouched) > 0 {
		whatChanged = append(whatChanged, summarizeFilesTouched(filesTouched))
	}

	result := ExecutionResultV1{
		SchemaVersion: "v1",
		Status:        executionStatusValue(success),
		Summary:       defaultDerivedExecutionSummary(success, strippedOutput, exitCode, filesTouched),
		WhatChanged:   whatChanged,
		Decisions:     []string{},
		Risks:         []string{},
		ChecksRun:     checksRun,
		FilesTouched:  filesTouched,
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

func ParseExecutionResultV1Map(data map[string]interface{}) (*ExecutionResultV1, error) {
	if data == nil {
		return nil, fmt.Errorf("execution result is nil")
	}

	result := normalizeExecutionResultV1(data)
	ensureExecutionResultDefaults(&result)
	if result.SchemaVersion == "" {
		result.SchemaVersion = "v1"
	}
	if result.Git.Mode == "" {
		result.Git.Mode = "manual"
	}
	return &result, nil
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
	text = stripAllStructuredResultBlocks(text)
	return stripAllAgentSummaryBlocks(text)
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
		return stripAllAgentSummaryBlocks(strings.TrimSpace(text))
	}

	before := strings.TrimSpace(text[:span.start])
	after := strings.TrimSpace(text[span.end:])
	if before == "" {
		return after
	}
	if after == "" {
		return before
	}
	return stripAllAgentSummaryBlocks(strings.TrimSpace(before + "\n\n" + after))
}

func ExecutionResultSummary(result map[string]interface{}) string {
	if summary, ok := result["summary"].(string); ok {
		return strings.TrimSpace(summary)
	}
	return ""
}

func stripAllAgentSummaryBlocks(text string) string {
	text = strings.TrimSpace(text)
	for {
		span, ok := extractAgentSummarySpan(text)
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

func (r ExecutionResultV1) ToMap() map[string]interface{} {
	return r.toMap()
}

func normalizeAgentSummary(summary *AgentSummaryV1) {
	if summary == nil {
		return
	}
	summary.Version = defaultStr(strings.TrimSpace(summary.Version), "v1")
	summary.Summary = strings.TrimSpace(summary.Summary)
	summary.WhatChanged = dedupeStringsPreserveOrder(summary.WhatChanged)
	summary.Decisions = dedupeStringsPreserveOrder(summary.Decisions)
	summary.Risks = dedupeStringsPreserveOrder(summary.Risks)
	summary.Followups = dedupeStringsPreserveOrder(summary.Followups)
	summary.Raw = strings.TrimSpace(summary.Raw)
	if summary.Summary == "" {
		switch {
		case len(summary.WhatChanged) > 0:
			summary.Summary = summary.WhatChanged[0]
		case len(summary.Decisions) > 0:
			summary.Summary = summary.Decisions[0]
		case len(summary.Risks) > 0:
			summary.Summary = summary.Risks[0]
		case len(summary.Followups) > 0:
			summary.Summary = summary.Followups[0]
		}
	}
}

func hasMeaningfulAgentSummary(summary *AgentSummaryV1) bool {
	if summary == nil {
		return false
	}
	if strings.TrimSpace(summary.Summary) != "" {
		return true
	}
	return len(summary.WhatChanged) > 0 || len(summary.Decisions) > 0 || len(summary.Risks) > 0 || len(summary.Followups) > 0
}

type structuredResultSpan struct {
	start int
	end   int
}

func extractAgentSummaryBlock(text string) (string, structuredResultSpan, bool) {
	span, ok := extractAgentSummarySpan(text)
	if !ok {
		return "", structuredResultSpan{}, false
	}

	block := strings.TrimSpace(text[span.start+len(SummaryStartMarker) : span.end-len(SummaryEndMarker)])
	if block == "" {
		return "", structuredResultSpan{}, false
	}
	return block, span, true
}

func extractAgentSummarySpan(text string) (structuredResultSpan, bool) {
	start := strings.LastIndex(text, SummaryStartMarker)
	end := strings.LastIndex(text, SummaryEndMarker)
	if start == -1 || end == -1 || end < start {
		return structuredResultSpan{}, false
	}
	return structuredResultSpan{
		start: start,
		end:   end + len(SummaryEndMarker),
	}, true
}

func parseAgentSummaryField(line string) (key string, value string, ok bool) {
	idx := strings.Index(line, ":")
	if idx <= 0 {
		return "", "", false
	}

	key = strings.ToLower(strings.TrimSpace(line[:idx]))
	value = strings.TrimSpace(line[idx+1:])
	switch key {
	case "version", "summary":
		return key, value, true
	default:
		return "", "", false
	}
}

func parseAgentSummarySection(line string) (string, bool) {
	normalized := strings.ToLower(strings.TrimSpace(strings.TrimSuffix(line, ":")))
	switch normalized {
	case "what changed":
		return "whatChanged", true
	case "decisions":
		return "decisions", true
	case "risks":
		return "risks", true
	case "followups":
		return "followups", true
	default:
		return "", false
	}
}

func stripSummaryBullet(line string) string {
	line = strings.TrimSpace(line)
	line = strings.TrimPrefix(line, "- ")
	line = strings.TrimPrefix(line, "* ")
	line = strings.TrimPrefix(line, "• ")
	return strings.TrimSpace(line)
}

func appendAgentSummaryItem(summary *AgentSummaryV1, section, item string) {
	if summary == nil || item == "" {
		return
	}
	items := splitExecutionListString(item)
	if len(items) == 0 {
		items = []string{item}
	}
	for _, entry := range items {
		switch section {
		case "whatChanged":
			summary.WhatChanged = append(summary.WhatChanged, entry)
		case "decisions":
			summary.Decisions = append(summary.Decisions, entry)
		case "risks":
			summary.Risks = append(summary.Risks, entry)
		case "followups":
			summary.Followups = append(summary.Followups, entry)
		}
	}
}

func appendSentence(existing, next string) string {
	next = strings.TrimSpace(next)
	if next == "" {
		return strings.TrimSpace(existing)
	}
	if strings.TrimSpace(existing) == "" {
		return next
	}
	return strings.TrimSpace(existing + " " + next)
}

func dedupeStringsPreserveOrder(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func containsString(values []string, target string) bool {
	target = strings.TrimSpace(target)
	if target == "" {
		return false
	}
	for _, value := range values {
		if strings.TrimSpace(value) == target {
			return true
		}
	}
	return false
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

func defaultDerivedExecutionSummary(success bool, readableOutput string, exitCode int, filesTouched []string) string {
	summary := defaultExecutionSummary(success, readableOutput, exitCode)
	if summary != "Task executed successfully." {
		return summary
	}
	if len(filesTouched) == 0 {
		return summary
	}
	return summarizeFilesTouched(filesTouched)
}

func summarizeFilesTouched(filesTouched []string) string {
	if len(filesTouched) == 0 {
		return "Task executed successfully."
	}
	if len(filesTouched) == 1 {
		return fmt.Sprintf("Updated %s.", filesTouched[0])
	}
	return fmt.Sprintf("Updated %d files: %s.", len(filesTouched), strings.Join(filesTouched, ", "))
}

func dedupeAndSortStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	seen := make(map[string]struct{}, len(values))
	result := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	slices.Sort(result)
	return result
}

func cloneExecutionChecks(checks []ExecutionResultCheck) []ExecutionResultCheck {
	if len(checks) == 0 {
		return []ExecutionResultCheck{}
	}
	cloned := make([]ExecutionResultCheck, len(checks))
	copy(cloned, checks)
	return cloned
}

func normalizeExecutionResultV1(data map[string]interface{}) ExecutionResultV1 {
	return ExecutionResultV1{
		SchemaVersion:    normalizeExecutionString(data["schemaVersion"]),
		Status:           normalizeExecutionStatus(data["status"]),
		Summary:          normalizeExecutionString(data["summary"]),
		WhatChanged:      normalizeExecutionStringSlice(data["whatChanged"]),
		Decisions:        normalizeExecutionStringSlice(data["decisions"]),
		Risks:            normalizeExecutionStringSlice(data["risks"]),
		ChecksRun:        normalizeExecutionChecks(data["checksRun"]),
		FilesTouched:     normalizeExecutionStringSlice(data["filesTouched"]),
		Git:              normalizeExecutionGit(data["git"]),
		Followups:        normalizeExecutionStringSlice(data["followups"]),
		MemoryCandidates: normalizeExecutionStringSlice(data["memoryCandidates"]),
		SkillCandidates:  normalizeExecutionSkillCandidates(data["skillCandidates"]),
	}
}

func normalizeExecutionStatus(value interface{}) string {
	raw := strings.ToLower(normalizeExecutionString(value))
	switch raw {
	case "success", "successful", "succeeded", "completed", "done", "ok", "passed":
		return "success"
	case "failed", "failure", "fail", "timed_out", "timeout", "cancelled", "canceled":
		return "failed"
	case "error", "errored":
		return "error"
	case "":
		return ""
	}

	switch {
	case strings.Contains(raw, "success"), strings.Contains(raw, "pass"), strings.Contains(raw, "done"), strings.Contains(raw, "complete"):
		return "success"
	case strings.Contains(raw, "error"):
		return "error"
	case strings.Contains(raw, "fail"), strings.Contains(raw, "timeout"), strings.Contains(raw, "cancel"):
		return "failed"
	default:
		return ""
	}
}

func normalizeExecutionStringSlice(value interface{}) []string {
	items := executionSliceItems(value)
	if items == nil {
		return splitExecutionListString(normalizeExecutionString(value))
	}

	result := make([]string, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		for _, entry := range splitExecutionListString(normalizeExecutionString(item)) {
			if entry == "" {
				continue
			}
			if _, ok := seen[entry]; ok {
				continue
			}
			seen[entry] = struct{}{}
			result = append(result, entry)
		}
	}
	return result
}

func normalizeExecutionChecks(value interface{}) []ExecutionResultCheck {
	items := executionSliceItems(value)
	if items == nil {
		check := normalizeExecutionCheck(value)
		if check == nil {
			return []ExecutionResultCheck{}
		}
		return []ExecutionResultCheck{*check}
	}

	result := make([]ExecutionResultCheck, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		check := normalizeExecutionCheck(item)
		if check == nil {
			continue
		}
		key := check.Name + "\x00" + check.Status
		if check.Details != nil {
			key += "\x00" + *check.Details
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, *check)
	}
	return result
}

func normalizeExecutionCheck(value interface{}) *ExecutionResultCheck {
	switch typed := value.(type) {
	case nil:
		return nil
	case ExecutionResultCheck:
		check := typed
		check.Name = normalizeExecutionString(check.Name)
		check.Status = normalizeExecutionCheckStatus(check.Status)
		if check.Status == "" {
			check.Status = "skipped"
		}
		if check.Details != nil {
			details := normalizeExecutionString(*check.Details)
			if details == "" {
				check.Details = nil
			} else {
				check.Details = &details
			}
		}
		if check.Name == "" {
			if check.Details == nil {
				return nil
			}
			check.Name = *check.Details
			check.Details = nil
		}
		return &check
	case map[string]interface{}:
		name := firstNonEmptyExecutionString(typed["name"], typed["command"], typed["check"], typed["title"])
		details := firstNonEmptyExecutionString(typed["details"], typed["message"], typed["summary"])
		if name == "" {
			name = details
			details = ""
		}
		if name == "" {
			return nil
		}
		status := normalizeExecutionCheckStatus(typed["status"])
		if status == "" {
			status = normalizeExecutionCheckStatus(name)
		}
		if status == "" {
			status = "skipped"
		}
		var detailsPtr *string
		if details != "" && details != name {
			detailsPtr = &details
		}
		return &ExecutionResultCheck{Name: name, Status: status, Details: detailsPtr}
	default:
		name := normalizeExecutionString(value)
		if name == "" {
			return nil
		}
		status := normalizeExecutionCheckStatus(name)
		if status == "" {
			status = "skipped"
		}
		return &ExecutionResultCheck{Name: name, Status: status}
	}
}

func normalizeExecutionCheckStatus(value interface{}) string {
	raw := strings.ToLower(normalizeExecutionString(value))
	switch raw {
	case "passed", "pass", "success", "successful", "succeeded", "completed", "ok":
		return "passed"
	case "failed", "fail", "failure", "error", "errored":
		return "failed"
	case "skipped", "skip", "not_run", "not-run", "pending", "cancelled", "canceled", "unknown":
		return "skipped"
	case "":
		return ""
	}

	switch {
	case strings.Contains(raw, "fail"), strings.Contains(raw, "error"):
		return "failed"
	case strings.Contains(raw, "pass"), strings.Contains(raw, "success"), strings.Contains(raw, "complete"), strings.Contains(raw, "ok"):
		return "passed"
	case strings.Contains(raw, "skip"), strings.Contains(raw, "pending"), strings.Contains(raw, "cancel"):
		return "skipped"
	default:
		return ""
	}
}

func normalizeExecutionGit(value interface{}) ExecutionResultGit {
	switch typed := value.(type) {
	case nil:
		return ExecutionResultGit{}
	case ExecutionResultGit:
		git := typed
		git.Mode = normalizeExecutionString(git.Mode)
		git.BaseBranch = normalizeExecutionStringPointer(git.BaseBranch)
		git.Branch = normalizeExecutionStringPointer(git.Branch)
		git.CommitShas = normalizeExecutionStringSlice(git.CommitShas)
		git.PRUrl = normalizeExecutionStringPointer(git.PRUrl)
		git.PRNumber = normalizeExecutionIntPointer(git.PRNumber)
		return git
	case map[string]interface{}:
		return ExecutionResultGit{
			Mode:       normalizeExecutionString(typed["mode"]),
			BaseBranch: normalizeExecutionStringPointer(typed["baseBranch"]),
			Branch:     normalizeExecutionStringPointer(typed["branch"]),
			CommitShas: normalizeExecutionStringSlice(typed["commitShas"]),
			PRUrl:      normalizeExecutionStringPointer(typed["prUrl"]),
			PRNumber:   normalizeExecutionIntPointer(typed["prNumber"]),
		}
	default:
		mode := normalizeExecutionString(value)
		if mode == "" {
			return ExecutionResultGit{}
		}
		return ExecutionResultGit{Mode: mode, CommitShas: []string{}}
	}
}

func normalizeExecutionSkillCandidates(value interface{}) []ExecutionResultSkillCandidate {
	items := executionSliceItems(value)
	if items == nil {
		candidate := normalizeExecutionSkillCandidate(value)
		if candidate == nil {
			return []ExecutionResultSkillCandidate{}
		}
		return []ExecutionResultSkillCandidate{*candidate}
	}

	result := make([]ExecutionResultSkillCandidate, 0, len(items))
	seen := make(map[string]struct{}, len(items))
	for _, item := range items {
		candidate := normalizeExecutionSkillCandidate(item)
		if candidate == nil {
			continue
		}
		key := candidate.Name + "\x00" + candidate.Reason
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, *candidate)
	}
	return result
}

func normalizeExecutionSkillCandidate(value interface{}) *ExecutionResultSkillCandidate {
	switch typed := value.(type) {
	case nil:
		return nil
	case ExecutionResultSkillCandidate:
		candidate := typed
		candidate.Name = normalizeExecutionString(candidate.Name)
		candidate.Reason = normalizeExecutionString(candidate.Reason)
		if candidate.Name == "" {
			return nil
		}
		return &candidate
	case map[string]interface{}:
		name := firstNonEmptyExecutionString(typed["name"], typed["skill"], typed["id"], typed["title"])
		reason := firstNonEmptyExecutionString(typed["reason"], typed["why"], typed["description"], typed["summary"])
		if name == "" {
			if reason == "" {
				return nil
			}
			name = reason
			reason = ""
		}
		return &ExecutionResultSkillCandidate{Name: name, Reason: reason}
	default:
		name := normalizeExecutionString(value)
		if name == "" {
			return nil
		}
		return &ExecutionResultSkillCandidate{Name: name}
	}
}

func executionSliceItems(value interface{}) []interface{} {
	if value == nil {
		return nil
	}
	if items, ok := value.([]interface{}); ok {
		return items
	}
	rv := reflect.ValueOf(value)
	if !rv.IsValid() {
		return nil
	}
	if rv.Kind() != reflect.Slice && rv.Kind() != reflect.Array {
		return nil
	}
	items := make([]interface{}, 0, rv.Len())
	for i := 0; i < rv.Len(); i++ {
		items = append(items, rv.Index(i).Interface())
	}
	return items
}

func splitExecutionListString(value string) []string {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil
	}
	if !strings.Contains(value, "\n") {
		return []string{value}
	}

	lines := strings.Split(value, "\n")
	result := make([]string, 0, len(lines))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "- ")
		line = strings.TrimPrefix(line, "* ")
		line = strings.TrimPrefix(line, "• ")
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		result = append(result, line)
	}
	if len(result) == 0 {
		return []string{value}
	}
	return result
}

func firstNonEmptyExecutionString(values ...interface{}) string {
	for _, value := range values {
		if normalized := normalizeExecutionString(value); normalized != "" {
			return normalized
		}
	}
	return ""
}

func normalizeExecutionStringPointer(value interface{}) *string {
	switch typed := value.(type) {
	case nil:
		return nil
	case *string:
		if typed == nil {
			return nil
		}
		normalized := normalizeExecutionString(*typed)
		if normalized == "" {
			return nil
		}
		return &normalized
	default:
		normalized := normalizeExecutionString(value)
		if normalized == "" {
			return nil
		}
		return &normalized
	}
}

func normalizeExecutionIntPointer(value interface{}) *int {
	switch typed := value.(type) {
	case nil:
		return nil
	case *int:
		if typed == nil {
			return nil
		}
		parsed := *typed
		return &parsed
	case int:
		parsed := typed
		return &parsed
	case int64:
		parsed := int(typed)
		return &parsed
	case float64:
		parsed := int(typed)
		return &parsed
	case string:
		normalized := strings.TrimSpace(typed)
		if normalized == "" {
			return nil
		}
		parsed, err := strconv.Atoi(normalized)
		if err != nil {
			return nil
		}
		return &parsed
	default:
		rv := reflect.ValueOf(value)
		if !rv.IsValid() {
			return nil
		}
		switch rv.Kind() {
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			parsed := int(rv.Int())
			return &parsed
		case reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64:
			parsed := int(rv.Uint())
			return &parsed
		case reflect.Float32, reflect.Float64:
			parsed := int(rv.Float())
			return &parsed
		default:
			return nil
		}
	}
}

func normalizeExecutionString(value interface{}) string {
	switch typed := value.(type) {
	case nil:
		return ""
	case string:
		return strings.TrimSpace(typed)
	case *string:
		if typed == nil {
			return ""
		}
		return strings.TrimSpace(*typed)
	case fmt.Stringer:
		return strings.TrimSpace(typed.String())
	default:
		rv := reflect.ValueOf(value)
		if !rv.IsValid() {
			return ""
		}
		switch rv.Kind() {
		case reflect.Bool,
			reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64,
			reflect.Uint, reflect.Uint8, reflect.Uint16, reflect.Uint32, reflect.Uint64,
			reflect.Float32, reflect.Float64:
			return strings.TrimSpace(fmt.Sprint(value))
		default:
			return ""
		}
	}
}
