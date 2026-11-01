<#
  Countryballs animation module - render spike runner (Windows PowerShell 5.1+).

  What it does, in order:
    1. Read-only checks: git branch/status, free space on C:/D:/E:, Node/npm/FFmpeg versions.
    2. Stops if E: is missing, D: has < 2 GB free, or E: has < 5 GB free.
    3. Points npm cache and TEMP/TMP to E:\YouTubeStudio for THIS PowerShell session only
       (no global npm config change, nothing written to C:).
    4. Installs dependencies into apps\animation\node_modules ONLY (npm ci --workspaces=false).
       Verifies the root package.json and package-lock.json are byte-for-byte unchanged.
    5. Downloads Remotion's headless browser once (into apps\animation\node_modules\.remotion on D:).
    6. Renders E:\YouTubeStudio\spike\spike.mp4, verifies it with FFprobe, writes metrics.json and report.md.
    7. Shows git status again.

  It never deletes anything. Existing output files are kept; new ones get a timestamp suffix.
  It does not touch .env, the database, storage folders, the API or the web app.

  Run from anywhere:
    powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\spike.ps1
  Benchmark several concurrency levels:
    ... spike.ps1 -Concurrency "1,2,3"
#>
param(
  [string]$Concurrency = "2",
  [string]$StudioRoot = "E:\YouTubeStudio",
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$ModuleDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ModuleDir '..\..')).Path
$SpikeDir = Join-Path $StudioRoot 'spike'
$TmpDir = Join-Path $StudioRoot 'tmp'
$NpmCache = Join-Path $StudioRoot 'cache\npm'
$RemotionCache = Join-Path $StudioRoot 'cache\remotion'

function Section($t) { Write-Host ""; Write-Host "===== $t =====" -ForegroundColor Cyan }
function Stop-Spike($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; try { Stop-Transcript | Out-Null } catch {}; exit 1 }

# ---------- 0. E: must exist before we log anything there ----------
$StudioDrive = Split-Path -Qualifier $StudioRoot
if (-not (Test-Path "$StudioDrive\")) { Write-Host "STOPPED: drive $StudioDrive not found. Connect the external disk and retry." -ForegroundColor Red; exit 1 }
New-Item -ItemType Directory -Force -Path $SpikeDir, $TmpDir, $NpmCache, $RemotionCache | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Transcript -Path (Join-Path $SpikeDir "run-$stamp.log") | Out-Null

# ---------- 1. Git (read-only) ----------
Section 'GIT (before)'
Write-Host "Repo: $RepoRoot"
try {
  Write-Host ("Branch: " + (git -C $RepoRoot branch --show-current))
  git -C $RepoRoot status --short --branch
} catch { Write-Host "git not available: $_" -ForegroundColor Yellow }

# ---------- 2. Disk space ----------
Section 'DISK'
$drives = @{}
foreach ($d in 'C','D','E') {
  $info = Get-PSDrive -Name $d -ErrorAction SilentlyContinue
  if ($info) {
    $free = [math]::Round($info.Free / 1GB, 2); $used = [math]::Round($info.Used / 1GB, 2)
    $drives[$d] = $free
    Write-Host ("{0}:  free {1} GB  (used {2} GB)" -f $d, $free, $used)
  } else { Write-Host "${d}:  not present" }
}
if (-not $drives.ContainsKey('D') -or $drives['D'] -lt 2) { Stop-Spike "D: has less than 2 GB free (needs ~0.5 GB for node_modules + browser)." }
if (-not $drives.ContainsKey('E') -or $drives['E'] -lt 5) { Stop-Spike "E: has less than 5 GB free." }
if ($drives.ContainsKey('C') -and $drives['C'] -lt 0.5) { Write-Host "Note: C: is very low. This script writes nothing to C:." -ForegroundColor Yellow }

# ---------- 3. Tool versions ----------
Section 'VERSIONS'
Write-Host ("node   " + (node -v))
Write-Host ("npm    " + (npm -v))
try { Write-Host ("ffmpeg " + ((ffmpeg -version 2>$null) | Select-Object -First 1)) } catch { Write-Host "ffmpeg not on PATH (not required: Remotion ships its own encoder)" -ForegroundColor Yellow }

# ---------- 4. Session-only paths on E: ----------
Section 'PATHS (this session only)'
$env:npm_config_cache = $NpmCache
$env:npm_config_update_notifier = 'false'
$env:npm_config_fund = 'false'
$env:npm_config_audit = 'false'
$env:TEMP = $TmpDir
$env:TMP = $TmpDir
Write-Host "npm cache : $env:npm_config_cache"
Write-Host "TEMP/TMP  : $env:TEMP"
Write-Host "output    : $SpikeDir"

# ---------- 5. Install into apps\animation only ----------
$rootPkg = Join-Path $RepoRoot 'package.json'
$rootLock = Join-Path $RepoRoot 'package-lock.json'
$hashBefore = @{ pkg = (Get-FileHash $rootPkg).Hash; lock = (Get-FileHash $rootLock).Hash }

Push-Location $ModuleDir
try {
  if (-not $SkipInstall) {
    Section 'INSTALL (apps\animation only)'
    $sw = [Diagnostics.Stopwatch]::StartNew()
    npm ci --workspaces=false --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Stop-Spike "npm ci failed (exit $LASTEXITCODE)." }
    $sw.Stop()
    $nm = (Get-ChildItem -Recurse -Force (Join-Path $ModuleDir 'node_modules') -ErrorAction SilentlyContinue | Measure-Object -Sum Length).Sum
    Write-Host ("Installed in {0:N0} s, node_modules = {1:N0} MB" -f $sw.Elapsed.TotalSeconds, ($nm / 1MB))
  }

  $hashAfter = @{ pkg = (Get-FileHash $rootPkg).Hash; lock = (Get-FileHash $rootLock).Hash }
  if ($hashBefore.pkg -ne $hashAfter.pkg -or $hashBefore.lock -ne $hashAfter.lock) {
    Stop-Spike "Root package.json or package-lock.json changed during install. Do not commit them; restore with: git -C `"$RepoRoot`" checkout -- package.json package-lock.json"
  }
  Write-Host "Root package.json / package-lock.json unchanged: OK" -ForegroundColor Green

  # ---------- 6. Render + FFprobe + metrics ----------
  Section 'RENDER'
  node scripts\render-spike.mjs --out (Join-Path $SpikeDir 'spike.mp4') --cache $RemotionCache --concurrency $Concurrency --drives "C:\,D:\,E:\"
  $renderExit = $LASTEXITCODE
  $browserDir = Join-Path $ModuleDir 'node_modules\.remotion'
  if (Test-Path $browserDir) {
    $b = (Get-ChildItem -Recurse -Force $browserDir | Measure-Object -Sum Length).Sum
    Write-Host ("Headless browser on D: = {0:N0} MB" -f ($b / 1MB))
  }
} finally {
  Pop-Location
}

# ---------- 7. Git (after) ----------
Section 'GIT (after)'
try { git -C $RepoRoot status --short --branch } catch {}

Section 'DONE'
Write-Host "Video, metrics.json, report.md and this log are in $SpikeDir"
try { Stop-Transcript | Out-Null } catch {}
exit $renderExit
