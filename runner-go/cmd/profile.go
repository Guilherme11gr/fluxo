package cmd

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"

	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/profiler"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var profileOutputJSON bool
var profileDocsDir string

var profileCmd = &cobra.Command{
	Use:   "profile",
	Short: "Profile a repository and extract minimal context",
	Long: `Profile a repository to extract minimal context for FluXo bootstrap.

Reads README, docs, and technical manifests to produce:
  - Project summary from README
  - Detected stack (languages, frameworks, databases, tools)
  - Candidate documentation files for upload
  - Suggested tags and skills

By default outputs YAML. Use --json for machine-readable output.`,
	RunE: func(cmd *cobra.Command, args []string) error {
		repoPath := "."
		if len(args) > 0 {
			repoPath = args[0]
		}

		absPath, err := filepath.Abs(repoPath)
		if err != nil {
			return fmt.Errorf("resolve path: %w", err)
		}

		repo, err := config.DetectGitRepo(absPath)
		if err != nil {
			return fmt.Errorf("detect git repo: %w", err)
		}

		if !repo.IsRepo {
			return fmt.Errorf("not a git repository: %s", absPath)
		}

		fmt.Printf("Profiling repository at %s\n\n", repo.GitRoot)

		opts := profiler.DefaultProfileOptions(repo.GitRoot)
		if profileDocsDir != "" {
			opts.DocsSubdir = profileDocsDir
		}

		result, err := profiler.Profile(opts)
		if err != nil {
			return fmt.Errorf("profile repo: %w", err)
		}

		if profileOutputJSON {
			encoder := json.NewEncoder(os.Stdout)
			encoder.SetIndent("", "  ")
			if err := encoder.Encode(result); err != nil {
				return fmt.Errorf("encode JSON: %w", err)
			}
		} else {
			data, err := yaml.Marshal(result)
			if err != nil {
				return fmt.Errorf("encode YAML: %w", err)
			}
			fmt.Print(string(data))
		}

		if len(result.Warnings) > 0 {
			fmt.Fprintf(os.Stderr, "\n\033[33mWarnings:\033[0m\n")
			for _, w := range result.Warnings {
				fmt.Fprintf(os.Stderr, "  ⚠ %s\n", w)
			}
		}

		return nil
	},
}

func init() {
	profileCmd.Flags().BoolVar(&profileOutputJSON, "json", false, "output as JSON instead of YAML")
	profileCmd.Flags().StringVar(&profileDocsDir, "docs-dir", "docs", "docs subdirectory to scan")
	rootCmd.AddCommand(profileCmd)
}
