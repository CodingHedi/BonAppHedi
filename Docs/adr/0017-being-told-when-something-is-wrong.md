# 17. Being told when something is wrong

Date: 2026-08-30 · Status: proposed

## Context

The ask was protection against people poking at the site, and logs somebody
looks at regularly. Auditing the server first turned up something that reframes
both.

### What is already there, and is better than expected

| Layer | State |
|---|---|
| Firewall | ufw, ports 22/80/443 only — **8080 deliberately absent**, the application binds loopback |
| SSH | `PasswordAuthentication no`, `PermitRootLogin prohibit-password` |
| Patching | `unattended-upgrades` |
| Headers | HSTS, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, CSP by hash |
| Authorization | `ApiSecurityMatrixTest` — no `/api` route exists without a declared rule |
| CSRF | Enforced, with two load-bearing filters |
| Abuse | One control: `bah.security.max-visitors-per-fingerprint`, answering 429 |

**Nobody can reach the database.** SQLite is a file, the application binds
`127.0.0.1`, and ufw does not open 8080. The realistic version of that worry is
scripted abuse of the public API — comment spam, rating manipulation, admin
brute force, scraping — and everything below is about that.

### There are no access logs. Not somewhere inconvenient — none

`deploy/Caddyfile` says:

> Access logs go to journald, which is Caddy's default and is where DEPLOY.md
> already sends you: `journalctl -u caddy`.

**That is wrong.** Caddy v2 does not log requests unless a site block has a
`log` directive, and this one has not had it since the `log { output file … }`
block was removed over a permissions problem. Removing it did not relocate the
access logs; it turned them off.

Measured on 2026-08-30: **25 Caddy log lines in 24 hours, zero of them requests**
over 48 — every one an ACME renewal or a TLS cache message. So "inspect the logs
regularly" currently has nothing to inspect, and the reason it looks fine is a
comment that describes a behaviour Caddy does not have.

### Nothing can tell anybody anything

No `msmtp`, no mail transport, no webhook, and no `OnFailure=` on any unit.
**The nightly backup can fail silently, and would.** That is not a security hole
and it is the more likely one to cost something.

### The application says nothing worth reading

`grep` for warn and error across `backend/src/main/java` returns media write
failures and one fingerprint warning. Not a line for a failed admin attempt, a
401, a 403, or a moderation action. A log review today would find nothing —
because nothing is written, not because nothing happened.

## Decision

Five stages, smallest and most valuable first. **Stage 1 is worth more than 3
to 5 combined**: a personal recipe site's realistic threat is a broken backup
discovered six months later, not a targeted attacker.

### 1. A way to be told

`msmtp` against an existing mailbox, one `notify` helper, and `OnFailure=` on
the backup unit. Everything after this depends on it.

The credential follows the pattern `bah.oauth` already set: it lives in
`/etc/bonapphedi/bonapphedi.env`, and **blank means notifications are off and
that is a supported state**, exactly as zero configured sign-in providers is.
A server that cannot mail must still boot, back up and serve.

### 2. Write the logs worth reading

Two halves, because they answer different questions.

**Caddy access logs to a file**, rotated, and the permissions trap that broke
the service last time is written into the Caddyfile already: `caddy validate`
runs as root, opens the log file, and creates it `root:root 0600`, after which
the caddy user cannot write to it and the unit dies at startup. So provisioning
creates the directory and chowns it *before* validate ever runs.

**A security log in the application**: sign-in success and failure, admin
access, every 401 and 403 with the path, and moderation actions. Not IP
addresses — `VisitorIdentity` already HMACs those and the privacy page promises
no raw address is stored; a security log that quietly broke that promise would
be a worse problem than the one it solves.

### 3. fail2ban

The standard `sshd` jail, plus one over the Caddy access log for repeated
failures against `/api/admin/**` and `/oauth2/**`. This is the only stage that
*stops* anybody rather than telling somebody afterwards.

### 4. A nightly digest

A timer that reads the last 24 hours and mails only when something crosses a
threshold: 4xx concentrated on one source, any admin 401, a 5xx spike, a failed
backup, disk over 80%.

**Silence has to mean nothing happened, not that the timer died.** So it also
sends one line a week when all is well — an alerting channel that has been quiet
for a month is indistinguishable from a broken one, and the second is more
likely.

`check.sh` gains a read-only `--security` mode over the same queries, so the
digest and a look by hand cannot disagree about what the logs say.

### 5. A ceiling on writes

Not a tuned rate limit — there is no traffic to tune against, and 25 log lines a
day is not a sample. A generous ceiling on the write endpoints in a Spring
filter: high enough that no reader will ever meet it, low enough that a script
cannot post a thousand comments.

