# UbuntuSafe

UbuntuSafe includes an Android app and a PostgreSQL-backed API. This guide covers local Windows setup and starting the API for a phone on the same Wi-Fi network.

## Start the API on Windows

1. Install Node.js LTS, enable pnpm with `corepack enable`, and install PostgreSQL as a Windows service.
2. From the project folder, install dependencies:

   ```powershell
   pnpm install
   ```

3. Copy `.env.example` to `.env` in the project root. Edit `.env` locally to set `DATABASE_URL` for your PostgreSQL database and a strong `SESSION_SECRET`. Keep `.env` private; do not paste its values into commands, screenshots, or support messages.
4. Make sure the PostgreSQL service is running. The launcher checks it before continuing.
5. From the project root, run the API with one command:

   ```powershell
   pnpm start:windows
   ```

   The launcher confirms the root `.env` exists without showing its contents, applies database migrations, starts the API, and checks `http://127.0.0.1:8080/api/healthz`. It reports `HEALTHY` only when the API and database respond successfully. The API remains running in its own console window. Use `Ctrl+C` in that window to stop it.

If PostgreSQL is installed but stopped, open Windows Services (`services.msc`), start the PostgreSQL service, then rerun the command. If the health check fails, check the API console window and the local PostgreSQL service.

## Connect an Android phone over Wi-Fi

1. Keep the phone and computer on the same Wi-Fi network and install Expo Go on the Android phone.
2. Leave `EXPO_PUBLIC_API_URL` blank in `artifacts/ubuntusafe-mobile/.env` to let the app detect the API computer from the Expo LAN connection.
3. Open a second terminal in the project root and run:

   ```powershell
   pnpm --filter @workspace/ubuntusafe-mobile run dev:lan
   ```

   Scan the QR code with Expo Go. Keep both the API console and this Expo console open. This local LAN script is for running on your own computer; the hosted preview uses its existing managed workflow.
4. If Windows Firewall blocks the connection, allow Node.js on **Private networks** only in Windows Defender Firewall. If you need a manual inbound rule, open PowerShell as Administrator and run:

   ```powershell
   New-NetFirewallRule -DisplayName "UbuntuSafe API 8080" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private
   ```

Do not expose this development API on a public network. The database and other provider settings belong in the root `.env`; the launcher does not contain or print passwords.

If automatic detection is unavailable, set `EXPO_PUBLIC_API_URL` to `http://<computer-wi-fi-ip>:8080` using your computer's current IPv4 address from `ipconfig`, then restart the Expo terminal. Never use `localhost` as the phone's API address.

## Terminal checklist

Run all commands from the project root.

| Terminal | Command | Purpose |
| --- | --- | --- |
| Setup, once | `pnpm install` | Restore dependencies |
| API on Windows | `pnpm start:windows` | Apply migrations, open the API console, and check database health |
| Mobile, second terminal | `pnpm --filter @workspace/ubuntusafe-mobile run dev:lan` | Start the local Expo Go LAN preview |
| Checks, optional terminal | `pnpm typecheck` followed by `pnpm test` | Run TypeScript and existing scanner tests |
| Database maintenance | `pnpm --filter @workspace/api-server run db:migrate` | Apply the included non-destructive schema migrations |

For a manually started API, use `pnpm --filter @workspace/api-server run dev` with a configured root `.env`. Do not run it alongside the API console already opened by `pnpm start:windows`.

## Software and editor extensions

- Required on the computer: Node.js LTS, pnpm, and a running PostgreSQL server.
- Required on an Android phone for this development preview: Expo Go compatible with the project's Expo SDK.
- No VS Code extension is required to run the app. Recommended extensions are **Expo Tools** (`expo.vscode-expo-tools`) and **Prettier** (`esbenp.prettier-vscode`). TypeScript/JavaScript support is built into VS Code.
- Android Studio is optional for an Android emulator; it is not needed for a physical phone using Expo Go.
- Keep `DATABASE_URL`, `SESSION_SECRET`, SMTP settings, provider keys, and separate administrator credentials private in your root `.env` locally or the workspace's secrets settings.

