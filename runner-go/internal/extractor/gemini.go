package extractor

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type GeminiExtractor struct {
	apiKey        string
	model         string
	timeoutSec    int
	maxInputChars int
	httpClient    *http.Client
}

func NewGeminiExtractor(apiKey, model string, timeoutSec, maxInputChars int) *GeminiExtractor {
	if timeoutSec <= 0 {
		timeoutSec = 20
	}
	if maxInputChars <= 0 {
		maxInputChars = 30000
	}
	return &GeminiExtractor{
		apiKey:        apiKey,
		model:         model,
		timeoutSec:    timeoutSec,
		maxInputChars: maxInputChars,
		httpClient:    &http.Client{Timeout: time.Duration(timeoutSec) * time.Second},
	}
}

func (e *GeminiExtractor) Name() string     { return "gemini" }
func (e *GeminiExtractor) Provider() string { return "gemini" }
func (e *GeminiExtractor) Model() string    { return e.model }

func (e *GeminiExtractor) Extract(ctx context.Context, req ExtractRequest) (*ExtractResult, error) {
	startedAt := time.Now()
	prompt := e.buildPrompt(req)
	inputChars := len(prompt)

	geminiReq := map[string]interface{}{
		"contents": []map[string]interface{}{
			{
				"parts": []map[string]interface{}{
					{"text": prompt},
				},
			},
		},
		"generationConfig": map[string]interface{}{
			"temperature":     0.0,
			"topP":            1.0,
			"maxOutputTokens": 4096,
		},
	}

	body, err := json.Marshal(geminiReq)
	if err != nil {
		return nil, fmt.Errorf("gemini extractor: marshal request: %w", err)
	}

	url := fmt.Sprintf("https://generativelanguage.googleapis.com/v1beta/models/%s:generateContent", e.model)

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("gemini extractor: create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", e.apiKey)

	resp, err := e.httpClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("gemini extractor: http request: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("gemini extractor: read response: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("gemini extractor: HTTP %d: %s", resp.StatusCode, e.truncate(string(respBody), 500))
	}

	var geminiResp geminiResponse
	if err := json.Unmarshal(respBody, &geminiResp); err != nil {
		return nil, fmt.Errorf("gemini extractor: parse response: %w", err)
	}

	text := e.extractText(geminiResp)
	if text == "" {
		return nil, fmt.Errorf("gemini extractor: empty response text")
	}

	jsonText := e.extractJSON(text)
	if jsonText == "" {
		return nil, fmt.Errorf("gemini extractor: no JSON found in response: %s", e.truncate(text, 300))
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(jsonText), &result); err != nil {
		return nil, fmt.Errorf("gemini extractor: parse extracted JSON: %w", err)
	}

	return &ExtractResult{
		Result:     result,
		Source:     SourceExtracted,
		Model:      e.model,
		LatencyMs:  time.Since(startedAt).Milliseconds(),
		InputChars: inputChars,
	}, nil
}

func (e *GeminiExtractor) buildExtractionInput(req ExtractRequest) string {
	output := req.ReadableOutput
	if output == "" {
		output = req.RawOutput
	}
	return e.truncate(output, e.maxInputChars)
}

