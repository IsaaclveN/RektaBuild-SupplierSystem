#!/usr/bin/env bash
# Health probe for the RektaBuild Supplier module.
#
#   ./deploy/scripts/healthcheck.sh https://<DOMAIN>
#
# Exits 0 when the app reports status "ok", 1 otherwise.

set -euo pipefail

BASE_URL="${1:-http://127.0.0.1:3000}"
ENDPOINT="${BASE_URL%/}/health"

echo "Checking ${ENDPOINT}"

BODY="$(curl -fsS --max-time 10 "${ENDPOINT}")" || {
  echo "FAIL: no response from ${ENDPOINT}"
  exit 1
}

echo "${BODY}"

if echo "${BODY}" | grep -q '"status":"ok"'; then
  echo "OK: application and database are healthy."
  exit 0
fi

echo "FAIL: application responded but reported a degraded state."
exit 1
