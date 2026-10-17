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

1. On the Windows computer, run `ipconfig` and find the IPv4 address for the active Wi-Fi adapter (for example, `192.168.1.20`).
2. In `artifacts/ubuntusafe-mobile/.env`, set `EXPO_PUBLIC_API_URL` to `http://<computer-wi-fi-ip>:8080`, replacing the example with the actual address. Do not use `localhost` or `127.0.0.1` in the phone's setting.
3. Keep the phone and computer on the same Wi-Fi network. Restart the mobile app after changing its `.env`.
4. If Windows Firewall blocks the connection, allow Node.js on **Private networks** only in Windows Defender Firewall. If you need a manual inbound rule, open PowerShell as Administrator and run:

   ```powershell
   New-NetFirewallRule -DisplayName "UbuntuSafe API 8080" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 8080 -Profile Private
   ```

Do not expose this development API on a public network. The database and other provider settings belong in the root `.env`; the launcher does not contain or print passwords.
