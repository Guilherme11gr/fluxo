package cmd

import (
	"fmt"

	"github.com/fluxo-app/fluxo-runner/internal/version"
	"github.com/spf13/cobra"
)

var cfgFile string

var rootCmd = &cobra.Command{
	Use:   "fluxo-runner",
	Short: "FluXo Runner — autonomous agent that polls and executes tasks from FluXo",
	Long: `FluXo Runner is a CLI worker that connects to a FluXo instance,
polls for pending tasks, and executes them using Claude Code or OpenCode.

It supports continuous polling mode, single-execution mode, and graceful
shutdown with task handoff.`,
	Version: version.String(),
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Printf("\033[31mError: %v\033[0m\n", err)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "config file (default is ./config.yaml)")
}
