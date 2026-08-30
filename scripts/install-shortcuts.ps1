<#
.SYNOPSIS
    Add `bah-*` commands to your PowerShell profile, so the scripts in this
    repository work from any directory.

.DESCRIPTION
    Everything here is normally run from the repo root - `.\scripts\dev.ps1`,
    `.\stop.bat`, `.\deploy\deploy.bat` - which means a `cd` before every one of
    them. This writes a block of small functions into $PROFILE that call the
    same scripts by absolute path, so `bah-dev` works from C:\Users\you.

    The paths are worked out from where this file sits, not hardcoded, so a
    clone anywhere gets the right ones. Nothing in the repository changes; the
    only file written is your own profile.

    Idempotent. The block is fenced by two markers and rewritten in place, so
    running it again after moving the clone or adding a script updates it rather
    than appending a second copy.

.PARAMETER Remove
    Take the block out again and leave the rest of the profile alone.

.PARAMETER WhatIf
    Print the block that would be written and change nothing.

.EXAMPLE
    .\scripts\install-shortcuts.ps1
    .\scripts\install-shortcuts.ps1 -WhatIf
    .\scripts\install-shortcuts.ps1 -Remove
#>
[CmdletBinding(SupportsShouldProcess)]
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent

$BEGIN = '# >>> bonapphedi shortcuts >>>'
$END = '# <<< bonapphedi shortcuts <<<'

<#
    One entry per command. `Path` is relative to the repo root and checked
    before anything is written: deploy/ is a private submodule, so a clone
    without access to it should get every other shortcut and no broken
    `bah-deploy` that fails with a path nobody recognises.
#>
$commands = @(
    @{ Name = 'bah-dev'; Path = 'scripts\dev.ps1'; What = 'backend on :8080 then frontend on :4200' }
    @{ Name = 'bah-stop'; Path = 'stop.bat'; What = 'stop whatever holds :4200 and :8080' }
    @{ Name = 'bah-api'; Path = 'scripts\api.ps1'; What = 'call the API from the shell' }
    @{ Name = 'bah-deploy'; Path = 'deploy\deploy.bat'; What = 'build, check and ship (private submodule)' }
    @{ Name = 'bah-backup'; Path = 'deploy\backup.bat'; What = 'pull a backup down (private submodule)' }
)

# --- the block ---------------------------------------------------------------

$lines = @($BEGIN, "# Written by scripts\install-shortcuts.ps1. Re-run it to update; -Remove to undo.", "# Repo: $repo", '')

foreach ($command in $commands) {
    $full = Join-Path $repo $command.Path
    if (-not (Test-Path $full)) {
        Write-Host "  skipping $($command.Name) - $($command.Path) is not in this clone" -ForegroundColor DarkGray
        continue
    }

    # @args and not $args: @args splats, so `bah-dev -Fresh` reaches the script
    # as a real parameter. $args would hand it across as one array argument and
    # the switch would be silently ignored - which looks like the script quietly
    # refusing to do what it was asked.
    $lines += "function $($command.Name) { & '$full' @args }   # $($command.What)"
}

<#
    The shell scripts in deploy/ all run on the server rather than on this
    machine, so their shortcuts are ssh wrappers rather than paths.

    The address is read out of deploy/deploy.ps1 at generation time and never
    written down here. This file is in the public repository and the server's
    address is not published in it; the profile these lines land in is local,
    personal and committed nowhere. A clone without the private submodule gets
    no address to find and no server shortcuts, which is the same rule the rest
    of this script follows.
#>
$deployScript = Join-Path $repo 'deploy\deploy.ps1'
$targetHost = $null
if (Test-Path $deployScript) {
    $match = [regex]::Match((Get-Content $deployScript -Raw), "TargetHost\s*=\s*'([^']+)'")
    if ($match.Success) { $targetHost = $match.Groups[1].Value }
}

