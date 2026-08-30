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

.NOTES
    Writing the profile is only half of making these commands work: PowerShell
    refuses to run a profile at all under the default `Restricted` policy, and
    the `-ExecutionPolicy Bypass` in the .bat wrapper cannot help, because the
    profile is read by a different process. This checks and says so rather than
    reporting success into a shell that will never load the file.

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
    Every double-clickable entry point in the repository, found rather than
    listed.

    It was a hand-written list and `bah-start` was missing from it, which is the
    failure mode a hand-written list has: nothing tells you what you left out.
    So the .bat files at the root and in deploy/ are discovered, and this table
    only holds the two things discovery cannot know — what a command should be
    called when the filename is not the answer, and which files are not entry
    points at all.

    A .bat rather than the .ps1 it wraps, wherever both exist: the wrapper is
    what handles the execution policy, and start.bat additionally passes -Open
    so the browser comes up. Pointing at scripts\dev.ps1 would silently drop
    that.
#>
$notEntryPoints = @(
    # Called by the Windows scheduled task, never by a person.
    'backup-task.ps1'
    # Wrapped by install-backup-task.bat.
    'install-backup-task.ps1'
    # Wrapped by deploy.bat, and running it directly skips the confirmation.
    'deploy.ps1'
    # Wrapped by backup.bat.
    'pull-backup.ps1'
)

# Where the filename is not the name anybody would reach for.
$names = @{
    'start.bat'               = 'bah-start'
    'stop.bat'                = 'bah-stop'
    'api.bat'                 = 'bah-api'
    'backup.bat'              = 'bah-backup'          # the root one: pulls a copy down here
    'deploy.bat'              = 'bah-deploy'
    'install-shortcuts.bat'   = 'bah-shortcuts'       # regenerate this block
    'install-backup-task.bat' = 'bah-install-backup-task'
}

<#
    A manual page for each command.

    Emitted as PowerShell comment-based help on the generated functions, so
    `man bah-start` and `Get-Help bah-check -Full` answer properly - `man` is an
    alias for Get-Help, which makes this the native answer rather than a
    document to go and find.

    Synopsis is the one line `bah-help` lists. Notes is where the thing worth
    knowing before running it goes: what it costs, what it changes, what it will
    not do. Several of these have side effects on a live server and say so.
