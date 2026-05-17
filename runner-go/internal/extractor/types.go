package extractor

import (
	"time"
)

type ExtractRequest struct {
	TaskID          string
	TaskTitle       string
	TaskDescription string
	AgentName       string
	Tool            string
	Model           string
	RawOutput       string
	ReadableOutput  string
	FilesTouched    []string
	ExitCode        int
	Success         bool
}

type ExtractResult struct {
	Result    map[string]interface{}
	Source    string
	Model     string
	LatencyMs int64
	InputChars int
}

type ExtractMeta struct {
	Attempted  bool   `json:"attempted"`
	Provider   string `json:"provider"`
	Model      string `json:"model"`
	Success    bool   `json:"success"`
	Error      string `json:"error,omitempty"`
	LatencyMs  int64  `json:"latencyMs"`
	InputChars int    `json:"inputChars"`

	startedAt time.Time
}

func NewMeta(provider, model string) *ExtractMeta {
	return &ExtractMeta{
		Attempted: true,
		Provider:  provider,
		Model:     model,
		startedAt: time.Now(),
	}
}

func (m *ExtractMeta) WithError(err error) *ExtractMeta {
	m.Success = false
	m.LatencyMs = time.Since(m.startedAt).Milliseconds()
	if err != nil {
		m.Error = err.Error()
	}
	return m
}

func (m *ExtractMeta) WithSuccess(inputChars int) *ExtractMeta {
	m.Success = true
	m.LatencyMs = time.Since(m.startedAt).Milliseconds()
	m.InputChars = inputChars
	return m
}

func (m *ExtractMeta) ToMap() map[string]interface{} {
	result := map[string]interface{}{
		"attempted": m.Attempted,
		"provider":  m.Provider,
		"model":     m.Model,
		"success":   m.Success,
	}
	if m.Error != "" {
		result["error"] = m.Error
	} else {
		result["error"] = nil
	}
	if m.LatencyMs > 0 {
		result["latencyMs"] = m.LatencyMs
	} else {
		result["latencyMs"] = time.Since(m.startedAt).Milliseconds()
	}
	if m.InputChars > 0 {
		result["inputChars"] = m.InputChars
	}
	return result
}
