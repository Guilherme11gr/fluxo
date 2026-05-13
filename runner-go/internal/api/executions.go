package api

import (
	"fmt"
	"time"
)

// CreateExecution sends a POST to create a new execution record (CLAIMED).
// Returns the execution ID.
func CreateExecution(client *Client, taskID, agentID, projectID, tool, model string) (string, error) {
	body := map[string]interface{}{
		"taskId":    taskID,
		"projectId": projectID,
		"agentId":   agentID,
		"startedAt": time.Now().UTC().Format(time.RFC3339),
	}
	if tool != "" {
		body["tool"] = tool
	}
	if model != "" {
		body["model"] = model
	}

	resp, err := client.Post("/executions", body)
	if err != nil {
		return "", fmt.Errorf("create execution: %w", err)
	}

	if errMsg, ok := resp["error"]; ok {
		return "", fmt.Errorf("API error: %v", errMsg)
	}

	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("unexpected response format: missing data")
	}

	id, ok := data["id"].(string)
	if !ok {
		return "", fmt.Errorf("unexpected response format: missing id")
	}

	return id, nil
}

// UpdateExecution sends a PATCH to update an execution's status and results.
func UpdateExecution(client *Client, execID string, params map[string]interface{}) error {
	resp, err := client.Patch("/executions/"+execID, params)
	if err != nil {
		return fmt.Errorf("update execution: %w", err)
	}

	if errMsg, ok := resp["error"]; ok {
		return fmt.Errorf("API error: %v", errMsg)
	}

	return nil
}