package version

import "strings"

var (
	Version   = "0.3.0"
	Commit    = "unknown"
	BuildDate = "unknown"
)

func String() string {
	parts := []string{strings.TrimSpace(Version)}
	if strings.TrimSpace(Commit) != "" && Commit != "unknown" {
		parts = append(parts, strings.TrimSpace(Commit))
	}
	if strings.TrimSpace(BuildDate) != "" && BuildDate != "unknown" {
		parts = append(parts, strings.TrimSpace(BuildDate))
	}
	return strings.Join(parts, " ")
}

func Metadata() map[string]interface{} {
	return map[string]interface{}{
		"version":   strings.TrimSpace(Version),
		"commit":    strings.TrimSpace(Commit),
		"buildDate": strings.TrimSpace(BuildDate),
	}
}
