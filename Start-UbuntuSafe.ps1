[CmdletBinding()]
param(
  [ValidateRange(1, 65535)]
  [int]$Port = 8080,

  [ValidateRange(1, 300)]
  [int]$StartupTimeoutSeconds = 45
)

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

Write-Host "Checking the local PostgreSQL Windows service..."
$postgresServices = @(Get-Service -Name "*postgres*" -ErrorAction SilentlyContinue)
$runningPostgres = @($postgresServices | Where-Object { $_.Status -eq "Running" })
if ($runningPostgres.Count -eq 0) {
  if ($postgresServices.Count -gt 0) {
    $serviceNames = ($postgresServices | ForEach-Object { $_.Name }) -join ", "
    throw "PostgreSQL is installed but not running ($serviceNames). Start its service in Windows Services, then run this command again."
  }
  throw "No PostgreSQL Windows service was found. Install PostgreSQL as a Windows service, start it, then run this command again."
}
Write-Host "PostgreSQL is running: $($runningPostgres[0].DisplayName)"

$envFile = Join-Path $projectRoot ".env"
if (-not (Test-Path -LiteralPath $envFile -PathType Leaf)) {
  throw "The root .env file is missing. Create it from .env.example and configure it. No environment values are displayed by this launcher."
}
Write-Host "Root .env file found. Its values will not be displayed."

$pnpm = Get-Command pnpm -CommandType Application -ErrorAction SilentlyContinue
if (-not $pnpm) {
  throw "pnpm was not found. Install Node.js and enable pnpm with Corepack, then reopen PowerShell."
}

$previousPort = $env:PORT
$apiProcess = $null
try {
  Push-Location $projectRoot
  $env:PORT = [string]$Port

  Write-Host "Running UbuntuSafe database migrations..."
  & $pnpm.Source --filter @workspace/api-server run db:migrate
  if ($LASTEXITCODE -ne 0) {
    throw "Database migrations failed (exit code $LASTEXITCODE). Check PostgreSQL and the root .env configuration."
  }

  Write-Host "Starting the UbuntuSafe API on port $Port..."
  $apiProcess = Start-Process `
    -FilePath $pnpm.Source `
    -ArgumentList @("--filter", "@workspace/api-server", "run", "dev") `
    -WorkingDirectory $projectRoot `
    -PassThru

  $healthUrl = "http://127.0.0.1:$Port/api/healthz"
  $deadline = (Get-Date).AddSeconds($StartupTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if ($apiProcess.HasExited) {
      throw "The API process exited before becoming healthy. Check its console window for the startup error."
    }

    try {
      $health = Invoke-RestMethod -Uri $healthUrl -Method Get -TimeoutSec 2
      if ($health.status -eq "ok" -and $health.database -eq "ok") {
        Write-Host "API health check: HEALTHY ($healthUrl)"
        Write-Host "The API is still running in its own console window."
        exit 0
      }
    }
    catch {
      # The API may still be building or waiting for its first request.
    }
    Start-Sleep -Seconds 1
  }

  Write-Host "API health check: NOT HEALTHY after $StartupTimeoutSeconds seconds ($healthUrl)." -ForegroundColor Red
  Write-Host "The API process was started (PID $($apiProcess.Id)); check its console window for errors."
  exit 1
}
finally {
  if ($null -ne $previousPort) {
    $env:PORT = $previousPort
  }
  else {
    Remove-Item Env:PORT -ErrorAction SilentlyContinue
  }
  if (Get-Location | Where-Object { $_.Path -eq $projectRoot }) {
    Pop-Location
  }
}
