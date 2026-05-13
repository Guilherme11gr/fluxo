package cmd

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"
)

var modelsCmd = &cobra.Command{
	Use:   "models [provider]",
	Short: "List available models for a tool",
	Long: `List available models from OpenCode or Claude Code.

Use this to discover which models you can configure in your agent profiles.

Examples:
  fluxo-runner models                # List all OpenCode models
  fluxo-runner models opencode       # List all OpenCode models
  fluxo-runner models claude         # List all Claude Code models
  fluxo-runner models zai            # List Z.AI models via OpenCode`,
	RunE: func(cmd *cobra.Command, args []string) error {
		provider := ""
		if len(args) > 0 {
			provider = args[0]
		}

		switch {
		case provider == "" || provider == "opencode":
			return listOpenCodeModels()
		case provider == "claude":
			return listClaudeModels()
		default:
			return listOpenCodeModelsByProvider(provider)
		}
	},
}

func listOpenCodeModels() error {
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("opencode", "models")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("opencode models failed: %s\n%s", err.Error(), stderr.String())
	}

	models := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	fmt.Println("\n\033[36mOpenCode Available Models\033[0m")
	fmt.Println(strings.Repeat("─", 50))

	providers := map[string][]string{}
	for _, m := range models {
		m = strings.TrimSpace(m)
		if m == "" {
			continue
		}
		parts := strings.SplitN(m, "/", 2)
		prov := "unknown"
		if len(parts) == 2 {
			prov = parts[0]
		}
		providers[prov] = append(providers[prov], m)
	}

	for prov, models := range providers {
		provLabel := prov
		if provLabel == "unknown" {
			provLabel = "other"
		}
		fmt.Printf("\n\033[33m%s\033[0m (%d models)\n", provLabel, len(models))
		for _, m := range models {
			fmt.Printf("  %s\n", m)
		}
	}

	fmt.Printf("\n\033[32mTotal: %d models\033[0m\n", len(models))
	fmt.Println("\nUse model names in config.yaml, e.g.:")
	fmt.Println("  model: \"zai-coding-plan/glm-5.1\"")
	fmt.Println("  model: \"openrouter/anthropic/claude-sonnet-4\"")
	return nil
}

func listOpenCodeModelsByProvider(provider string) error {
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("opencode", "models", provider)
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("opencode models %s failed: %s\n%s", provider, err.Error(), stderr.String())
	}

	models := strings.Split(strings.TrimSpace(stdout.String()), "\n")
	fmt.Printf("\n\033[36mOpenCode Models — %s\033[0m\n", provider)
	fmt.Println(strings.Repeat("─", 50))
	for _, m := range models {
		m = strings.TrimSpace(m)
		if m != "" {
			fmt.Printf("  %s\n", m)
		}
	}
	return nil
}

func listClaudeModels() error {
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("claude", "--print", "list models", "--output-format", "text")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		fmt.Println("\n\033[33mClaude Code not available or failed.\033[0m")
		fmt.Printf("Error: %s\n", err.Error())
		fmt.Println("\nTo see Claude models, install Claude Code CLI:")
		fmt.Println("  npm install -g @anthropic-ai/claude-code")
		return nil
	}

	output := strings.TrimSpace(stdout.String())
	models := strings.Split(output, "\n")

	fmt.Println("\n\033[36mClaude Code Available Models\033[0m")
	fmt.Println(strings.Repeat("─", 50))
	for _, m := range models {
		m = strings.TrimSpace(m)
		if m != "" {
			fmt.Printf("  %s\n", m)
		}
	}

	fmt.Println("\nUse model names in config.yaml:")
	fmt.Println("  tool: claude")
	fmt.Println("  model: \"claude-sonnet-4-20250514\"")
	return nil
}

func init() {
	rootCmd.AddCommand(modelsCmd)
}