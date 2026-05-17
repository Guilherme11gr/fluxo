package sync

import (
	"testing"

	"github.com/fluxo-app/fluxo-runner/internal/config"
)

func TestConvertAPIAgentParsesResultExtractorConfig(t *testing.T) {
	agent := convertAPIAgent(map[string]interface{}{
		"id":   "agent-1",
		"name": "builder",
		"tool": "opencode",
		"config": map[string]interface{}{
			"model": "glm-5.1",
			"result_extractor": map[string]interface{}{
				"enabled":         false,
				"provider":        "gemini",
				"model":           "gemini-3.1-flash-lite",
				"api_key_env":     "GEMINI_API_KEY",
				"timeout_sec":     15,
				"max_input_chars": 4200,
			},
		},
	}, defaults())

	if agent.ResultExtractor == nil {
		t.Fatal("expected result extractor override")
	}
	if agent.ResultExtractor.Enabled == nil || *agent.ResultExtractor.Enabled {
		t.Fatalf("expected explicit enabled=false, got %#v", agent.ResultExtractor)
	}
	if agent.ResultExtractor.Provider != "gemini" {
		t.Fatalf("expected provider parsed, got %#v", agent.ResultExtractor)
	}
	if agent.ResultExtractor.TimeoutSec != 15 || agent.ResultExtractor.MaxInputChars != 4200 {
		t.Fatalf("expected numeric fields parsed, got %#v", agent.ResultExtractor)
	}
}

func defaults() config.AgentDefaults {
	return config.AgentDefaults{
		PickStatus:  "TODO",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     300,
	}
}
