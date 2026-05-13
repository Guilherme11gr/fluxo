package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Create a config.yaml for connection (agents come from the API)",
	Long: `Interactively create a minimal config.yaml with just connection settings.

Agent profiles are fetched from the FluXo API automatically.
You can also run directly with: fluxo-runner run --api-key agk_xxx`,
	RunE: func(cmd *cobra.Command, args []string) error {
		reader := bufio.NewReader(os.Stdin)

		fmt.Println("\n\033[36m╔══════════════════════════════════════╗")
		fmt.Println("║     FluXo Runner — Setup Wizard     ║")
		fmt.Print("╚══════════════════════════════════════╝\033[0m\n\n")

		fmt.Println("Agent profiles are fetched from the FluXo API.")
		fmt.Print("Configure agents in the FluXo UI — no YAML needed.\n\n")

		fmt.Print("FluXo API URL [https://fluxo.agenda-aqui.com/api/agent]: ")
		apiURL, _ := reader.ReadString('\n')
		apiURL = strings.TrimSpace(apiURL)
		if apiURL == "" {
			apiURL = "https://fluxo.agenda-aqui.com/api/agent"
		}

		fmt.Print("API Key env var [AGENT_API_KEY]: ")
		apiKeyEnv, _ := reader.ReadString('\n')
		apiKeyEnv = strings.TrimSpace(apiKeyEnv)
		if apiKeyEnv == "" {
			apiKeyEnv = "AGENT_API_KEY"
		}

		fmt.Print("Poll interval in seconds [30]: ")
		pollStr, _ := reader.ReadString('\n')
		pollStr = strings.TrimSpace(pollStr)
		if pollStr == "" {
			pollStr = "30"
		}

		cfg := config.Config{
			Runner: config.RunnerConfig{
				APIURL:          apiURL,
				APIKeyEnv:       apiKeyEnv,
				PollIntervalSec: mustAtoi(pollStr, 30),
				HeartbeatSec:    60,
				SyncIntervalSec: 120,
			},
			// Agents intentionally left empty — fetched from API
		}

		data, err := yaml.Marshal(&cfg)
		if err != nil {
			return fmt.Errorf("failed to marshal config: %w", err)
		}

		outPath := "config.yaml"
		if err := os.WriteFile(outPath, data, 0644); err != nil {
			return fmt.Errorf("failed to write config: %w", err)
		}

		fmt.Printf("\n\033[32m✓ Config written to %s\033[0m\n", outPath)
		fmt.Println("\nSet your API key:")
		fmt.Printf("  export %s=your-api-key-here\n", apiKeyEnv)
		fmt.Println("\nThen run:")
		fmt.Println("  fluxo-runner run")
		fmt.Println("\nOr skip config entirely:")
		fmt.Println("  fluxo-runner run --api-key agk_xxx")
		return nil
	},
}

func mustAtoi(s string, def int) int {
	var n int
	fmt.Sscanf(s, "%d", &n)
	if n == 0 {
		return def
	}
	return n
}

func init() {
	rootCmd.AddCommand(initCmd)
}