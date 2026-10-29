-- Existing accounts retain access; only new registrations explicitly require verification.
ALTER TABLE ubuntu_users ADD COLUMN IF NOT EXISTS email_verified_at timestamptz;
ALTER TABLE ubuntu_users ADD COLUMN IF NOT EXISTS email_verification_required boolean NOT NULL DEFAULT false;
ALTER TABLE ubuntu_users ADD COLUMN IF NOT EXISTS session_version integer NOT NULL DEFAULT 0;
ALTER TABLE password_reset_tokens ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
CREATE TABLE IF NOT EXISTS email_verification_tokens (
  user_id uuid PRIMARY KEY REFERENCES ubuntu_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
