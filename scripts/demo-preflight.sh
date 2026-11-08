#!/usr/bin/env bash
# Read-only demo preflight against a SpacetimeDB database (default: prod). Prints OK / WARN / FAIL lines. Never prints secrets.
# Usage:  scripts/demo-preflight.sh [database] [web-url]
#   scripts/demo-preflight.sh                                   # prod, no web check
#   scripts/demo-preflight.sh aftermath-hackutd https://xyz.trycloudflare.com
set -u
DB="${1:-aftermath-hackutd}"
WEB="${2:-}"
FAILS=0
sql() { spacetime sql -s maincloud "$DB" "$1" 2>&1 | grep -v -i "^WARNING"; }
ok() { echo "OK    $*"; }
warn() { echo "WARN  $*"; }
fail() { echo "FAIL  $*"; FAILS=$((FAILS + 1)); }

echo "== Preflight for $DB ($(date -u '+%Y-%m-%d %H:%M UTC'))"

# 1. service identities
roles=$(sql "SELECT role FROM service_identity")
for r in admin worker web; do
  echo "$roles" | grep -q "\"$r\"" && ok "service identity registered: $r" || fail "no '$r' service identity (worker/web cannot connect)"
done

# 2. job queue
open=$(sql "SELECT id, kind, state FROM job" | grep -E '"(queued|leased)"' || true)
if [ -z "$open" ]; then ok "no queued or leased jobs"; else warn "open jobs (a worker must be running to drain them):"; echo "$open" | sed 's/^/        /'; fi
failed=$(sql "SELECT id, kind, state FROM job" | grep -c '"failed"' || true)
[ "${failed:-0}" -gt 0 ] && warn "$failed failed job(s) in history (old failures are normal, check they are not yours)"

# 3. seeded data and map freshness
reports=$(sql "SELECT id, source, created_at FROM report")
n=$(echo "$reports" | grep -c '"fixture"\|"live"' || true)
[ "${n:-0}" -ge 3 ] && ok "$n reports in the database" || warn "only ${n:-0} reports: the map will look empty (run seed:demo)"
oldest_ok=$(echo "$reports" | grep -o '20[0-9-]*T[0-9:]*' | sort | tail -1)
if [ -n "$oldest_ok" ]; then
  newest_epoch=$(date -u -j -f '%Y-%m-%dT%H:%M:%S' "$oldest_ok" +%s 2>/dev/null || date -u -d "$oldest_ok" +%s 2>/dev/null || echo 0)
  now=$(date -u +%s)
  hours=$(( (now - newest_epoch) / 3600 ))
  left=$(( 72 - hours ))
  if [ "$left" -le 0 ]; then fail "newest report is ${hours}h old: the 72h area map is EMPTY. Reseed (docs/BACKEND_RUNBOOK.md)."
  elif [ "$left" -le 12 ]; then warn "newest report is ${hours}h old: map data expires in about ${left}h. Reseed before the demo."
  else ok "newest report is ${hours}h old: map data lasts about ${left}h more"; fi
fi
cells=$(sql "SELECT cell_id FROM area_cell_summary" | grep -c '"' || true)
[ "${cells:-0}" -ge 1 ] && ok "$cells area cell(s) with data" || fail "no area cells: the map is empty"

# 4. config that changes demo behavior
sec=$(sql "SELECT hold_duplicate_claims, max_verification_starts_per_hour_global, max_verification_starts_per_property_per_day FROM admin_security_config" | tail -1)
echo "INFO  security_config: $sec"
echo "$sec" | grep -q "true" && warn "hold_duplicate_claims is ON: a second person verifying an already-verified address is HELD (set false for rehearsals, or have an admin resolve)" || ok "hold_duplicate_claims is off"
acct=$(sql "SELECT accounts_enabled, require_stepup FROM admin_account_config" | tail -1)
echo "INFO  account_config (accounts_enabled, require_stepup): $acct"

# 5. recent module errors (last 30 minutes only)
cutoff=$(date -u -v-30M '+%Y-%m-%dT%H:%M' 2>/dev/null || date -u -d '30 minutes ago' '+%Y-%m-%dT%H:%M')
recent=$(spacetime logs -s maincloud "$DB" -n 200 2>&1 | grep "ERROR" | grep -v -i token | awk -v c="$cutoff" '$1 >= c' || true)
nrec=$(echo "$recent" | grep -c "ERROR" || true)
if [ "${nrec:-0}" -eq 0 ]; then ok "no module errors in the last 30 minutes"; else warn "$nrec module ERROR line(s) in the last 30 minutes (negative tests in smoke scripts are expected):"; echo "$recent" | tail -3 | sed 's/^/        /'; fi

# 6. web app
if [ -n "$WEB" ]; then
  for p in "" "/affected/start" "/reporter"; do
    code=$(curl -s -o /dev/null -m 15 -w '%{http_code}' -L "$WEB$p")
    [ "$code" = "200" ] && ok "web $WEB$p -> $code" || fail "web $WEB$p -> $code"
  done
else
  warn "no web URL given: pass it as the second argument to check the app is reachable"
fi

echo "== done: $FAILS failure(s)"
exit $((FAILS > 0))
