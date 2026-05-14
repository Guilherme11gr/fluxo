package orchestrator

import (
	"context"
	"fmt"
	"os"
	"runtime"
	"sync"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	agentsync "github.com/fluxo-app/fluxo-runner/internal/sync"
)

type RunnerManager struct {
	apiURL          string
	apiKey          string
	pollInterval    time.Duration
	heartbeat       time.Duration
	availableModels []string
	agentFlag       string

	runnerID string

	syncer   *agentsync.AgentSyncer
	agentsMu sync.Mutex
	workers  map[string]*AgentWorker
}

func NewRunnerManager(apiURL, apiKey string, pollInterval, heartbeat time.Duration, availableModels []string, syncer *agentsync.AgentSyncer, agentFlag string) *RunnerManager {
	return &RunnerManager{
		apiURL:          apiURL,
		apiKey:          apiKey,
		pollInterval:    pollInterval,
		heartbeat:       heartbeat,
		availableModels: availableModels,
		syncer:          syncer,
		agentFlag:       agentFlag,
		workers:         map[string]*AgentWorker{},
	}
}

func (m *RunnerManager) Register(ctx context.Context) error {
	hostname, _ := os.Hostname()
	runnerProfile := hostname
	runnerID, err := api.RegisterRunner(api.NewClient(m.apiURL, m.apiKey, "runner"), api.RegisterRunnerParams{
		Hostname: hostname,
		PID:      os.Getpid(),
		Version:  "0.3.0",
		Capabilities: map[string]interface{}{
			"streaming":        true,
			"claim_next":       true,
			"multi_agent":      true,
			"host_os":          runtime.GOOS,
			"runner_profile":   runnerProfile,
			"available_models": m.availableModels,
		},
		Metadata: map[string]interface{}{
			"hostOs":        runtime.GOOS,
			"runnerProfile": runnerProfile,
		},
	})
	if err != nil {
		return err
	}
	m.runnerID = runnerID
	go m.heartbeatLoop(ctx)
	return nil
}

func (m *RunnerManager) Start(ctx context.Context, agents []config.AgentConfig) error {
	if err := m.Register(ctx); err != nil {
		return err
	}

	go m.reaperLoop(ctx)
	m.reconcileAgents(ctx, agents)
	ticker := time.NewTicker(m.pollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			m.stopAll()
			return nil
		case <-ticker.C:
			if m.syncer != nil {
				agents = m.syncer.GetAgents()
			}
			m.reconcileAgents(ctx, agents)
		}
	}
}

func (m *RunnerManager) RunOnce(ctx context.Context, agents []config.AgentConfig) error {
	if err := m.Register(ctx); err != nil {
		return err
	}

	var wg sync.WaitGroup
	for _, agent := range agents {
		if m.agentFlag != "" && agent.Name != m.agentFlag {
			continue
		}
		if agent.ID == "" {
			continue
		}
		agent.AvailableModels = m.availableModels
		worker := NewAgentWorker(m.apiURL, m.apiKey, m.runnerID, agent, m.pollInterval)
		wg.Add(1)
		go func() {
			defer wg.Done()
			worker.runOnce(ctx)
		}()
	}
	wg.Wait()
	_, _ = api.HeartbeatRunner(api.NewClient(m.apiURL, m.apiKey, "runner"), m.runnerID, api.RunnerHeartbeatParams{Status: "OFFLINE"})
	return nil
}

func (m *RunnerManager) reconcileAgents(ctx context.Context, agents []config.AgentConfig) {
	m.agentsMu.Lock()
	defer m.agentsMu.Unlock()

	keep := map[string]bool{}
	for _, agent := range agents {
		if m.agentFlag != "" && agent.Name != m.agentFlag {
			continue
		}
		agent.AvailableModels = m.availableModels
		if agent.ID == "" {
			continue
		}
		keep[agent.ID] = true

		worker, exists := m.workers[agent.ID]
		if !exists {
			worker = NewAgentWorker(m.apiURL, m.apiKey, m.runnerID, agent, m.pollInterval)
			m.workers[agent.ID] = worker
			go worker.Run(ctx)
			continue
		}

		worker.UpdateAgent(agent)
	}

	for id, worker := range m.workers {
		if !keep[id] {
			worker.Stop()
			delete(m.workers, id)
		}
	}
}

func (m *RunnerManager) stopAll() {
	m.agentsMu.Lock()
	defer m.agentsMu.Unlock()
	for id, worker := range m.workers {
		worker.Stop()
		delete(m.workers, id)
	}
	if m.runnerID != "" {
		_, _ = api.HeartbeatRunner(api.NewClient(m.apiURL, m.apiKey, "runner"), m.runnerID, api.RunnerHeartbeatParams{Status: "OFFLINE"})
	}
}

func (m *RunnerManager) heartbeatLoop(ctx context.Context) {
	if m.heartbeat <= 0 {
		m.heartbeat = 30 * time.Second
	}
	ticker := time.NewTicker(m.heartbeat)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if m.runnerID == "" {
				continue
			}
			_, err := api.HeartbeatRunner(api.NewClient(m.apiURL, m.apiKey, "runner"), m.runnerID, api.RunnerHeartbeatParams{
				Status: "ONLINE",
				Capabilities: map[string]interface{}{
					"host_os":        runtime.GOOS,
					"available_models": m.availableModels,
				},
				Metadata: map[string]interface{}{
					"hostOs": runtime.GOOS,
				},
			})
			if err != nil {
				fmt.Printf("[runner] heartbeat error: %v\n", err)
			}
		}
	}
}

func (m *RunnerManager) reaperLoop(ctx context.Context) {
	interval := 60 * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	client := api.NewClient(m.apiURL, m.apiKey, "runner")
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := api.ReapStaleExecutions(client, 10*60*1000); err != nil {
				fmt.Printf("[runner] reaper error: %v\n", err)
			}
		}
	}
}