#>
$help = @{
    'bah-start' = @{
        Synopsis = 'Dev loop, and open the browser when it is up.'
        Body     = 'Starts the backend on :8080, waits for it to answer, then the frontend on :4200, and opens a browser once Angular has finished compiling. Ctrl+C stops both. If either port is already taken it says so up front rather than half-starting.'
        Notes    = 'Takes the same arguments as the script: -Fresh deletes the SQLite file so every migration runs again, -Mocks skips the backend entirely.'
        Example  = 'bah-start -Fresh'
    }
    'bah-dev' = @{
        Synopsis = 'Dev loop, without opening a browser.'
        Body     = 'The same as bah-start minus the browser, which is what you want in a terminal you are already looking at.'
        Example  = 'bah-dev -Mocks'
    }
    'bah-stop' = @{
        Synopsis = 'Stop whatever is holding :4200 and :8080.'
        Body     = 'For when Ctrl+C could not run - a window closed with the X, or a leftover from a session you no longer have a terminal for. It finds the servers by asking who holds the ports and refuses to kill anything that is not node or java.'
        Example  = 'bah-stop'
    }
    'bah-api' = @{
        Synopsis = 'Call the local API from the shell.'
        Body     = 'A thin wrapper for poking :8080 by hand without writing curl invocations.'
        Example  = 'bah-api /api/recipes?locale=fr'
    }
    'bah-verify' = @{
        Synopsis = 'The full frontend chain: format, lint, typecheck, unit, build, e2e.'
        Body     = 'Green verify is the bar for merging into main. Runs from frontend/ wherever you call it.'
        Notes    = 'Runs against the mocks on port 4300, so a dev server on 4200 does not affect it and is not affected by it.'
        Example  = 'bah-verify'
    }
    'bah-test-backend' = @{
        Synopsis = 'The backend test suite.'
        Body     = 'mvnw test from backend/, using the committed wrapper rather than any Maven on the machine - there is not one.'
        Example  = 'bah-test-backend'
    }
    'bah-repo' = @{
        Synopsis = 'cd to the repository.'
        Body     = 'For when you want to be in it rather than call into it.'
        Example  = 'bah-repo'
    }
    'bah-shortcuts' = @{
        Synopsis = 'Regenerate these commands.'
        Body     = 'Rewrites the block in your profile. Run it after moving the clone, after adding a script, or after pulling changes to the shortcut generator.'
        Notes    = 'Takes -WhatIf to print the block without writing, and -Remove to take it out again.'
        Example  = 'bah-shortcuts -WhatIf'
    }
    'bah-deploy' = @{
        Synopsis = 'Build, check and ship the site to production.'
        Body     = 'Runs verify:prod and the backend tests, builds, packages the jar, checks the artefact, applies the server configuration when it has changed, uploads, restarts, and confirms the live site answers. It asks before doing any of it.'
        Notes    = 'CHANGES THE LIVE SITE. It stops in about a second when the server is already running this commit. -Provision forces the server configuration through even when unchanged; -Force deploys anyway when there is nothing new.'
        Example  = 'bah-deploy -Provision'
    }
    'bah-backup' = @{
        Synopsis = 'Pull the newest backup down to this machine.'
        Body     = 'Asks the server for its newest nightly snapshot of the database and the photographs, copies both here, checks the archives actually open, and puts a second copy in Google Drive.'
        Example  = 'bah-backup'
    }
    'bah-install-backup-task' = @{
        Synopsis = 'Schedule the nightly backup pull on this machine.'
        Body     = 'Registers a Windows scheduled task so the backup is fetched without anybody remembering to.'
        Notes    = 'Changes this machine, not the server. Run once.'
        Example  = 'bah-install-backup-task'
    }
    'bah-check' = @{
        Synopsis = 'What state is the server in. Read-only.'
        Body     = 'Copies check.sh up and runs it: operating system, disk, runtimes, the application and its files, services, listening ports, firewall, DNS, whether the site answers from the box and from the internet, recent log, backups, and the security summary.'
        Notes    = 'Changes nothing. This is the first thing to run when something looks wrong.'
        Example  = 'bah-check'
    }
    'bah-bans' = @{
        Synopsis = 'Who fail2ban is currently refusing.'
        Body     = 'The sshd jail and the one over Caddy access log. Bans last an hour and expire on their own.'
        Notes    = 'To let somebody back in early: bah-ssh "sudo fail2ban-client set sshd unbanip 1.2.3.4"'
        Example  = 'bah-bans'
    }
    'bah-serverlog' = @{
        Synopsis = 'The last 60 lines of the application log on the server.'
        Body     = 'journalctl for the bonapphedi unit. Refused requests appear here, written by the security audit filter.'
        Example  = 'bah-serverlog'
    }
    'bah-digest' = @{
        Synopsis = 'Run tonight''s log digest now.'
        Body     = 'Reads the day, mails only if something crossed a threshold, and then erases the access log.'
        Notes    = 'HAS SIDE EFFECTS. It erases the access log, which is the point of it - run it and the day is gone. It normally runs itself at 02:40.'
        Example  = 'bah-digest'
    }
    'bah-notify' = @{
        Synopsis = 'Send an alert, to check the path still works.'
        Body     = 'Pipes whatever it is given through the server notifier, which mails it to the addresses in BAH_ALERT_EMAIL.'
        Notes    = 'Sends real mail. Use it after changing the mail credentials.'
        Example  = '"something to say" | bah-notify "a test"'
    }
    'bah-backup-now' = @{
        Synopsis = 'Run the backup on the server now.'
        Body     = 'Starts the backup unit rather than waiting for 03:20, then shows how it went.'
        Notes    = 'Writes a new snapshot on the server. It does not pull anything down - that is bah-backup.'
        Example  = 'bah-backup-now'
    }
    'bah-provision' = @{
        Synopsis = 'Re-apply the server configuration.'
        Body     = 'A deploy with -Provision, which forces the server configuration step even when its hash says nothing changed. This is how a hand-edited box is put back, and how a new setting in the environment file is picked up.'
        Notes    = 'CHANGES THE LIVE SERVER. It restarts Caddy and fail2ban.'
        Example  = 'bah-provision'
    }
    'bah-ssh' = @{
        Synopsis = 'A shell on the server.'
        Body     = 'Plain ssh to the box, or run one command on it.'
        Example  = 'bah-ssh "systemctl status bonapphedi"'
    }
    'bah-help' = @{
        Synopsis = 'List every bah command.'
        Body     = 'One line each, grouped by what they touch. `man <name>` gives the full page for any of them.'
        Example  = 'bah-help'
    }
}

