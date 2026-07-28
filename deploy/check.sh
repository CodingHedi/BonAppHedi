#!/bin/bash
#
# Read-only. Tells you what state the VPS is actually in — run it before
# provisioning, after provisioning, and whenever something is wrong.
#
#   ssh root@141.95.86.140 'bash -s' < deploy/check.sh
#
# Changes nothing, so it is safe on a box you are unsure about.

DOMAIN=bonapphedi.fr
echo "================ $(hostname) — $(date -Is) ================"

section() { printf '\n--- %s\n' "$1"; }
have() { command -v "$1" >/dev/null 2>&1; }

section "system"
. /etc/os-release 2>/dev/null && echo "  os        : $PRETTY_NAME"
echo "  kernel    : $(uname -r)"
echo "  uptime    : $(uptime -p 2>/dev/null)"
echo "  memory    : $(free -h | awk '/^Mem:/ {print $3 " used of " $2}')"
echo "  disk      : $(df -h / | awk 'NR==2 {print $3 " used of " $2 " (" $5 " full)"}')"

section "runtimes"
if have java; then echo "  java      : $(java -version 2>&1 | head -1)"; else echo "  java      : NOT INSTALLED"; fi
if have caddy; then echo "  caddy     : $(caddy version 2>/dev/null | head -1)"; else echo "  caddy     : NOT INSTALLED"; fi
if have sqlite3; then echo "  sqlite3   : $(sqlite3 --version | cut -d' ' -f1)"; else echo "  sqlite3   : NOT INSTALLED"; fi

section "application"
id bonapphedi >/dev/null 2>&1 && echo "  user      : present" || echo "  user      : MISSING"
for p in /opt/bonapphedi/bonapphedi.jar /etc/bonapphedi/bonapphedi.env /var/lib/bonapphedi/bonapphedi.db; do
  if [[ -e $p ]]; then echo "  $(printf '%-38s' "$p") $(stat -c '%s bytes, %U:%G %a' "$p")"
  else echo "  $(printf '%-38s' "$p") absent"; fi
done
# Empty values here are the usual reason sign-in does not work.
if [[ -r /etc/bonapphedi/bonapphedi.env ]]; then
  echo "  env file  :"
  while IFS='=' read -r k v; do
    [[ $k =~ ^BAH_ ]] || continue
    if [[ -z $v ]]; then echo "      $k = (EMPTY)"; else echo "      $k = set (${#v} chars)"; fi
  done < /etc/bonapphedi/bonapphedi.env
fi

section "services"
for unit in bonapphedi caddy ssh bonapphedi-backup.timer; do
  printf '  %-24s %-10s %s\n' "$unit" \
    "$(systemctl is-active "$unit" 2>/dev/null)" \
    "$(systemctl is-enabled "$unit" 2>/dev/null)"
done

section "listening"
if have ss; then ss -tlnp 2>/dev/null | awk 'NR==1 || /:(22|80|443|8080)\s/ {print "  " $0}'; fi

section "firewall"
have ufw && ufw status | head -8 | sed 's/^/  /'

section "dns as this machine sees it"
for t in A AAAA; do
  echo "  $t $DOMAIN -> $(getent ahosts $DOMAIN 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ')"
  break
done
echo "  my ipv4   : $(curl -4 -s --max-time 5 https://ifconfig.me 2>/dev/null || echo '?')"
echo "  my ipv6   : $(curl -6 -s --max-time 5 https://ifconfig.me 2>/dev/null || echo 'no ipv6 connectivity')"

section "does the site answer, from the box itself"
echo "  127.0.0.1:8080  -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 5 http://127.0.0.1:8080/api/recipes?locale=fr 2>/dev/null || echo 'no answer')"
echo "  https://$DOMAIN -> $(curl -s -o /dev/null -w '%{http_code}' --max-time 10 https://$DOMAIN/fr 2>/dev/null || echo 'no answer')"

section "recent application log"
journalctl -u bonapphedi -n 12 --no-pager 2>/dev/null | sed 's/^/  /' || echo "  (no journal yet)"

section "backups"
ls -lh /var/backups/bonapphedi/ 2>/dev/null | tail -5 | sed 's/^/  /' || echo "  none yet"

echo
echo "================ end ================"
