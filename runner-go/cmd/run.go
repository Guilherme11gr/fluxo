package cmd

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/fluxo-app/fluxo-runner/internal/api"
	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/logging"
	"github.com/fluxo-app/fluxo-runner/internal/orchestrator"
	"github.com/fluxo-app/fluxo-runner/internal/runner"
	"github.com/fluxo-app/fluxo-runner/internal/sync"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var (
	once       bool
	apiKeyFlag string
	apiURLFlag string
	agentFlag  string
	debugFlag  bool
)

var runCmd = &cobra.Command{
	Use:   "run",
	Short: "Start the runner (continuous or single execution)",
	Long: `Start polling FluXo for tasks and executing them.

By default runs in continuous mode. Use --once for a single execution pass.

Dynamic mode (no agents in config):
  The runner fetches agent profiles from the API and executes tasks
  based on the remote configuration. This is the recommended mode.

  Quick start:
    fluxo-runner run --api-key agk_xxx

Legacy mode (agents in config.yaml):
  When agents are defined in config.yaml, the runner uses them directly
  without fetching from the API.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		// Try loading config file (optional in dynamic mode with --api-key)
		var cfg config.Config
		configPath := cfgFile
		if configPath == "" {
			configPath = "./config.yaml"
		}

		absPath, _ := filepath.Abs(configPath)
		data, err := os.ReadFile(absPath)
		if err == nil {
			if err := yaml.Unmarshal(data, &cfg); err != nil {
				return fmt.Errorf("invalid config: %w", err)
			}
		} else if cfgFile != "" {
			// Explicit config path that doesn't exist — error
			return fmt.Errorf("config not found: %s\nUsage: fluxo-runner run [--config path/to/config.yaml] [--api-key key]", absPath)
		}
		// If no config file and no --config flag, that's fine — dynamic mode with flags

		// Resolve API key: flag > env var from config > AGENT_API_KEY env
		apiKey := apiKeyFlag
		if apiKey == "" && cfg.Runner.APIKeyEnv != "" {
			apiKey = os.Getenv(cfg.Runner.APIKeyEnv)
		}
		if apiKey == "" {
			apiKey = os.Getenv("AGENT_API_KEY")
		}
		if apiKey == "" {
			return fmt.Errorf("API key required. Use --api-key flag or set AGENT_API_KEY env var")
		}

		// Resolve API URL: flag > config > default
		apiURL := apiURLFlag
		if apiURL == "" {
			apiURL = cfg.Runner.APIURL
		}
		if apiURL == "" {
			apiURL = "https://fluxo.agenda-aqui.com/api/agent"
		}

		logging.SetDebug(debugFlag)

		pollInterval := time.Duration(cfg.Runner.GetPollInterval()) * time.Second

		// Banner
		fmt.Println()
		fmt.Println("\033[36m╔══════════════════════════════════════╗")
		fmt.Printf("║   FluXo Runner v%-20s ║\n", Version)
		fmt.Println("╚══════════════════════════════════════╝\033[0m")
		fmt.Printf("  API: %s\n", apiURL)

		if cfg.IsDynamic() {
			fmt.Println("  Mode: \033[36mdynamic\033[0m (agents from API)")
		} else {
			fmt.Printf("  Mode: \033[33mlegacy\033[0m (agents from config)\n")
			fmt.Printf("  Agents: %s\n", formatAgents(cfg.Agents))
		}
		fmt.Printf("  Poll: every %ds\n\n", int(pollInterval.Seconds()))
		if debugFlag {
			fmt.Println("  Debug: \033[35menabled\033[0m")
			fmt.Println()
		}

		// Determine agent list
		var agents []config.AgentConfig
		var syncer *sync.AgentSyncer

		if cfg.IsDynamic() {
			// Dynamic mode: fetch agents from API
			defaults := config.DefaultAgentDefaults()
			syncerClient := api.NewClient(apiURL, apiKey, "sync")
			syncer = sync.NewAgentSyncer(syncerClient, defaults)

			fmt.Println("[runner] Fetching agents from API...")
			fetched, err := syncer.FetchAgents()
			if err != nil {
				return fmt.Errorf("failed to fetch agents from API: %w\nHint: check your API key and URL", err)
			}
			if len(fetched) == 0 {
				return fmt.Errorf("no agents found in API. Create agents in the FluXo UI first")
			}
			agents = fetched
			fmt.Printf("  \033[32m%d agent(s) fetched from API\033[0m\n", len(agents))
			for _, a := range agents {
				fmt.Printf("  \033[32m%s\033[0m (%s, model=%s)\n", a.Name, a.Tool, a.Model)
			}
			fmt.Println()
		} else {
			// Legacy mode: use agents from config
			agents = cfg.Agents
		}

		// Discover available models from installed tools
		availableModels := runner.DiscoverModels()
		if len(availableModels) > 0 {
			fmt.Printf("  \033[36m%d model(s) detected\033[0m\n", len(availableModels))
		} else {
			fmt.Println("  \033[33mNo models detected (opencode/claude not found)\033[0m")
		}

		// Filter to single agent if --agent flag is set
		if agentFlag != "" {
			var filtered []config.AgentConfig
			for _, a := range agents {
				if a.Name == agentFlag {
					filtered = append(filtered, a)
					break
				}
			}
			if len(filtered) == 0 {
				return fmt.Errorf("agent %q not found. Available: %s", agentFlag, formatAgents(agents))
			}
			agents = filtered
			fmt.Printf("  \033[36mFiltered to agent: %s\033[0m\n\n", agentFlag)
		}

		// Register all agents
		fmt.Println("[runner] Registering agents...")
		for _, agent := range agents {
			agent.AvailableModels = availableModels
			client := api.NewClient(apiURL, apiKey, agent.Name)
			id := runner.RegisterAgent(client, agent, availableModels)
			if id != "" {
				shortID := id
				if len(shortID) > 8 {
					shortID = shortID[:8]
				}
				fmt.Printf("  \033[32m%s\033[0m: registered (%s...)\n", agent.Name, shortID)
			} else {
				fmt.Printf("  \033[33m%s\033[0m: failed (will retry)\n", agent.Name)
			}
		}
		fmt.Println()

		// Single run mode
		if once {
			manager := orchestrator.NewRunnerManager(apiURL, apiKey, pollInterval, time.Duration(cfg.Runner.HeartbeatSec)*time.Second, availableModels, nil, agentFlag)
			ctx, cancel := context.WithTimeout(context.Background(), 30*time.Minute)
			defer cancel()
			if err := manager.RunOnce(ctx, agents); err != nil {
				return err
			}
			return nil
		}

		// Start background sync if in dynamic mode
		if syncer != nil {
			syncInterval := time.Duration(cfg.Runner.GetSyncInterval()) * time.Second
			syncCtx, syncCancel := context.WithCancel(context.Background())
			go syncer.Start(syncCtx, syncInterval)
			defer syncCancel()
		}

		// Continuous mode with graceful shutdown
		ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
		defer stop()

		fmt.Print("Running in continuous mode. Press Ctrl+C to stop.\n\n")
		manager := orchestrator.NewRunnerManager(apiURL, apiKey, pollInterval, time.Duration(cfg.Runner.HeartbeatSec)*time.Second, availableModels, syncer, agentFlag)
		if err := manager.Start(ctx, agents); err != nil {
			fmt.Print("\n\033[33m[runner] Shutdown signal received...\033[0m\n")
			gracefulShutdown(agents, apiURL, apiKey)
			return err
		}
		fmt.Println("[runner] Goodbye.")
		return nil
	},
}

func gracefulShutdown(agents []config.AgentConfig, apiURL, apiKey string) {
	if task, agent, ok := runner.GetActiveTask(); ok {
		shortID := task.ID
		if len(shortID) > 8 {
			shortID = shortID[:8]
		}
		fmt.Printf("  [%s] Aborting active task %s...\n", agent.Name, shortID)
		client := api.NewClient(apiURL, apiKey, agent.Name)
		client.Patch("/tasks/"+task.ID, map[string]interface{}{
			"status":      "BLOCKED",
			"blockReason": "Runner stopped",
		})
	}

	for _, agent := range agents {
		client := api.NewClient(apiURL, apiKey, agent.Name)
		runner.SendHeartbeat(client, agent, "OFFLINE")
	}
}

func formatAgents(agents []config.AgentConfig) string {
	names := ""
	for i, a := range agents {
		if i > 0 {
			names += ", "
		}
		names += fmt.Sprintf("%s (%s)", a.Name, a.Tool)
	}
	return names
}

func init() {
	runCmd.Flags().BoolVarP(&once, "once", "", false, "run once and exit (no continuous polling)")
	runCmd.Flags().StringVar(&apiKeyFlag, "api-key", "", "API key (overrides config/env)")
	runCmd.Flags().StringVar(&apiURLFlag, "api-url", "", "API URL (overrides config)")
	runCmd.Flags().StringVar(&agentFlag, "agent", "", "run only this agent by name (e.g. --agent reviewer)")
	runCmd.Flags().BoolVar(&debugFlag, "debug", false, "enable verbose debug logging for API, claim, git and executor events")
	rootCmd.AddCommand(runCmd)
}
