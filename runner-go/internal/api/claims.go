package api

import "fmt"

type ClaimNextTaskParams struct {
	AgentID          string                 `json:"agentId"`
	RunnerInstanceID string                 `json:"runnerInstanceId"`
	PickStatus       string                 `json:"pickStatus,omitempty"`
	ClaimStatus      string                 `json:"claimStatus,omitempty"`
	ProjectID        string                 `json:"projectId,omitempty"`
	CandidateLimit   int                    `json:"candidateLimit,omitempty"`
	LeaseMs          int                    `json:"leaseMs,omitempty"`
	Tool             string                 `json:"tool,omitempty"`
	Model            string                 `json:"model,omitempty"`
	WorkspaceMode    string                 `json:"workspaceMode,omitempty"`
	WorkspaceRef     string                 `json:"workspaceRef,omitempty"`
	WorkspacePath    string                 `json:"workspacePath,omitempty"`
	Metadata         map[string]interface{} `json:"metadata,omitempty"`
}

type ClaimedTaskResponse struct {
	Task struct {
		ID          string `json:"id"`
		OrgID       string `json:"orgId"`
		ProjectID   string `json:"projectId"`
		FeatureID   string `json:"featureId"`
		LocalID     int    `json:"localId"`
		Title       string `json:"title"`
		Description string `json:"description"`
		Status      string `json:"status"`
		Type        string `json:"type"`
		Priority    string `json:"priority"`
	} `json:"task"`
	Execution struct {
		ID               string                 `json:"id"`
		OrgID            string                 `json:"orgId"`
		TaskID           string                 `json:"taskId"`
		ProjectID        string                 `json:"projectId"`
		AgentID          string                 `json:"agentId"`
		RunnerInstanceID string                 `json:"runnerInstanceId"`
		Status           string                 `json:"status"`
		Tool             string                 `json:"tool"`
		Model            string                 `json:"model"`
		Metadata         map[string]interface{} `json:"metadata"`
		StartedAt        string                 `json:"startedAt"`
	} `json:"execution"`
	Lease struct {
		ID         string `json:"id"`
		ProjectID  string `json:"projectId"`
		ExecutionID string `json:"executionId"`
		ExpiresAt  string `json:"expiresAt"`
	} `json:"lease"`
}

func ClaimNextTask(client *Client, params ClaimNextTaskParams) (*ClaimedTaskResponse, error) {
	body := map[string]interface{}{
		"agentId":          params.AgentID,
		"runnerInstanceId": params.RunnerInstanceID,
	}
	if params.PickStatus != "" {
		body["pickStatus"] = params.PickStatus
	}
	if params.ClaimStatus != "" {
		body["claimStatus"] = params.ClaimStatus
	}
	if params.ProjectID != "" {
		body["projectId"] = params.ProjectID
	}
	if params.CandidateLimit > 0 {
		body["candidateLimit"] = params.CandidateLimit
	}
	if params.LeaseMs > 0 {
		body["leaseMs"] = params.LeaseMs
	}
	if params.Tool != "" {
		body["tool"] = params.Tool
	}
	if params.Model != "" {
		body["model"] = params.Model
	}
	if params.WorkspaceMode != "" {
		body["workspaceMode"] = params.WorkspaceMode
	}
	if params.WorkspaceRef != "" {
		body["workspaceRef"] = params.WorkspaceRef
	}
	if params.WorkspacePath != "" {
		body["workspacePath"] = params.WorkspacePath
	}
	if params.Metadata != nil {
		body["metadata"] = params.Metadata
	}

	resp, err := client.Post("/tasks/claim-next", body)
	if err != nil {
		return nil, fmt.Errorf("claim next task: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return nil, fmt.Errorf("API error: %v", errMsg)
	}
	if resp["data"] == nil {
		return nil, nil
	}
	data, ok := resp["data"].(map[string]interface{})
	if !ok || len(data) == 0 {
		return nil, nil
	}

	result := &ClaimedTaskResponse{}
	if taskData, ok := data["task"].(map[string]interface{}); ok {
		result.Task.ID, _ = taskData["id"].(string)
		result.Task.OrgID, _ = taskData["orgId"].(string)
		result.Task.ProjectID, _ = taskData["projectId"].(string)
		result.Task.FeatureID, _ = taskData["featureId"].(string)
		if localID, ok := taskData["localId"].(float64); ok {
			result.Task.LocalID = int(localID)
		}
		result.Task.Title, _ = taskData["title"].(string)
		result.Task.Description, _ = taskData["description"].(string)
		result.Task.Status, _ = taskData["status"].(string)
		result.Task.Type, _ = taskData["type"].(string)
		result.Task.Priority, _ = taskData["priority"].(string)
	}
	if execData, ok := data["execution"].(map[string]interface{}); ok {
		result.Execution.ID, _ = execData["id"].(string)
		result.Execution.OrgID, _ = execData["orgId"].(string)
		result.Execution.TaskID, _ = execData["taskId"].(string)
		result.Execution.ProjectID, _ = execData["projectId"].(string)
		result.Execution.AgentID, _ = execData["agentId"].(string)
		result.Execution.RunnerInstanceID, _ = execData["runnerInstanceId"].(string)
		result.Execution.Status, _ = execData["status"].(string)
		result.Execution.Tool, _ = execData["tool"].(string)
		result.Execution.Model, _ = execData["model"].(string)
		result.Execution.StartedAt, _ = execData["startedAt"].(string)
		if metadata, ok := execData["metadata"].(map[string]interface{}); ok {
			result.Execution.Metadata = metadata
		}
	}
	if leaseData, ok := data["lease"].(map[string]interface{}); ok {
		result.Lease.ID, _ = leaseData["id"].(string)
		result.Lease.ProjectID, _ = leaseData["projectId"].(string)
		result.Lease.ExecutionID, _ = leaseData["executionId"].(string)
		result.Lease.ExpiresAt, _ = leaseData["expiresAt"].(string)
	}

	if result.Task.ID == "" {
		return nil, nil
	}
	return result, nil
}
