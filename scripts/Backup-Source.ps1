[CmdletBinding()]
param([string]$RepositoryUrl, [switch]$NonInteractive)
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$work = Join-Path $root "private-backups\github-source"
function Get-SourceFiles([string]$Directory) {
  foreach ($item in Get-ChildItem -LiteralPath $Directory -Force) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { continue }
    if ($item.PSIsContainer) {
      if ($item.Name -notin @("node_modules","dist",".expo",".git",".cache","static-build","web-build","private-backups","generated-artifacts")) {
        Get-SourceFiles $item.FullName
      }
    } else { $item }
  }
}
if (!(Get-Command git -ErrorAction SilentlyContinue)) { throw "Install Git for Windows first." }
if ($NonInteractive) {
  $env:GIT_TERMINAL_PROMPT = "0"
  $env:GCM_INTERACTIVE = "Never"
}
if ($RepositoryUrl -and $RepositoryUrl -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') {
  throw "Use a GitHub HTTPS repository URL with no password or token in it."
}
New-Item -ItemType Directory -Force -Path $work | Out-Null
Push-Location $work
try {
  if (!(Test-Path ".git")) {
    if (!$RepositoryUrl) { throw "First run requires -RepositoryUrl https://github.com/YOUR_ACCOUNT/YOUR_PRIVATE_REPOSITORY.git" }
    git init --initial-branch=ubuntusafe-backup | Out-Null
    if ($LASTEXITCODE) { throw "Git initialization failed." }
    git remote add origin $RepositoryUrl
  } elseif ($RepositoryUrl) { git remote set-url origin $RepositoryUrl }
  $remote = git remote get-url origin
  if ($remote -notmatch '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+(?:\.git)?$') {
    throw "The backup remote must be a GitHub HTTPS URL without credentials."
  }
  # Isolated repository. Never stage the working app, secrets or a database dump.
  Get-ChildItem $work -Force | Where-Object { $_.Name -ne ".git" } | Remove-Item -Force -Recurse
  $roots = @("artifacts\api-server", "artifacts\ubuntusafe-mobile", "lib", "tests", "scripts", ".vscode")
  $extensions = @(".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json", ".yaml", ".yml", ".sql", ".css", ".png", ".jpg", ".jpeg", ".webp", ".svg", ".ttf", ".otf", ".ps1", ".py")
  foreach ($folder in $roots) {
    $base = Join-Path $root $folder
    if (!(Test-Path $base)) { continue }
    Get-SourceFiles $base | Where-Object {
      $_.FullName -notmatch '[\\/](node_modules|dist|\.expo|\.git|\.cache|static-build|web-build|private-backups|generated-artifacts)[\\/]' -and
      $_.Name -notlike ".env*" -and $extensions -contains $_.Extension.ToLowerInvariant() -and
      $_.Name -notmatch '(?i)(credential|secret|service.account|private.key|keystore)' -and
      !($_.Attributes -band [IO.FileAttributes]::ReparsePoint)
    } | ForEach-Object {
      $relative = $_.FullName.Substring($root.Length).TrimStart("\", "/")
      $target = Join-Path $work $relative
      New-Item -ItemType Directory -Force -Path (Split-Path $target -Parent) | Out-Null
      Copy-Item -LiteralPath $_.FullName -Destination $target
    }
  }
  foreach ($name in @("package.json","pnpm-lock.yaml","pnpm-workspace.yaml","tsconfig.base.json","Start-UbuntuSafe.ps1","README.md","BACKUP-RESTORE.md",".env.example",".gitignore")) {
    $path = Join-Path $root $name
    if (Test-Path $path) { Copy-Item -LiteralPath $path -Destination (Join-Path $work $name) }
  }
  git add --all
  if ($LASTEXITCODE) { throw "Git staging failed." }
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 1) {
    git commit -m "Automatic UbuntuSafe source backup"
    if ($LASTEXITCODE) { throw "Commit failed. Configure your local Git user.name and user.email." }
  }
  git push -u origin ubuntusafe-backup
  if ($LASTEXITCODE) { throw "GitHub backup failed. Check Git authentication, permissions and network. No force push was attempted." }
  Write-Host "Source code backed up to the ubuntusafe-backup branch. No .env or database backups were included."
} finally { Pop-Location }
