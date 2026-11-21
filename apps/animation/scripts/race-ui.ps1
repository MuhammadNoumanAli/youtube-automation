<#
  Opens the Marble Race Maker form in your browser (http://127.0.0.1:4600). Close this window (or Ctrl+C) to stop it.

    powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\race-ui.ps1
    ... race-ui.ps1 -StudioRoot D:\YouTubeStudio -Port 4601

  Same safety steps as race.ps1: studio drive check, npm cache and TEMP on the studio drive for this session,
  install into apps\animation only if node_modules is missing, root package files must stay unchanged.
  Videos: <StudioRoot>\races\. Never deletes files.
#>
param(
  [string]$StudioRoot = $(if (Test-Path 'E:\') { 'E:\YouTubeStudio' } elseif (Test-Path 'D:\') { 'D:\YouTubeStudio' } else { Join-Path $env:USERPROFILE 'YouTubeStudio' }),
  [int]$Port = 4600
)
$ErrorActionPreference = 'Stop'
$ModuleDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ModuleDir '..\..')).Path

$StudioDrive = $StudioRoot.Substring(0, 2)
if (-not (Test-Path "$StudioDrive\")) { Write-Host "STOPPED: drive $StudioDrive not found. Connect the drive or pass -StudioRoot D:\YouTubeStudio" -ForegroundColor Red; exit 1 }
$TmpDir = Join-Path $StudioRoot 'tmp'
$NpmCache = Join-Path $StudioRoot 'cache\npm'
New-Item -ItemType Directory -Force -Path (Join-Path $StudioRoot 'races'), $TmpDir, $NpmCache | Out-Null
$info = Get-PSDrive -Name $StudioDrive.TrimEnd(':') -ErrorAction SilentlyContinue
if ($info -and ($info.Free / 1GB) -lt 5) { Write-Host ("WARNING: only {0:N1} GB free on {1}. Long videos need several GB." -f ($info.Free / 1GB), $StudioDrive) -ForegroundColor Yellow }

$env:npm_config_cache = $NpmCache
$env:npm_config_update_notifier = 'false'
$env:TEMP = $TmpDir
$env:TMP = $TmpDir
$env:TMPDIR = $TmpDir

$rootPkg = Join-Path $RepoRoot 'package.json'
$rootLock = Join-Path $RepoRoot 'package-lock.json'
$before = (Get-FileHash $rootPkg).Hash + (Get-FileHash $rootLock).Hash
Push-Location $ModuleDir
try {
  if (-not (Test-Path (Join-Path $ModuleDir 'node_modules\remotion'))) {
    Write-Host "Installing dependencies into apps\animation (first run only)..." -ForegroundColor Cyan
    npm ci --workspaces=false --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Write-Host "STOPPED: npm ci failed." -ForegroundColor Red; exit 1 }
  }
  $after = (Get-FileHash $rootPkg).Hash + (Get-FileHash $rootLock).Hash
  if ($before -ne $after) { Write-Host "STOPPED: root package.json or package-lock.json changed." -ForegroundColor Red; exit 1 }

  Write-Host "Starting Marble Race Maker... (keep this window open while videos are made)" -ForegroundColor Green
  Start-Job -ScriptBlock { param($p) Start-Sleep -Seconds 3; Start-Process "http://127.0.0.1:$p" } -ArgumentList $Port | Out-Null
  node race\ui\server.mjs --studio $StudioRoot --port $Port
} finally {
  Pop-Location
}
