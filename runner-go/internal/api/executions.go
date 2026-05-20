package api

import (
	"fmt"
	"time"
)

type ExecutionEvent struct {
	Seq      int                    `json:"seq"`
	Kind     string                 `json:"kind"`
	Content  string                 `json:"content"`
	Metadata map[string]interface{} `json:"metadata,omitempty"`
}

type FinalizeExecutionParams struct {
	Status              string                 `json:"status"`
	ExpectedExecutionID string                 `json:"expectedExecutionId,omitempty"`
	CallerRoleHint      string                 `json:"callerRoleHint,omitempty"`
	Disposition         map[string]interface{} `json:"disposition,omitempty"`
	Evidence            map[string]interface{} `json:"evidence,omitempty"`
	Output              string                 `json:"output,omitempty"`
	ResultSummary       string                 `json:"resultSummary,omitempty"`
	Result              map[string]interface{} `json:"result,omitempty"`
	ErrorMessage        string                 `json:"errorMessage,omitempty"`
	ExitCode            int                    `json:"exitCode,omitempty"`
	Duration            int                    `json:"duration,omitempty"`
	NextStatus          string                 `json:"nextStatus,omitempty"`
	NextAssigneeAgentID *string                `json:"nextAssigneeAgentId,omitempty"`
	BlockReason         *string                `json:"blockReason,omitempty"`
	Comment             string                 `json:"comment,omitempty"`
	Metadata            map[string]interface{} `json:"metadata,omitempty"`
}

type ExecutionSnapshot struct {
	ID       string                 `json:"id"`
	Status   string                 `json:"status"`
	TaskID   string                 `json:"taskId"`
	Metadata map[string]interface{} `json:"metadata"`
}

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

func AppendExecutionEvents(client *Client, execID string, events []ExecutionEvent) (int, error) {
	resp, err := client.Post("/executions/"+execID+"/events", map[string]interface{}{
		"expectedExecutionId": execID,
		"events":              events,
	})
	if err != nil {
		return 0, fmt.Errorf("append execution events: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return 0, fmt.Errorf("API error: %v", errMsg)
	}
	data, _ := resp["data"].(map[string]interface{})
	created, _ := data["created"].(float64)
	return int(created), nil
}

func HeartbeatExecution(client *Client, execID string) error {
	resp, err := client.Post("/executions/"+execID+"/heartbeat", map[string]interface{}{
		"expectedExecutionId": execID,
	})
	if err != nil {
		return fmt.Errorf("execution heartbeat: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return fmt.Errorf("API error: %v", errMsg)
	}
	return nil
}

func GetExecution(client *Client, execID string) (*ExecutionSnapshot, error) {
	resp, err := client.Get("/executions/" + execID)
	if err != nil {
		return nil, fmt.Errorf("get execution: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return nil, fmt.Errorf("API error: %v", errMsg)
	}
	data, ok := resp["data"].(map[string]interface{})
	if !ok || len(data) == 0 {
		return nil, nil
	}
	snapshot := &ExecutionSnapshot{}
	snapshot.ID, _ = data["id"].(string)
	snapshot.Status, _ = data["status"].(string)
	snapshot.TaskID, _ = data["taskId"].(string)
	if metadata, ok := data["metadata"].(map[string]interface{}); ok {
		snapshot.Metadata = metadata
	}
	if snapshot.ID == "" {
		return nil, nil
	}
	return snapshot, nil
}

func FinalizeExecution(client *Client, execID string, params FinalizeExecutionParams) (map[string]interface{}, error) {
	expectedExecutionID := params.ExpectedExecutionID
	if expectedExecutionID == "" {
		expectedExecutionID = execID
	}

	body := map[string]interface{}{
		"status":              params.Status,
		"expectedExecutionId": expectedExecutionID,
	}
	if params.CallerRoleHint != "" {
		body["callerRoleHint"] = params.CallerRoleHint
	}
	if params.Disposition != nil {
		body["disposition"] = params.Disposition
	}
	if params.Evidence != nil {
		body["evidence"] = params.Evidence
	}
	if params.Output != "" {
		body["output"] = params.Output
	}
	if params.ResultSummary != "" {
		body["resultSummary"] = params.ResultSummary
	}
	if params.Result != nil {
		body["result"] = params.Result
	}
	if params.ErrorMessage != "" {
		body["errorMessage"] = params.ErrorMessage
	}
	if params.ExitCode != 0 {
		body["exitCode"] = params.ExitCode
	}
	if params.Duration > 0 {
		body["duration"] = params.Duration
	}
	if params.NextStatus != "" {
		body["nextStatus"] = params.NextStatus
	}
	if params.NextAssigneeAgentID != nil {
		body["nextAssigneeAgentId"] = *params.NextAssigneeAgentID
	}
	if params.BlockReason != nil {
		body["blockReason"] = *params.BlockReason
	}
	if params.Comment != "" {
		body["comment"] = params.Comment
	}
	if params.Metadata != nil {
		body["metadata"] = params.Metadata
	}

	resp, err := client.Post("/executions/"+execID+"/finalize", body)
	if err != nil {
		return nil, fmt.Errorf("finalize execution: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return nil, fmt.Errorf("API error: %v", errMsg)
	}
	return resp, nil
}

func ReapStaleExecutions(client *Client, staleAfterMs int) error {
	body := map[string]interface{}{}
	if staleAfterMs > 0 {
		body["staleAfterMs"] = staleAfterMs
	}
	resp, err := client.Post("/executions/reap-stale", body)
	if err != nil {
		return fmt.Errorf("reap stale executions: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return fmt.Errorf("API error: %v", errMsg)
	}
	return nil
}
