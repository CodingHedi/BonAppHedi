<#
.SYNOPSIS
    Exercises the API by hand, with the CSRF handshake done once.

.DESCRIPTION
    The frontend is the real client and the e2e suite is the real acceptance
    test, so this is not a substitute for either. It exists because every write
    in this API needs a session cookie and a matching XSRF header, which makes
    "just curl it" a three-step dance that is tedious to get right at a prompt
    and easy to blame the server for when you don't.

    Each flow prints what it sent and what came back, so a surprising answer is
    readable rather than something to reconstruct.

    The admin flows need a signed-in admin, and there is no way to obtain one
    without a real Google round trip - which is the point of it. Sign in through
    the browser at http://localhost:4200, copy the value of the SESSION cookie
    from devtools, and pass it with -Session.

.PARAMETER BaseUrl
    Defaults to the backend directly. Point it at http://localhost:4200 to go
    through the Angular dev proxy instead, which is what a browser actually does.

.PARAMETER Session
    The SESSION cookie value, for the flows that need an account. Without it the
    admin flow still runs and asserts that it is refused, which is worth seeing.

.PARAMETER Flow
    Which flows to run. Defaults to everything that needs no account.

.EXAMPLE
    .\scripts\api.ps1
    .\scripts\api.ps1 -Flow Social
    .\scripts\api.ps1 -Flow Admin -Session 8f2c1e4a-...
#>
[CmdletBinding()]
param(
    [string]$BaseUrl = 'http://localhost:8080',
    [string]$Session,
    [ValidateSet('Public', 'Social', 'Abuse', 'Admin', 'All')]
    [string[]]$Flow = @('Public', 'Social', 'Abuse', 'Admin')
)

$ErrorActionPreference = 'Stop'

# Written for Windows PowerShell 5.1, which is what ships with Windows: no
# ternary, no ?? and no && anywhere below.

# The content is French and the console is not UTF-8 by default, so accented
# characters would arrive intact and then be mangled on the way to the screen.
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

function Write-Section {
    param([string]$Title)
    Write-Host ''
    Write-Host "--- $Title " -ForegroundColor Cyan -NoNewline
    Write-Host ('-' * [Math]::Max(0, 68 - $Title.Length)) -ForegroundColor DarkCyan
}

function Write-Result {
    param([string]$Label, $Response, [string]$Expected)

    $status = $Response.Status
    $ok = $true
    if ($Expected) { $ok = ($status -eq [int]$Expected) }

    $colour = 'Green'
    if (-not $ok) { $colour = 'Red' }

    $suffix = ''
    if ($Expected -and -not $ok) { $suffix = "  (expected $Expected)" }

    Write-Host ('{0,-52} {1}{2}' -f $Label, $status, $suffix) -ForegroundColor $colour
    if ($Response.Body) {
        Write-Host "    $($Response.Body)" -ForegroundColor DarkGray
    }
}

<#
    A browser session: a cookie jar, plus whatever CSRF token the server has
    issued into it.

    The GET is not decoration. Spring Security defers generating the token until
    something reads it, and CsrfCookieFilter is what forces it out as a cookie -
    so a session that has never made a request has no token to send, and its
    first write would be a 403 that looks like a bug.
