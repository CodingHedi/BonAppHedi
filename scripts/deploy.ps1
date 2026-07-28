<#
.SYNOPSIS
    Build, verify and ship Bon App' Hedi to the VPS.

.DESCRIPTION
    Builds the frontend, packages the fat jar, checks it, uploads it and
    restarts the service - then confirms the site actually answers.

    The order matters. `verify:prod` runs before anything is built for real,
    because it is the gate described in README and TESTING: a deploy that
    skips it is a deploy whose bundle budgets and production build have never
    been exercised.

.PARAMETER SkipVerify
    Skip the frontend verify chain. For a second attempt after a failed upload,
    when the artefact has already been proven. Not for a first deploy.

.PARAMETER Host
    Override the target. Defaults to the production VPS.

.EXAMPLE
    .\scripts\deploy.ps1
    .\scripts\deploy.ps1 -SkipVerify
#>
[CmdletBinding()]
param(
    [switch]$SkipVerify,
    [string]$TargetHost = 'root@141.95.86.140'
)

$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent

function Step($text) { Write-Host "`n==> $text" -ForegroundColor Cyan }
function Ok($text)   { Write-Host "    $text" -ForegroundColor DarkGray }
function Die($text)  { Write-Host "`n !  $text" -ForegroundColor Red; exit 1 }

# Node lives behind NVM for Windows and is not on PATH non-interactively.
$env:Path = "C:\nvm4w\nodejs;$env:Path"

# --- 1. the gate ------------------------------------------------------------

if (-not $SkipVerify) {
    Step 'Verifying the frontend against a production build'
    Push-Location "$repo\frontend"
    try {
        npm run verify:prod
        if ($LASTEXITCODE -ne 0) { Die 'verify:prod failed - nothing was deployed.' }
    } finally { Pop-Location }
} else {
    Write-Host "`n !  Skipping verify:prod at your request" -ForegroundColor Yellow
}

Step 'Running the backend tests'
Push-Location "$repo\backend"
try {
    .\mvnw.cmd --batch-mode test
    if ($LASTEXITCODE -ne 0) { Die 'Backend tests failed - nothing was deployed.' }
} finally { Pop-Location }

# --- 2. build ---------------------------------------------------------------

Step 'Building the Angular application'
Push-Location "$repo\frontend"
try {
    npm run build
    if ($LASTEXITCODE -ne 0) { Die 'ng build failed.' }
} finally { Pop-Location }

Step 'Packaging the fat jar'
Push-Location "$repo\backend"
try {
    .\mvnw.cmd --batch-mode -Pweb -DskipTests clean package
    if ($LASTEXITCODE -ne 0) { Die 'Packaging failed.' }
} finally { Pop-Location }

$jar = Get-ChildItem "$repo\backend\target\*.jar" | Where-Object { $_.Name -notlike '*sources*' } | Select-Object -First 1
if (-not $jar) { Die 'No jar was produced.' }
Ok "$($jar.Name)  $([math]::Round($jar.Length / 1MB, 1)) MB"

# --- 3. check the artefact before it leaves the machine ---------------------

Step 'Checking the jar'

# The build excludes application-local.yml, and this is the belt to that
# braces: one careless edit to the pom would start shipping a live Google
# secret to a server, and nothing else would say so.
$entries = & "$env:JAVA_HOME\bin\jar.exe" tf $jar.FullName
if ($entries -match 'application-local\.yml$') {
    Die 'The jar contains application-local.yml - it would carry live credentials. Fix the maven-jar-plugin excludes before deploying.'
}
Ok 'no local credentials inside'

# A jar with no index.html answers every page with a 404 and looks like a
# server problem. The -Pweb enforcer checks this too; it costs nothing here.
if (-not ($entries -match 'BOOT-INF/classes/static/index\.html$')) {
    Die 'The jar has no static/index.html - the Angular build did not make it in.'
}
Ok 'the Angular build is inside'

# --- 4. ship ----------------------------------------------------------------

Step "Uploading to $TargetHost"
# Uploaded beside the live jar and moved into place afterwards, so a dropped
# connection leaves the running version untouched rather than half-written.
scp $jar.FullName "${TargetHost}:/opt/bonapphedi/bonapphedi.jar.new"
if ($LASTEXITCODE -ne 0) { Die 'Upload failed - the running version is untouched.' }

Step 'Swapping it in and restarting'
$remote = @'
set -euo pipefail
cd /opt/bonapphedi
# Keep one generation back. `systemctl rollback` is not a thing; this is.
[ -f bonapphedi.jar ] && cp bonapphedi.jar bonapphedi.jar.previous
mv bonapphedi.jar.new bonapphedi.jar
chown root:root bonapphedi.jar
chmod 644 bonapphedi.jar
systemctl restart bonapphedi
sleep 3
systemctl is-active --quiet bonapphedi && echo "service is active" || {
  echo "SERVICE FAILED TO START - last 30 lines:" >&2
  journalctl -u bonapphedi -n 30 --no-pager >&2
  exit 1
}
'@
ssh $TargetHost $remote
if ($LASTEXITCODE -ne 0) {
    Die "The service did not come back. The previous jar is at /opt/bonapphedi/bonapphedi.jar.previous - to roll back:`n    ssh $TargetHost 'cd /opt/bonapphedi && mv bonapphedi.jar.previous bonapphedi.jar && systemctl restart bonapphedi'"
}

# --- 5. confirm from outside ------------------------------------------------

Step 'Checking the live site'
# From here rather than from the box: "systemd says active" and "the site
# answers over TLS" are different claims, and only the second one matters.
Start-Sleep -Seconds 3
try {
    $r = Invoke-WebRequest 'https://bonapphedi.fr/fr' -TimeoutSec 25 -UseBasicParsing
    if ($r.StatusCode -eq 200 -and $r.Content -match '<html') {
        Ok "https://bonapphedi.fr/fr -> 200"
    } else {
        Die "Unexpected response: $($r.StatusCode)"
    }
} catch {
    Die "The site did not answer: $($_.Exception.Message)`nThe service is running; check Caddy with:  ssh $TargetHost 'journalctl -u caddy -n 40 --no-pager'"
}

# A deep link, because that is the one the SPA fallback exists for and the one
# that would have 404'd on every deploy before it was written.
try {
    $d = Invoke-WebRequest 'https://bonapphedi.fr/fr/recettes/babka-au-chocolat' -TimeoutSec 25 -UseBasicParsing
    if ($d.StatusCode -eq 200) { Ok 'deep links resolve' } else { Die "Deep link returned $($d.StatusCode)" }
} catch {
    Die "Deep link failed: $($_.Exception.Message)"
}

Write-Host "`nDeployed. https://bonapphedi.fr`n" -ForegroundColor Green
