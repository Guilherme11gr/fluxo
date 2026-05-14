package sync

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
)

// AgentSyncer fetches agent configurations from the FluXo API
// and keeps a local cache refreshed on a background interval.
//
// Safety: when an agent disappears from the API response, the syncer
// waits for missCount consecutive misses before removing it. This prevents
// false positives from transient network issues.
type AgentSyncer struct {
	client   *api.Client
	defaults config.AgentDefaults
	mu       sync.RWMutex
	agents   []config.AgentConfig
	missMap  map[string]int // agent name → consecutive miss count
	missCap  int            // how many misses before removal (default: 2)
	lastSync time.Time
	lastErr  error
}

// NewAgentSyncer creates a new syncer that will use the given API client
// and apply the provided defaults to fields not supplied by the API.
func NewAgentSyncer(client *api.Client, defaults config.AgentDefaults) *AgentSyncer {
	return &AgentSyncer{
		client:  client,
		defaults: defaults,
		missMap: make(map[string]int),
		missCap: 2,
	}
}

// FetchAgents fetches the list of agents from the API and converts them
// to AgentConfig structs, merging with defaults.
func (s *AgentSyncer) FetchAgents() ([]config.AgentConfig, error) {
	resp, err := s.client.Get("/agents")
	if err != nil {
		return nil, fmt.Errorf("fetch agents: %w", err)
	}

	if errMsg, ok := resp["error"]; ok {
		return nil, fmt.Errorf("API error: %v", errMsg)
	}

	data, ok := resp["data"]
	if !ok {
		return nil, fmt.Errorf("unexpected response format: missing 'data' field")
	}

	arr, ok := data.([]interface{})
	if !ok {
		return nil, fmt.Errorf("unexpected response format: data is not an array")
	}

	var agents []config.AgentConfig
	for _, item := range arr {
		obj, ok := item.(map[string]interface{})
		if !ok {
			continue
		}
		agent := convertAPIAgent(obj, s.defaults)
		agents = append(agents, agent)
	}

	return agents, nil
}

// Start begins the background sync loop. It fetches agents immediately
// and then refreshes at the given interval. Blocks until ctx is cancelled.
func (s *AgentSyncer) Start(ctx context.Context, interval time.Duration) {
	s.doSync()
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			fmt.Println("[sync] Agent syncer stopped")
			return
		case <-ticker.C:
			s.doSync()
		}
	}
}

// GetAgents returns the current cached agent list (thread-safe).
func (s *AgentSyncer) GetAgents() []config.AgentConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]config.AgentConfig, len(s.agents))
	copy(out, s.agents)
	return out
}

// LastSync returns the time of the last successful sync.
func (s *AgentSyncer) LastSync() time.Time {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastSync
}

// LastError returns the last sync error, if any.
func (s *AgentSyncer) LastError() error {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.lastErr
}

// doSync performs one sync cycle: fetch from API, merge with cache,
// apply miss-count logic for removals.
func (s *AgentSyncer) doSync() {
	fetched, err := s.FetchAgents()
	if err != nil {
		fmt.Printf("[sync] Failed to fetch agents: %v\n", err)
		s.mu.Lock()
		s.lastErr = err
		s.mu.Unlock()
		return
	}

	fetchedNames := make(map[string]bool)
	for _, a := range fetched {
		fetchedNames[a.Name] = true
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	s.lastErr = nil
	s.lastSync = time.Now()

	// Check for removed agents (miss-count logic)
	var kept []config.AgentConfig
	for _, existing := range s.agents {
		if fetchedNames[existing.Name] {
			// Agent still present in API response
			delete(s.missMap, existing.Name)
			// Will be replaced by fetched version below
		} else {
			// Agent missing from API response — increment miss count
			s.missMap[existing.Name]++
			if s.missMap[existing.Name] >= s.missCap {
				fmt.Printf("[sync] Agent %q removed after %d consecutive misses\n", existing.Name, s.missCap)
				delete(s.missMap, existing.Name)
				continue
			}
			// Keep stale agent for now
			kept = append(kept, existing)
		}
	}

	// Add fetched agents (replacing any stale copies)
	keptNames := make(map[string]bool)
	for _, k := range kept {
		keptNames[k.Name] = true
	}
	for _, a := range fetched {
		if !keptNames[a.Name] {
			kept = append(kept, a)
		} else {
			// Replace stale copy with fresh data
			for i, k := range kept {
				if k.Name == a.Name {
					kept[i] = a
					break
				}
			}
		}
	}

	s.agents = kept
	fmt.Printf("[sync] Synced %d agent(s)\n", len(s.agents))
}

// convertAPIAgent maps an API response object to an AgentConfig,
// filling in defaults for missing fields.
func convertAPIAgent(obj map[string]interface{}, d config.AgentDefaults) config.AgentConfig {
	agent := config.AgentConfig{
		Name:        strVal(obj, "name"),
		Tool:        strVal(obj, "tool"),
		PickStatus:  d.PickStatus,
		ClaimStatus: d.ClaimStatus,
		DoneStatus:  d.DoneStatus,
		Timeout:     d.Timeout,
	}

	if id, ok := obj["id"].(string); ok {
		agent.ID = id
	}

	// The "config" field is a JSON object with runtime settings
	configMap, _ := obj["config"].(map[string]interface{})
	if configMap == nil {
		configMap = make(map[string]interface{})
	}

	agent.Model = strVal(configMap, "model")
	agent.AgentType = strVal(configMap, "agent_type")
	agent.Variant = strVal(configMap, "variant")
	agent.AssigneeID = strVal(configMap, "assignee_agent_id")
	if agent.AssigneeID == "" {
		agent.AssigneeID = strVal(configMap, "assignee_id")
	}
	agent.NextAssigneeID = strVal(configMap, "next_assignee_agent_id")
	if agent.NextAssigneeID == "" {
		agent.NextAssigneeID = strVal(configMap, "next_assignee_id")
	}
	agent.Context = strVal(configMap, "context")
	agent.Workdir = strVal(configMap, "workdir")
	if agent.Workdir == "" {
		if w := strVal(obj, "workdir"); w != "" {
			agent.Workdir = w
		}
	}

	// ProjectID: prefer column, fall back to config
	agent.ProjectID = strVal(obj, "projectId")
	if agent.ProjectID == "" {
		agent.ProjectID = strVal(configMap, "project_id")
	}

	// Override defaults with config values if present
	if v := strVal(configMap, "pick_status"); v != "" {
		agent.PickStatus = v
	}
	if v := strVal(configMap, "claim_status"); v != "" {
		agent.ClaimStatus = v
	}
	if v := strVal(configMap, "done_status"); v != "" {
		agent.DoneStatus = v
	}
	if v := intVal(configMap, "timeout"); v > 0 {
		agent.Timeout = v
	}

	return agent
}

func strVal(m map[string]interface{}, key string) string {
	v, _ := m[key].(string)
	return v
}

func intVal(m map[string]interface{}, key string) int {
	switch v := m[key].(type) {
	case float64:
		return int(v)
	case int:
		return v
	case string:
		var n int
		fmt.Sscanf(v, "%d", &n)
		return n
	}
	return 0
}
