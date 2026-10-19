#!/usr/bin/env bash
# Usage: launcher-smoke.sh <the plugin's scripts folder> <a model file>
set -euo pipefail
scripts=$1
sample=$2
fail() { echo "::error::$*" >&2; exit 1; }
cd "$(mktemp -d)"

clean=''
IFS=: read -r -a dirs <<<"$PATH"
for dir in "${dirs[@]}"; do
  if [ -n "$dir" ] && [ ! -e "$dir/node" ] && [ ! -e "$dir/node.exe" ]; then clean=${clean:+$clean:}$dir; fi
done
export PATH=$clean
if command -v node >/dev/null; then fail "node is still on PATH at $(command -v node)."; fi
arcue() { sh "$scripts/arcue" "$@"; }

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

sh "$scripts/arcue" serve --port 4537 >serve.txt 2>&1 &
server=$!
for _ in $(seq 60); do
  if curl -fsS -o /dev/null http://localhost:4537/; then break; fi
  sleep 1
done
curl -fsS -o /dev/null http://localhost:4537/ || fail "serve did not start: $(cat serve.txt)"
arcue status >running.txt
grep -qF 'Arcue is running in a browser at http://localhost:4537' running.txt || fail "$(cat running.txt)"
kill "$server"
wait "$server" || true
sleep 2
if curl -fsS -o /dev/null http://localhost:4537/; then
  [ "${RUNNER_OS-}" = Windows ] || fail "serve still answers after its launcher was stopped."
  echo "::warning::Stopping the launcher's process in Git Bash left node.exe serving; stopping it by its port."
  listener=$(netstat -ano | awk '$2 ~ /:4537$/ && $4 == "LISTENING" { print $5; exit }')
  [ -n "$listener" ] || fail "serve still answers, and netstat shows nothing listening on port 4537."
  taskkill //F //PID "$listener" >/dev/null
  sleep 2
  if curl -fsS -o /dev/null http://localhost:4537/; then fail "serve still answers after taskkill."; fi
fi
