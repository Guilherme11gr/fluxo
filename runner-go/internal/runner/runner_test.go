package runner

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
)

func TestRegisterAgentPublishesResultExtractorConfig(t *testing.T) {
	var posted map[string]interface{}

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		if r.Method != http.MethodPost || r.URL.Path != "/agents" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&posted); err != nil {
			t.Fatalf("decode request body: %v", err)
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"success": true,
			"data": map[string]any{"id": "agent-reg-1"},
		})
	}))
	defer server.Close()

	agentID := RegisterAgent(api.NewClient(server.URL, "test-key", "builder"), config.AgentConfig{
		Name:  "builder",
		Tool:  "opencode",
		Model: "glm-5.1",
		ResultExtractor: &config.ResultExtractorConfig{
			Enabled:       boolPtr(true),
			Provider:      "gemini",
			Model:         "gemini-3.1-flash-lite",
			APIKeyEnv:     "GEMINI_API_KEY",
			TimeoutSec:    15,
			MaxInputChars: 4200,
		},
	}, nil)

	if agentID != "agent-reg-1" {
		t.Fatalf("expected registered id, got %q", agentID)
	}
	configMap, ok := posted["config"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected config payload, got %#v", posted)
	}
	extractorMap, ok := configMap["result_extractor"].(map[string]interface{})
	if !ok {
		t.Fatalf("expected result_extractor payload, got %#v", configMap)
	}
	if extractorMap["enabled"] != true {
		t.Fatalf("expected enabled=true, got %#v", extractorMap)
	}
	if extractorMap["provider"] != "gemini" || extractorMap["model"] != "gemini-3.1-flash-lite" {
		t.Fatalf("expected provider/model payload, got %#v", extractorMap)
	}
	if extractorMap["timeout_sec"] != float64(15) {
		t.Fatalf("expected timeout_sec payload, got %#v", extractorMap)
	}
	if extractorMap["max_input_chars"] != float64(4200) {
		t.Fatalf("expected max_input_chars payload, got %#v", extractorMap)
	}
}

func boolPtr(v bool) *bool {
	return &v
}
