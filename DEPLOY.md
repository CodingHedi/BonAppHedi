# Deploying

One fat jar behind Caddy on an OVH VPS. The jar holds the Angular build and the
API, so there is one process, one port and one thing to restart.

| | |
|---|---|
| Domain | `bonapphedi.fr` (`www` redirects to it) |
| VPS | `141.95.86.140` · `2001:41d0:701:1100::4326` · Ubuntu 26.04 |
| Service | `bonapphedi.service`, running as `bonapphedi`, bound to `127.0.0.1:8080` |
| TLS | Caddy, automatic, renewing itself |
| Database | `/var/lib/bonapphedi/bonapphedi.db`, backed up nightly |
| Secrets | `/etc/bonapphedi/bonapphedi.env`, `root:bonapphedi 640`, never in the repo |

---

## Day to day

```powershell
.\scripts\deploy.ps1
```

That runs `verify:prod` and the backend tests, builds, packages, checks the
artefact, uploads, restarts, and then fetches the live site to confirm. It
refuses to continue at the first failure, and the site is untouched until the
upload succeeds.

`-SkipVerify` exists for a retry after a failed upload. Not for a first deploy:
`verify:prod` is the gate, and skipping it deploys a bundle whose production
build and budgets were never exercised.

**Rolling back.** The previous jar stays on the server:

```bash
ssh ubuntu@141.95.86.140 "cd /opt/bonapphedi && sudo mv bonapphedi.jar.previous bonapphedi.jar && sudo systemctl restart bonapphedi"
```

---

## First time, or after a reinstall

**1. DNS.** Three records, and the AAAA is the one that gets forgotten:

| Type | Sub-domain | Target |
|---|---|---|
| A | *(root)* | `141.95.86.140` |
| AAAA | *(root)* | `2001:41d0:701:1100::4326` |
| A | `www` | `141.95.86.140` |

Never use OVH's **réinitialiser la zone**. It restores their hosting defaults —
pointing the domain at `213.186.33.5` — and deletes custom records including the
`selector1._domainkey` DKIM entry, which breaks outgoing mail signing silently.
It has already happened once.

**1b. SSH keys, if `ssh` asks for a password.**

OVH installs the key you paste into the reinstall form. If that was skipped — or
the box was reinstalled without one — log in with the password OVH emailed and
push the key up:

```powershell
Get-Content $env:USERPROFILE\.ssh\id_ed25519.pub |
  ssh ubuntu@141.95.86.140 "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys"
```

It asks for the password once. After that `ssh ubuntu@141.95.86.140` should log
straight in, and everything below works unattended. Confirm that before running
`provision.sh`, which turns password authentication off — it only does so when
it can already see an `authorized_keys`, but there is no reason to test that
guard by accident.

**2. Provision the box.**

```powershell
scp deploy\provision.sh deploy\Caddyfile deploy\bonapphedi.service `
    deploy\bonapphedi-backup.service deploy\bonapphedi-backup.timer deploy\backup.sh `
    ubuntu@141.95.86.140:/tmp/
ssh ubuntu@141.95.86.140 "cd /tmp && sudo bash provision.sh"
```

The OVH Ubuntu image has no root login — it ships an `ubuntu` account with
sudo, and SSH refuses root outright. Everything here connects as `ubuntu` and
elevates only where it must.

Idempotent — re-running it is how you apply a change to the Caddyfile or the
unit. It installs the Java runtime, Caddy, the service account, the units, the
firewall and unattended upgrades, and it does *not* start the application,
because there is no jar yet.

It disables SSH password authentication only if it finds an `authorized_keys`
already in place. That guard is deliberate: getting it wrong locks you out of a
machine whose only door it is.

**3. Fill in the secrets.**

```bash
ssh ubuntu@141.95.86.140 "sudo nano /etc/bonapphedi/bonapphedi.env"
```

```
BAH_GOOGLE_CLIENT_ID=…
BAH_GOOGLE_CLIENT_SECRET=…
BAH_ADMIN_EMAILS=you@example.com
BAH_FINGERPRINT_SALT=…        # openssl rand -base64 36
```

Leave any of them blank and the site still runs — it simply offers no sign-in,
which is a supported state (ADR 3). A blank `BAH_FINGERPRINT_SALT` is the one
worth caring about: it regenerates on every restart, so rating-abuse detection
silently resets with each deploy.

**4. Register the production redirect URI** in the Google Cloud console:

```
https://bonapphedi.fr/login/oauth2/code/google
```

Sign-in works locally and fails in production without it, and this is the only
step in the whole list that cannot be done from a terminal.

**5. Deploy.** `.\scripts\deploy.ps1`.

---

## Changing the Content-Security-Policy

