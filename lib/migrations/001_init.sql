CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN
  CREATE TYPE scan_kind AS ENUM ('message','voice','email','link','job');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE scan_status AS ENUM ('safe','warning','danger');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE report_category AS ENUM ('scam','unsafe-job','suspicious-link','other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE TYPE report_status AS ENUM ('received','reviewing');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
CREATE TABLE IF NOT EXISTS ubuntu_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  email text NOT NULL UNIQUE,
  password_hash text,
  language text NOT NULL DEFAULT 'English',
  biometrics_enabled text NOT NULL DEFAULT '0',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  device_id text
);
CREATE TABLE IF NOT EXISTS scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ubuntu_users(id),
  kind scan_kind NOT NULL,
  content text NOT NULL,
  status scan_status NOT NULL,
  title text NOT NULL,
  detail text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  device_id text
);
CREATE TABLE IF NOT EXISTS community_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES ubuntu_users(id),
  category report_category NOT NULL,
  details text NOT NULL,
  status report_status NOT NULL DEFAULT 'received',
  client_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  device_id text
);
CREATE INDEX IF NOT EXISTS scans_user_updated_idx ON scans(user_id, updated_at);
CREATE INDEX IF NOT EXISTS reports_user_updated_idx ON community_reports(user_id, updated_at);