## Email verification and service checks

For the standalone VS Code edition, use the Windows setup below. Gemini and Gmail connect directly using your private backend `.env`; SMS is optional and disabled by default. No managed provider connector is needed. Gemini replaces OpenAI for scanning, OCR and transcription; no OpenAI fallback is used.

New registrations must verify a six-digit email code before signing in. Codes expire after 10 minutes, permit five failed attempts, and are single-use. Resends have a one-minute cooldown. If the email provider rejects delivery, the account remains pending and the app offers a resend path; it does not claim a code was sent.

The additive migration preserves access for pre-existing accounts without falsely marking their email addresses as verified. It also adds session versions so a successful password reset invalidates old sessions.

Check provider access without printing credentials or sending to an arbitrary recipient:

```sh
pnpm --filter @workspace/api-server run services:check
```

This performs a small real AI request and checks SMTP connectivity/authentication. SMS is optional and disabled by default: set SMS_ENABLED=false and leave TWILIO_* empty. Verification and mobile password recovery use email. Disabled SMS does not contact Twilio or fail readiness; enabled SMS still checks the account/sender. Provider acceptance is not proof of recipient delivery.

Run the controlled integration suite against a **development database only**:

```sh
pnpm --filter @workspace/api-server run test:integration
```

The suite uses isolated SMTP/AI fixture servers, creates only synthetic accounts, and cleans up its own records. These tests do not certify live third-party delivery or physical Android recording/upload/OCR. The known upstream Expo tooling and transitive dependency security findings are not a production security clearance.

## Windows VS Code setup

Requirements: Node.js 24 LTS or newer, PostgreSQL running with your existing `ubuntusafe` database, VS Code and a compatible Expo Go client. pgAdmin 4 manages PostgreSQL; it is not the database engine. Optional VS Code extensions: Expo Tools, Prettier, React Native Tools.

Back up your old folder and `.env` before updating. Keep DATABASE_URL and SESSION_SECRET to preserve access to the same data. Do not drop/recreate the database. The archive is source, not an APK, and contains no credentials or installed dependencies.

Open the extracted root folder (the one containing package.json) in VS Code:

```powershell
cd C:\UbuntuSafe-Application
node --version
npm.cmd install -g pnpm@10.26.1
pnpm.cmd install --frozen-lockfile
if (!(Test-Path .env)) { Copy-Item .env.example .env }
```

Edit `.env` privately. A typical configuration is:

```env
DATABASE_URL=postgresql://postgres:YOUR_DATABASE_PASSWORD@localhost:5432/ubuntusafe
PORT=8080
SESSION_SECRET=YOUR_EXISTING_OR_GENERATED_SECRET
UBUNTUSAFE_ADMIN_EMAIL=YOUR_ADMIN_EMAIL
UBUNTUSAFE_ADMIN_PASSWORD=YOUR_STRONG_ADMIN_PASSWORD
GEMINI_API_KEY=YOUR_GOOGLE_AI_STUDIO_KEY
GEMINI_MODEL=gemini-3.1-flash-lite
GEMINI_SCAN_MODEL=gemini-3.1-flash-lite
GEMINI_VISION_MODEL=gemini-3.1-flash-lite
GEMINI_TRANSCRIPTION_MODEL=gemini-3.1-flash-lite
SMTP_HOST=smtp.gmail.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=YOUR_GMAIL_ADDRESS
SMTP_PASS=YOUR_GOOGLE_APP_PASSWORD
EMAIL_FROM=YOUR_GMAIL_ADDRESS
SMS_ENABLED=false
EXPO_PUBLIC_API_URL=
```

Use the PostgreSQL server password, not the pgAdmin master password. URL-encode reserved characters in it. For a new installation only, generate SESSION_SECRET locally with:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

For Gmail, enable 2-Step Verification and create an app password at https://myaccount.google.com/apppasswords. SMTP_PASS is that app password, not the Google login password. Keep EMAIL_FROM the same as SMTP_USER. Gmail allows port465/secure=true or port587/secure=false with required STARTTLS. Google account policies may restrict app passwords.

