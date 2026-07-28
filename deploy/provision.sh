#!/bin/bash
#
# First-time setup for the Bon App' Hedi VPS. Run once, as root:
#
#   scp deploy/* ubuntu@141.95.86.140:/tmp/
#   ssh ubuntu@141.95.86.140 "cd /tmp && sudo bash provision.sh"
#
# As `ubuntu` with sudo, because the OVH image has no root login.
#
# Idempotent: running it again is safe and is the intended way to apply a change
# to any of the files it writes.
#
# It installs a Java *runtime* and not a JDK. The jar is built on a workstation
# or in CI, where the tests run; a compiler on the server would only be one more
# thing to keep patched.
#
# It deliberately does NOT start the application. There is no jar yet at this
# point, and a service that fails on first boot leaves a red unit and a puzzle.
# scripts/deploy.ps1 uploads the jar and starts it.

set -euo pipefail

APP_USER=bonapphedi
APP_DIR=/opt/bonapphedi
DATA_DIR=/var/lib/bonapphedi
LOG_DIR=/var/log/bonapphedi
ETC_DIR=/etc/bonapphedi
BACKUP_DIR=/var/backups/bonapphedi
DOMAIN=bonapphedi.fr

say() { printf '\n\033[1;34m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m !  %s\033[0m\n' "$*"; }

if [[ $EUID -ne 0 ]]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

# The script writes these next to itself, so it has to know where it is.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

say "Updating the package index"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg sqlite3 ufw unattended-upgrades

say "Java runtime"
# Ubuntu 26.04 carries OpenJDK 25. If a future image does not, fall back to
# Amazon Corretto, which is what the workstation and CI both use - the jar is
# compiled for 25 and will not start on anything older.
if java -version 2>&1 | grep -qE '"2[5-9]|"[3-9][0-9]'; then
  echo "    already present: $(java -version 2>&1 | head -1)"
elif apt-cache show openjdk-25-jre-headless >/dev/null 2>&1; then
  apt-get install -y -qq openjdk-25-jre-headless
else
  warn "openjdk-25 not in the archive; using Amazon Corretto"
  curl -fsSL https://apt.corretto.aws/corretto.key | gpg --dearmor -o /usr/share/keyrings/corretto.gpg
  echo "deb [signed-by=/usr/share/keyrings/corretto.gpg] https://apt.corretto.aws stable main" \
    >/etc/apt/sources.list.d/corretto.list
  apt-get update -qq
  apt-get install -y -qq java-25-amazon-corretto-jdk
fi
java -version

say "Caddy"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' |
    gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    >/etc/apt/sources.list.d/caddy-stable.list
  apt-get update -qq
  apt-get install -y -qq caddy
fi
caddy version

say "Service account and directories"
# A system account with no shell and no home: it exists to own a process and
# some files, and nothing should ever log in as it.
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"

install -d -o root      -g root      -m 755 "$APP_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$DATA_DIR"
install -d -o "$APP_USER" -g "$APP_USER" -m 750 "$LOG_DIR"
install -d -o root      -g "$APP_USER" -m 750 "$ETC_DIR"
install -d -o root      -g root      -m 700 "$BACKUP_DIR"

say "Secrets file"
# Root-owned, group-readable by the service, and never in the repository. The
# jar carries no credentials - that is enforced in the build - so this file is
# the only place they exist on this machine.
if [[ ! -f "$ETC_DIR/bonapphedi.env" ]]; then
  cat >"$ETC_DIR/bonapphedi.env" <<'ENVFILE'
# Fill these in, then: systemctl restart bonapphedi
#
# Until BAH_GOOGLE_* are set the site runs perfectly well and simply offers no
# sign-in button, which is a supported state rather than a broken one (ADR 3).

BAH_GOOGLE_CLIENT_ID=
BAH_GOOGLE_CLIENT_SECRET=

# Comma-separated. Checked at every login, so removing an address demotes that
# account the next time it signs in.
BAH_ADMIN_EMAILS=

# Any long random string; generate one with:  openssl rand -base64 36
# Leaving it blank means a new salt at every restart, which silently resets
# rating-abuse detection on each deploy.
BAH_FINGERPRINT_SALT=
ENVFILE
  chown root:"$APP_USER" "$ETC_DIR/bonapphedi.env"
  chmod 640 "$ETC_DIR/bonapphedi.env"
  warn "Created $ETC_DIR/bonapphedi.env - fill it in before expecting sign-in to work"
else
  echo "    keeping the existing $ETC_DIR/bonapphedi.env"
fi

say "systemd units"
install -m 644 "$HERE/bonapphedi.service"        /etc/systemd/system/
install -m 644 "$HERE/bonapphedi-backup.service" /etc/systemd/system/
install -m 644 "$HERE/bonapphedi-backup.timer"   /etc/systemd/system/
install -m 755 "$HERE/backup.sh"                 /usr/local/bin/bonapphedi-backup
systemctl daemon-reload
systemctl enable --now bonapphedi-backup.timer
systemctl enable bonapphedi >/dev/null 2>&1 || true

say "Caddy configuration"
install -m 644 "$HERE/Caddyfile" /etc/caddy/Caddyfile
# Fails loudly on a syntax error rather than leaving the old config running and
# the new one silently unapplied. Run as the caddy user, not as root: validate
# opens whatever the config tells it to, and anything it creates while running
# as root is then unwritable by the service.
sudo -u caddy caddy validate --config /etc/caddy/Caddyfile
systemctl restart caddy
sleep 2
systemctl is-active --quiet caddy || {
  echo "caddy did not start:" >&2
  journalctl -u caddy -n 20 --no-pager >&2
  exit 1
}

say "Firewall"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443/tcp >/dev/null
# 8080 is deliberately absent: the application binds 127.0.0.1 and is reachable
# only through Caddy.
#
# --force rather than `yes | ufw enable`. Under `set -o pipefail` that pipeline
# aborts the whole script: ufw stops reading, `yes` takes SIGPIPE and exits 141,
# and pipefail promotes that to the pipeline's status. The script died here
# silently on its first real run, after the firewall was already enabled.
ufw --force enable >/dev/null
ufw status verbose | head -12

say "Unattended security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

say "SSH hardening"
# Guarded, because getting this wrong locks you out of a machine whose only door
# this is. Password auth is disabled only when a key is already installed and
# proven to work - which it has, since this script arrived over SSH.
KEYS=$(find /root/.ssh /home/*/.ssh -name authorized_keys -size +0 2>/dev/null | head -1 || true)
if [[ -n "$KEYS" ]]; then
  cat >/etc/ssh/sshd_config.d/99-bonapphedi.conf <<'SSHCONF'
PasswordAuthentication no
PermitRootLogin prohibit-password
KbdInteractiveAuthentication no
SSHCONF
  sshd -t && systemctl reload ssh
  echo "    password authentication disabled; keys only"
else
  warn "No authorized_keys found - leaving password auth ON rather than locking you out"
fi

say "Done"
cat <<SUMMARY

  Next, from the workstation:

    .\\scripts\\deploy.ps1

  which builds the frontend, packages the jar, uploads it and starts the
  service. Until then https://$DOMAIN answers 502: Caddy is up and has its
  certificate, and there is simply nothing behind it yet.

  Remember to fill in $ETC_DIR/bonapphedi.env and restart, or sign-in
  will be unavailable.

SUMMARY
