package rag

import (
	"fmt"

	"github.com/fluxo-app/fluxo-runner/internal/api"
)

// FetchContext queries the RAG endpoint and returns formatted documentation context.
func FetchContext(client *api.Client, query, projectID string) string {
	path := fmt.Sprintf("/docs/search?q=%s&mode=chunks&limit=3", query)
	if projectID != "" {
		path += "&projectId=" + projectID
	}

	resp, err := client.Get(path)
	if err != nil {
		return "" // RAG is optional
	}

	data, ok := resp["data"].([]interface{})
	if !ok || len(data) == 0 {
		return ""
	}

	var parts []string
	for i, chunk := range data {
		m, ok := chunk.(map[string]interface{})
		if !ok {
			continue
		}
		title := "Unknown"
		if t, ok := m["docTitle"].(string); ok {
			title = t
		}
		content := ""
		if c, ok := m["content"].(string); ok {
			content = c
		}
		parts = append(parts, fmt.Sprintf("### Doc %d: %s\n%s", i+1, title, content))
	}

	if len(parts) == 0 {
		return ""
	}

	return "\n## Relevant Documentation\n\n" + joinParts(parts)
}

func joinParts(parts []string) string {
	result := ""
	for i, p := range parts {
		if i > 0 {
			result += "\n\n"
		}
		result += p
	}
	return result
}
