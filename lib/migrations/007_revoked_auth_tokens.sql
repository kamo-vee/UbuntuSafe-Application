CREATE TABLE IF NOT EXISTS revoked_auth_tokens (
  token_hash text PRIMARY KEY,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS revoked_auth_tokens_expiry_idx
  ON revoked_auth_tokens(expires_at);
