<#
  Copy the existing sherpa-onnx runtime from E: to D: (checksum-verified). Windows PowerShell 5.1+.

    powershell -ExecutionPolicy Bypass -File D:\wamp64\www\youtube-automation\apps\animation\scripts\copy-runtime-to-d.ps1

  1. checks the SOURCE: sherpa-onnx-node and sherpa-onnx-win-x64 are version 1.13.8 and the five native files match
     the SHA-256 values verified in Stage 0 -> stops on any mismatch
  2. if the destination already holds a verified copy, does nothing
  3. robocopy of the whole folder with /E only: no /MOV, no /MIR, no /PURGE, so nothing is moved or deleted
  4. checks the DESTINATION the same way, plus file count and total bytes
  Nothing is downloaded or installed. The E: original is never modified. After this, voice.ps1 uses D: automatically.
#>
param(
  [string]$Source = 'E:\YouTubeStudio\runtime\sherpa-onnx',
  [string]$Dest   = 'D:\YouTubeStudio\runtime\sherpa-onnx'
)
$ErrorActionPreference = 'Stop'
$Native = [ordered]@{
  'sherpa-onnx.node'                 = 'f5fd562bdc4bea167eee8ac981c6acd88c05cc8d2792b67d8951566818e293ca'
  'onnxruntime.dll'                  = '7f66f939a881baf4f46a2216496798edf4a1429878b646d12674aa62f27d8a25'
  'sherpa-onnx-c-api.dll'            = 'b0801cd8eeead83213c60b92cc004de6f3ac4cd4a9ac7c388c16b97c590f1e99'
  'sherpa-onnx-cxx-api.dll'          = 'e709c46a63e4b84f3862aa0c843a804040b42ea054a398b420142f6c8e58ec77'
  'onnxruntime_providers_shared.dll' = '551d0e1fe4c227d8542314ba718d52f4379e0c7bfe729a37c59833a884e27b4d'
}
function Stop-Run($msg) { Write-Host "STOPPED: $msg" -ForegroundColor Red; exit 1 }
function Check-Runtime($dir, $label) {
  foreach ($pkg in 'sherpa-onnx-node', 'sherpa-onnx-win-x64') {
    $pj = Join-Path $dir "node_modules\$pkg\package.json"
    if (-not (Test-Path -LiteralPath $pj)) { return "$label`: $pkg missing" }
    $v = (Get-Content -LiteralPath $pj -Raw | ConvertFrom-Json).version
    if ($v -ne '1.13.8') { return "$label`: $pkg is $v, expected 1.13.8" }
  }
  foreach ($f in $Native.Keys) {
    $p = Join-Path $dir "node_modules\sherpa-onnx-win-x64\$f"
    if (-not (Test-Path -LiteralPath $p)) { return "$label`: $f missing" }
    $h = (Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash.ToLower()
    if ($h -ne $Native[$f]) { return "$label`: $f checksum mismatch ($h)" }
  }
  return $null
}
function Summary($dir) {
  $files = Get-ChildItem -LiteralPath $dir -Recurse -File
  [pscustomobject]@{ Count = $files.Count; Bytes = ($files | Measure-Object -Property Length -Sum).Sum }
}

if ($Source.Length -lt 2 -or -not (Test-Path ($Source.Substring(0, 2) + '\'))) { Stop-Run "Source drive $($Source.Substring(0, 2)) not found. Is the external drive connected?" }
if (-not (Test-Path -LiteralPath $Source)) { Stop-Run "Source not found: $Source" }
Write-Host "Checking source $Source ..."
$err = Check-Runtime $Source 'source'
if ($err) { Stop-Run $err }
Write-Host "Source verified: version 1.13.8, 5 native files match." -ForegroundColor Green
$srcSum = Summary $Source

if (Test-Path -LiteralPath $Dest) {
  $err = Check-Runtime $Dest 'destination'
  $dstSum = Summary $Dest
  if (-not $err -and $dstSum.Count -eq $srcSum.Count -and $dstSum.Bytes -eq $srcSum.Bytes) {
    Write-Host "Destination already holds a verified copy: nothing to do." -ForegroundColor Green
    exit 0
  }
  Stop-Run "Destination $Dest exists but does not match the source. Not overwriting. Check it manually."
}

New-Item -ItemType Directory -Force -Path $Dest | Out-Null
robocopy $Source $Dest /E /COPY:DAT /DCOPY:T /R:2 /W:5 /NP /NFL /NDL /NJH
if ($LASTEXITCODE -ge 8) { Stop-Run "robocopy failed with exit code $LASTEXITCODE." }
$err = Check-Runtime $Dest 'destination'
if ($err) { Stop-Run $err }
$dstSum = Summary $Dest
if ($dstSum.Count -ne $srcSum.Count -or $dstSum.Bytes -ne $srcSum.Bytes) { Stop-Run "File count/size differ after copy." }
Write-Host ("DONE. Runtime verified on {0} ({1} files, {2:N0} bytes). E: original untouched." -f $Dest, $dstSum.Count, $dstSum.Bytes) -ForegroundColor Green
exit 0