func (e *GeminiExtractor) buildPrompt(req ExtractRequest) string {
	var b strings.Builder

	b.WriteString("You are a structured result extractor for the FluXo task runner.\n\n")
	b.WriteString("Below is the execution log of a coding agent that completed a task.\n")
	b.WriteString("The agent was supposed to return a JSON block between FLUXO_RESULT_JSON_START and FLUXO_RESULT_JSON_END markers, but it did not.\n")
	b.WriteString("Your job is to reconstruct that JSON from the log.\n\n")

	b.WriteString("## Task Context\n")
	b.WriteString(fmt.Sprintf("Title: %s\n", req.TaskTitle))
	if req.TaskDescription != "" {
		b.WriteString(fmt.Sprintf("Description: %s\n", e.truncate(req.TaskDescription, 500)))
	}
	b.WriteString(fmt.Sprintf("Agent: %s (%s)\n", req.AgentName, req.Tool))
	b.WriteString(fmt.Sprintf("Exit code: %d\n", req.ExitCode))

	status := "success"
	if !req.Success {
		status = "failed"
	}
	b.WriteString(fmt.Sprintf("Execution status: %s\n\n", status))

	if len(req.FilesTouched) > 0 {
		b.WriteString("## Files Touched (detected by git)\n")
		for _, f := range req.FilesTouched {
			b.WriteString(fmt.Sprintf("- %s\n", f))
		}
		b.WriteString("\n")
	}

	b.WriteString("## Agent Execution Log\n")
	b.WriteString(e.buildExtractionInput(req))
	b.WriteString("\n\n")

	b.WriteString("## Instructions\n")
	b.WriteString("1. Extract the structured result from the log above.\n")
	b.WriteString("2. Return a JSON object with this exact shape and field types:\n")
	b.WriteString(`{
  "schemaVersion": "v1",
  "status": "success",
  "summary": "One-sentence human summary.",
  "whatChanged": ["Concrete change"],
  "decisions": ["Technical decision"],
  "risks": ["Explicit risk if mentioned"],
  "checksRun": [{"name": "go test ./...", "status": "passed", "details": null}],
  "filesTouched": ["path/to/file"],
  "git": {
    "mode": "manual",
    "baseBranch": null,
    "branch": null,
    "commitShas": [],
    "prUrl": null,
    "prNumber": null
  },
  "followups": [],
  "memoryCandidates": [],
  "skillCandidates": []
}
`)
	b.WriteString("3. Use these rules:\n")
	b.WriteString("   - status: the execution status provided above\n")
	b.WriteString(fmt.Sprintf("   - summary: one sentence describing what happened (%d chars max)\n", 200))
	b.WriteString("   - whatChanged: concrete changes mentioned in the log (implemented X, fixed Y, updated Z)\n")
	b.WriteString("   - decisions: architectural/design choices the agent made\n")
	b.WriteString("   - risks: only include risks the agent explicitly mentioned\n")
	b.WriteString("   - checksRun: only include checks that appear in the log (e.g. npm test, go test)\n")
	b.WriteString("   - every array field must stay an array even with a single item; never return a bare string for whatChanged, decisions, risks, filesTouched, followups, memoryCandidates, or checksRun\n")
	b.WriteString("   - checksRun entries must be objects with name, status, and details\n")
	b.WriteString("   - skillCandidates must be an array of objects with name and reason\n")
	if len(req.FilesTouched) > 0 {
		b.WriteString("   - filesTouched: use the exact list provided above unless the log mentions additional files\n")
	} else {
		b.WriteString("   - filesTouched: files the agent edited, read, or created (extract from read/edit/write operations)\n")
	}
	b.WriteString("   - git.mode: manual\n")
	b.WriteString("   - git.baseBranch: null\n")
	b.WriteString("   - git.branch: null\n")
	b.WriteString("   - git.commitShas: []\n")
	b.WriteString("   - git.prUrl: null\n")
	b.WriteString("   - git.prNumber: null\n")
	b.WriteString("   - followups: only if the log explicitly mentions follow-up work\n")
	b.WriteString("   - memoryCandidates: []\n")
	b.WriteString("   - skillCandidates: []\n")
	b.WriteString("4. Do NOT invent facts not present in the log.\n")
	b.WriteString("5. Return ONLY the JSON object, no other text, no markdown fences, no explanation.\n")
	b.WriteString("6. The JSON must be a valid FluXo ExecutionResultV1 object with schemaVersion: \"v1\".\n")

	return b.String()
}

func (e *GeminiExtractor) extractText(resp geminiResponse) string {
	if len(resp.Candidates) == 0 {
		return ""
	}
	candidate := resp.Candidates[0]
	if candidate.Content.Role != "model" {
		return ""
	}
	if len(candidate.Content.Parts) == 0 {
		return ""
	}
	return strings.TrimSpace(candidate.Content.Parts[0].Text)
}

func (e *GeminiExtractor) extractJSON(text string) string {
	text = strings.TrimSpace(text)

	start := strings.Index(text, "{")
	end := strings.LastIndex(text, "}")
	if start == -1 || end == -1 || end < start {
		return ""
	}
	return text[start : end+1]
}

func (e *GeminiExtractor) truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}

type geminiResponse struct {
	Candidates []geminiCandidate `json:"candidates"`
}

type geminiCandidate struct {
	Content geminiContent `json:"content"`
}

type geminiContent struct {
	Role  string       `json:"role"`
	Parts []geminiPart `json:"parts"`
}

type geminiPart struct {
	Text string `json:"text"`
}
