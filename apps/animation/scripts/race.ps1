<#
  Marble race: simulate + render in one go on Windows (PowerShell 5.1+). Separate from render.ps1; touches nothing else.

    powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\race.ps1
    ... race.ps1 -Race race\races\world-58.race.json
    ... race.ps1 -Race race\races\long-58.race.json -Seed 99 -Concurrency 4
    ... race.ps1 -Race race\races\test-10.race.json -Only 1          (render just stage 1 as a quick preview)
    ... race.ps1 -Race race\races\test-10.race.json -SimulateOnly    (results + video length, no rendering)

  Steps: free space check -> npm cache and TEMP/TMP to the studio drive for this session only -> install into
  apps\animation only if node_modules is missing (npm ci --workspaces=false) -> verify the root package.json /
  package-lock.json are unchanged -> simulate (race\simulate.mjs) -> render segment by segment and join
  (scripts\render-race.mjs) -> report next to the video.

  Folders (defaults):
    replay + segments : <StudioRoot>\races\<race id>\replay and \segments   (rerun the same command to resume)
    final video       : <StudioRoot>\races\<race id>.mp4    (+ .report.md, .metrics.json, run log)
  Re-simulating with another -Seed rewrites the replay files in the race folder, so segments re-render.
  Disk: about 30 MB per minute of video for the segments, and the same again for the joined file.
  Never deletes files. Existing final videos are kept; a new one gets a timestamp suffix.
#>
param(
  [string]$Race = "race\races\test-10.race.json",
  [string]$Seed = "",
  [string]$StudioRoot = $(if (Test-Path 'E:\') { 'E:\YouTubeStudio' } elseif (Test-Path 'D:\') { 'D:\YouTubeStudio' } else { Join-Path $env:USERPROFILE 'YouTubeStudio' }),
  [string]$Concurrency = "2",
  [string]$Only = "",
  [switch]$SimulateOnly
)
$ErrorActionPreference = 'Stop'
$ModuleDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ModuleDir '..\..')).Path

function Section($t) { Write-Host ""; Write-Host "===== $t =====" -ForegroundColor Cyan }
function Stop-Run($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; try { Stop-Transcript | Out-Null } catch {}; exit 1 }

$StudioDrive = $StudioRoot.Substring(0, 2)
if (-not (Test-Path "$StudioDrive\")) { Write-Host "STOPPED: drive $StudioDrive not found. Is the external drive connected? Or pass -StudioRoot D:\YouTubeStudio" -ForegroundColor Red; exit 1 }

$RaceFile = if ([System.IO.Path]::IsPathRooted($Race)) { $Race } else { Join-Path $ModuleDir $Race }
if (-not (Test-Path $RaceFile)) { Write-Host "STOPPED: race file $RaceFile not found." -ForegroundColor Red; exit 1 }
$RaceId = (Get-Content $RaceFile -Raw | ConvertFrom-Json).id
$RacesDir = Join-Path $StudioRoot 'races'
$RaceDir = Join-Path $RacesDir $RaceId
$Out = Join-Path $RacesDir "$RaceId.mp4"
$TmpDir = Join-Path $StudioRoot 'tmp'
$NpmCache = Join-Path $StudioRoot 'cache\npm'
$RemotionCache = Join-Path $StudioRoot 'cache\remotion'
New-Item -ItemType Directory -Force -Path $RaceDir, $TmpDir, $NpmCache, $RemotionCache | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
Start-Transcript -Path (Join-Path $RacesDir "run-race-$RaceId-$stamp.log") | Out-Null

Section 'DISK'
$info = Get-PSDrive -Name $StudioDrive.TrimEnd(':') -ErrorAction SilentlyContinue
$free = if ($info) { [math]::Round($info.Free / 1GB, 2) } else { 0 }
Write-Host ("{0} free: {1} GB" -f $StudioDrive, $free)
if ($free -lt 5) { Stop-Run "$StudioDrive has less than 5 GB free. A 1-hour race needs about 4 GB (segments + final video) plus cache." }

$env:npm_config_cache = $NpmCache
$env:npm_config_update_notifier = 'false'
$env:TEMP = $TmpDir
$env:TMP = $TmpDir
$env:TMPDIR = $TmpDir

$rootPkg = Join-Path $RepoRoot 'package.json'
$rootLock = Join-Path $RepoRoot 'package-lock.json'
$before = (Get-FileHash $rootPkg).Hash + (Get-FileHash $rootLock).Hash

Push-Location $ModuleDir
$exitCode = 0
try {
  if (-not (Test-Path (Join-Path $ModuleDir 'node_modules\remotion'))) {
    Section 'INSTALL (apps\animation only)'
    npm ci --workspaces=false --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { Stop-Run "npm ci failed (exit $LASTEXITCODE)." }
  }
  $after = (Get-FileHash $rootPkg).Hash + (Get-FileHash $rootLock).Hash
  if ($before -ne $after) { Stop-Run "Root package.json or package-lock.json changed." }

  Section "SIMULATE $RaceId"
  $simArgs = @('race\simulate.mjs', '--race', $RaceFile, '--out', $RaceDir)
  if ($Seed) { $simArgs += @('--seed', $Seed) }
  node @simArgs
  if ($LASTEXITCODE -ne 0) { Stop-Run "simulation failed (exit $LASTEXITCODE)." }

  if (-not $SimulateOnly) {
    Section "RENDER $RaceId"
    $renderArgs = @('scripts\render-race.mjs', '--race-dir', $RaceDir, '--out', $Out, '--cache', $RemotionCache, '--concurrency', $Concurrency)
    if ($Only -ne '') { $renderArgs += @('--only', $Only) }
    node @renderArgs
    $exitCode = $LASTEXITCODE
  }
} finally {
  Pop-Location
}
Section 'DONE'
Write-Host "Replay and segments: $RaceDir"
if (-not $SimulateOnly -and $Only -eq '') { Write-Host "Video: $Out (or a timestamped name if that file already existed)" }
try { Stop-Transcript | Out-Null } catch {}
exit $exitCode
