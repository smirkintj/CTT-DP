#!/usr/bin/env bash
set -euo pipefail

APP_URL="${APP_URL:-http://localhost:3000}"
TASK_ID="${TASK_ID:-}"
COOKIE_HEADER="${COOKIE_HEADER:-}"

print_result() {
  local path="$1"
  local header_file
  local body_file
  header_file="$(mktemp)"
  body_file="$(mktemp)"

  if [[ -n "$COOKIE_HEADER" ]]; then
    curl -sS -D "$header_file" -o "$body_file" -H "Cookie: $COOKIE_HEADER" "${APP_URL}${path}" || true
  else
    curl -sS -D "$header_file" -o "$body_file" "${APP_URL}${path}" || true
  fi

  local status
  status="$(awk 'NR==1 {print $2}' "$header_file" 2>/dev/null || echo "N/A")"
  local timing
  timing="$(grep -i '^x-query-time-ms:' "$header_file" | tail -n 1 | awk -F': ' '{print $2}' | tr -d '\r' || true)"
  local size
  size="$(wc -c < "$body_file" | tr -d ' ')"

  echo "${path} => status=${status}, x-query-time-ms=${timing:-N/A}, body-bytes=${size}"

  rm -f "$header_file" "$body_file"
}

echo "Performance sample against ${APP_URL}"
echo "Tip: set COOKIE_HEADER from browser session to avoid 401."
echo

print_result "/api/tasks"

if [[ -n "$TASK_ID" ]]; then
  print_result "/api/tasks/${TASK_ID}"
  print_result "/api/tasks/${TASK_ID}/history"
else
  echo "TASK_ID not set; skipping detail/history endpoints."
fi