In the application rather than in Caddy, because `caddy-ratelimit` needs a
custom Caddy build and this needs one file.

### Definition of done

| # | Criterion |
|---|---|
| 1 | A failing backup sends mail, demonstrated by making one fail on purpose |
| 2 | An unset mail credential leaves the server booting, backing up and serving, with nothing failing |
| 3 | `journalctl -u caddy` and the access-log file both show requests, and Caddy still starts after `provision.sh` runs twice |
| 4 | A failed admin attempt, a 401 and a moderation action each write one line naming the path and no raw IP address |
| 5 | fail2ban bans a source that fails admin auth repeatedly, demonstrated against a throwaway address |
| 6 | The digest mails on a threshold being crossed and stays silent otherwise, and says so weekly regardless |
| 7 | `check.sh --security` answers the same questions read-only, changing nothing |
| 8 | The write ceiling refuses a scripted burst and is never met by the e2e suite, which is the closest thing to a real reader here |
| 9 | The privacy page says what the server logs and for how long, in both languages |

## Consequences

**New ops files do not ship unless `deploy.ps1` is told about them.** Step 4
scp's a *fixed list* of six filenames and runs `provision.sh` from `/tmp`; a
seventh file added to `deploy/` is hashed by nothing, uploaded by nothing, and
silently absent on the server while everything reports success. Every stage
below adds files, so that array grows with them. This is the trap the ops
conventions warn about in general terms and it now has a specific instance.

**The privacy page changes, and this is the same argument ADR 15 makes about
analytics.** An access log records visits with IP addresses, and the page
currently says « Les visites ne sont pas comptées » and « Rien n'est
enregistré ». Security logging is a legitimate interest and does not need
consent, but it does need saying — with a retention period, kept short.

**It is not the analytics of ADR 15 and must not be quietly merged with it.**
That one counts recipe reads with no identifier of any kind, for the author's
curiosity. This one keeps addresses briefly, to catch abuse. Same files could
serve both, and the moment they do, the analytics inherits an obligation it was
carefully designed not to have.

**Retention has to be short and enforced by rotation**, not by intention. A log
nobody deletes is a growing store of addresses, which is the thing the rest of
this site is arranged to avoid.

**Alerting is only as good as the mailbox.** If the credential expires the
digest goes quiet, which looks exactly like good news. Criterion 6's weekly line
is what distinguishes them, and it is the criterion most likely to be dropped as
noise — it should not be.

## Amendment, 2026-08-30: erased daily, and the privacy page keeps its promises

The decision above accepted that the privacy page would have to give up two
sentences — « Les visites ne sont pas comptées » and « Rien n'est enregistré » —
because an access log records visits. **Both stay, and the retention changes
instead.**

Hedi's framing, and it is the better one: the log is not a record, it is a
*window*. Its whole purpose is spotting suspicious activity while it is
happening — admin sign-in attempts, bursts, insistent robots — and once a day
has passed without anything unusual there is no reason to keep it. So it is
erased every day rather than kept for fourteen, and the two sentences remain
true because nobody ever counts anything in it.

That distinction is worth stating precisely, because the same file could serve
both purposes and must not: **watching for an attack is not measuring an
audience.** The moment somebody greps this log to find out which recipe is
popular, the page's claim becomes false — and the honest way to answer that
question is ADR 15's counter, which stores no identifier at all. Two purposes,
two mechanisms, and they do not get merged for convenience.

### Retention is logrotate's, not Caddy's

`roll_keep_for` looked like the natural way to do it and cannot do it. Caddy
expires *rolled* files, and a file only rolls when it reaches `roll_size` — at
this site's traffic the active log would never get there, would never roll, and
nothing would ever be deleted. A retention setting that silently never fires is
worse than none, because it reads as a policy.

So `deploy/logrotate-bonapphedi` does it: `daily`, `rotate 0` — no archive, not
even yesterday's — and `copytruncate`, because Caddy holds the file open and
takes no signal to reopen it. Without `copytruncate` logrotate renames the file,
Caddy keeps writing to the renamed inode, and the current log stays empty for
ever while the real one grows invisibly: a failure that looks like no traffic.

Caddy's own rolling stays as a backstop for a single bad day — a flood or a
scraper between one erasure and the next — rather than as the policy.

Confirmed by forcing a rotation: the file goes to 0 bytes and no archive is left
beside it.

### What this costs, and it is real

Anything noticed more than a day late cannot be investigated, because the
evidence is gone. That is the deliberate trade: on a personal recipe site the
cost of losing an old trail is small, and the cost of keeping a growing store of
readers' addresses is not. The nightly digest of stage 4 is what makes it
workable — it reads the day's log before the erasure and carries anything worth
keeping into the alert mail, so what survives is a summary rather than a file.