# Kept for the inline trailing comment on each generated line.
$what = @{}
foreach ($key in $help.Keys) { $what[$key] = $help[$key].Synopsis }

<#
    Every function goes out through here, so none of them can be written without
    its manual page - which is the same lesson as discovering the entry points
    rather than listing them. A command with no page is reported rather than
    emitted bare.

    The help block sits between `function name {` and the body, which is where
    Get-Help looks. `param` after it is fine and is how bah-notify works.
#>
function New-Shortcut {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Body,
        [string]$Param
    )

    $page = $help[$Name]
    if (-not $page) {
        Write-Host "  $Name has no manual page - add one to `$help in install-shortcuts.ps1" -ForegroundColor Yellow
    }

    $out = @("function $Name {")
    if ($page) {
        $out += '    <#'
        $out += '    .SYNOPSIS'
        $out += "        $($page.Synopsis)"
        if ($page.Body) {
            $out += '    .DESCRIPTION'
            $out += "        $($page.Body)"
        }
        if ($page.Notes) {
            $out += '    .NOTES'
            $out += "        $($page.Notes)"
        }
        if ($page.Example) {
            $out += '    .EXAMPLE'
            $out += "        $($page.Example)"
        }
        $out += '    #>'
    }
    if ($Param) { $out += "    $Param" }
    $out += "    $Body"
    $out += '}'
    $out += ''
    return $out
}

$commands = @()
$claimed = @{}

# The root is walked first on purpose. backup.bat exists in both places and the
# one at the root simply forwards to deploy's, so whichever is seen first is the
# right answer and the second is a duplicate rather than a different command.
foreach ($dir in @('', 'deploy')) {
    $full = if ($dir) { Join-Path $repo $dir } else { $repo }
    if (-not (Test-Path $full)) { continue }

    foreach ($file in Get-ChildItem -Path $full -Filter '*.bat' -File | Sort-Object Name) {
        if ($notEntryPoints -contains $file.Name) { continue }
        $name = if ($names.ContainsKey($file.Name)) { $names[$file.Name] } else { "bah-$($file.BaseName)" }
        $relative = if ($dir) { Join-Path $dir $file.Name } else { $file.Name }

        # Two functions of the same name is not an error in PowerShell: the
        # second silently replaces the first, so half the block would be
        # generated and quietly discarded. Discovery makes that easy to cause,
        # so it is refused here rather than left to be noticed.
        if ($claimed.ContainsKey($name)) {
            Write-Host "  $name already points at $($claimed[$name]); skipping $relative" -ForegroundColor DarkGray
            continue
        }

        $claimed[$name] = $relative
        $commands += @{ Name = $name; Path = $relative; What = $what[$name] }
    }
}

