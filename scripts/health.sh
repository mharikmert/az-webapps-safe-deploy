#!/usr/bin/env bash
set -euo pipefail

URL="${1:-}"
MAX_ATTEMPTS="${2:-20}"
SLEEP_SECONDS="${3:-15}"
LABEL="${4:-healthcheck}"
EXPECTED_VERSION="${5:-}"

if [ -z "$URL" ]; then
  echo "❌ No URL provided to healthcheck script."
  echo "Usage: $0 <url> [max_attempts] [sleep_seconds] [label] [expected_version]"
  exit 1
fi

echo "Starting healthcheck for $LABEL at $URL"
attempt=1

while [ "$attempt" -le "$MAX_ATTEMPTS" ]; do
  echo "Attempt $attempt/$MAX_ATTEMPTS..."

  RESPONSE=$(curl -sS -w "HTTP_CODE:%{http_code}" "$URL" || true)
  HTTP_CODE="${RESPONSE##*HTTP_CODE:}"
  BODY="${RESPONSE%HTTP_CODE:*}"

  if [ "$HTTP_CODE" -ge 200 ] && [ "$HTTP_CODE" -lt 400 ]; then
    if [ -n "$EXPECTED_VERSION" ]; then
      if echo "$BODY" | grep -q "$EXPECTED_VERSION"; then
        echo "✅ $LABEL is healthy (HTTP $HTTP_CODE) and reports expected version '$EXPECTED_VERSION'"
        exit 0
      else
        echo "⚠️  $LABEL responded with HTTP $HTTP_CODE but body does not contain expected version '$EXPECTED_VERSION' yet. Sleeping ${SLEEP_SECONDS}s..."
      fi
    else
      echo "✅ $LABEL is healthy (HTTP $HTTP_CODE)"
      exit 0
    fi
  else
    echo "⚠️  $LABEL not healthy yet (HTTP $HTTP_CODE). Sleeping ${SLEEP_SECONDS}s..."
  fi

  sleep "$SLEEP_SECONDS"
  attempt=$((attempt+1))
done

echo "❌ $LABEL FAILED healthcheck after $MAX_ATTEMPTS attempts."
exit 1