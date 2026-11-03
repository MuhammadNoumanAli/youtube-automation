<#
  Copy the two approved Piper voices from E: to D: (checksum-verified). Windows PowerShell 5.1+.

    powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\copy-piper-to-d.ps1

  For each voice:
    1. hash the SOURCE .onnx on E: and compare it with the recorded SHA-256 -> stop on mismatch
    2. if the destination already holds a verified copy, skip it
    3. robocopy the whole voice folder (model, .onnx.json, tokens.txt, MODEL_CARD, espeak-ng-data)
       with /E only: no /MOV, no /MIR, no /PURGE, so nothing is moved or deleted
    4. hash the DESTINATION .onnx and compare file count and total bytes with the source -> stop on mismatch

  The E: originals are never modified, moved or deleted. An existing, unverified destination is never overwritten.
#>
param(
  [string]$Source = 'E:\YouTubeStudio\models\tts\piper',
  [string]$Dest   = 'D:\YouTubeStudio\models\tts\piper'
)
$ErrorActionPreference = 'Stop'

# Recorded in E:\YouTubeStudio\downloads\piper_kokoro_verification.txt and re-confirmed by Stage 0 (3 Nov 2026).
$Voices = [ordered]@{
  'en_US-ljspeech-high' = 'fea8faae21240174e972568a004f1d7afb01a93dbc7b3a58c36ecdc1bae82e33'
  'en_US-libritts-high' = '1a6fa5ce4de0aa7e2a91baa13c683c5f13985196e0f12c4c757c05e4d2dd008b'
}

function Stop-Run($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; exit 1 }
function Sha($path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $path).Hash.ToLower() }
function Summary($dir) {
  $files = Get-ChildItem -LiteralPath $dir -Recurse -File
  [pscustomobject]@{ Count = $files.Count; Bytes = ($files | Measure-Object -Property Length -Sum).Sum }
}

$destDrive = Get-PSDrive -Name ($Dest.Substring(0, 1)) -ErrorAction SilentlyContinue
if (-not $destDrive) { Stop-Run "Destination drive for $Dest not found." }
$freeGB = [math]::Round($destDrive.Free / 1GB, 2)
Write-Host "Destination drive free: $freeGB GB"
if ($freeGB -lt 1) { Stop-Run 'Less than 1 GB free on the destination drive.' }

foreach ($name in $Voices.Keys) {
  $expected = $Voices[$name]
  $src = Join-Path $Source $name
  $dst = Join-Path $Dest $name
  $srcOnnx = Join-Path $src "$name.onnx"
  $dstOnnx = Join-Path $dst "$name.onnx"
  Write-Host ""
  Write-Host "===== $name =====" -ForegroundColor Cyan

  if (-not (Test-Path -LiteralPath $srcOnnx)) { Stop-Run "Source model missing: $srcOnnx" }
  Write-Host "Hashing source $srcOnnx ..."
  $srcHash = Sha $srcOnnx
  if ($srcHash -ne $expected) { Stop-Run "Source checksum mismatch for $name`n  got      $srcHash`n  expected $expected" }
  Write-Host "Source checksum OK" -ForegroundColor Green
  $srcSum = Summary $src

  if (Test-Path -LiteralPath $dstOnnx) {
    $existing = Sha $dstOnnx
    $dstSum = Summary $dst
    if ($existing -eq $expected -and $dstSum.Count -eq $srcSum.Count -and $dstSum.Bytes -eq $srcSum.Bytes) {
      Write-Host "Destination already holds a verified copy: skipped." -ForegroundColor Green
      continue
    }
    Stop-Run "Destination $dst exists but does not match the source (hash or file count/size differ). Not overwriting. Check it manually."
  }

  New-Item -ItemType Directory -Force -Path $dst | Out-Null
  Write-Host "Copying $src -> $dst"
  robocopy $src $dst /E /COPY:DAT /DCOPY:T /R:2 /W:5 /NP /NFL /NDL /NJH
  $rc = $LASTEXITCODE
  if ($rc -ge 8) { Stop-Run "robocopy failed with exit code $rc." }

  Write-Host "Hashing destination $dstOnnx ..."
  $dstHash = Sha $dstOnnx
  $dstSum = Summary $dst
  if ($dstHash -ne $expected) { Stop-Run "Destination checksum mismatch for $name (got $dstHash)." }
  if ($dstSum.Count -ne $srcSum.Count -or $dstSum.Bytes -ne $srcSum.Bytes) {
    Stop-Run "File count/size differ: source $($srcSum.Count) files / $($srcSum.Bytes) B, destination $($dstSum.Count) files / $($dstSum.Bytes) B."
  }
  Write-Host ("Destination verified: checksum OK, {0} files, {1:N0} bytes" -f $dstSum.Count, $dstSum.Bytes) -ForegroundColor Green
}

Write-Host ""
Write-Host "DONE. Piper voices verified on $Dest. E: originals untouched." -ForegroundColor Green
exit 0
