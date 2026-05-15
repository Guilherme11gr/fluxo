package config

// Config represents the full runner configuration.
type Config struct {
	Runner RunnerConfig  `yaml:"runner"`
	Agents []AgentConfig `yaml:"agents"`
}

// RunnerConfig holds global runner settings.
type RunnerConfig struct {
	APIURL           string `yaml:"api_url"`
	APIKeyEnv        string `yaml:"api_key_env"`
	PollIntervalSec  int    `yaml:"poll_interval_sec"`
	HeartbeatSec     int    `yaml:"heartbeat_interval_sec"`
	SyncIntervalSec  int    `yaml:"sync_interval_sec"`
}

// AgentDefaults holds default values for fields not provided by the API.
// Used in dynamic mode to fill in AgentConfig fields.
type AgentDefaults struct {
	PickStatus   string
	ClaimStatus  string
	DoneStatus   string
	Timeout      int
}

// DefaultAgentDefaults returns sensible defaults for dynamic agent config.
func DefaultAgentDefaults() AgentDefaults {
	return AgentDefaults{
		PickStatus:  "TODO",
		ClaimStatus: "DOING",
		DoneStatus:  "DONE",
		Timeout:     300,
	}
}

// AgentConfig holds per-agent settings.
type AgentConfig struct {
	Name           string `yaml:"name"`
	Tool           string `yaml:"tool"`
	Model          string `yaml:"model"`
	AgentType      string `yaml:"agent_type"`
	Role           string `yaml:"role"`
	RolePrompt     string `yaml:"role_prompt"`
	OperatingRules []string `yaml:"operating_rules"`
	OutputSchemaVersion string `yaml:"output_schema_version"`
	Variant        string `yaml:"variant"`
	ProjectID      string `yaml:"project_id"`
	AssigneeID     string `yaml:"assignee_id"`
	Workdir        string `yaml:"workdir"`
	PickStatus     string `yaml:"pick_status"`
	ClaimStatus    string `yaml:"claim_status"`
	DoneStatus     string `yaml:"done_status"`
	NextAssigneeID string `yaml:"next_assignee_id"`
	Timeout        int    `yaml:"timeout"`
	Context        string `yaml:"context"`

	// ID is the agent's remote ID from the API (not in YAML).
	// Used by the syncer to track registration state.
	ID string `yaml:"-"`

	// AvailableModels is populated at runtime by detecting installed tools.
	// Not stored in YAML — sent to the API so the web UI can use it.
	AvailableModels []string `yaml:"-"`

	// GitPolicy controls the git workflow behavior for this agent.
	GitPolicy string `yaml:"git_policy"`

	// GitBaseBranch is the protected base branch (default: main).
	GitBaseBranch string `yaml:"git_base_branch"`

	// GitAllowedPrefix restricts branch names to a given prefix.
	GitAllowedPrefix string `yaml:"git_allowed_prefix"`
}

// IsDynamic returns true when no agents are defined in config,
// meaning the runner should fetch agents from the API.
func (c *Config) IsDynamic() bool {
	return len(c.Agents) == 0
}

// GetPollInterval returns the configured poll interval with a default of 30s.
func (r *RunnerConfig) GetPollInterval() int {
	if r.PollIntervalSec <= 0 {
		return 30
	}
	return r.PollIntervalSec
}

// GetSyncInterval returns the configured sync interval with a default of 120s.
func (r *RunnerConfig) GetSyncInterval() int {
	if r.SyncIntervalSec <= 0 {
		return 120
	}
	return r.SyncIntervalSec
}
