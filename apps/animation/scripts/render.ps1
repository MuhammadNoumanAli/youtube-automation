<#
  Render any composition of the animation module on Windows (PowerShell 5.1+).

  Default: renders the 30 s "NetherlandsDemo" to E:\YouTubeStudio\prototype\netherlands-demo.mp4.

    powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\render.ps1
    ... render.ps1 -Composition Spike -Out E:\YouTubeStudio\spike\spike.mp4
    ... render.ps1 -Concurrency 3
    ... render.ps1 -Composition NetherlandsVoiced -Out E:\YouTubeStudio\prototype\netherlands-voiced.mp4 `
                   -AudioDir D:\YouTubeStudio\audio\videos\NetherlandsVoiced      (run scripts\voice.ps1 first)

  Steps: git status + free space (read-only) -> npm cache and TEMP/TMP to E: for this session only ->
  install into apps\animation only if node_modules is missing (npm ci --workspaces=false) -> verify the root
  package.json/package-lock.json are unchanged -> render -> FFprobe, black-frame and freeze checks, contact sheet,
  metrics and report next to the video -> git status.

  Never deletes existing files. Existing outputs are kept; new files get a timestamp suffix. Voiced renders
  (-AudioDir) are loudness-mastered to -14 LUFS; the intermediate file this creates in the cache is removed after.
  Does not touch .env, the database, storage folders, the API or the web app.
#>
param(
  [string]$Composition = "NetherlandsDemo",
  [string]$Out = "E:\YouTubeStudio\prototype\netherlands-demo.mp4",
  [string]$Concurrency = "2",
  [string]$StudioRoot = "E:\YouTubeStudio",
  [string]$AudioDir = ""
)

$ErrorActionPreference = 'Stop'
$ModuleDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ModuleDir '..\..')).Path

function Section($t) { Write-Host ""; Write-Host "===== $t =====" -ForegroundColor Cyan }
function Stop-Run($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; try { Stop-Transcript | Out-Null } catch {}; exit 1 }

# Check the drives exist before building any path on them (an unplugged E: otherwise fails with a cryptic error).
$StudioDrive = $StudioRoot.Substring(0, 2)
if (-not (Test-Path "$StudioDrive\")) { Write-Host "STOPPED: drive $StudioDrive (StudioRoot) not found. Is the external drive connected? Or pass -StudioRoot D:\YouTubeStudio" -ForegroundColor Red; exit 1 }
$OutDrive = $Out.Substring(0, 2)
if (-not (Test-Path "$OutDrive\")) { Write-Host "STOPPED: drive $OutDrive (output) not found. Is the external drive connected? Or pass -Out D:\..." -ForegroundColor Red; exit 1 }
$OutDir = Split-Path -Parent $Out
$TmpDir = Join-Path $StudioRoot 'tmp'
$NpmCache = Join-Path $StudioRoot 'cache\npm'
$RemotionCache = Join-Path $StudioRoot 'cache\remotion'
New-Item -ItemType Directory -Force -Path $OutDir, $TmpDir, $NpmCache, $RemotionCache | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Transcript -Path (Join-Path $OutDir "run-$Composition-$stamp.log") | Out-Null

Section 'GIT (before)'
try { Write-Host ("Branch: " + (git -C $RepoRoot branch --show-current)); git -C $RepoRoot status --short --branch } catch { Write-Host "git not available" }

Section 'DISK'
$drives = @{}
foreach ($d in 'C','D','E') {
  $info = Get-PSDrive -Name $d -ErrorAction SilentlyContinue
  if ($info) { $drives[$d] = [math]::Round($info.Free / 1GB, 2); Write-Host ("{0}:  free {1} GB" -f $d, $drives[$d]) }
}
$studioLetter = $StudioDrive.TrimEnd(':')
if (-not $drives.ContainsKey($studioLetter) -or $drives[$studioLetter] -lt 5) { Stop-Run "$StudioDrive (StudioRoot) has less than 5 GB free." }
if ($drives.ContainsKey('D') -and $drives['D'] -lt 1) { Stop-Run "D: has less than 1 GB free." }

$env:npm_config_cache = $NpmCache
$env:npm_config_update_notifier = 'false'
$env:TEMP = $TmpDir
$env:TMP = $TmpDir
Write-Host "TEMP/TMP: $env:TEMP   npm cache: $env:npm_config_cache"

$rootPkg = Join-Path $RepoRoot 'package.json'
$rootLock = Join-Path $RepoRoot 'package-lock.json'
$before = (Get-FileHash $rootPkg).Hash + (Get-FileHash $rootLock).Hash

Push-Location $ModuleDir
try {
  if (-not (Test-Path (Join-Path $ModuleDir 'node_modules\remotion'))) {
    Section 'INSTALL (apps\animation only)'
    npm ci --workspaces=false --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Stop-Run "npm ci failed (exit $LASTEXITCODE)." }
  } else {
    Write-Host "Dependencies already installed: no install needed."
  }
  $after = (Get-FileHash $rootPkg).Hash + (Get-FileHash $rootLock).Hash
  if ($before -ne $after) { Stop-Run "Root package.json or package-lock.json changed. Restore with: git -C `"$RepoRoot`" checkout -- package.json package-lock.json" }
  Write-Host "Root package.json / package-lock.json unchanged: OK" -ForegroundColor Green

  Section "RENDER $Composition"
  $renderArgs = @('scripts\render.mjs', '--composition', $Composition, '--out', $Out, '--cache', $RemotionCache, '--concurrency', $Concurrency, '--drives', 'C:\,D:\,E:\')
  if ($AudioDir) { $renderArgs += @('--audio-dir', $AudioDir) }
  node @renderArgs
  $renderExit = $LASTEXITCODE
} finally {
  Pop-Location
}

Section 'GIT (after)'
try { git -C $RepoRoot status --short --branch } catch {}
Section 'DONE'
Write-Host "Outputs are in $OutDir (video, .report.md, .metrics.json, .contact-sheet.jpg, run log)"
try { Stop-Transcript | Out-Null } catch {}
exit $renderExit