# dev.ps1 has no .bat of its own that does not also open a browser, and running
# the dev loop without one is the ordinary case in a terminal.
$commands += @{ Name = 'bah-dev'; Path = 'scripts\dev.ps1'; What = 'dev loop, no browser' }

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
    $lines += New-Shortcut -Name $command.Name -Body "& '$full' @args"
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
    $lines += New-Shortcut -Name 'bah-check' -Body "scp -q '$checkScript' ${targetHost}:/tmp/bonapphedi-check.sh; ssh $targetHost 'sudo bash /tmp/bonapphedi-check.sh; rm -f /tmp/bonapphedi-check.sh'"

    <#
        The rest are the copies provision.sh installed, so they are the versions
        the timers actually use rather than whatever is in this working tree.

        Discovered from deploy\*.sh for the same reason the local ones are:
        a script added there and forgotten here would just not be reachable, and
        nothing would say so. Each one needs to know how it is invoked, so the
        table below is keyed by filename and anything not in it is reported
        rather than skipped silently.
    #>
    $serverScripts = @{
        'digest.sh'    = @{ Name = 'bah-digest'; Run = "sudo /usr/local/bin/bonapphedi-digest"; What = "run tonight's digest now (mails, then erases the day)" }
        'backup.sh'    = @{ Name = 'bah-backup-now'; Run = "sudo systemctl start bonapphedi-backup; sleep 2; systemctl status bonapphedi-backup --no-pager -n 5"; What = 'run the backup on the server now' }
        'notify.sh'    = @{ Name = 'bah-notify'; Run = $null; What = 'send an alert, to check the path' }
        'check.sh'     = @{ Name = 'bah-check'; Run = $null; What = 'read-only: what state is the server in' }
        'provision.sh' = @{ Name = 'bah-provision'; Run = $null; What = 're-apply the server configuration through a deploy' }
    }

    foreach ($file in Get-ChildItem -Path (Join-Path $repo 'deploy') -Filter '*.sh' -File | Sort-Object Name) {
        if (-not $serverScripts.ContainsKey($file.Name)) {
            Write-Host "  deploy\$($file.Name) has no shortcut defined - add one to install-shortcuts.ps1" -ForegroundColor Yellow
            continue
        }
        $entry = $serverScripts[$file.Name]
        # The three with a null Run are written out below, because each needs
        # something a one-line ssh cannot express: a copy first, piped stdin, or
        # a local deploy instead.
        if ($entry.Run) {
            $lines += New-Shortcut -Name $entry.Name -Body "ssh $targetHost '$($entry.Run)'"
        }
    }

    $lines += New-Shortcut -Name 'bah-notify' `
        -Param "param([string]`$Subject = 'test')" `
        -Body "`$input | ssh $targetHost `"sudo /usr/local/bin/bonapphedi-notify '`$Subject'`""

    # provision.sh is never run by hand - it is step 4 of a deploy, and running
    # it out of band would apply a configuration the deploy has not checked.
    $lines += New-Shortcut -Name 'bah-provision' -Body "& '$(Join-Path $repo 'deploy\deploy.bat')' -Provision"

    $lines += New-Shortcut -Name 'bah-bans' -Body "ssh $targetHost 'sudo fail2ban-client status sshd; sudo fail2ban-client status bonapphedi'"
    $lines += New-Shortcut -Name 'bah-serverlog' -Body "ssh $targetHost 'sudo journalctl -u bonapphedi -n 60 --no-pager'"
    $lines += New-Shortcut -Name 'bah-ssh' -Body "ssh $targetHost @args"
}

# Repo-root-relative commands that are not a single script, so they are worth
# having as functions rather than as paths: both are run constantly and both
# need a specific directory, which is the whole friction being removed.
$lines += ''
$lines += New-Shortcut -Name 'bah-verify' -Body "Push-Location '$repo\frontend'; try { npm run verify @args } finally { Pop-Location }"
$lines += New-Shortcut -Name 'bah-test-backend' -Body "Push-Location '$repo\backend'; try { .\mvnw.cmd --batch-mode test @args } finally { Pop-Location }"
$lines += New-Shortcut -Name 'bah-repo' -Body "Set-Location '$repo'"

<#
    The index. Built from the same $help table the pages come from, and grouped
    by what a command touches - because "does this change the live server" is the
    question worth answering before "what does it do".
#>
$groups = [ordered]@{
    'Here, on this machine' = @('bah-start', 'bah-dev', 'bah-stop', 'bah-api', 'bah-verify', 'bah-test-backend', 'bah-repo', 'bah-shortcuts', 'bah-backup', 'bah-install-backup-task')
    'The server, read-only' = @('bah-check', 'bah-bans', 'bah-serverlog', 'bah-ssh')
    'The server, changes it' = @('bah-deploy', 'bah-provision', 'bah-digest', 'bah-notify', 'bah-backup-now')
}

$indexLines = @()
foreach ($group in $groups.Keys) {
    $present = $groups[$group] | Where-Object { $claimed.ContainsKey($_) -or $emitted -contains $_ }
    $indexLines += "    Write-Host ''; Write-Host '  $group' -ForegroundColor DarkGray"
    foreach ($name in $groups[$group]) {
        if (-not $help.ContainsKey($name)) { continue }
        $synopsis = $help[$name].Synopsis -replace "'", "''"
        $indexLines += "    if (Get-Command $name -ErrorAction SilentlyContinue) { Write-Host ('    {0,-24}{1}' -f '$name', '$synopsis') }"
    }
}

$lines += New-Shortcut -Name 'bah-help' -Body (
    ($indexLines -join "`r`n") +
    "`r`n    Write-Host ''; Write-Host '  man <name> for the full page, e.g. man bah-deploy' -ForegroundColor DarkGray; Write-Host ''"
)
$lines += $END

$block = $lines -join "`r`n"

# --- will a new terminal actually run this? ----------------------------------

<#
    The execution policy a NEW TERMINAL will use, which is emphatically not the
    one this script is running under.

    install-shortcuts.bat launches powershell with -ExecutionPolicy Bypass, the
    same as every other wrapper here. That is process-scoped, so a plain
    Get-ExecutionPolicy answers `Bypass` regardless of how the machine is set -
    it would measure the one state guaranteed not to be the user's, and report
    that all is well from inside the only shell where it is.

    So Process is skipped and the remaining scopes are read in precedence order.
    Undefined everywhere means Restricted on a client edition of Windows, which
    is the default and was this machine's setting.

    This exists because writing the profile is only half of making a command
    work. On 2026-08-30 this script wrote the file, printed `Wrote ...` and
    listed twenty commands that could not load - the profile is dot-sourced by
    the host at startup, and under Restricted PowerShell refuses to run it. The
    wrapper's Bypass cannot help: it applies to this process, and the profile is
    read by a different one. Every terminal opened after that greeted him with a
    PSSecurityException and no shortcuts.
#>
function Get-PolicyForNewShell {
    $scopes = Get-ExecutionPolicy -List
    foreach ($scope in 'MachinePolicy', 'UserPolicy', 'CurrentUser', 'LocalMachine') {
        $value = ($scopes | Where-Object { $_.Scope -eq $scope }).ExecutionPolicy
        if ($value -and $value -ne 'Undefined') { return $value }
    }
    return 'Restricted'
}

# AllSigned is in the refusing list on purpose: it runs local scripts only when
# they carry a signature, and this one generates an unsigned file.
$policy = Get-PolicyForNewShell
$profileWillLoad = $policy -in 'RemoteSigned', 'Unrestricted', 'Bypass'

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
        if ($without.Trim()) {
            Set-Content -Path $profilePath -Value $without -Encoding UTF8
            Write-Host "Removed the block from $profilePath" -ForegroundColor Green
        } else {
            <#
                Nothing of the user's was in it, so the file goes too.

                An empty profile is not the same as no profile. The host
                dot-sources whatever sits at that path before it ever looks
                inside, so under a policy that refuses scripts an empty
                profile.ps1 throws exactly the same PSSecurityException at every
                startup as a full one. Writing the empty string back left the
                most visible symptom of this script in place - in the one
                command whose entire job is to undo it.
            #>
            Remove-Item -Path $profilePath -Force
            Write-Host "Removed the block, and $profilePath with it - nothing else was in there." -ForegroundColor Green
        }
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

    # Say which of the two things just happened, rather than assuming the good
    # one. The file is written either way - what changes is whether anything
    # will read it, and that is the half worth reporting.
    if ($profileWillLoad) {
        Write-Host '  Open a new terminal, or run:  . $PROFILE' -ForegroundColor DarkGray
    } else {
        Write-Host "  ...but none of them will work yet." -ForegroundColor Yellow
        Write-Host ''
        Write-Host "  This machine's execution policy is $policy, so PowerShell refuses to" -ForegroundColor Yellow
        Write-Host '  run your profile at all, and every new terminal will open with a' -ForegroundColor Yellow
        Write-Host '  PSSecurityException instead of these commands.' -ForegroundColor Yellow
        Write-Host ''
        Write-Host '  To allow scripts you wrote yourself - per user, no admin needed:' -ForegroundColor Yellow
        Write-Host '      Set-ExecutionPolicy -Scope CurrentUser RemoteSigned' -ForegroundColor Cyan
        Write-Host ''
        Write-Host '  Or undo this and leave the machine as it is:' -ForegroundColor Yellow
        Write-Host '      .\install-shortcuts.bat -Remove' -ForegroundColor Cyan
    }
    Write-Host ''
} else {
    Write-Host $block
}