if ($targetHost) {
    $checkScript = Join-Path $repo 'deploy\check.sh'
    $lines += ''
    $lines += "# The server. Address read from deploy\deploy.ps1 when this was generated."

    # Copied and then run, never piped: `ssh host 'bash -s' < file` is a parser
    # error in PowerShell, and piping Get-Content into ssh turns every LF into
    # CRLF so bash reports $'\r': command not found. check.sh says so in its own
    # header, having been the thing that found out.
    $lines += "function bah-check { scp -q '$checkScript' ${targetHost}:/tmp/bonapphedi-check.sh; ssh $targetHost 'sudo bash /tmp/bonapphedi-check.sh; rm -f /tmp/bonapphedi-check.sh' }   # read-only: what state is the server in"

    # These run the copies provision.sh installed, so they are the versions the
    # timers actually use rather than whatever is in this working tree.
    $lines += "function bah-digest { ssh $targetHost 'sudo /usr/local/bin/bonapphedi-digest' }   # run tonight's digest now (mails, then erases the day)"
    $lines += "function bah-notify { param([string]`$Subject = 'test') `$input | ssh $targetHost `"sudo /usr/local/bin/bonapphedi-notify '`$Subject'`" }   # send an alert, to check the path"
    $lines += "function bah-backup-now { ssh $targetHost 'sudo systemctl start bonapphedi-backup; sleep 2; systemctl status bonapphedi-backup --no-pager -n 5' }   # run the backup on the server now"
    $lines += "function bah-bans { ssh $targetHost 'sudo fail2ban-client status sshd; sudo fail2ban-client status bonapphedi' }   # who fail2ban is currently refusing"
    $lines += "function bah-serverlog { ssh $targetHost 'sudo journalctl -u bonapphedi -n 60 --no-pager' }   # the application's own log"
    $lines += "function bah-ssh { ssh $targetHost @args }   # a shell on the server"

    # provision.sh is never run by hand - it is step 4 of a deploy, and running
    # it out of band would apply a configuration the deploy has not checked.
    $lines += "function bah-provision { & '$(Join-Path $repo 'deploy\deploy.bat')' -Provision }   # re-apply the server configuration through a deploy"
}

# Repo-root-relative commands that are not a single script, so they are worth
# having as functions rather than as paths: both are run constantly and both
# need a specific directory, which is the whole friction being removed.
$lines += ''
$lines += "function bah-verify { Push-Location '$repo\frontend'; try { npm run verify @args } finally { Pop-Location } }"
$lines += "function bah-test-backend { Push-Location '$repo\backend'; try { .\mvnw.cmd --batch-mode test @args } finally { Pop-Location } }"
$lines += "function bah-repo { Set-Location '$repo' }"
$lines += $END

$block = $lines -join "`r`n"

# --- write it ----------------------------------------------------------------

$profilePath = $PROFILE.CurrentUserAllHosts

if ($Remove -and -not (Test-Path $profilePath)) {
    Write-Host "Nothing to remove: $profilePath does not exist." -ForegroundColor DarkGray
    return
}

# Read before deciding, and never create anything here.
#
# Creating the file up front was wrong under -WhatIf: New-Item honours it and
# skips the creation, and then the read below failed on a file the script had
# just been told not to make. The directory and the file are both created by
# Set-Content at the point of writing, which is the only place that should.
$existing = if (Test-Path $profilePath) { (Get-Content $profilePath -Raw) } else { '' }
if ($null -eq $existing) { $existing = '' }

# Everything between the markers, including them, and nothing else. Written as
# a single-line regex over the whole file because the block spans lines.
$pattern = [regex]::Escape($BEGIN) + '.*?' + [regex]::Escape($END)
$without = [regex]::Replace($existing, $pattern, '', 'Singleline').TrimEnd()

if ($Remove) {
    if ($existing -eq $without) {
        Write-Host 'No bonapphedi block found; nothing changed.' -ForegroundColor DarkGray
        return
    }
    if ($PSCmdlet.ShouldProcess($profilePath, 'remove the bonapphedi block')) {
        Set-Content -Path $profilePath -Value $without -Encoding UTF8
        Write-Host "Removed the block from $profilePath" -ForegroundColor Green
    }
    return
}

$updated = if ($without) { "$without`r`n`r`n$block`r`n" } else { "$block`r`n" }

if ($PSCmdlet.ShouldProcess($profilePath, 'write the bonapphedi block')) {
    $parent = Split-Path $profilePath -Parent
    if (-not (Test-Path $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    Set-Content -Path $profilePath -Value $updated -Encoding UTF8

    Write-Host ''
    Write-Host "Wrote $profilePath" -ForegroundColor Green
    Write-Host ''
    foreach ($line in $lines | Where-Object { $_ -match '^function' }) {
        if ($line -match '^function\s+(\S+)') { Write-Host ("  " + $Matches[1]) -ForegroundColor Cyan }
    }
    Write-Host ''
    Write-Host '  Open a new terminal, or run:  . $PROFILE' -ForegroundColor DarkGray
    Write-Host ''
} else {
    Write-Host $block
}
