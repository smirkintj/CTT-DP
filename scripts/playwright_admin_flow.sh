#!/usr/bin/env bash
set -euo pipefail

# Required env vars:
# - APP_URL (example: http://localhost:3000)
# - ADMIN_EMAIL
# - ADMIN_PASSWORD
APP_URL="${APP_URL:-http://localhost:3000}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
RUN_LABEL="${RUN_LABEL:-admin-flow}"
HEADED="${HEADED:-1}"

if ! command -v npx >/dev/null 2>&1; then
  echo "ERROR: npx is required. Install Node.js/npm first."
  exit 1
fi

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  cat <<'EOF'
ERROR: Missing credentials.
Set:
  export ADMIN_EMAIL="admin@example.com"
  export ADMIN_PASSWORD="your-password"
Optional:
  export APP_URL="http://localhost:3000"
  export HEADED=1
EOF
  exit 1
fi

export CODEX_HOME="${CODEX_HOME:-$HOME/.codex}"
export PWCLI="$CODEX_HOME/skills/playwright/scripts/playwright_cli.sh"
if [[ ! -x "$PWCLI" ]]; then
  echo "ERROR: Playwright wrapper not found at $PWCLI"
  exit 1
fi

TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
ARTIFACT_DIR="output/playwright/${RUN_LABEL}-${TIMESTAMP}"
mkdir -p "$ARTIFACT_DIR"

SESSION="ctt-admin-${TIMESTAMP}"
OPEN_FLAGS=()
if [[ "$HEADED" == "1" ]]; then
  OPEN_FLAGS+=(--headed)
fi

run_pw() {
  "$PWCLI" --session "$SESSION" "$@"
}

snapshot_to_file() {
  local name="$1"
  run_pw snapshot > "${ARTIFACT_DIR}/${name}.txt"
}

extract_ref() {
  local file="$1"
  local pattern="$2"
  awk -v p="$pattern" 'BEGIN{IGNORECASE=1} $0 ~ p { if (match($0, /e[0-9]+/)) { print substr($0, RSTART, RLENGTH); exit } }' "$file"
}

require_ref() {
  local ref="$1"
  local label="$2"
  if [[ -z "$ref" ]]; then
    echo "ERROR: Could not find element ref for ${label}. Check snapshot artifacts."
    exit 1
  fi
}

echo "[1/6] Open login page"
run_pw open "${APP_URL}" "${OPEN_FLAGS[@]}"
snapshot_to_file "01-login"

EMAIL_REF="$(extract_ref "${ARTIFACT_DIR}/01-login.txt" "email|e-mail")"
PASS_REF="$(extract_ref "${ARTIFACT_DIR}/01-login.txt" "password")"
LOGIN_REF="$(extract_ref "${ARTIFACT_DIR}/01-login.txt" "sign in|log in|login|continue")"
require_ref "$EMAIL_REF" "email field"
require_ref "$PASS_REF" "password field"
require_ref "$LOGIN_REF" "login button"

echo "[2/6] Submit credentials"
run_pw fill "$EMAIL_REF" "$ADMIN_EMAIL"
run_pw fill "$PASS_REF" "$ADMIN_PASSWORD"
run_pw click "$LOGIN_REF"
run_pw run-code "await page.waitForTimeout(1200)"
snapshot_to_file "02-post-login"
run_pw screenshot > "${ARTIFACT_DIR}/02-post-login-screenshot.txt" || true

echo "[3/6] Verify admin dashboard"
run_pw open "${APP_URL}/admin/dashboard"
run_pw run-code "await page.waitForTimeout(900)"
snapshot_to_file "03-admin-dashboard"
if ! rg -qi "dashboard|recent activity|admin" "${ARTIFACT_DIR}/03-admin-dashboard.txt"; then
  echo "ERROR: Dashboard verification failed."
  exit 1
fi
run_pw screenshot > "${ARTIFACT_DIR}/03-admin-dashboard-screenshot.txt" || true

echo "[4/6] Verify admin task page"
run_pw open "${APP_URL}/admin/tasks"
run_pw run-code "await page.waitForTimeout(900)"
snapshot_to_file "04-admin-tasks"
if ! rg -qi "task|priority|status" "${ARTIFACT_DIR}/04-admin-tasks.txt"; then
  echo "ERROR: Admin tasks verification failed."
  exit 1
fi
run_pw screenshot > "${ARTIFACT_DIR}/04-admin-tasks-screenshot.txt" || true

echo "[5/6] Verify admin database page"
run_pw open "${APP_URL}/admin/database"
run_pw run-code "await page.waitForTimeout(900)"
snapshot_to_file "05-admin-database"
if ! rg -qi "user|database|country|notification" "${ARTIFACT_DIR}/05-admin-database.txt"; then
  echo "ERROR: Admin database verification failed."
  exit 1
fi
run_pw screenshot > "${ARTIFACT_DIR}/05-admin-database-screenshot.txt" || true

echo "[6/6] Save debug artifacts"
run_pw console warning > "${ARTIFACT_DIR}/console-warning.txt" || true
run_pw network > "${ARTIFACT_DIR}/network.txt" || true
run_pw close || true

cat <<EOF
SUCCESS: Playwright admin flow completed.
Artifacts:
  ${ARTIFACT_DIR}
Session:
  ${SESSION}
EOF
