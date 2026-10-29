CREATE TABLE IF NOT EXISTS ubuntu_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  surname text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_signed_in_at timestamptz,
  deleted_at timestamptz
);
ALTER TABLE scans ADD COLUMN IF NOT EXISTS tool text;
CREATE INDEX IF NOT EXISTS scans_tool_created_idx ON scans(tool,created_at);
