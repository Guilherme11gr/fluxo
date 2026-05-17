package extractor

import (
	"context"
	"fmt"
)

type NoopExtractor struct{}

func (e *NoopExtractor) Name() string    { return "noop" }
func (e *NoopExtractor) Provider() string { return "noop" }
func (e *NoopExtractor) Model() string    { return "" }

func (e *NoopExtractor) Extract(_ context.Context, _ ExtractRequest) (*ExtractResult, error) {
	return nil, fmt.Errorf("noop extractor: extraction not configured")
}
