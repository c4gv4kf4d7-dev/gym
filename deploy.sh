#!/bin/bash
# Deploy: bump automatico della versione cache + commit + push + verifica build.
# Uso: ./deploy.sh "messaggio commit"
set -e
cd "$(dirname "$0")"

MSG="${1:-Update}"
V="v=$(date +%Y%m%d%H%M)"

# Sostituisce QUALSIASI versione esistente (?v=...) in index.html — mai più sed sfasati
sed -i '' -E "s/v=[0-9]{8,12}[a-z]?/${V}/g" index.html
echo "→ versione cache: ${V}"

# Sintassi JS prima di pushare
for f in js/*.js; do
  osascript -l JavaScript -e "var a=Application.currentApplication();a.includeStandardAdditions=true;try{new Function(a.read(Path('$PWD/$f')));''}catch(e){'ERRORE $f: '+e.message}" | grep -q "ERRORE" && { echo "✗ Sintassi rotta in $f — deploy annullato"; exit 1; } || true
done
echo "→ sintassi JS: OK"

# Test sulle funzioni pure
if ! osascript -l JavaScript tests/test_core.js | tail -1 | grep -q "TUTTI I TEST PASSANO"; then
  echo "✗ Test falliti — deploy annullato"; osascript -l JavaScript tests/test_core.js | grep FAIL; exit 1
fi
echo "→ test: OK"

git add -A
git commit -m "$MSG

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
git push origin main
echo "→ push OK. Verifica build:"

TOK=$(git remote get-url origin | sed -n 's|https://\([^@]*\)@github.com.*|\1|p' | sed 's/^[^:]*://')
for i in $(seq 1 20); do
  sleep 20
  INFO=$(curl -s -m 15 "https://api.github.com/repos/c4gv4kf4d7-dev/gym/actions/runs?per_page=1" || true)
  ST=$(echo "$INFO" | python3 -c "import sys,json;r=json.load(sys.stdin)['workflow_runs'][0];print(r['status'],str(r.get('conclusion')))" 2>/dev/null || echo "?")
  LIVE=$(curl -s -m 15 "https://c4gv4kf4d7-dev.github.io/gym/index.html?cb=$RANDOM" | grep -o "v=[0-9]\{8,12\}" | head -1)
  echo "  [$i] build: $ST | live: $LIVE"
  [ "$LIVE" = "${V%[a-z]}" ] || [ "$LIVE" = "$V" ] && { echo "✅ LIVE AGGIORNATO ($V)"; exit 0; }
  case "$ST" in *failure*)
    RID=$(echo "$INFO" | python3 -c "import sys,json;print(json.load(sys.stdin)['workflow_runs'][0]['id'])")
    curl -s -m 15 -X POST -H "Authorization: Bearer $TOK" "https://api.github.com/repos/c4gv4kf4d7-dev/gym/actions/runs/$RID/rerun-failed-jobs" -o /dev/null
    echo "  ↻ deploy fallito → rerun automatico";;
  esac
done
echo "⚠️ Timeout verifica: controlla a mano lo stato della build."
exit 1
