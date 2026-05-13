package cmd

import (
	"bytes"
	"fmt"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"
)

var agentsCmd = &cobra.Command{
	Use:   "agents",
	Short: "List available agent types for OpenCode",
	Long:  `List available agent types from OpenCode CLI (build, plan, explore, etc.).`,
	RunE: func(cmd *cobra.Command, args []string) error {
		return listOpenCodeAgents()
	},
}

func listOpenCodeAgents() error {
	var stdout, stderr bytes.Buffer
	cmd := exec.Command("opencode", "agent", "list")
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return fmt.Errorf("opencode agent list failed: %s\n%s", err.Error(), stderr.String())
	}

	output := strings.TrimSpace(stdout.String())
	lines := strings.Split(output, "\n")

	fmt.Println("\n\033[36mOpenCode Agent Types\033[0m")
	fmt.Println(strings.Repeat("─", 40))
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if strings.HasPrefix(line, "{") || strings.HasPrefix(line, "[") {
			continue
		}
		fmt.Printf("  \033[32m%s\033[0m\n", line)
	}

	fmt.Println("\nUse in config.yaml:")
	fmt.Println("  agent_type: \"build\"")
	fmt.Println("  agent_type: \"plan\"")
	return nil
}

func init() {
	rootCmd.AddCommand(agentsCmd)
}