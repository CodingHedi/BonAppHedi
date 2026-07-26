<#
.SYNOPSIS
    Starts the backend and the frontend together, and stops both on Ctrl+C.

.DESCRIPTION
    The dev loop is two servers: Spring Boot on :8080 and the Angular dev server
    on :4200, which proxies /api, /oauth2, /login, /logout and /media to the
    backend (frontend/proxy.conf.json). Running them in two terminals works, but
    it means two terminals, two Ctrl+Cs, and remembering which one to start
    first.

    The frontend is started only once the backend answers, so the first page
    load never races a JVM that is still coming up.

    Node is installed through NVM for Windows and is frequently absent from a
    non-interactive PATH, so its symlink directory is prepended here rather than
    left to chance.

.PARAMETER Mocks
    Skips the backend entirely and runs the frontend against its mock services -
    the milestone-1 loop, and still the fastest way to work on the UI alone.

.PARAMETER Fresh
    Deletes the SQLite database first, so the next start re-runs every migration
    from empty. The database is a single file; this is the whole reset story.

.EXAMPLE
    .\scripts\dev.ps1
    .\scripts\dev.ps1 -Mocks
    .\scripts\dev.ps1 -Fresh
#>
[CmdletBinding()]
param(
    [switch]$Mocks,
    [switch]$Fresh
)

$ErrorActionPreference = 'Stop'

$repo = Split-Path -Parent $PSScriptRoot
$backend = Join-Path $repo 'backend'
$frontend = Join-Path $repo 'frontend'

# NVM for Windows puts the active Node behind this symlink. Without it `npm` is
# simply not found in a non-interactive shell.
$nodeDir = 'C:\nvm4w\nodejs'
if (Test-Path $nodeDir) { $env:Path = "$nodeDir;$env:Path" }

# npm.cmd specifically, not npm: Get-Command resolves the extensionless shell
# script that ships alongside it, and Start-Process cannot execute that on
# Windows - it fails with "not a valid Win32 application".
# Written without ?. or ?? so the script runs on Windows PowerShell 5.1, which
# is what ships with Windows and has neither operator.
$npmCommand = Get-Command npm.cmd -ErrorAction SilentlyContinue
if (-not $npmCommand) {
    throw "npm not found. Install Node via 'winget install CoreyButler.NVMforWindows', then 'nvm use'."
}
$npm = $npmCommand.Source

$jobs = @()

<#
    Fail on a busy port before starting anything, rather than after.

    Without this the backend starts, the frontend then dies on "port already in
    use", the script tears the backend back down, and the only clue is one line
    buried in the middle of a JVM's startup log. A leftover dev server from an
    earlier session is by far the most common way this script fails.
#>
function Assert-PortFree {
    param([int]$Port, [string]$Who)

    $listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
    if (-not $listener) { return }

    $owner = Get-Process -Id $listener[0].OwningProcess -ErrorAction SilentlyContinue
    $name = if ($owner) { "$($owner.ProcessName) (PID $($owner.Id))" } else { "PID $($listener[0].OwningProcess)" }
    throw "Port $Port is already in use by $name, which is where $Who goes. Stop it and try again."
}

function Stop-Everything {
    foreach ($job in $script:jobs) {
        if ($job -and -not $job.HasExited) {
            # Kill the whole tree: `npm` and `mvnw` are launchers, and killing
            # only the launcher orphans the Node and JVM processes holding :4200
            # and :8080, which then block the next run.
            taskkill /PID $job.Id /T /F 2>$null | Out-Null
        }
    }
}

try {
    Assert-PortFree -Port 4200 -Who 'the frontend'
    if (-not $Mocks) { Assert-PortFree -Port 8080 -Who 'the backend' }

    if (-not $Mocks) {
        $db = Join-Path $repo 'data\bonapphedi.db'
        if ($Fresh -and (Test-Path $db)) {
            Write-Host 'Deleting the database so migrations re-run from empty.' -ForegroundColor Yellow
            # -wal and -shm travel with it; leaving them behind corrupts the next open.
            Remove-Item "$db*" -Force
        }

        Write-Host 'Starting the backend on :8080 ...' -ForegroundColor Cyan
        $mvnw = Join-Path $backend 'mvnw.cmd'
        $jobs += Start-Process -FilePath $mvnw -ArgumentList 'spring-boot:run' `
            -WorkingDirectory $backend -NoNewWindow -PassThru

        $deadline = (Get-Date).AddSeconds(120)
        do {
            Start-Sleep -Milliseconds 700
            $up = $false
            try {
                # Any answer means the port is served. A 401 or a 404 is still
                # the backend talking, so success here is "it responded", not
                # "it responded 200".
                Invoke-WebRequest -Uri 'http://localhost:8080/api/auth/providers' `
                    -UseBasicParsing -TimeoutSec 2 | Out-Null
                $up = $true
            } catch [System.Net.WebException] {
                $up = $null -ne $_.Exception.Response
            } catch {
                $up = $false
            }
        } while (-not $up -and (Get-Date) -lt $deadline)

        if (-not $up) { throw 'The backend did not come up within 120s.' }
        Write-Host 'Backend is up.' -ForegroundColor Green
    }
    else {
        Write-Host 'Mock mode: the frontend runs on its own mock services.' -ForegroundColor Yellow
    }

    Write-Host 'Starting the frontend on :4200 ...' -ForegroundColor Cyan
    Write-Host 'Ctrl+C stops both.' -ForegroundColor DarkGray

    $jobs += Start-Process -FilePath $npm -ArgumentList 'start' `
        -WorkingDirectory $frontend -NoNewWindow -PassThru

    # Block here until a child dies or the user interrupts.
    while ($true) {
        Start-Sleep -Seconds 1
        foreach ($job in $jobs) {
            if ($job.HasExited) {
                Write-Host "A process exited (code $($job.ExitCode)); shutting the other down." -ForegroundColor Red
                return
            }
        }
    }
}
finally {
    Stop-Everything
    Write-Host 'Stopped.' -ForegroundColor DarkGray
}
