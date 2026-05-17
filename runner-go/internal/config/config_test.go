package config

import "testing"

func TestResultExtractorConfigMergedWithExplicitDisable(t *testing.T) {
	global := &ResultExtractorConfig{
		Enabled:   boolPtr(true),
		Provider:  "gemini",
		Model:     "gemini-3.1-flash-lite",
		APIKeyEnv: "GEMINI_API_KEY",
	}
	agent := &ResultExtractorConfig{
		Enabled: boolPtr(false),
	}

	merged := global.MergedWith(agent)
	if merged == nil {
		t.Fatal("expected merged config")
	}
	if merged.IsEnabled() {
		t.Fatalf("expected explicit false to disable extractor, got %#v", merged)
	}
	if merged.Provider != "gemini" || merged.Model != "gemini-3.1-flash-lite" {
		t.Fatalf("expected non-overridden fields to be preserved, got %#v", merged)
	}
}

func TestResultExtractorConfigMergedWithInheritance(t *testing.T) {
	global := &ResultExtractorConfig{
		Enabled:       boolPtr(true),
		Provider:      "gemini",
		TimeoutSec:    12,
		MaxInputChars: 1234,
	}

	merged := global.MergedWith(nil)
	if merged == nil {
		t.Fatal("expected merged config")
	}
	if !merged.IsEnabled() {
		t.Fatalf("expected inherited enabled=true, got %#v", merged)
	}
	if merged.TimeoutSec != 12 || merged.MaxInputChars != 1234 {
		t.Fatalf("expected inherited numeric fields, got %#v", merged)
	}
	if merged == global {
		t.Fatal("expected merged config to be cloned")
	}
}

func TestResultExtractorConfigMergedWithAgentOnlyEnable(t *testing.T) {
	agent := &ResultExtractorConfig{
		Enabled:   boolPtr(true),
		Provider:  "gemini",
		Model:     "gemini-3.1-flash-lite",
		APIKeyEnv: "GEMINI_API_KEY",
	}

	merged := (*ResultExtractorConfig)(nil).MergedWith(agent)
	if merged == nil {
		t.Fatal("expected merged config")
	}
	if !merged.IsEnabled() {
		t.Fatalf("expected local enable to work without global config, got %#v", merged)
	}
	if merged.Provider != "gemini" || merged.APIKeyEnv != "GEMINI_API_KEY" {
		t.Fatalf("expected agent-only config to survive merge, got %#v", merged)
	}
}

func boolPtr(v bool) *bool {
	return &v
}