#>
function New-ApiSession {
    param([string]$SessionCookie)

    $web = New-Object Microsoft.PowerShell.Commands.WebRequestSession

    if ($SessionCookie) {
        $cookie = New-Object System.Net.Cookie('SESSION', $SessionCookie, '/', ([Uri]$BaseUrl).Host)
        $web.Cookies.Add($cookie)
    }

    # Any GET will do; this one is the cheapest and says who you are.
    Invoke-WebRequest -Uri "$BaseUrl/api/auth/session" -WebSession $web -UseBasicParsing `
        -TimeoutSec 10 | Out-Null

    return $web
}

function Get-CsrfToken {
    param($Web)

    $token = $Web.Cookies.GetCookies([Uri]$BaseUrl)['XSRF-TOKEN']
    if (-not $token) {
        throw 'No XSRF-TOKEN cookie was issued. Is CsrfCookieFilter still in the chain?'
    }
    return $token.Value
}

<#
    One request, returning its status whatever that status is.

    Invoke-WebRequest throws on anything that is not 2xx, and half of what is
    worth checking here is a 401, a 403 or a 429. Catching turns those back into
    answers rather than terminating errors.
#>
function Invoke-Api {
    param(
        [string]$Method,
        [string]$Path,
        $Web,
        [string]$Body,
        [switch]$NoCsrf
    )

    $headers = @{}
    if (-not $NoCsrf -and $Method -ne 'GET') {
        $headers['X-XSRF-TOKEN'] = Get-CsrfToken -Web $Web
    }

    $arguments = @{
        Uri             = "$BaseUrl$Path"
        Method          = $Method
        WebSession      = $Web
        Headers         = $headers
        UseBasicParsing = $true
        TimeoutSec      = 15
    }
    if ($Body) {
        $arguments['Body'] = $Body
        $arguments['ContentType'] = 'application/json; charset=utf-8'
    }

    try {
        $response = Invoke-WebRequest @arguments
        return [pscustomobject]@{ Status = [int]$response.StatusCode; Body = (Limit-Text (Read-Utf8 $response)) }
    }
    catch [System.Net.WebException] {
        if ($_.Exception.Response) {
            return [pscustomobject]@{ Status = [int]$_.Exception.Response.StatusCode; Body = '' }
        }
        throw
    }
}

<#
    Decodes the body ourselves, as UTF-8, because Windows PowerShell will not.

    Spring 6 serves `application/json` with no charset parameter - correct, since
    JSON is UTF-8 by definition - and Invoke-WebRequest falls back to ISO-8859-1
    when the parameter is missing. Left alone, "Hédi" prints as "HÃ©di" and the
    API looks broken when it is the client that is wrong. Worth the four lines:
    a script that misrepresents the thing it is checking is worse than no script.
#>
function Read-Utf8 {
    param($Response)

    if (-not $Response.RawContentStream) { return $Response.Content }

    $bytes = $Response.RawContentStream.ToArray()
    return [System.Text.Encoding]::UTF8.GetString($bytes)
}

# Long JSON is noise at a prompt; a trimmed first slice of it usually is not.
function Limit-Text {
    param([string]$Text, [int]$Max = 160)

    if (-not $Text) { return '' }
    $flat = ($Text -replace '\s+', ' ').Trim()
    if ($flat.Length -le $Max) { return $flat }
    return $flat.Substring(0, $Max) + ' ...'
}

# --- flows ------------------------------------------------------------------

function Invoke-PublicFlow {
    Write-Section 'Public reads - no account, no cookie, no CSRF'

    $web = New-ApiSession
    foreach ($path in @(
            '/api/recipes?locale=fr',
            '/api/recipes/featured?locale=fr',
            '/api/recipes/babka-au-chocolat?locale=fr',
            '/api/recipes/babka-au-chocolat/comments?locale=fr',
            '/api/tags?locale=fr',
            '/api/authors',
            '/api/auth/providers')) {

        Write-Result "GET $path" (Invoke-Api -Method GET -Path $path -Web $web) 200
    }

    # A draft is invisible to the public, and so is a slug from the other
    # language. Both are 404 on purpose: distinguishing them would confirm that
    # an unpublished recipe exists.
    Write-Result 'GET a draft by slug' `
    (Invoke-Api -Method GET -Path '/api/recipes/jus-grenade-orange?locale=fr' -Web $web) 404
    Write-Result 'GET a French slug asked for in English' `
    (Invoke-Api -Method GET -Path '/api/recipes/babka-au-chocolat?locale=en' -Web $web) 404
}

function Invoke-SocialFlow {
    Write-Section 'Social writes - the CSRF handshake and the visitor cookie'

    $web = New-ApiSession

    # Nothing is stored about someone who only reads, so there is no visitor
    # cookie yet however many pages they have looked at.
    $before = $web.Cookies.GetCookies([Uri]$BaseUrl)['bah-visitor']
    if ($before) {
        Write-Host 'A visitor cookie exists before any write, which it should not.' -ForegroundColor Red
    }
    else {
        Write-Host 'No visitor cookie before the first write, as intended.' -ForegroundColor Green
    }

    # The test that stops anyone "fixing" a 403 by disabling CSRF.
    Write-Result 'PUT a rating with no XSRF header' `
    (Invoke-Api -Method PUT -Path '/api/recipes/babka-au-chocolat/rating?locale=fr' `
            -Web $web -Body '{"stars":5}' -NoCsrf) 403

    Write-Result 'PUT a rating of 5 (fr)' `
    (Invoke-Api -Method PUT -Path '/api/recipes/babka-au-chocolat/rating?locale=fr' `
            -Web $web -Body '{"stars":5}') 200

    $after = $web.Cookies.GetCookies([Uri]$BaseUrl)['bah-visitor']
    if ($after) {
        Write-Host "Visitor cookie issued on the first write: $($after.Value)" -ForegroundColor Green
    }
    else {
        Write-Host 'No visitor cookie was issued by a write, which breaks dedupe.' -ForegroundColor Red
    }

    # Same recipe, other language, same person. The count must not move: a vote
    # belongs to the recipe, and the slug belongs to a translation.
    Write-Result 'PUT a rating of 3 on the English slug' `
    (Invoke-Api -Method PUT -Path '/api/recipes/chocolate-babka/rating?locale=en' `
            -Web $web -Body '{"stars":3}') 200

    Write-Result 'PUT a reaction on' `
    (Invoke-Api -Method PUT -Path '/api/recipes/babka-au-chocolat/reaction?locale=fr' `
            -Web $web -Body '{"reacted":true}') 200
    Write-Result 'PUT the same reaction again (cannot count twice)' `
    (Invoke-Api -Method PUT -Path '/api/recipes/babka-au-chocolat/reaction?locale=fr' `
            -Web $web -Body '{"reacted":true}') 200

    Write-Result 'GET the recipe back as this same visitor' `
    (Invoke-Api -Method GET -Path '/api/recipes/babka-au-chocolat?locale=fr' -Web $web) 200

    Write-Result 'PUT a rating of 9 (off the scale)' `
    (Invoke-Api -Method PUT -Path '/api/recipes/babka-au-chocolat/rating?locale=fr' `
            -Web $web -Body '{"stars":9}') 400

    Write-Result 'POST a comment with no session' `
    (Invoke-Api -Method POST -Path '/api/recipes/babka-au-chocolat/comments?locale=fr' `
            -Web $web -Body '{"bodyMarkdown":"Bonjour"}') 401
}

function Invoke-AbuseFlow {
    Write-Section 'Clearing cookies to vote again'

    # A fresh session each time is a browser with its cookies cleared. The
    # fingerprint does not change with them, which is the entire point: two per
    # fingerprint is a shared laptop, the third is one person voting twice.
    for ($i = 1; $i -le 4; $i++) {
        $web = New-ApiSession
        $result = Invoke-Api -Method PUT -Path '/api/recipes/babka-au-chocolat/rating?locale=fr' `
            -Web $web -Body '{"stars":5}'

        Write-Result "cookie #$i from this machine" $result
    }

    Write-Host 'Expect the first two to be 200 and the rest 429, unless this' -ForegroundColor DarkGray
    Write-Host 'machine has already used its allowance against a database that' -ForegroundColor DarkGray
    Write-Host 'was not reset - scripts\dev.ps1 -Fresh clears it.' -ForegroundColor DarkGray
}

function Invoke-AdminFlow {
    Write-Section 'Admin - refused without an account, and without the role'

    $web = New-ApiSession -SessionCookie $Session

    $expected = 401
    if ($Session) { $expected = 200 }

    foreach ($path in @(
            '/api/admin/recipes?locale=fr',
            '/api/admin/recipes/babka',
            '/api/admin/recipes/blank',
            '/api/admin/comments/pending?locale=fr',
            '/api/admin/stats?locale=fr')) {

        Write-Result "GET $path" (Invoke-Api -Method GET -Path $path -Web $web) $expected
    }

    if (-not $Session) {
        Write-Host ''
        Write-Host 'Those 401s are the guard working. To see the admin area itself,' -ForegroundColor DarkGray
        Write-Host 'sign in at http://localhost:4200, copy the SESSION cookie out of' -ForegroundColor DarkGray
        Write-Host 'devtools and re-run with -Session <value>. An account only becomes' -ForegroundColor DarkGray
        Write-Host 'an admin if its address is in bah.admin.emails.' -ForegroundColor DarkGray
        return
    }

    # Round-trips a real recipe through the editor: read it, save it back
    # unchanged, and confirm the site still has it. Saving a draft over a recipe
    # is the one operation here that can silently destroy something, so it is
    # worth doing against a database you do not mind losing.
    Write-Section 'Admin - a save round trip'

    $draft = Invoke-Api -Method GET -Path '/api/admin/recipes/babka' -Web $web
    Write-Result 'GET the babka as a draft' $draft 200

    if ($draft.Status -eq 200) {
        Write-Host 'Not saving it back automatically: a save is destructive if the' -ForegroundColor DarkGray
        Write-Host 'draft is wrong, and this script is for looking rather than for' -ForegroundColor DarkGray
        Write-Host 'writing over your own content.' -ForegroundColor DarkGray
    }
}

# --- run --------------------------------------------------------------------

Write-Host "Base URL: $BaseUrl" -ForegroundColor DarkGray

try {
    Invoke-WebRequest -Uri "$BaseUrl/api/auth/providers" -UseBasicParsing -TimeoutSec 5 | Out-Null
}
catch {
    throw "Nothing is answering at $BaseUrl. Start it with .\scripts\dev.ps1."
}

$wanted = $Flow
if ($Flow -contains 'All') { $wanted = @('Public', 'Social', 'Abuse', 'Admin') }

if ($wanted -contains 'Public') { Invoke-PublicFlow }
if ($wanted -contains 'Social') { Invoke-SocialFlow }
if ($wanted -contains 'Abuse') { Invoke-AbuseFlow }
if ($wanted -contains 'Admin') { Invoke-AdminFlow }

Write-Host ''
