#!/usr/bin/env bash
# Validation rapide avant présentation jury FAST UAC
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BASE_URL="${BASE_URL:-http://localhost:3000}"
DB="$ROOT/db/smartdrop.db"
PASS=0
FAIL=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }

assert() {
  local name="$1"
  local cond="$2"
  if eval "$cond"; then
    green "  PASS: $name"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $name"
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════════════"
echo "  SUIVI-DÉCHETS — Validation démo jury"
echo "  $BASE_URL"
echo "═══════════════════════════════════════════════"

if ! curl -s -o /dev/null --connect-timeout 3 "$BASE_URL/login"; then
  red "Serveur inaccessible. Lancez: npm start"
  exit 1
fi

for path in /login /presentation /presentation.html /; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$path")
  assert "$path → HTTP 200" "[[ '$code' == '200' ]]"
done

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/admin-dashboard")
assert "/admin-dashboard protégé" "[[ '$code' == '401' || '$code' == '403' ]]"

assert "createUACMarker dans app.js" "grep -q createUACMarker public/app.js"
assert "mode démo ?demo=1" "grep -q 'demo.*===.*1' public/app.js"

TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"super@suivi-dechets.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null)
assert "JWT SUPER_ADMIN" "[[ -n '$TOKEN' ]]"

ADMIN=$(curl -s "$BASE_URL/api/admin/stats" -H "Authorization: Bearer $TOKEN")
assert "admin/stats (co2_saved, uac_bins)" "echo '$ADMIN' | python3 -c \"
import sys,json
d=json.load(sys.stdin)
sys.exit(0 if all(k in d for k in ['co2_saved','uac_bins','esp32_online']) else 1)
\" 2>/dev/null"

for ep in /api/stats /api/poubelles /api/alertes /api/simulation/status; do
  code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL$ep" -H "Authorization: Bearer $TOKEN")
  assert "GET $ep" "[[ '$code' == '200' ]]"
done

PAG=$(curl -s "$BASE_URL/api/poubelles?page=1&limit=3" -H "Authorization: Bearer $TOKEN")
assert "pagination poubelles" "echo '$PAG' | python3 -c 'import sys,json; d=json.load(sys.stdin); exit(0 if \"data\" in d else 1)' 2>/dev/null"

code=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$BASE_URL/api/iot/releve" \
  -H "Content-Type: application/json" -H "x-esp32-token: shared-secret-key-2026" \
  -d '{"esp32_id":"ESP-DEMO-CHECK","niveau":60,"batterie":90}')
assert "POST /api/iot/releve" "[[ '$code' == '200' ]]"

code=$(curl -s -o /dev/null -w "%{http_code}" "$BASE_URL/socket.io/?EIO=4&transport=polling")
assert "Socket.IO actif" "[[ '$code' == '200' ]]"

UAC=$(sqlite3 "$DB" "SELECT COUNT(*) FROM poubelles WHERE quartier LIKE 'UAC%';" 2>/dev/null || echo 0)
assert "poubelles campus UAC" "[[ $UAC -ge 1 ]]"

echo
if [[ $FAIL -eq 0 ]]; then
  green "  STATUT: PRÊT POUR LA DÉMO ($PASS tests)"
  exit 0
fi
red "  STATUT: $FAIL échec(s) — corriger avant le jury"
exit 1
