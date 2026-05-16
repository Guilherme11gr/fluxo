package runner

import "testing"

func TestLooksLikeModelID(t *testing.T) {
	tests := []struct {
		name  string
		value string
		want  bool
	}{
		{name: "provider model", value: "github-copilot/gpt-5.4", want: true},
		{name: "claude style model", value: "claude-sonnet-4-20250514", want: true},
		{name: "openrouter style model", value: "openrouter/qwen/qwen3-coder:free", want: true},
		{name: "word sentence", value: "Unclear what to list. Here are common options:", want: false},
		{name: "plain word", value: "Which", want: false},
		{name: "markdown bullet", value: "- Files in the current directory", want: false},
		{name: "windows path", value: `D:\Users\Guilherme\Documents\development\jt-kill`, want: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := looksLikeModelID(tt.value); got != tt.want {
				t.Fatalf("looksLikeModelID(%q) = %t, want %t", tt.value, got, tt.want)
			}
		})
	}
}
