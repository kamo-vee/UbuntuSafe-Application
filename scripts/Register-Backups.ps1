[CmdletBinding()]
param()
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$pnpm = (Get-Command pnpm.cmd -ErrorAction Stop).Source
$trigger = New-ScheduledTaskTrigger -Daily -At "20:00"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId ([System.Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive
$command = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/d /c `"`"$pnpm`" backup:automatic`"" -WorkingDirectory $root
Register-ScheduledTask -TaskName "UbuntuSafe-Database-Backup" -Action $command -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
$script = Join-Path $PSScriptRoot "Backup-Source.ps1"
$source = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$script`" -NonInteractive" -WorkingDirectory $root
Register-ScheduledTask -TaskName "UbuntuSafe-GitHub-Code-Backup" -Action $source -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
Write-Host "Daily tasks registered for 20:00 under your Windows account. The PC, PostgreSQL and user session must be available."
Write-Host "Configure and test the encryption key and GitHub repository FIRST. Review failures in Windows Task Scheduler."
