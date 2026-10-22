#!/usr/bin/env bash
# Usage: launcher-smoke.sh <the plugin's scripts folder> <a model file>
set -euo pipefail
scripts=$1
sample=$2
fail() { echo "::error::$*" >&2; exit 1; }
[ -n "${ARCUE_USER_DATA-}" ] || fail "Set ARCUE_USER_DATA to a folder of this run's own, so the test never stops your Arcue."
unset CLAUDE_CODE_SESSION_ID CODEX_SESSION_ID CODEX_THREAD_ID ARCUE_VIEW
cd "$(mktemp -d)"

clean=''
IFS=: read -r -a dirs <<<"$PATH"
for dir in "${dirs[@]}"; do
  if [ -n "$dir" ] && [ ! -e "$dir/node" ] && [ ! -e "$dir/node.exe" ]; then clean=${clean:+$clean:}$dir; fi
done
export PATH=$clean
if command -v node >/dev/null; then fail "node is still on PATH at $(command -v node)."; fi
arcue() { sh "$scripts/arcue" "$@"; }
trap 'arcue stop >/dev/null 2>&1 || true' EXIT

code=0; arcue inspect "$sample" >out.txt 2>err.txt || code=$?
[ "$code" = 3 ] || fail "Without Node the launcher exited with $code: $(cat err.txt)"
grep -qF 'Ask the user before you run sh "' err.txt || fail "No consent message: $(cat err.txt)"

arcue setup >setup.txt
grep -qF 'for Arcue is ready in' setup.txt || fail "$(cat setup.txt)"
arcue setup >again.txt
grep -qF 'is already set up in' again.txt || fail "$(cat again.txt)"

arcue inspect "$sample" --json >inspect.json
grep -qF '"name": "StoneResonatorRig|Walk"' inspect.json || fail "inspect did not list StoneResonatorRig|Walk."

code=0; arcue status 'StoneResonatorRig|Walk' 'my model.fbx' '100%PATH%' 'a&b' '^c' '!d' 'e"f' 2>status.txt || code=$?
[ "$code" = 2 ] || fail "status with arguments exited with $code."
grep -qF 'got "StoneResonatorRig|Walk my model.fbx 100%PATH% a&b ^c !d e"f"' status.txt ||
  fail "Arguments changed on the way to node: $(cat status.txt)"

watchdog() { sleep "$1" >/dev/null 2>&1; echo "::error::$2" >&2; kill -TERM "$$"; }
watchdog 60 'arcue serve --detach did not return within 60 seconds.' &
dog=$!
out=$(arcue serve --detach --port 4537) || fail "serve --detach failed: $out"
kill "$dog" 2>/dev/null || true
case $out in
  'Arcue runs in a browser at http://localhost:4537 '*) ;;
  *) fail "serve --detach said: $out" ;;
esac
curl -fsS -o /dev/null http://localhost:4537/ || fail "serve does not answer at http://localhost:4537/."
arcue status >running.txt
grep -qF 'Arcue is running in a browser at http://localhost:4537' running.txt || fail "$(cat running.txt)"
arcue serve --detach >again.txt
grep -qF 'Arcue already runs in a browser at http://localhost:4537' again.txt || fail "$(cat again.txt)"

arcue stop >stop.txt
grep -qF 'Stopped Arcue in the browser at http://localhost:4537' stop.txt || fail "$(cat stop.txt)"
for _ in $(seq 10); do
  curl -fsS -o /dev/null http://localhost:4537/ 2>/dev/null || break
  sleep 1
done
if curl -fsS -o /dev/null http://localhost:4537/ 2>/dev/null; then fail "serve still answers after arcue stop."; fi
arcue stop >none.txt
grep -qF 'Arcue is not running in a browser.' none.txt || fail "$(cat none.txt)"
