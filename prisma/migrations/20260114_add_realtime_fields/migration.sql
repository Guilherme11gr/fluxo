-- Add realtime fields to audit_logs
-- This enables event sourcing lite for real-time synchronization

-- Add sequence number for ordering and catch-up
ALTER TABLE audit_logs 
ADD COLUMN sequence_number BIGSERIAL;

-- Add actor type to distinguish between user, agent, and system events
ALTER TABLE audit_logs 
ADD COLUMN actor_type VARCHAR(20) DEFAULT 'user' 
CHECK (actor_type IN ('user', 'agent', 'system'));

-- Add client ID for deduplication across multiple tabs
ALTER TABLE audit_logs 
ADD COLUMN client_id UUID;

-- Create index for sequence-based queries (used for catch-up)
CREATE INDEX idx_audit_logs_sequence 
ON audit_logs (org_id, sequence_number DESC);

-- Create partial index for recent events (last hour) - optimized for real-time
CREATE INDEX idx_audit_logs_realtime 
ON audit_logs (org_id, created_at DESC) 
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Add unique constraint to guarantee sequence ordering per entity
-- This ensures we don't have duplicate events for the same entity update
ALTER TABLE audit_logs 
ADD CONSTRAINT uq_audit_sequence 
UNIQUE (org_id, target_type, target_id, sequence_number);

-- Set default values for existing records
-- Existing records get sequential numbers starting from 1
WITH numbered AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (
      PARTITION BY org_id, target_type, target_id 
      ORDER BY created_at
    ) as rn
  FROM audit_logs
  WHERE target_type IS NOT NULL AND target_id IS NOT NULL
)
UPDATE audit_logs
SET sequence_number = numbered.rn
FROM numbered
WHERE audit_logs.id = numbered.id
AND audit_logs.sequence_number IS NULL;

-- Add comments for documentation
COMMENT ON COLUMN audit_logs.sequence_number IS 'Monotonically increasing number for event ordering. Used for catch-up synchronization.';
COMMENT ON COLUMN audit_logs.actor_type IS 'Type of actor that triggered the event: user, agent, or system';
COMMENT ON COLUMN audit_logs.client_id IS 'Unique identifier for client/tab that sent the event. Used for deduplication.';
