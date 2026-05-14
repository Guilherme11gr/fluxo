package api

import "fmt"

type RegisterRunnerParams struct {
	Hostname     string                 `json:"hostname,omitempty"`
	PID          int                    `json:"pid,omitempty"`
	Version      string                 `json:"version,omitempty"`
	Status       string                 `json:"status,omitempty"`
	Capabilities map[string]interface{} `json:"capabilities,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

type RunnerHeartbeatParams struct {
	Status       string                 `json:"status,omitempty"`
	Capabilities map[string]interface{} `json:"capabilities,omitempty"`
	Metadata     map[string]interface{} `json:"metadata,omitempty"`
}

func RegisterRunner(client *Client, params RegisterRunnerParams) (string, error) {
	body := map[string]interface{}{}
	if params.Hostname != "" {
		body["hostname"] = params.Hostname
	}
	if params.PID > 0 {
		body["pid"] = params.PID
	}
	if params.Version != "" {
		body["version"] = params.Version
	}
	if params.Status != "" {
		body["status"] = params.Status
	}
	if params.Capabilities != nil {
		body["capabilities"] = params.Capabilities
	}
	if params.Metadata != nil {
		body["metadata"] = params.Metadata
	}

	resp, err := client.Post("/runners", body)
	if err != nil {
		return "", fmt.Errorf("register runner: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return "", fmt.Errorf("API error: %v", errMsg)
	}
	data, ok := resp["data"].(map[string]interface{})
	if !ok {
		return "", fmt.Errorf("unexpected response format")
	}
	id, _ := data["id"].(string)
	if id == "" {
		return "", fmt.Errorf("missing runner id")
	}
	return id, nil
}

func HeartbeatRunner(client *Client, runnerID string, params RunnerHeartbeatParams) (map[string]interface{}, error) {
	body := map[string]interface{}{}
	if params.Status != "" {
		body["status"] = params.Status
	}
	if params.Capabilities != nil {
		body["capabilities"] = params.Capabilities
	}
	if params.Metadata != nil {
		body["metadata"] = params.Metadata
	}
	resp, err := client.Post("/runners/"+runnerID+"/heartbeat", body)
	if err != nil {
		return nil, fmt.Errorf("runner heartbeat: %w", err)
	}
	if errMsg, ok := resp["error"]; ok {
		return nil, fmt.Errorf("API error: %v", errMsg)
	}
	return resp, nil
}
