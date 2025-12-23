-- Migration: Add parent_run_id column to agent_runs table
-- This enables hierarchical run tracking like SQLite runner
-- Run this migration if you want to track nested agent calls

ALTER TABLE agent_runs 
ADD COLUMN IF NOT EXISTS parent_run_id TEXT REFERENCES agent_runs(run_id);

CREATE INDEX IF NOT EXISTS idx_parent_run_id ON agent_runs(parent_run_id);

COMMENT ON COLUMN agent_runs.parent_run_id IS 'ID of parent run for nested agent calls';