**Test it against a running jar before it goes anywhere near the server.** The
first attempt at a CSP here was reasoned about rather than measured, applied
straight to production, and took the site down. `scripts/csp-lab.mjs` exists so
that cannot happen twice: it starts a browser, injects the policy on every
response the site serves, and reports what the browser refused.

```powershell
cd backend ; .\mvnw.cmd -Pweb -DskipTests package
java -jar backend\target\bonapphedi-0.0.1-SNAPSHOT.jar
# in another shell, with the policy copied out of deploy/Caddyfile:
node scripts\csp-lab.mjs "default-src 'self'; script-src ..."
```

It checks the five things a CSP breaks here — the cards render, the theme
bootstrap ran, component styles applied, the ICU plural resolved, the video
iframe loaded — and exits nonzero on any violation. Confirm a change by removing
a term and watching the right check go red; a run that cannot fail is not
evidence.

Then edit `deploy/Caddyfile`, re-run `provision.sh`, or copy it up by hand:

```powershell
scp deploy\Caddyfile ubuntu@141.95.86.140:/tmp/
ssh ubuntu@141.95.86.140 "sudo install -o root -g root -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile && sudo -u caddy caddy validate --config /etc/caddy/Caddyfile && sudo systemctl reload caddy"
```

`validate` runs **as the `caddy` user** deliberately, and the file is copied
rather than piped — both for reasons written up under "When something is wrong".

Two terms in the current policy are weaker than they look and are deliberate:
`'unsafe-eval'` is there because messageformat compiles ICU plurals with
`new Function` (see `Docs/backlog.md`), and `style-src 'unsafe-inline'` because
Angular sets styles at runtime. The inline theme script is allowed by **hash**,
and `deploy.ps1` refuses to ship if that hash goes stale.

---

## When something is wrong

```powershell
scp deploy\check.sh ubuntu@141.95.86.140:/tmp/
ssh ubuntu@141.95.86.140 "sudo bash /tmp/check.sh"
```

Read-only, and safe on a box you do not trust.

**Copy the file, do not stream it.** Every one-liner for this online is a
variation of `ssh host 'bash -s' < script.sh`, and on Windows all of them fail:

- PowerShell 5.1 has **no `<` operator** at all — it is a parser error.
- `cmd.exe` honours the redirect but does not strip single quotes, so the remote
  shell hunts for a command literally named `bash -s`.
- `Get-Content script.sh | ssh ...` gets past both and then fails differently:
  PowerShell splits the file into lines and re-emits them **CRLF**, so every
  line arrives with a trailing `\r` and bash reports `$'\r': command not found`
  on a script that is LF-clean in the repository.

`scp` copies bytes verbatim. Nothing translates, nothing re-encodes. That is why
these instructions transfer files and then run them, rather than piping. It reports the OS, the runtimes,
whether each file and unit is where it should be, which environment variables
are still empty, what is listening, the firewall, what DNS looks like from the
box, whether the site answers both locally and over TLS, and the last dozen log
lines.

Otherwise:

```bash
sudo journalctl -u bonapphedi -f      # the application
sudo journalctl -u caddy -n 50        # certificates and proxying
sudo systemctl status bonapphedi
```

**Symptoms worth recognising:**

*502 from Caddy* — Caddy is fine and the application is not running. `journalctl
-u bonapphedi -n 50`. Usually a jar that failed to start.

*Certificate errors on a new domain* — Caddy could not complete the ACME
challenge, which almost always means DNS. Check that both A and AAAA point at
this machine: a stale AAAA aimed somewhere else fails the challenge over IPv6
while everything looks correct over IPv4.

*Sign-in bounces back signed out* — the redirect URI is not registered, or
`server.forward-headers-strategy` is missing so Spring built the callback as
`http://`.

*Every page 404s but `/api/recipes` works* — the jar was built without `-Pweb`,
so it has no `static/index.html`. `deploy.ps1` checks for this before uploading.

---

## Backups

`bonapphedi-backup.timer` runs nightly at 03:20, takes a consistent snapshot
with `sqlite3 .backup` — not `cp`, which can capture a torn write — verifies the
copy with `PRAGMA integrity_check`, compresses it and keeps 30 days in
`/var/backups/bonapphedi/`.

Restoring:

```bash
sudo systemctl stop bonapphedi
sudo sh -c 'gunzip -c /var/backups/bonapphedi/bonapphedi-2026-07-28.db.gz > /var/lib/bonapphedi/bonapphedi.db'
sudo chown bonapphedi:bonapphedi /var/lib/bonapphedi/bonapphedi.db
sudo systemctl start bonapphedi
```

**These backups are on the same disk as the database.** They survive a mistake,
not a dead VPS. Copying them off the machine is a separate decision and has not
been made.
