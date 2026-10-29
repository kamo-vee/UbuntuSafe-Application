ALTER TABLE ubuntu_users ADD COLUMN IF NOT EXISTS phone text;
CREATE UNIQUE INDEX IF NOT EXISTS ubuntu_users_phone_unique_idx
  ON ubuntu_users(phone) WHERE phone IS NOT NULL;
