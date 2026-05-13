package cmd

import (
	"fmt"

	"github.com/spf13/cobra"
)

const Version = "0.3.0"

var cfgFile string

var rootCmd = &cobra.Command{
	Use:   "fluxo-runner",
	Short: "FluXo Runner — autonomous agent that polls and executes tasks from FluXo",
	Long: `FluXo Runner is a CLI worker that connects to a FluXo instance,
polls for pending tasks, and executes them using Claude Code or OpenCode.

It supports continuous polling mode, single-execution mode, and graceful
shutdown with task handoff.`,
	Version: Version,
}

func Execute() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Printf("\033[31mError: %v\033[0m\n", err)
	}
}

func init() {
	rootCmd.PersistentFlags().StringVarP(&cfgFile, "config", "c", "", "config file (default is ./config.yaml)")
}
