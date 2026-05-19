package profiler

import (
	"fmt"
	"regexp"
	"strings"
)

const redactedPlaceholder = "[REDACTED]"

// SecretPattern defines a regex pattern for detecting secrets.
type SecretPattern struct {
	Name    string
	Pattern *regexp.Regexp
}

// Common secret patterns for redaction.
var secretPatterns = []SecretPattern{
	{
		Name: "AWS Access Key",
		Pattern: regexp.MustCompile(`AKIA[0-9A-Z]{16}`),
	},
	{
		Name: "AWS Secret Key",
		Pattern: regexp.MustCompile(`(?i)aws_secret_access_key\s*=\s*['"]?[A-Za-z0-9/+=]{40}['"]?`),
	},
	{
		Name: "Generic API Key",
		Pattern: regexp.MustCompile(`(?i)(?:api[_-]?key|apikey)\s*[:=]\s*['"]?[A-Za-z0-9_-]{16,}['"]?`),
	},
	{
		Name: "Generic Secret",
		Pattern: regexp.MustCompile(`(?i)(?:secret|token)\s*[:=]\s*['"]?[A-Za-z0-9+/=_-]{16,}['"]?`),
	},
	{
		Name: "Private Key Block",
		Pattern: regexp.MustCompile(`-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----`),
	},
	{
		Name: "GitHub Token",
		Pattern: regexp.MustCompile(`ghp_[A-Za-z0-9_]{36}`),
	},
	{
		Name: "GitHub OAuth Token",
		Pattern: regexp.MustCompile(`gho_[A-Za-z0-9_]{36}`),
	},
	{
		Name: "GitHub App Token",
		Pattern: regexp.MustCompile(`(ghu|ghs)_[A-Za-z0-9]{36}`),
	},
	{
		Name: "GitHub Fine-grained PAT",
		Pattern: regexp.MustCompile(`github_pat_[A-Za-z0-9]{22}_[A-Za-z0-9]{59}`),
	},
	{
		Name: "Slack Token",
		Pattern: regexp.MustCompile(`xox[baprs]-[0-9]{10,13}-[A-Za-z0-9-]{10,32}`),
	},
	{
		Name: "Slack Webhook",
		Pattern: regexp.MustCompile(`https://hooks\.slack\.com/services/T[A-Za-z0-9]{8,12}/B[A-Za-z0-9]{8,12}/[A-Za-z0-9]{24}`),
	},
	{
		Name: "Stripe Secret Key",
		Pattern: regexp.MustCompile(`sk_live_[A-Za-z0-9]{24,}`),
	},
	{
		Name: "Stripe Publishable Key",
		Pattern: regexp.MustCompile(`pk_live_[A-Za-z0-9]{24,}`),
	},
	{
		Name: "SendGrid API Key",
		Pattern: regexp.MustCompile(`SG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}`),
	},
	{
		Name: "Twilio API Key",
		Pattern: regexp.MustCompile(`SK[0-9a-fA-F]{32}`),
	},
	{
		Name: "JWT Token",
		Pattern: regexp.MustCompile(`eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}`),
	},
	{
		Name: "Database URL with password",
		Pattern: regexp.MustCompile(`(?i)(?:postgres|mysql|mongodb|redis)://[^:]+:[^@]+@[^/\s]+`),
	},
	{
		Name: "Password assignment",
		Pattern: regexp.MustCompile(`(?i)(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]`),
	},
	{
		Name: "Bearer Token",
		Pattern: regexp.MustCompile(`(?i)bearer\s+[A-Za-z0-9\-._~+/]+=*`),
	},
	{
		Name: "Basic Auth",
		Pattern: regexp.MustCompile(`(?i)basic\s+[A-Za-z0-9+/=]{10,}`),
	},
}

// RedactSecrets scans content for common secret patterns and redacts them.
// Returns the sanitized content and a list of redacted pattern names.
func RedactSecrets(content string) (string, []string) {
	var redacted []string
	result := content

	for _, sp := range secretPatterns {
		if sp.Pattern.MatchString(result) {
			redacted = append(redacted, sp.Name)
			result = sp.Pattern.ReplaceAllString(result, redactedPlaceholder)
		}
	}

	return result, redacted
}

// RedactEnvVars redacts environment variable assignments that look like secrets.
// This handles patterns like KEY=value in .env-style files.
func RedactEnvVars(content string) (string, []string) {
	var redacted []string
	lines := strings.Split(content, "\n")
	sensitiveVarPatterns := []string{
		"SECRET", "KEY", "TOKEN", "PASSWORD", "PASS", "CREDENTIAL",
		"AUTH", "PRIVATE", "API_KEY", "APIKEY", "ACCESS_KEY",
	}

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" || strings.HasPrefix(trimmed, "#") {
			continue
		}

		// Check if line looks like VAR=value
		idx := strings.Index(trimmed, "=")
		if idx <= 0 {
			continue
		}

		varName := strings.ToUpper(strings.TrimSpace(trimmed[:idx]))
		isSensitive := false
		for _, pat := range sensitiveVarPatterns {
			if strings.Contains(varName, pat) {
				isSensitive = true
				break
			}
		}

		if isSensitive {
			redacted = append(redacted, fmt.Sprintf("env:%s", varName))
			lines[i] = trimmed[:idx+1] + redactedPlaceholder
		}
	}

	return strings.Join(lines, "\n"), redacted
}

// SanitizeContent applies all redaction strategies to file content.
// Returns sanitized content and a combined list of what was redacted.
func SanitizeContent(content string, filename string) (string, []string) {
	var allRedacted []string

	// Apply secret pattern redaction
	result, secretRedacted := RedactSecrets(content)
	allRedacted = append(allRedacted, secretRedacted...)

	// Apply env var redaction
	result, envRedacted := RedactEnvVars(result)
	allRedacted = append(allRedacted, envRedacted...)

	return result, allRedacted
}
