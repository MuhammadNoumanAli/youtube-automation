<#
  Generate dialogue audio for a voiced composition (Phase 3). Windows PowerShell 5.1+.

    powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\voice.ps1 -Smoke
    ... voice.ps1                                  (NetherlandsVoiced, from src\videos\netherlands-voiced.voice.json)
    ... voice.ps1 -Video NetherlandsVoiced -Force  (regenerate every line, ignoring the cache)

  Uses the EXISTING sherpa-onnx runtime and local models; installs and downloads nothing:
    runtime  E:\YouTubeStudio\runtime\sherpa-onnx           (version + native file checksums verified on start)
    Kokoro   D:\YouTubeStudio\models\tts\kokoro-multi-lang-v1_0
    Piper    D:\YouTubeStudio\models\tts\piper\              (copied by scripts\copy-piper-to-d.ps1)
  Writes only under -AudioRoot (default D:\YouTubeStudio\audio): cache, per-video public\lines and voice-manifest.json,
  plus a log in <AudioRoot>\logs. Environment variables are set for this session only. Never deletes anything.
#>
param(
  [string]$Video = 'NetherlandsVoiced',
  [switch]$Smoke,
  [switch]$Force,
  [string]$AudioRoot = 'D:\YouTubeStudio\audio',
  [string]$RuntimeDir = 'E:\YouTubeStudio\runtime\sherpa-onnx',
  [string]$KokoroDir = 'D:\YouTubeStudio\models\tts\kokoro-multi-lang-v1_0',
  [string]$PiperDir = 'D:\YouTubeStudio\models\tts\piper',
  [int]$Threads = 2
)
$ErrorActionPreference = 'Stop'
$ModuleDir = Split-Path -Parent $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ModuleDir '..\..')).Path
function Stop-Run($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; try { Stop-Transcript | Out-Null } catch {}; exit 1 }

New-Item -ItemType Directory -Force -Path (Join-Path $AudioRoot 'logs') | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$label = if ($Smoke) { 'smoke' } else { $Video }
Start-Transcript -Path (Join-Path $AudioRoot "logs\voice-$label-$stamp.log") | Out-Null

Write-Host "===== CHECKS =====" -ForegroundColor Cyan
$nodeVersion = (node -v) 2>$null
if (-not $nodeVersion) { Stop-Run 'node not found on PATH.' }
if ([int]($nodeVersion.TrimStart('v').Split('.')[0]) -lt 22) { Stop-Run "Node 22+ required (found $nodeVersion)." }
Write-Host "Node $nodeVersion"
$audioDrive = Get-PSDrive -Name $AudioRoot.Substring(0, 1) -ErrorAction SilentlyContinue
if ($audioDrive -and ($audioDrive.Free / 1GB) -lt 1) { Stop-Run "Less than 1 GB free on $($AudioRoot.Substring(0, 2))." }
if (-not (Test-Path -LiteralPath $KokoroDir)) { Stop-Run "Not found: $KokoroDir" }
if (-not (Test-Path -LiteralPath $RuntimeDir)) {
  Write-Host "WARNING: runtime not found at $RuntimeDir (is the E: drive connected?). Only cached lines can be used." -ForegroundColor Yellow
}
foreach ($v in 'en_US-ljspeech-high', 'en_US-libritts-high') {
  if (-not (Test-Path -LiteralPath (Join-Path $PiperDir "$v\$v.onnx"))) {
    Stop-Run "Piper voice $v not found under $PiperDir. Run scripts\copy-piper-to-d.ps1 first (or pass -PiperDir)."
  }
}
try { Write-Host ("Git: " + (git -C $RepoRoot branch --show-current)) } catch {}

$env:TTS_RUNTIME_DIR = $RuntimeDir
$env:TTS_KOKORO_DIR = $KokoroDir
$env:TTS_PIPER_DIR = $PiperDir
$env:TTS_AUDIO_ROOT = $AudioRoot
$env:TTS_THREADS = "$Threads"

Write-Host "===== VOICE =====" -ForegroundColor Cyan
Push-Location $ModuleDir
try {
  $nodeArgs = @('voice\generate.mjs')
  if ($Smoke) { $nodeArgs += '--smoke' } else { $nodeArgs += @('--video', $Video) }
  if ($Force) { $nodeArgs += '--force' }
  node @nodeArgs
  $exitCode = $LASTEXITCODE
} finally {
  Pop-Location
}
Write-Host ""
if ($exitCode -eq 0) { Write-Host "DONE (exit 0)" -ForegroundColor Green } else { Write-Host "FINISHED WITH PROBLEMS (exit $exitCode)" -ForegroundColor Yellow }
if (-not $Smoke -and $exitCode -eq 0) {
  Write-Host "Next: render with"
  Write-Host "  powershell -ExecutionPolicy Bypass -File $ModuleDir\scripts\render.ps1 -Composition $Video -Out E:\YouTubeStudio\prototype\$($Video.ToLower()).mp4 -AudioDir $AudioRoot\videos\$Video"
}
try { Stop-Transcript | Out-Null } catch {}
exit $exitCode
