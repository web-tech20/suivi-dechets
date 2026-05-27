#!/usr/bin/env bash
# Suite de tests manuels SUIVI-DÉCHETS
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
BASE_URL="${BASE_URL:-http://localhost:3000}"
DB="$ROOT/db/smartdrop.db"
PASS=0
FAIL=0
SKIP=0

green() { printf '\033[32m%s\033[0m\n' "$1"; }
red() { printf '\033[31m%s\033[0m\n' "$1"; }
yellow() { printf '\033[33m%s\033[0m\n' "$1"; }

assert_ok() {
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

assert_http() {
  local name="$1"
  local expected="$2"
  local url="$3"
  local method="${4:-GET}"
  local body="${5:-}"
  local auth="${6:-}"
  local extra=()
  [[ -n "$auth" ]] && extra+=(-H "Authorization: Bearer $auth")
  [[ -n "$body" ]] && extra+=(-H "Content-Type: application/json" -d "$body")
  local code
  code=$(curl -s -o /tmp/sd_test_body.json -w "%{http_code}" -X "$method" "$url" "${extra[@]}" 2>/dev/null || echo "000")
  if [[ "$code" == "$expected" ]]; then
    green "  PASS: $name (HTTP $code)"
    PASS=$((PASS + 1))
  else
    red "  FAIL: $name (attendu $expected, reçu $code)"
    cat /tmp/sd_test_body.json 2>/dev/null | head -c 200
    echo
    FAIL=$((FAIL + 1))
  fi
}

echo "═══════════════════════════════════════════════"
echo "  SUIVI-DÉCHETS — Run tests"
echo "  Base URL: $BASE_URL"
echo "═══════════════════════════════════════════════"
echo

echo "▶ 1. Fichiers & structure"
assert_ok "server.js existe" "[[ -f server.js ]]"
assert_ok "public/app.js existe" "[[ -f public/app.js ]]"
assert_ok "db/init.js existe" "[[ -f db/init.js ]]"
assert_ok "README existe" "[[ -f README.md ]]"
assert_ok "v2 archivée" "[[ -d archive/suivi-dechets-v2 ]]"
assert_ok "v2 absente à la racine" "[[ ! -d suivi-dechets-v2 ]]"
echo

echo "▶ 2. README"
assert_ok "README sans Leaflet" "! grep -qi leaflet README.md"
assert_ok "README mentionne Google" "grep -qi google README.md"
echo

echo "▶ 3. Git"
if git rev-parse --git-dir >/dev/null 2>&1; then
  assert_ok "Au moins 1 commit" "[[ $(git rev-list --count HEAD 2>/dev/null || echo 0) -ge 1 ]]"
  GIT_STATUS=$(git status --porcelain 2>/dev/null || true)
  assert_ok "Working tree propre" "[[ -z \"$GIT_STATUS\" ]]"
else
  yellow "  SKIP: pas de dépôt git"
  SKIP=$((SKIP + 1))
fi
echo

echo "▶ 4. Base de données"
assert_ok "Base SQLite présente" "[[ -f $DB ]]"
UAC_COUNT=$(sqlite3 "$DB" "SELECT COUNT(*) FROM poubelles WHERE quartier LIKE 'UAC%';" 2>/dev/null || echo 0)
assert_ok "4 poubelles UAC" "[[ $UAC_COUNT -eq 4 ]]"
RELEVES=$(sqlite3 "$DB" "SELECT COUNT(*) FROM releves;" 2>/dev/null || echo 0)
assert_ok "Relevés <= 2500 (cap 200×12)" "[[ $RELEVES -le 2500 ]]"
# Coordonnées sur terre (zone Abomey-Calavi, pas lac)
BAD_WATER=$(sqlite3 "$DB" "SELECT COUNT(*) FROM poubelles WHERE latitude < 6.435 OR latitude > 6.465 OR longitude < 2.335 OR longitude > 2.375;" 2>/dev/null || echo 99)
assert_ok "Toutes les poubelles dans la bbox terrestre (hors lac)" "[[ $BAD_WATER -eq 0 ]]"
echo

echo "▶ 5. Syntaxe Node"
if node --check server.js 2>/dev/null; then
  green "  PASS: server.js syntaxe OK"
  PASS=$((PASS + 1))
else
  red "  FAIL: server.js syntaxe"
  FAIL=$((FAIL + 1))
fi
if node --check public/app.js 2>/dev/null; then
  green "  PASS: public/app.js syntaxe OK"
  PASS=$((PASS + 1))
else
  red "  FAIL: public/app.js syntaxe"
  FAIL=$((FAIL + 1))
fi
echo

echo "▶ 6. Serveur HTTP"
if curl -s -o /dev/null -w "%{http_code}" --connect-timeout 3 "$BASE_URL/login" | grep -qE '200|304'; then
  green "  PASS: Serveur répond sur /login"
  PASS=$((PASS + 1))
else
  red "  FAIL: Serveur inaccessible sur $BASE_URL"
  FAIL=$((FAIL + 1))
  echo
  red "Bilan partiel — démarrez: npm start"
  echo "PASS=$PASS FAIL=$FAIL SKIP=$SKIP"
  exit 1
fi
echo

echo "▶ 7. Authentification"
assert_http "Login invalide → 401" "401" "$BASE_URL/api/auth/login" "POST" '{"email":"x@y.com","password":"wrong"}'
LOGIN=$(curl -s -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"super@suivi-dechets.com","password":"Admin123!"}')
TOKEN=$(echo "$LOGIN" | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || true)
assert_ok "Login SUPER_ADMIN retourne un token" "[[ -n '$TOKEN' && ${#TOKEN} -gt 50 ]]"
assert_http "Stats sans token → 401" "401" "$BASE_URL/api/stats"
echo

echo "▶ 8. API protégées (SUPER_ADMIN)"
assert_http "GET /api/stats" "200" "$BASE_URL/api/stats" "GET" "" "$TOKEN"
assert_http "GET /api/poubelles" "200" "$BASE_URL/api/poubelles" "GET" "" "$TOKEN"
assert_http "GET /api/alertes" "200" "$BASE_URL/api/alertes" "GET" "" "$TOKEN"
assert_http "GET /api/simulation/status" "200" "$BASE_URL/api/simulation/status" "GET" "" "$TOKEN"
assert_http "GET /api/config/maps" "200" "$BASE_URL/api/config/maps" "GET" "" "$TOKEN"
echo

echo "▶ 9. Repositionnement"
BIN_ID=$(sqlite3 "$DB" "SELECT id FROM poubelles WHERE nom='PBL-001' LIMIT 1;")
assert_http "PUT position poubelle" "200" "$BASE_URL/api/poubelles/${BIN_ID}/position" "PUT" '{"latitude":6.4395,"longitude":2.4152}' "$TOKEN"
echo

echo "▶ 10. RBAC COLLECTEUR"
COL_TOKEN=$(curl -s -X POST "$BASE_URL/api/auth/login" -H "Content-Type: application/json" \
  -d '{"email":"collecteur@suivi-dechets.com","password":"Admin123!"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin).get('accessToken',''))" 2>/dev/null || true)
assert_http "Collecteur peut lire poubelles" "200" "$BASE_URL/api/poubelles" "GET" "" "$COL_TOKEN"
assert_http "Collecteur ne peut pas déplacer poubelle → 403" "403" "$BASE_URL/api/poubelles/${BIN_ID}/position" "PUT" '{"latitude":6.44,"longitude":2.416}' "$COL_TOKEN"
echo

echo "▶ 11. Tournée optimiser"
OPT=$(curl -s -o /tmp/sd_opt.json -w "%{http_code}" -X POST "$BASE_URL/api/tournees/optimiser" \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d "{\"poubelle_ids\":[\"$BIN_ID\"]}" 2>/dev/null || echo "000")
if [[ "$OPT" == "200" ]] || [[ "$OPT" == "400" ]]; then
  green "  PASS: POST /api/tournees/optimiser (HTTP $OPT)"
  PASS=$((PASS + 1))
else
  red "  FAIL: POST /api/tournees/optimiser (HTTP $OPT)"
  FAIL=$((FAIL + 1))
fi
echo

echo "═══════════════════════════════════════════════"
echo "  RÉSULTAT: $PASS réussis | $FAIL échoués | $SKIP ignorés"
if [[ $FAIL -eq 0 ]]; then
  green "  STATUT GLOBAL: OK"
  exit 0
else
  red "  STATUT GLOBAL: ÉCHEC"
  exit 1
fi
