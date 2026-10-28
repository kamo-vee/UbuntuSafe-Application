# UbuntuSafe backup and recovery

## What is protected

- **Database/system:** encrypted PostgreSQL custom-format dumps contain the database schema, users and password hashes, scans, reports, feedback, and security/audit tables.
- **Users:** daily encrypted personal snapshots contain the owner's scan/report/feedback history and basic profile information. Users can restore only their own deleted or missing records. Existing active records are not overwritten.
- **Administrators:** full database backups include all users and community administration data. The admin recovery screen can restore deleted records/accounts. Restoring an account invalidates its old user sessions.
- **Application code:** a separate GitHub branch contains source/configuration templates only, never database dumps or `.env`.
- **Private configuration:** your `.env` contains administrator credentials, provider credentials, session secret and backup key. It is NOT inside the database or GitHub backup. Keep an additional encrypted copy in a trusted password manager or encrypted offline storage. Losing both `.env` and the backup key can make recovery impossible.

The app cannot recover records permanently deleted before any backup existed. Deleted records retained by the app remain recoverable until the owner deliberately removes them outside the app. There is no automatic permanent deletion of recently deleted records.

Automatic server backups cover records already synced to PostgreSQL. Unsynced edits that exist only on a lost/offline phone cannot be recovered from a server backup.

## 1. Configure encrypted backups privately

Run once in the VS Code project root:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copy the result privately into `.env`. Do not share it, put it in GitHub, or generate a new key each time.

```env
BACKUP_ENABLED=true
BACKUP_ENCRYPTION_KEY=YOUR_GENERATED_BASE64_KEY
BACKUP_DIRECTORY=private-backups
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION_DAYS=30
PG_DUMP_PATH=C:\Program Files\PostgreSQL\17\bin\pg_dump.exe
PG_RESTORE_PATH=C:\Program Files\PostgreSQL\17\bin\pg_restore.exe
```

Use the actual PostgreSQL installation folder/version on your PC. `pg_dump` must not be older than your database server. If both tools are already on PATH, leave their settings empty. **pgAdmin is a management application, not the database backup executable.**

Save the encryption key separately from the backups. Changing it does not re-encrypt old backups; old files still need the original key. AES-256-GCM encryption authenticates the file before disaster restore. Backups are created privately and only completed encrypted files appear in the app. Failed backups are not shown as successes.

Prefer a folder on an external/encrypted backup drive, e.g. `BACKUP_DIRECTORY=E:\UbuntuSafe-Backups`. It must be writable by the Windows account running the app/tasks. A relative folder is resolved from the command's working directory; the supplied launch commands and scheduled tasks use the project root.

**A backup on the same disk does not protect against disk/computer loss.** Copy completed `.usdb` and `.ussnapshot` files to another device or a trusted cloud folder. Keep the encryption key elsewhere. No cloud account or off-site copy is silently configured by this code.

## 2. Migrate safely and test

Keep your existing database and session secret. Do not reset or drop the database.

```powershell
pnpm.cmd db:migrate
pnpm.cmd backup:database
pnpm.cmd backup:status
pnpm.cmd backup:automatic
```

The first command adds the recovery audit table without deleting existing data. `backup:automatic` also creates missing/due personal snapshots. The default interval is 24 hours, checked on API startup and every 15 minutes while it is running. Backups require the computer, PostgreSQL, storage and encryption configuration to be available. No backup can run while the PC is powered off.

Completed backup files older than 30 days are pruned after a new backup; at least the newest completed backup in each scope is retained. Deleted live records are not pruned. Audit entries are retained in the database.

## 3. Restore accidentally deleted records

Users: **Settings → Backups and restore**. Administrators: **Admin dashboard → Backups and restore**.

Select a deleted record, press Restore, then Confirm restore. For personal snapshots, Restore missing brings back missing/deleted records only. Active records and passwords are not overwritten by personal snapshots. The app synchronizes before/after user restores; offline edits must sync first.

A deleted account cannot sign in to restore itself: an administrator must recover it. Users on a new phone can sign in and sync existing server records without restoring the whole database.

## 4. Full database disaster recovery — separate empty database only

1. Keep the live database untouched.
2. In pgAdmin create a separate EMPTY database, for example `ubuntusafe_recovery`. Do not run migrations against it first: the full dump includes the schema.
3. In private `.env`, keep DATABASE_URL unchanged and add:

```env
RESTORE_DATABASE_URL=postgresql://postgres:YOUR_DATABASE_PASSWORD@localhost:5432/ubuntusafe_recovery
```

4. Set BACKUP_ENCRYPTION_KEY to the key used for that backup. List completed backups, then use the required confirmation flag:

```powershell
pnpm.cmd backup:status
pnpm.cmd backup:restore BACKUP_ID --confirm-empty-target
```

5. Inspect the recovery database. Check users, scans, reports and feedback before switching DATABASE_URL to it and restarting the API. Keep the original database until you are satisfied.

Restore refuses the running database and nonempty targets. PostgreSQL restores transactionally. User sessions and outstanding user reset/verification codes are invalidated afterward; users sign in or request new codes. Administrator sessions use SESSION_SECRET, so **rotate SESSION_SECRET after disaster recovery** to invalidate old administrator tokens. Keep your existing administrator/provider `.env` values to restore those connections. Remove RESTORE_DATABASE_URL when finished.

Only restore trusted backups. Never upload backups or keys into chat or a source repository.

## 5. GitHub source backup — no private data

Install Git for Windows. Create a **private, empty GitHub repository**. Configure Git name/email and authenticate locally using Git Credential Manager; do not embed a password/token in the URL or `.env`.

```powershell
git config --global user.name "YOUR_NAME"
git config --global user.email "YOUR_GIT_EMAIL"
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Backup-Source.ps1 -RepositoryUrl https://github.com/YOUR_ACCOUNT/YOUR_PRIVATE_REPOSITORY.git
```

Replace the placeholders. The first run may open GitHub authentication in your browser. It pushes the isolated source copy to `ubuntusafe-backup` without force-pushing. Inspect that branch to confirm the upload. Future manual runs:

```powershell
pnpm.cmd backup:github
```

The allowlist excludes `.env`, database dumps, private backup folders, installed dependencies, build outputs and common credential filenames. Keep real secrets out of source files as well; automated file selection cannot detect every possible hardcoded secret. A push failure is reported rather than claimed as success.

To recover code on another computer, clone the private repository, check out `ubuntusafe-backup`, install dependencies, and restore your private `.env` securely. Database recovery is separate:

```powershell
git clone --branch ubuntusafe-backup https://github.com/YOUR_ACCOUNT/YOUR_PRIVATE_REPOSITORY.git UbuntuSafe-Application
cd UbuntuSafe-Application
pnpm.cmd install --frozen-lockfile
```

## 6. Automatic Windows tasks

Only after testing database backups and the first GitHub push:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\Register-Backups.ps1
```

This registers daily database/personal backup and GitHub source backup tasks at 20:00, under your signed-in Windows account. The API itself does not need to be running for these scheduled commands. The PC, PostgreSQL, signed-in Windows session, storage, Git authentication and internet for GitHub must be available. Missed runs use Windows' StartWhenAvailable setting; check Task Scheduler history/results.

To remove the tasks:

```powershell
Unregister-ScheduledTask -TaskName UbuntuSafe-Database-Backup -Confirm
Unregister-ScheduledTask -TaskName UbuntuSafe-GitHub-Code-Backup -Confirm
```

Scheduling and GitHub cannot be activated on your computer from this workspace. The scripts are included; run and verify them locally. Periodically test restore into a separate database and confirm your off-computer copy is current.
