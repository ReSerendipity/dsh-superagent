# dsh-superagent Windows guard loop — starts the service if it is down at boot, then keeps
# running one watchdog tick every 15 minutes. This is the logon-time mechanism that replaces
# Task Scheduler (which this environment refuses) and the process-level supervision the upstream
# documents as missing. Death paths (all deliberate, per the discipline "no periodic task
# without a death path may exist"):
#   1) sign-out ends the process (it is a session startup item);
#   2) %APPDATA%\Superagent\watchdog\disabled marker  -> loop exits at its next tick;
#   3) `scripts\dsh-superagent.cmd stop` writes the manual-stop marker, which every tick
#      honours through --respect-stop, so the guard never resurrects an intentional stop.
# Single instance: a pid file in the same directory; a second starter exits if the pid lives.
# Optional: CLI unattended path only. For the in-app plugin path the app starts its own DSH host,
# and the shared stateDir/plugin lock means this guard cannot activate the plugin while the app holds it.
$ErrorActionPreference = 'Continue'
$Repo = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Tick = Join-Path $Repo 'scripts\dsh-superagent-watchdog.ps1'
$Service = Join-Path $Repo 'scripts\dsh-superagent.cmd'
$Dir = Join-Path $env:APPDATA 'Superagent\watchdog'
New-Item -ItemType Directory -Force -Path $Dir | Out-Null
$Lock = Join-Path $Dir 'loop.pid'

# The pid file carries the recorded process's creation time (its StartTime ticks): Windows reuses pids
# aggressively, and a reused number must not suppress a needed guard or count as a running one.
function Test-GuardAlive {
    if (-not (Test-Path $Lock)) { return $false }
    $raw = (Get-Content $Lock -Raw).Trim()
    try { $record = $raw | ConvertFrom-Json } catch { $record = $null }
    if ($null -eq $record -or $record -isnot [pscustomobject]) {
        # Legacy 0.2.7 file: a bare pid. ConvertFrom-Json reads it as a scalar, so build the record here.
        try { $record = [pscustomobject]@{ pid = [int]$raw; born = $null } } catch { return $false }
    }
    if (-not $record.pid) { return $false }
    $old = Get-Process -Id $record.pid -ErrorAction SilentlyContinue
    if (-not $old) { return $false }
    return ($null -eq $record.born -or $old.StartTime.Ticks -eq [long]$record.born)
}
$old = $null
if (Test-GuardAlive) {
    try { $old = (Get-Content $Lock -Raw | ConvertFrom-Json).pid } catch { $old = '?' }
    "guard already running (pid $old)"; exit 0
}
Set-Content $Lock (@{ pid = $PID; born = (Get-Process -Id $PID).StartTime.Ticks } | ConvertTo-Json -Compress) -Encoding ascii

function Note($line) { Add-Content (Join-Path $Dir 'watchdog.log') ("{0} GUARD {1}" -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $line) -Encoding UTF8 }
Note "loop started pid=$PID interval=15m"

# A disabled marker set while the guard was away means the operator wants nothing started either: check
# before the boot bring-up, not only inside the loop.
if (Test-Path (Join-Path $Dir 'disabled')) { Note 'disabled marker found before boot start; loop exits'; Remove-Item $Lock -ErrorAction SilentlyContinue; exit 0 }

# At logon the backend is not running by itself; bring it up once now (honours manual stop).
$first = & $Service --respect-stop status 2>&1 | Out-String
if ($LASTEXITCODE -eq 1) {
    Note 'backend down at guard start; starting it'
    & $Service --respect-stop start 2>&1 | Out-Null
}

while ($true) {
    if (Test-Path (Join-Path $Dir 'disabled')) { Note 'disabled marker found; loop exits'; break }
    & $Tick 2>&1 | Out-Null
    Start-Sleep -Seconds 900
}
Remove-Item $Lock -ErrorAction SilentlyContinue
exit 0
