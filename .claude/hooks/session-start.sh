#!/bin/bash
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "$CLAUDE_PROJECT_DIR"
env_file="${CLAUDE_ENV_FILE:-/dev/null}"

pnpm install >&2
(cd apps/desktop && node -e 'require("electron")') >&2

if [ "$(id -u)" = "0" ]; then
  echo 'export ELECTRON_DISABLE_SANDBOX=1' >>"$env_file"
fi

# Cloud sessions cannot download Playwright's browsers, so when the container's Chromium is another revision than the
# pinned Playwright expects, link the container's under the paths Playwright looks for.
installed="${PLAYWRIGHT_BROWSERS_PATH:-}"
linked="$HOME/.cache/arcue-playwright"
expected_chrome() {
  (cd apps/web && PLAYWRIGHT_BROWSERS_PATH="$1" node -p 'require("@playwright/test").chromium.executablePath()')
}
if [ "$installed" = "$linked" ]; then
  echo "export PLAYWRIGHT_BROWSERS_PATH=$linked" >>"$env_file"
elif [ -n "$installed" ] && [ ! -e "$(expected_chrome "$installed")" ]; then
  chrome=$(ls -d "$installed"/chromium-*/chrome-linux*/chrome 2>/dev/null | sort -V | tail -n 1 || true)
  shell=$(ls -d "$installed"/chromium_headless_shell-*/*/{headless_shell,chrome-headless-shell} 2>/dev/null |
    sort -V | tail -n 1 || true)
  if [ -n "$chrome" ] && [ -n "$shell" ]; then
    linked_chrome=$(expected_chrome "$linked")
    revision=$(basename "$(dirname "$(dirname "$linked_chrome")")")
    linked_shell="$linked/chromium_headless_shell-${revision#chromium-}/chrome-headless-shell-linux64/chrome-headless-shell"
    mkdir -p "$(dirname "$linked_chrome")" "$(dirname "$linked_shell")"
    ln -sfn "$chrome" "$linked_chrome"
    ln -sfn "$shell" "$linked_shell"
    echo "export PLAYWRIGHT_BROWSERS_PATH=$linked" >>"$env_file"
  fi
fi