For Gemini, obtain your own API key at https://aistudio.google.com/apikey. Keep it server-side, never in an EXPO_PUBLIC_* variable. Per-feature model settings may be blank to inherit GEMINI_MODEL.

### Does free Gemini expire?

The Gemini API Free tier is not a fixed 30-/90-day trial. It can continue while your project/model/region remain eligible and requests stay within quotas. Google may change limits or retire a model; free access is not guaranteed forever. Daily request quotas reset at midnight Pacific time; shorter rate limits have shorter windows. See your actual project limits at https://aistudio.google.com/rate-limit.

Keep the project on the Free tier if you do not want paid API usage. Enabling paid billing can make requests billable; this app does not upgrade the account or fall back to a paid provider. Unpaid-service submissions may be used to improve Google's products: use synthetic/redacted examples, not confidential/sensitive/private data.

Official information: https://ai.google.dev/gemini-api/docs/billing, https://ai.google.dev/gemini-api/docs/pricing, https://ai.google.dev/gemini-api/terms.

### Terminal 1 — API

```powershell
pnpm.cmd db:migrate
pnpm.cmd dev:api
```

Keep it running. Migrations are additive; the recovery update adds an audit table. Back up important existing data before migrations. Restart the API after editing `.env`.

### Terminal 2 — mobile live preview

```powershell
cd C:\UbuntuSafe-Application
pnpm.cmd dev:mobile
```

Keep it running. Connect laptop and phone to the same Wi-Fi and scan the QR code in compatible Expo Go. Press `w` for browser preview. Allow Node through the Windows firewall on Private networks. Leave EXPO_PUBLIC_API_URL blank for automatic LAN detection; if needed use the laptop's reachable LAN URL and port8080, not localhost on the phone. Restart Expo after changing EXPO_PUBLIC_* settings.

### Terminal 3 — checks and real delivery

```powershell
cd C:\UbuntuSafe-Application
pnpm.cmd typecheck
pnpm.cmd test
pnpm.cmd services:check
Invoke-RestMethod -Uri "http://localhost:8080/api/healthz" -TimeoutSec 10
```

Expected readiness: Gemini connected, email connected, SMS disabled. This does not send email or prove inbox receipt. For your own inbox only:

```powershell
pnpm.cmd services:test-delivery --confirm-send --email-to YOUR_EMAIL_ADDRESS
```

Check inbox/spam for the message. Never post `.env`, passwords or keys in chat.

## Automatic backups, user/admin restore and GitHub

Read **[BACKUP-RESTORE.md](BACKUP-RESTORE.md)** for the encryption key, PostgreSQL tool paths, daily Windows tasks, separate-empty-database disaster recovery and private GitHub source backup setup. The app's Backups and restore page shows real backup status and recoverable records.

Automatic backups require a configured encryption key and writable private folder. A local file is not protection against losing the computer: keep encrypted copies off-device and the key separately. Administrator/provider `.env` settings need separate secure storage; they are intentionally not in the database or GitHub backups. GitHub and Windows task scheduling are included as scripts, not connected/activated until you run local setup.

## Check the connection in the app

Before signing in, open the **API connection** check on the sign-in screen (it is also available in Settings). It shows the app's configured API URL and tests `/api/healthz`:

- **Connected** means the API and PostgreSQL are responding.
- **Database unavailable** means the API is running but cannot reach PostgreSQL. Start/check the PostgreSQL service and review the API console.
- **API not reachable** means the API may be stopped. If it is running on the laptop, the phone cannot reach it at the configured address; confirm both devices are on the same Wi-Fi, use the laptop's Wi-Fi IPv4 address rather than `localhost`, and allow Node.js through Windows Firewall on Private networks.
- **API reported an error** means a server answered, but the health check failed. Confirm the URL points to this app's API and check its console.

The phone cannot tell whether an unresponsive laptop API is stopped or blocked by the network from the phone alone, so the check explains both possibilities. URL credentials and query parameters are hidden in the app's display.
