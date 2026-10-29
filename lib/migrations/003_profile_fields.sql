ALTER TABLE ubuntu_users ADD COLUMN IF NOT EXISTS surname text NOT NULL DEFAULT '';
ALTER TABLE ubuntu_users ADD COLUMN IF NOT EXISTS date_of_birth text;
