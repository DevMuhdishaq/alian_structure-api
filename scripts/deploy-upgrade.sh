#!/usr/bin/env bash
# =============================================================================
# deploy-upgrade.sh
#
# Demonstrates deploying a new implementation version and performing a controlled
# upgrade through the upgradeability REST API.  Expects a running API server
# with an admin bearer token.
#
# Usage:
#   UPGRADE_API_URL=http://localhost:3001/api/v1 \
#   ADMIN_TOKEN=<admin-jwt> \
#   bash scripts/deploy-upgrade.sh
#
# Required environment variables:
#   UPGRADE_API_URL  – Base URL of the API (without trailing slash)
#   ADMIN_TOKEN      – Bearer token with ADMIN role
#
# Optional environment variables:
#   MODULE_KEY       – Logical module to upgrade (default: oracle-service)
#   FROM_VERSION     – Current version (default: 1.0.0)
#   TO_VERSION       – Target version (default: 1.1.0)
#   ARTIFACT_URI     – URI of the new implementation artefact
#   CHECKSUM         – SHA-256 checksum of the artefact
# =============================================================================
set -euo pipefail

API_URL="${UPGRADE_API_URL:-http://localhost:3001/api/v1}"
TOKEN="${ADMIN_TOKEN:?ADMIN_TOKEN is required}"
MODULE="${MODULE_KEY:-oracle-service}"
FROM="${FROM_VERSION:-1.0.0}"
TO="${TO_VERSION:-1.1.0}"
ARTIFACT="${ARTIFACT_URI:-s3://artifacts/${MODULE}/${TO}.tar.gz}"
HASH="${CHECKSUM:-sha256:$(echo -n "${MODULE}-${TO}" | sha256sum | cut -d' ' -f1)}"
AUTHOR="${UPGRADE_AUTHOR:-deploy-bot@alian-structure.com}"

header() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  $1"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
}

api() {
  local method="$1"
  local path="$2"
  shift 2
  curl -s -f \
    -X "${method}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    "${API_URL}${path}" \
    "$@"
}

# ── 1. Pre-flight: check current state ────────────────────────────────────────
header "1. Current active implementation for ${MODULE}"
api GET "/upgradeability/implementations/${MODULE}/active" | jq .

# ── 2. Register the new implementation ────────────────────────────────────────
header "2. Register implementation ${MODULE}@${TO}"
api POST "/upgradeability/implementations" \
  -d "{
    \"moduleKey\": \"${MODULE}\",
    \"version\": \"${TO}\",
    \"checksum\": \"${HASH}\",
    \"artifactUri\": \"${ARTIFACT}\",
    \"active\": false,
    \"releaseNotes\": \"Automated deploy via deploy-upgrade.sh\"
  }" | jq .

# ── 3. Register migration hooks ──────────────────────────────────────────────
header "3. Register migration hooks"
api POST "/upgradeability/hooks" \
  -d "{
    \"moduleKey\": \"${MODULE}\",
    \"name\": \"pre-migrate-cache\",
    \"phase\": \"pre\"
  }" | jq .

api POST "/upgradeability/hooks" \
  -d "{
    \"moduleKey\": \"${MODULE}\",
    \"name\": \"post-verify-integrity\",
    \"phase\": \"post\"
  }" | jq .

# ── 4. Plan the upgrade ──────────────────────────────────────────────────────
header "4. Plan upgrade ${MODULE} ${FROM} → ${TO}"
PLAN=$(api POST "/upgradeability/plan" \
  -d "{
    \"moduleKey\": \"${MODULE}\",
    \"fromVersion\": \"${FROM}\",
    \"toVersion\": \"${TO}\",
    \"description\": \"Automated upgrade from ${FROM} to ${TO}\"
  }")
echo "${PLAN}" | jq .
UPGRADE_ID=$(echo "${PLAN}" | jq -r '.upgrade.id')
echo "Upgrade ID: ${UPGRADE_ID}"

# ── 5. Simulate the upgrade (dry run) ────────────────────────────────────────
header "5. Simulate upgrade (dry run)"
api POST "/upgradeability/simulate" \
  -d "{
    \"moduleKey\": \"${MODULE}\",
    \"fromVersion\": \"${FROM}\",
    \"toVersion\": \"${TO}\"
  }" | jq .

# ── 6. Execute the upgrade ────────────────────────────────────────────────────
header "6. Execute upgrade"
RESULT=$(api POST "/upgradeability/execute" \
  -d "{
    \"moduleKey\": \"${MODULE}\",
    \"fromVersion\": \"${FROM}\",
    \"toVersion\": \"${TO}\",
    \"authorisedBy\": \"${AUTHOR}\"
  }")
echo "${RESULT}" | jq .
STATUS=$(echo "${RESULT}" | jq -r '.result.status')
echo "Final status: ${STATUS}"

# ── 7. Post-upgrade verification ─────────────────────────────────────────────
header "7. Active implementation after upgrade"
api GET "/upgradeability/implementations/${MODULE}/active" | jq .

header "8. Upgrade record"
api GET "/upgradeability/upgrades/${UPGRADE_ID}" | jq .

# ── 8. Rollback if failed ────────────────────────────────────────────────────
if [ "${STATUS}" = "failed" ]; then
  header "⚠️  Upgrade FAILED — triggering rollback"
  api POST "/upgradeability/rollback" \
    -d "{
      \"moduleKey\": \"${MODULE}\",
      \"failedVersion\": \"${TO}\",
      \"targetVersion\": \"${FROM}\",
      \"authorisedBy\": \"${AUTHOR}\"
    }" | jq .

  header "Active implementation after rollback"
  api GET "/upgradeability/implementations/${MODULE}/active" | jq .
fi

header "Done"
