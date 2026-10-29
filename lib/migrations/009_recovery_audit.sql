CREATE TABLE IF NOT EXISTS recovery_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL,
  actor_role text NOT NULL,
  action text NOT NULL,
  record_kind text,
  record_id uuid,
  restored_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
