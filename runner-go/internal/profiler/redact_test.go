package profiler

import (
	"strings"
	"testing"
)

func TestRedactSecrets_AWSKeys(t *testing.T) {
	content := `
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
`
	result, redacted := RedactSecrets(content)

	if len(redacted) == 0 {
		t.Error("expected some secrets to be redacted")
	}

	if strings.Contains(result, "AKIAIOSFODNN7EXAMPLE") {
		t.Error("AWS access key should be redacted")
	}
}

func TestRedactSecrets_APIKeys(t *testing.T) {
	content := `
api_key = "sk-1234567890abcdef1234567890abcdef"
SECRET_TOKEN=mysecrettoken1234567890
`
	result, redacted := RedactSecrets(content)

	if len(redacted) == 0 {
		t.Error("expected secrets to be redacted")
	}

	if strings.Contains(result, "sk-1234567890abcdef1234567890abcdef") {
		t.Error("API key should be redacted")
	}
}

func TestRedactSecrets_PrivateKey(t *testing.T) {
	content := `
-----BEGIN RSA PRIVATE KEY-----
MIIEpAIBAAKCAQEA0Z3VS5JJcds3xfn/ygWyF8PbnGy0AHB7MaU8xKwwKU9dHDff
SgEYDWU+V6NjMfE8gP7Pm9p7Q6x7HqKqP7sKqP7sKqP7sKqP7sKqP7sKqP7sKqP7s
-----END RSA PRIVATE KEY-----
`
	result, redacted := RedactSecrets(content)

	if len(redacted) == 0 {
		t.Error("expected private key to be redacted")
	}

	if strings.Contains(result, "BEGIN RSA PRIVATE KEY") {
		t.Error("Private key block should be redacted")
	}
}

func TestRedactSecrets_GitHubTokens(t *testing.T) {
	content := `
GITHUB_TOKEN=ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij
`
	result, redacted := RedactSecrets(content)

	if len(redacted) == 0 {
		t.Error("expected GitHub token to be redacted")
	}

	if strings.Contains(result, "ghp_") {
		t.Error("GitHub token should be redacted")
	}
}

func TestRedactSecrets_DatabaseURL(t *testing.T) {
	content := `
DATABASE_URL=postgres://user:supersecretpassword@localhost:5432/mydb
`
	result, redacted := RedactSecrets(content)

	if len(redacted) == 0 {
		t.Error("expected database URL to be redacted")
	}

	if strings.Contains(result, "supersecretpassword") {
		t.Error("Database password should be redacted")
	}
}

func TestRedactSecrets_NoSecrets(t *testing.T) {
	content := `
# This is a normal file
# With no secrets
Just some documentation
`
	result, redacted := RedactSecrets(content)

	if len(redacted) > 0 {
		t.Errorf("expected no redactions, got %v", redacted)
	}

	if result != content {
		t.Error("content should be unchanged when no secrets present")
	}
}

func TestRedactEnvVars_SensitiveVars(t *testing.T) {
	content := `
DB_HOST=localhost
DB_PORT=5432
DB_PASSWORD=supersecret123
API_KEY=sk-1234567890abcdef
NORMAL_VAR=hello
`
	result, redacted := RedactEnvVars(content)

	if len(redacted) < 2 {
		t.Errorf("expected at least 2 redactions, got %d", len(redacted))
	}

	if strings.Contains(result, "supersecret123") {
		t.Error("DB_PASSWORD should be redacted")
	}

	if strings.Contains(result, "sk-1234567890abcdef") {
		t.Error("API_KEY should be redacted")
	}

	if !strings.Contains(result, "DB_HOST=localhost") {
		t.Error("DB_HOST should not be redacted")
	}

	if !strings.Contains(result, "NORMAL_VAR=hello") {
		t.Error("NORMAL_VAR should not be redacted")
	}
}

func TestRedactEnvVars_CommentsAndEmpty(t *testing.T) {
	content := `
# This is a comment
SECRET_KEY=mysecret

# Another comment
PUBLIC_URL=https://example.com
`
	result, redacted := RedactEnvVars(content)

	if len(redacted) != 1 {
		t.Errorf("expected 1 redaction, got %d", len(redacted))
	}

	if !strings.Contains(result, "# This is a comment") {
		t.Error("Comments should be preserved")
	}

	if strings.Contains(result, "mysecret") {
		t.Error("SECRET_KEY value should be redacted")
	}
}

func TestSanitizeContent_Combined(t *testing.T) {
	content := `
# Config file
API_KEY=sk-1234567890abcdef1234567890abcdef
DATABASE_URL=postgres://user:password@localhost/db
NORMAL_VAR=hello
`
	result, redacted := SanitizeContent(content, "config.env")

	if len(redacted) == 0 {
		t.Error("expected some redactions")
	}

	if strings.Contains(result, "sk-1234567890abcdef") {
		t.Error("API key should be redacted")
	}

	if strings.Contains(result, "password@localhost") {
		t.Error("Database password should be redacted")
	}

	if !strings.Contains(result, "NORMAL_VAR=hello") {
		t.Error("Normal vars should be preserved")
	}
}

func TestSanitizeContent_Empty(t *testing.T) {
	result, redacted := SanitizeContent("", "empty.txt")

	if len(redacted) > 0 {
		t.Error("expected no redactions for empty content")
	}

	if result != "" {
		t.Error("expected empty result")
	}
}
