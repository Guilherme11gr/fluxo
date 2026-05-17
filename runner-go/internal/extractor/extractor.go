package extractor

import (
	"context"
	"fmt"
	"os"
	"strings"
)

const (
	SourceExtracted = "extracted"
)

type StructuredResultExtractor interface {
	Name() string
	Provider() string
	Model() string
	Extract(ctx context.Context, req ExtractRequest) (*ExtractResult, error)
}

type Config struct {
	Enabled       bool
	Provider      string
	Model         string
	APIKeyEnv     string
	APIKey        string
	TimeoutSec    int
	MaxInputChars int
}

func (c Config) ResolvedModel() string {
	if strings.TrimSpace(c.Model) != "" {
		return strings.TrimSpace(c.Model)
	}
	if strings.ToLower(strings.TrimSpace(c.Provider)) == "gemini" {
		return "gemini-3.1-flash-lite"
	}
	return ""
}

func (c Config) ResolvedTimeoutSec() int {
	if c.TimeoutSec <= 0 {
		return 20
	}
	return c.TimeoutSec
}

func (c Config) ResolvedMaxInputChars() int {
	if c.MaxInputChars <= 0 {
		return 30000
	}
	return c.MaxInputChars
}

func NewExtractor(cfg Config) (StructuredResultExtractor, error) {
	if !cfg.Enabled {
		return &NoopExtractor{}, nil
	}

	apiKey := cfg.APIKey
	if apiKey == "" && cfg.APIKeyEnv != "" {
		apiKey = os.Getenv(cfg.APIKeyEnv)
	}
	if strings.TrimSpace(apiKey) == "" {
		return nil, fmt.Errorf("extractor: no API key configured (set api_key_env or api_key)")
	}

	provider := strings.ToLower(strings.TrimSpace(cfg.Provider))
	switch provider {
	case "gemini":
		return NewGeminiExtractor(apiKey, cfg.ResolvedModel(), cfg.ResolvedTimeoutSec(), cfg.ResolvedMaxInputChars()), nil
	case "noop", "":
		return &NoopExtractor{}, nil
	default:
		return nil, fmt.Errorf("extractor: unknown provider %q", cfg.Provider)
	}
}
