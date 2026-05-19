package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestFinalizeExecutionSendsProtocolAndEvidence(t *testing.T) {
	var body map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/executions/exec-1/finalize" {
			t.Fatalf("unexpected path: %s", r.URL.Path)
		}
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"exec-1"}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key", "runner")
	_, err := FinalizeExecution(client, "exec-1", FinalizeExecutionParams{
		Status:         "SUCCESS",
		CallerRoleHint: "builder",
		Evidence: map[string]interface{}{
			"artifact": map[string]interface{}{
				"gitPolicy":          "branch_only",
				"baselineHeadSha":    "abc",
				"finalHeadSha":       "def",
				"newCommitShas":      []string{"def"},
				"hasVerifiableDelta": true,
			},
		},
	})
	if err != nil {
		t.Fatalf("FinalizeExecution returned error: %v", err)
	}

	if body["expectedExecutionId"] != "exec-1" {
		t.Fatalf("expected expectedExecutionId=exec-1, got %#v", body["expectedExecutionId"])
	}
	if body["callerRoleHint"] != "builder" {
		t.Fatalf("expected callerRoleHint, got %#v", body["callerRoleHint"])
	}
	if _, ok := body["evidence"].(map[string]interface{}); !ok {
		t.Fatalf("expected evidence map, got %#v", body["evidence"])
	}
}

func TestHeartbeatExecutionSendsExpectedExecutionID(t *testing.T) {
	var body map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"id":"exec-1"}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key", "runner")
	if err := HeartbeatExecution(client, "exec-1"); err != nil {
		t.Fatalf("HeartbeatExecution returned error: %v", err)
	}
	if body["expectedExecutionId"] != "exec-1" {
		t.Fatalf("expected expectedExecutionId=exec-1, got %#v", body["expectedExecutionId"])
	}
}

func TestAppendExecutionEventsSendsExpectedExecutionID(t *testing.T) {
	var body map[string]interface{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatalf("decode request: %v", err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"created":1}}`))
	}))
	defer server.Close()

	client := NewClient(server.URL, "test-key", "runner")
	created, err := AppendExecutionEvents(client, "exec-1", []ExecutionEvent{{Seq: 1, Kind: "log", Content: "hello"}})
	if err != nil {
		t.Fatalf("AppendExecutionEvents returned error: %v", err)
	}
	if created != 1 {
		t.Fatalf("expected created=1, got %d", created)
	}
	if body["expectedExecutionId"] != "exec-1" {
		t.Fatalf("expected expectedExecutionId=exec-1, got %#v", body["expectedExecutionId"])
	}
}
