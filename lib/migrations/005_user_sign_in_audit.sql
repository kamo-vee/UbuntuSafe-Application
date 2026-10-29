ALTER TABLE ubuntu_users ADD COLUMN IF NOT EXISTS last_signed_in_at timestamptz;
