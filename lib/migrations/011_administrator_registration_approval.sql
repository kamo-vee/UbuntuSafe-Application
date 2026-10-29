-- Existing administrator access is preserved. Public registrations explicitly
-- override this default with pending; approval is never client-controlled.
ALTER TABLE ubuntu_admins ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved';
ALTER TABLE ubuntu_admins ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE ubuntu_admins ADD COLUMN IF NOT EXISTS reviewed_by text;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname='ubuntu_admins_approval_status_check' AND conrelid='ubuntu_admins'::regclass
  ) THEN
    ALTER TABLE ubuntu_admins ADD CONSTRAINT ubuntu_admins_approval_status_check
      CHECK (approval_status IN ('pending','approved','rejected'));
  END IF;
END $$;
