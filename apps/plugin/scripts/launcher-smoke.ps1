param(
  [Parameter(Mandatory = $true)] [string] $Scripts,
  [Parameter(Mandatory = $true)] [string] $Sample,
  [Parameter(Mandatory = $true)] [string] $Runtime
)
$ErrorActionPreference = 'Continue'
function Fail([string] $Message) { Write-Output "::error::$Message"; exit 1 }
function Text($Lines) { ($Lines | ForEach-Object { "$_" }) -join "`n" }
if (-not $env:ARCUE_USER_DATA) { Fail "Set ARCUE_USER_DATA to a folder of this run's own, so the test never stops your Arcue." }
foreach ($name in 'CLAUDE_CODE_SESSION_ID', 'CODEX_SESSION_ID', 'CODEX_THREAD_ID', 'ARCUE_VIEW') {
  Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
}
$ProgressPreference = 'SilentlyContinue'

$env:Path = ($env:Path -split ';' | Where-Object { $_ -and -not (Test-Path -LiteralPath (Join-Path $_ 'node.exe')) }) -join ';'
if (Get-Command node.exe -ErrorAction SilentlyContinue) { Fail 'node.exe is still on PATH.' }
$nodeCmd = Join-Path $Scripts 'arcue-node.cmd'
$setupCmd = Join-Path $Scripts 'arcue-setup.cmd'
$js = Join-Path $Scripts 'arcue.js'
$work = Join-Path $env:RUNNER_TEMP "cwd-$PID"
New-Item -ItemType Directory -Force -Path $work | Out-Null
Set-Location -LiteralPath $work
Set-Content -LiteralPath (Join-Path $work 'Walk.cmd') -Value '@echo ran> "%~dp0walk-ran.txt"' -Encoding Ascii

$shared = & $nodeCmd
if ($LASTEXITCODE -ne 0 -or -not $shared) { Fail 'arcue-node.cmd did not find the Node that the shell launcher set up.' }

Copy-Item -LiteralPath $shared -Destination (Join-Path $work 'node.exe')
$saved = $env:Path
$env:Path = ".;$env:Path"
$chosen = & $nodeCmd
$env:Path = $saved
if ($chosen -ne $shared) { Fail "With . first on PATH, arcue-node.cmd printed '$chosen' instead of '$shared'." }

$env:ARCUE_RUNTIME_DIR = $Runtime
$out = & $nodeCmd 2>$null
if ($LASTEXITCODE -ne 3 -or $out) { Fail "Before setup, arcue-node.cmd exited with $LASTEXITCODE and printed '$out'." }
$setup = Text (& $setupCmd 2>&1)
if ($LASTEXITCODE -ne 0 -or $setup -notlike '*for Arcue is ready in*') { Fail "Setup failed: $setup" }
$again = Text (& $setupCmd 2>&1)
if ($again -notlike '*is already set up in*') { Fail "A second setup said: $again" }

$json = Text (& (& $nodeCmd) $js inspect $Sample --json)
if ($LASTEXITCODE -ne 0 -or -not $json.Contains('"name": "StoneResonatorRig|Walk"')) { Fail 'inspect did not list StoneResonatorRig|Walk.' }
$status = Text (& (& $nodeCmd) $js status 'StoneResonatorRig|Walk' 'my model.fbx' '100%PATH%' 'a&b' '^c' '!d' 2>&1)
if ($LASTEXITCODE -ne 2 -or -not $status.Contains('got "StoneResonatorRig|Walk my model.fbx 100%PATH% a&b ^c !d"')) {
  Fail "Arguments changed on the way to node.exe: $status"
}
if (Test-Path -LiteralPath (Join-Path $work 'walk-ran.txt')) { Fail 'cmd.exe ran Walk.cmd from a clip name.' }

$address = 'http://localhost:4539'
function Answers {
  try { $null = Invoke-WebRequest -UseBasicParsing -Uri $address -TimeoutSec 5 -ErrorAction Stop; $true } catch { $false }
}
try {
  $job = Start-Job -ScriptBlock {
    $lines = & (& $using:nodeCmd) $using:js serve --detach --port 4539 2>&1 | ForEach-Object { "$_" }
    [pscustomobject]@{ Code = $LASTEXITCODE; Out = $lines -join "`n" }
  }
  if (-not (Wait-Job $job -Timeout 60)) {
    Remove-Job $job -Force
    Fail 'arcue serve --detach did not return within 60 seconds.'
  }
  $detached = Receive-Job $job
  Remove-Job $job
  if ($detached.Code -ne 0 -or $detached.Out -notlike "Arcue runs in a browser at $address *") { Fail "serve --detach said: $($detached.Out)" }
  if (-not (Answers)) { Fail "serve does not answer at $address." }
  $running = Text (& (& $nodeCmd) $js status)
  if (-not $running.Contains("Arcue is running in a browser at $address")) { Fail "status said: $running" }
  $already = Text (& (& $nodeCmd) $js serve --detach)
  if (-not $already.Contains("Arcue already runs in a browser at $address")) { Fail "A second serve --detach said: $already" }

  $stopped = Text (& (& $nodeCmd) $js stop)
  if ($LASTEXITCODE -ne 0 -or -not $stopped.Contains("Stopped Arcue in the browser at $address")) { Fail "stop said: $stopped" }
  for ($second = 0; $second -lt 10 -and (Answers); $second++) { Start-Sleep -Seconds 1 }
  if (Answers) { Fail 'serve still answers after arcue stop.' }
  $none = Text (& (& $nodeCmd) $js stop)
  if (-not $none.Contains('Arcue is not running in a browser.')) { Fail "A second stop said: $none" }
} finally {
  & (& $nodeCmd) $js stop *> $null
}
exit 0
