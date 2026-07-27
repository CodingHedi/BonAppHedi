<#
.SYNOPSIS
    Stops whatever is serving the dev loop, by port rather than by memory.

.DESCRIPTION
    dev.ps1 already stops both halves on Ctrl+C and when either one dies, so this
    is not the normal way to finish. It exists for the case that path cannot
    cover: a console window closed with the X button, a machine that slept, or a
    run from an earlier session nobody remembers starting. Windows gives a
    closing console a couple of seconds and no promise, and a JVM does not always
    take the hint - so the leftovers are found by asking who holds the port
    instead of by trusting anything written down.

    Killing the process that holds a port is enough to bring the rest down with
    it: dev.ps1 watches its children and tears the other half down as soon as one
    exits, so stopping the frontend from here stops the backend too.

    Only node and java are killed. Port 8080 in particular is popular, and a
    "stop the website" script that silently killed somebody's unrelated server
    because it happened to answer there would be a worse bug than the one it
    solves. Anything else holding a port is named and left alone.

.PARAMETER Ports
    Defaults to the dev loop's two. Pass 4300 to clear a Playwright server left
    behind by an interrupted run.

.EXAMPLE
    .\scripts\stop.ps1
    .\scripts\stop.ps1 -Ports 4300
#>
[CmdletBinding()]
param(
    [int[]]$Ports = @(4200, 8080)
)

$ErrorActionPreference = 'Stop'

# The launchers are cmd and node; the processes actually holding the ports are
# the Angular dev server and the Spring Boot JVM.
$ours = @('node', 'java', 'javaw')

$stopped = 0

foreach ($port in $Ports) {
    $listeners = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue
    if (-not $listeners) {
        Write-Host "Nothing is listening on :$port." -ForegroundColor DarkGray
        continue
    }

    foreach ($owningProcess in ($listeners.OwningProcess | Select-Object -Unique)) {
        # Not $pid: that is an automatic variable holding this script's own
        # process id, and assigning to it fails.
        $owner = Get-Process -Id $owningProcess -ErrorAction SilentlyContinue
        if (-not $owner) {
            Write-Host ":$port is held by PID $owningProcess, which has already gone." -ForegroundColor DarkGray
            continue
        }

        if ($ours -notcontains $owner.ProcessName) {
            Write-Host ":$port is held by $($owner.ProcessName) (PID $($owner.Id)), which is not this project. Left running." -ForegroundColor Yellow
            continue
        }

        # /T because npm and mvnw are launchers: killing one on its own orphans
        # the process holding the port, which then blocks the next start.
        Write-Host "Stopping $($owner.ProcessName) (PID $($owner.Id)) on :$port ..." -ForegroundColor Cyan
        taskkill /PID $owner.Id /T /F 2>$null | Out-Null
        $stopped++
    }
}

if ($stopped -eq 0) {
    Write-Host 'Nothing to stop.' -ForegroundColor DarkGray
}
else {
    Write-Host "Stopped $stopped process(es)." -ForegroundColor Green
}
