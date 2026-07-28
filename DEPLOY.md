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
ssh root@141.95.86.140 'cd /opt/bonapphedi && mv bonapphedi.jar.previous bonapphedi.jar && systemctl restart bonapphedi'
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

**2. Provision the box.**

```powershell
scp deploy\provision.sh deploy\Caddyfile deploy\bonapphedi.service `
    deploy\bonapphedi-backup.service deploy\bonapphedi-backup.timer deploy\backup.sh `
    root@141.95.86.140:/tmp/
ssh root@141.95.86.140 'cd /tmp && bash provision.sh'
```

Idempotent — re-running it is how you apply a change to the Caddyfile or the
unit. It installs the Java runtime, Caddy, the service account, the units, the
firewall and unattended upgrades, and it does *not* start the application,
because there is no jar yet.

It disables SSH password authentication only if it finds an `authorized_keys`
already in place. That guard is deliberate: getting it wrong locks you out of a
machine whose only door it is.

**3. Fill in the secrets.**

```bash
ssh root@141.95.86.140 'nano /etc/bonapphedi/bonapphedi.env'
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

## When something is wrong

```powershell
ssh root@141.95.86.140 'bash -s' < deploy\check.sh
```

Read-only, and safe on a box you do not trust. It reports the OS, the runtimes,
whether each file and unit is where it should be, which environment variables
are still empty, what is listening, the firewall, what DNS looks like from the
box, whether the site answers both locally and over TLS, and the last dozen log
lines.

Otherwise:

```bash
journalctl -u bonapphedi -f          # the application
journalctl -u caddy -n 50            # certificates and proxying
systemctl status bonapphedi
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
systemctl stop bonapphedi
gunzip -c /var/backups/bonapphedi/bonapphedi-2026-07-28.db.gz > /var/lib/bonapphedi/bonapphedi.db
chown bonapphedi:bonapphedi /var/lib/bonapphedi/bonapphedi.db
systemctl start bonapphedi
```

**These backups are on the same disk as the database.** They survive a mistake,
not a dead VPS. Copying them off the machine is a separate decision and has not
been made.
