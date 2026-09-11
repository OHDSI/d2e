#!/bin/bash
# Obtain a bearer token from trex for the HTTP test suites.
#
# Replaces Logto's interaction dance (/oidc/auth -> PUT /api/interaction ->
# POST /api/interaction/submit -> resume -> code, threading six cookies by hand)
# with the three calls trex needs. Sourcing this sets BEARER_TOKEN and SUB.
#
# Usage:  source tests/backend_integration_tests/lib/trex-login.sh
#         trex_login "https://localhost:41100" "$EMAIL" "$PASSWORD" "$CLIENT_ID" "$CLIENT_SECRET"

trex_login() {
  local gateway="$1" email="$2" password="$3" client_id="$4" client_secret="$5"
  local jar; jar=$(mktemp)
  local verifier="dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"
  local challenge
  challenge=$(printf '%s' "$verifier" | openssl dgst -sha256 -binary | base64 | tr '+/' '-_' | tr -d '=')
  local redirect="$gateway/d2e/portal/login-callback"

  # 1. Native login. The session cookie it sets is what /authorize reads.
  local login_status
  login_status=$(curl -sk -c "$jar" -o /dev/null -w '%{http_code}' \
    -X POST "$gateway/trex/auth/v1/token?grant_type=password" \
    -H 'content-type: application/json' \
    -d "{\"email\":\"$email\",\"password\":\"$password\"}")
  if [ "$login_status" != "200" ]; then
    echo "trex login failed for $email: HTTP $login_status" >&2
    rm -f "$jar"; return 1
  fi

  # 2. Authorization code.
  local location code
  location=$(curl -sk -b "$jar" -o /dev/null -w '%{redirect_url}' \
    "$gateway/trex/oidc/authorize?client_id=$client_id&redirect_uri=$(printf '%s' "$redirect" | sed 's/:/%3A/g; s#/#%2F#g')&response_type=code&scope=openid%20profile%20email&code_challenge=$challenge&code_challenge_method=S256&state=http-tests")
  code=$(printf '%s' "$location" | sed -n 's/.*[?&]code=\([^&]*\).*/\1/p')
  if [ -z "$code" ]; then
    echo "trex authorize returned no code. Location: $location" >&2
    rm -f "$jar"; return 1
  fi

  # 3. Redeem through the d2e proxy, as the portal does.
  local body
  body=$(curl -sk -X POST "$gateway/d2e/oauth/token" \
    -H 'content-type: application/x-www-form-urlencoded' \
    --data-urlencode 'grant_type=authorization_code' \
    --data-urlencode "client_id=$client_id" \
    --data-urlencode "client_secret=$client_secret" \
    --data-urlencode "redirect_uri=$redirect" \
    --data-urlencode "code=$code" \
    --data-urlencode "code_verifier=$verifier")
  rm -f "$jar"

  BEARER_TOKEN=$(printf '%s' "$body" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("id_token") or d.get("access_token",""))')
  # Kept so a caller can renew rather than log in again. Empty against a
  # provider that issues none, which callers already treat as "not available".
  REFRESH_TOKEN=$(printf '%s' "$body" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("refresh_token",""))')
  if [ -z "$BEARER_TOKEN" ]; then
    echo "trex token response carried no token: $body" >&2
    return 1
  fi

  # `sub` is the trex user id, which the suites use to key their fixtures.
  SUB=$(printf '%s' "$BEARER_TOKEN" | cut -d. -f2 | python3 -c '
import sys, base64, json
raw = sys.stdin.read().strip()
raw += "=" * (-len(raw) % 4)
print(json.loads(base64.urlsafe_b64decode(raw)).get("sub", ""))')

  export BEARER_TOKEN SUB
}
