package cmd

import (
	"bufio"
	"fmt"
	"os"
	"strings"

	"github.com/fluxo-app/fluxo-runner/internal/config"
	"github.com/fluxo-app/fluxo-runner/internal/integration"
	"github.com/spf13/cobra"
	"gopkg.in/yaml.v3"
)

var initProject bool
var initDryRun bool

var initCmd = &cobra.Command{
	Use:   "init",
	Short: "Create config for the runner",
	Long: `Create configuration for the FluXo Runner.

Without flags: creates a minimal config.yaml with connection settings.
With --project: interactive project bootstrap that links the current git repo
to a FluXo project and writes local config.
With --project --dry-run: previews all changes without writing any files.

Agent profiles are fetched from the FluXo API automatically.
You can also run directly with: fluxo-runner run --api-key agk_xxx`,
	RunE: func(cmd *cobra.Command, args []string) error {
		if initProject {
			return runInitProject()
		}
		return runInitConnection()
	},
}

func runInitConnection() error {
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
}

func runInitProject() error {
	reader := bufio.NewReader(os.Stdin)

	fmt.Println("\n\033[36m╔══════════════════════════════════════════╗")
	fmt.Println("║  FluXo Runner — Project Bootstrap       ║")
	fmt.Print("╚══════════════════════════════════════════╝\033[0m\n\n")

	repo, err := config.DetectGitRepo("")
	if err != nil {
		return fmt.Errorf("detect git repo: %w", err)
	}
	if !repo.IsRepo {
		return fmt.Errorf("not a git repository. Run this command inside a git repo")
	}

	fmt.Printf("  Git root: \033[36m%s\033[0m\n", repo.GitRoot)
	fmt.Printf("  Git common dir: \033[36m%s\033[0m\n", repo.CommonDir)
	fmt.Println()

	existing, err := config.LoadProjectConfig(repo)
	if err != nil {
		return fmt.Errorf("load existing project config: %w", err)
	}
	if existing != nil {
		fmt.Printf("  Existing project config found: projectId=\033[36m%s\033[0m\n", existing.ProjectID)
		fmt.Print("  Overwrite? [y/N]: ")
		overwrite, _ := reader.ReadString('\n')
		if strings.TrimSpace(strings.ToLower(overwrite)) != "y" {
			fmt.Println("  Aborted.")
			return nil
		}
		fmt.Println()
	}

	fmt.Println("Step 1: Link this repo to a FluXo project")
	fmt.Print("  FluXo Project ID: ")
	projectID, _ := reader.ReadString('\n')
	projectID = strings.TrimSpace(projectID)
	if projectID == "" {
		return fmt.Errorf("project ID is required")
	}
	fmt.Println()

	cfg := &config.ProjectConfig{
		ProjectID:    projectID,
		RepoPath:     repo.GitRoot,
		Integrations: map[string]bool{},
	}

	fmt.Println("Step 2: Provision command (optional)")
	fmt.Println("  Command to run before each execution (e.g. npm install, go mod tidy)")
	fmt.Print("  Provision command []: ")
	provCmd, _ := reader.ReadString('\n')
	provCmd = strings.TrimSpace(provCmd)
	if provCmd != "" {
		cfg.ProvisionCommand = provCmd
		fmt.Print("  Provision cache key (e.g. go.sum, package-lock.json) []: ")
		cacheKey, _ := reader.ReadString('\n')
		cfg.ProvisionCacheKey = strings.TrimSpace(cacheKey)
	}
	fmt.Println()

	fmt.Println("Step 3: Local integrations (opt-in)")
	fmt.Print("  Configure OpenCode integration? [y/N]: ")
	opencodeAns, _ := reader.ReadString('\n')
	configureOpencode := strings.TrimSpace(strings.ToLower(opencodeAns)) == "y"
	if configureOpencode {
		cfg.Integrations["opencode"] = true
	}
	fmt.Print("  Configure Claude Code integration? [y/N]: ")
	claudeAns, _ := reader.ReadString('\n')
	configureClaude := strings.TrimSpace(strings.ToLower(claudeAns)) == "y"
	if configureClaude {
		cfg.Integrations["claude"] = true
	}
	fmt.Println()

	fmt.Println("Step 4: Review")
	fmt.Printf("  Project ID: \033[36m%s\033[0m\n", cfg.ProjectID)
	fmt.Printf("  Repo path: \033[36m%s\033[0m\n", cfg.RepoPath)
	if cfg.ProvisionCommand != "" {
		fmt.Printf("  Provision: \033[36m%s\033[0m (cache: %s)\n", cfg.ProvisionCommand, cfg.ProvisionCacheKey)
	}
	integrations := []string{}
	for k, v := range cfg.Integrations {
		if v {
			integrations = append(integrations, k)
		}
	}
	if len(integrations) > 0 {
		fmt.Printf("  Integrations: \033[36m%s\033[0m\n", strings.Join(integrations, ", "))
	} else {
		fmt.Println("  Integrations: \033[90mnone\033[0m")
	}
	fmt.Println()

	fmt.Print("  Save project config? [Y/n]: ")
	saveAns, _ := reader.ReadString('\n')
	if strings.TrimSpace(strings.ToLower(saveAns)) == "n" {
		fmt.Println("  Aborted.")
		return nil
	}

	if initDryRun {
		fmt.Println("\n  \033[36m[DRY-RUN] Would save project config to:\033[0m")
		fmt.Printf("  %s\n", config.ProjectConfigPath(repo))
	} else {
		if err := config.SaveProjectConfig(repo, cfg); err != nil {
			return fmt.Errorf("save project config: %w", err)
		}

		configPath := config.ProjectConfigPath(repo)
		fmt.Printf("\n\033[32m✓ Project config saved to %s\033[0m\n", configPath)
	}

	// Scaffold integrations
	if configureOpencode || configureClaude {
		fmt.Println("\nStep 5: Scaffold integrations")

		scaffoldCfg := integration.ScaffoldConfig{
			GitRoot:   repo.GitRoot,
			ProjectID: projectID,
			DryRun:    initDryRun,
			Force:     false,
		}

		if configureOpencode {
			fmt.Println("\n  Scaffolding OpenCode integration...")
			result, err := integration.ScaffoldOpencode(scaffoldCfg)
			if err != nil {
				fmt.Printf("  \033[31m✗ OpenCode scaffolding error: %v\033[0m\n", err)
			} else {
				printScaffoldResult(result)
			}
		}

		if configureClaude {
			fmt.Println("\n  Scaffolding Claude Code integration...")
			result, err := integration.ScaffoldClaude(scaffoldCfg)
			if err != nil {
				fmt.Printf("  \033[31m✗ Claude Code scaffolding error: %v\033[0m\n", err)
			} else {
				printScaffoldResult(result)
			}
		}

		// Validate integrations
		fmt.Println("\nStep 5: Validate integrations")
		if configureOpencode {
			ok, msg := integration.Validate(integration.Opencode)
			if ok {
				fmt.Printf("  \033[32m✓ OpenCode: %s\033[0m\n", msg)
			} else {
				fmt.Printf("  \033[33m⚠ OpenCode: %s\033[0m\n", msg)
			}
		}
		if configureClaude {
			ok, msg := integration.Validate(integration.Claude)
			if ok {
				fmt.Printf("  \033[32m✓ Claude Code: %s\033[0m\n", msg)
			} else {
				fmt.Printf("  \033[33m⚠ Claude Code: %s\033[0m\n", msg)
			}
		}
	}

	fmt.Println()
	fmt.Println("Next steps:")
	fmt.Println("  1. Create or link the project in the FluXo UI")
	fmt.Println("  2. Run: fluxo-runner run --api-key agk_xxx")
	fmt.Println()
	fmt.Println("To also create a connection config.yaml, run:")
	fmt.Println("  fluxo-runner init")
	return nil
}

func mustAtoi(s string, def int) int {
	var n int
	fmt.Sscanf(s, "%d", &n)
	if n == 0 {
		return def
	}
	return n
}

func printScaffoldResult(result *integration.ScaffoldResult) {
	for _, f := range result.FilesWritten {
		fmt.Printf("  \033[32m✓ Written: %s\033[0m\n", f)
	}
	for _, f := range result.FilesSkipped {
		fmt.Printf("  \033[33m⚠ Skipped: %s\033[0m\n", f)
	}
	for _, e := range result.Errors {
		fmt.Printf("  \033[31m✗ Error: %s\033[0m\n", e)
	}
}

func init() {
	initCmd.Flags().BoolVar(&initProject, "project", false, "interactive project bootstrap (link repo to FluXo project)")
	initCmd.Flags().BoolVar(&initDryRun, "dry-run", false, "preview changes without writing any files")
	rootCmd.AddCommand(initCmd)
}
