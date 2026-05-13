package api

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

const UserAgent = "FluXo-Runner/0.3.0"

// Client is a minimal HTTP client for the FluXo Agent API.
type Client struct {
	BaseURL    string
	APIKey     string
	AgentName  string
	HTTPClient *http.Client
}

// NewClient creates a new API client.
func NewClient(baseURL, apiKey, agentName string) *Client {
	return &Client{
		BaseURL:   baseURL,
		APIKey:    apiKey,
		AgentName: agentName,
		HTTPClient: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
}

func (c *Client) doRequest(method, path string, body interface{}) (map[string]interface{}, error) {
	var bodyReader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(data)
	}

	req, err := http.NewRequest(method, c.BaseURL+path, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+c.APIKey)
	req.Header.Set("User-Agent", UserAgent)
	req.Header.Set("X-Agent-Name", c.AgentName)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("read response: %w", err)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return map[string]interface{}{
			"status": float64(resp.StatusCode),
			"raw":    string(respBody),
		}, nil
	}

	return result, nil
}

// Get performs a GET request.
func (c *Client) Get(path string) (map[string]interface{}, error) {
	return c.doRequest("GET", path, nil)
}

// Post performs a POST request.
func (c *Client) Post(path string, body interface{}) (map[string]interface{}, error) {
	return c.doRequest("POST", path, body)
}

// Patch performs a PATCH request.
func (c *Client) Patch(path string, body interface{}) (map[string]interface{}, error) {
	return c.doRequest("PATCH", path, body)
}
