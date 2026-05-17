package orchestrator

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/runner"
)

func TestSetAgentsOfflineSendsOfflineHeartbeat(t *testing.T) {
	var (
		mu               sync.Mutex
		offlineHeartbeat bool
	)

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")

		switch {
		case r.Method == http.MethodPost && r.URL.Path == "/agents":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"success": true,
				"data": map[string]any{"id": "agent-reg-1"},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/agents/agent-reg-1/heartbeat":
			var body struct {
				Status string `json:"status"`
			}
			if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
				t.Fatalf("decode heartbeat body: %v", err)
			}
			mu.Lock()
			if body.Status == "OFFLINE" {
				offlineHeartbeat = true
			}
			mu.Unlock()
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{}})
		default:
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
	}))
	defer server.Close()

	agent := config.AgentConfig{Name: "builder", Tool: "opencode"}
	agentID := runner.RegisterAgent(api.NewClient(server.URL, "test-key", agent.Name), agent, nil)
	if agentID == "" {
		t.Fatal("expected agent registration to succeed")
	}

	manager := NewRunnerManager(server.URL, "test-key", 0, 0, nil, nil, "", nil)
	manager.setAgentsOffline([]config.AgentConfig{agent})

	mu.Lock()
	defer mu.Unlock()
	if !offlineHeartbeat {
		t.Fatal("expected OFFLINE heartbeat to be sent")
	}
}
