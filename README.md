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

For the standalone full-connected VS Code edition, start with **`VSCODE-SETUP.md`**. Gemini, Gmail SMTP and Twilio connect directly using your private backend `.env`; no managed provider connector is needed. The downloadable source includes Gmail-ready defaults and explicit opt-in real delivery test commands. Gemini replaces OpenAI for scanning, OCR and transcription; no OpenAI fallback is used. Use an eligible Gemini free-tier project, respect quotas, and review Google's unpaid-service data-use terms before sending content.

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

The suite uses isolated SMTP/AI fixture servers, creates only synthetic accounts, and cleans up its own records. These tests do not certify live third-party delivery. See `VALIDATION-REPORT.md` for the latest results and remaining blockers.

## Check the connection in the app

Before signing in, open the **API connection** check on the sign-in screen (it is also available in Settings). It shows the app's configured API URL and tests `/api/healthz`:

- **Connected** means the API and PostgreSQL are responding.
- **Database unavailable** means the API is running but cannot reach PostgreSQL. Start/check the PostgreSQL service and review the API console.
- **API not reachable** means the API may be stopped. If it is running on the laptop, the phone cannot reach it at the configured address; confirm both devices are on the same Wi-Fi, use the laptop's Wi-Fi IPv4 address rather than `localhost`, and allow Node.js through Windows Firewall on Private networks.
- **API reported an error** means a server answered, but the health check failed. Confirm the URL points to this app's API and check its console.

The phone cannot tell whether an unresponsive laptop API is stopped or blocked by the network from the phone alone, so the check explains both possibilities. URL credentials and query parameters are hidden in the app's display.
