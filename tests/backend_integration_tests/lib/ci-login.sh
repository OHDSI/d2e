#!/bin/bash
# Obtain a bearer token for the CI test workflows and publish it to $GITHUB_ENV.
#
# Four workflows (_test-http-hana, _test-http-duckdb, _test-regression,
# strategus-analysis-integration-test) each carried their own copy of Logto's
# interaction dance inline in YAML. They now share this, so adding an IdP is one
# change rather than four, and the flows cannot drift apart.
#
# Exports BEARER_TOKEN, REFRESH_TOKEN and IDP_SUB — the three the workflows read.
set -uo pipefail

GATEWAY="${CI_LOGIN_GATEWAY:-https://localhost:41100}"
# The CLI writes .env unless it is given --env-file, and the workflows are not
# consistent about passing it. Looking only for .env.local meant a job that used
# the default silently found no D2E_IDP and fell back to the wrong provider,
# which fails at the login rather than at the missing file.
ENVFILE="${CI_LOGIN_ENVFILE:-}"
if [ -z "$ENVFILE" ]; then
  for candidate in .env.local .env; do
    if [ -f "$candidate" ]; then
      ENVFILE="$candidate"
      break
    fi
  done
fi
ENVFILE="${ENVFILE:-.env.local}"

decode_jwt_sub() {
  printf '%s' "$1" | cut -d. -f2 | python3 -c '
import sys, base64, json
raw = sys.stdin.read().strip()
raw += "=" * (-len(raw) % 4)
try:
    print(json.loads(base64.urlsafe_b64decode(raw)).get("sub", ""))
except Exception:
    print("")'
}

# usermgmt keys its own rows separately from the identity provider's subject, so
# the callers that grant study roles need the row id rather than the subject.
# This used to be scraped from a response variable left over from the inline
# login the workflows once did; nothing sets it now, so it is asked for here,
# where the token already exists.
resolve_user_mgmt_id() {
  curl -sk --max-time 20 "$GATEWAY/d2e/usermgmt/api/me" \
    -H "Authorization: Bearer $BEARER_TOKEN" 2>/dev/null \
    | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4
}

publish() {
  USER_MGMT_ID=$(resolve_user_mgmt_id)
  if [ -z "$USER_MGMT_ID" ]; then
    # Not fatal on its own, but a caller that grants roles to an empty id gets a
    # 500 that says nothing about the cause, so say it here.
    echo "Warning: could not resolve the usermgmt id for $IDP_SUB" >&2
  fi
  echo "BEARER_TOKEN=$BEARER_TOKEN" >>"${GITHUB_ENV:-/dev/null}"
  echo "REFRESH_TOKEN=${REFRESH_TOKEN:-}" >>"${GITHUB_ENV:-/dev/null}"
  echo "IDP_SUB=$IDP_SUB" >>"${GITHUB_ENV:-/dev/null}"
  echo "USER_MGMT_ID=$USER_MGMT_ID" >>"${GITHUB_ENV:-/dev/null}"
  export BEARER_TOKEN REFRESH_TOKEN IDP_SUB USER_MGMT_ID
}

# The workflows do not export D2E_IDP, so fall back to the env file the CLI
# generates — the same single source of truth the stack itself is started from.
# Reading it from two places is how the host and container drifted apart before.
IDP="${D2E_IDP:-}"
if [ -z "$IDP" ] && [ -f "$ENVFILE" ]; then
  IDP=$(grep -E '^D2E_IDP=' "$ENVFILE" | cut -d'=' -f2- | tr -d '"'"'"'"')
fi
IDP="${IDP:-logto}"
echo "CI login using IdP: $IDP"

if [ "$IDP" = "trex" ]; then
  # shellcheck source=/dev/null
  source "$(dirname "${BASH_SOURCE[0]}")/trex-login.sh"

  SEED_JSON="${D2E__SEED_USER:-${LOGTO__USER:-}}"
  if [ -z "$SEED_JSON" ]; then
    SEED_JSON=$(grep -E '^D2E__SEED_USER=' "$ENVFILE" | cut -d'=' -f2-)
  fi
  SEED_USER=$(printf '%s' "$SEED_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])')
  SEED_PASS=$(printf '%s' "$SEED_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("initialPassword") or d["password"])')
  case "$SEED_USER" in
    *@*) SEED_EMAIL="$SEED_USER" ;;
    *)   SEED_EMAIL="$SEED_USER@${D2E__SEED_USER_DOMAIN:-d2e.local}" ;;
  esac

  CLIENT_ID="${TREX__OIDC__WEBAPI_CLIENT_ID:-d2e-webapi}"
  CLIENT_SECRET="${TREX__OIDC__WEBAPI_CLIENT_SECRET:-$(grep -E '^TREX__OIDC__WEBAPI_CLIENT_SECRET=' "$ENVFILE" | cut -d'=' -f2-)}"

  # Provision the account before signing in as it. This step runs before any
  # setup script, so on a fresh stack nothing has created it yet and the login
  # simply 400s. trex mints the service-role key on first boot and publishes it
  # only to its own settings table, hence reading it from the database.
  SERVICE_ROLE_KEY=$(docker exec "${PROJECT_NAME:-alp}-minerva-postgres-1" \
    psql -U postgres -d alp -tAc \
    "select value #>> '{}' from trexdb.setting where key='auth.serviceRoleKey'" 2>/dev/null | tr -d '[:space:]')

  if [ -n "$SERVICE_ROLE_KEY" ]; then
    # 422 means the account is already there, which is the steady state on a
    # re-run; anything else is reported but not fatal, because the login below
    # is the real check.
    create_code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 20 \
      -X POST "$GATEWAY/trex/auth/v1/admin/users" \
      -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"$SEED_EMAIL\",\"password\":\"$SEED_PASS\"}")
    echo "Provisioning $SEED_EMAIL in trex: HTTP $create_code"

    # The suites call admin-only endpoints, so the account needs the roles that
    # authorize them. Named exactly as webapi.sec_role expects.
    login_body=$(curl -sk --max-time 20 \
      -X POST "$GATEWAY/trex/auth/v1/token?grant_type=password" \
      -H 'content-type: application/json' \
      -d "{\"email\":\"$SEED_EMAIL\",\"password\":\"$SEED_PASS\"}")
    SEED_SUB=$(printf '%s' "$login_body" \
      | python3 -c 'import json,sys,base64
try:
    t = json.load(sys.stdin)["access_token"].split(".")[1]
    t += "=" * (-len(t) % 4)
    print(json.loads(base64.urlsafe_b64decode(t)).get("sub", ""))
except Exception:
    print("")')
    for role in role.systemadmin admin role.useradmin; do
      curl -sk -o /dev/null --max-time 20 \
        -X POST "$GATEWAY/trex/admin/roles/assign" \
        -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
        -H 'content-type: application/json' \
        -d "{\"userId\":\"$SEED_SUB\",\"role\":\"$role\"}"
    done
    echo "Granted application roles to $SEED_EMAIL ($SEED_SUB)."
  else
    echo "Could not read the trex service-role key; skipping provisioning." >&2
  fi

  trex_login "$GATEWAY" "$SEED_EMAIL" "$SEED_PASS" "$CLIENT_ID" "$CLIENT_SECRET" || {
    echo "trex login failed for $SEED_EMAIL" >&2
    exit 1
  }
  # trex_login sets this from the token response. It stays empty against a
  # provider that issues none, which callers treat as "not available".
  REFRESH_TOKEN="${REFRESH_TOKEN:-}"
  IDP_SUB="${SUB:-$(decode_jwt_sub "$BEARER_TOKEN")}"
  publish
  echo "Logged in against trex as $SEED_EMAIL (sub $IDP_SUB)."
  exit 0
fi

# ── Logto ────────────────────────────────────────────────────────────────────
APP_ID="${LOGTO__D2E_APP__CLIENT_ID:-${LOGTO__ALP_APP__CLIENT_ID:-}}"
SEED_JSON="${LOGTO__USER:-{\"username\":\"admin\",\"initialPassword\":\"Updatepassword12345\"}}"
SEED_USER=$(printf '%s' "$SEED_JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["username"])')
SEED_PASS=$(printf '%s' "$SEED_JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("initialPassword") or d["password"])')

response=$(curl -ik "$GATEWAY/oidc/auth?redirect_uri=$(printf '%s' "$GATEWAY/d2e/portal/login-callback" | sed 's/:/%3A/g; s#/#%2F#g')&client_id=$APP_ID&response_type=code&state=lbFDB1hcko&scope=openid%20offline_access%20profile%20email&nonce=Osptnuwqc47w&code_challenge=n6eqz8p8jj1L9Qu7pY2_GrWO7XyaQbWrcs54x9OAnPg&code_challenge_method=S256")
ck() { printf "%s\n" "$response" | grep "$1=" | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}'; }
interaction_cookie=$(ck _interaction)
interaction_sig_cookie=$(ck _interaction.sig)
interaction_resume_cookie=$(ck _interaction_resume)
interaction_resume_sig_cookie=$(ck _interaction_resume.sig)

curl -ik --request PUT "$GATEWAY/api/interaction" \
  --header 'content-type: application/json' \
  --header "Referer: $GATEWAY/sign-in" \
  --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _logto={\"appId\":\"$APP_ID\"}" \
  --data "{\"event\":\"SignIn\",\"identifier\":{\"username\":\"$SEED_USER\",\"password\":\"$SEED_PASS\"}}" >/dev/null

curl -ik --request POST "$GATEWAY/api/interaction/submit" \
  --header 'accept: application/json' \
  --header "origin: $GATEWAY" \
  --header "referer: $GATEWAY/sign-in" \
  --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _logto={\"appId\":\"$APP_ID\"}" >/dev/null

response=$(curl -ik "$GATEWAY/oidc/auth/$interaction_cookie" \
  --header "referer: $GATEWAY/sign-in" \
  --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _interaction_resume=$interaction_resume_cookie; _interaction_resume.sig=$interaction_resume_sig_cookie; _logto={\"appId\":\"$APP_ID\"}")
session_cookie=$(ck _session)
session_sig_cookie=$(ck _session.sig)

response=$(curl -ik "$GATEWAY/consent" \
  --header "referer: $GATEWAY/sign-in" \
  --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _session=$session_cookie; _session.sig=$session_sig_cookie; _logto={\"appId\":\"$APP_ID\"}")

response=$(curl -ik "$GATEWAY/oidc/auth/$interaction_cookie" \
  --header "referer: $GATEWAY/sign-in" \
  --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _session=$session_cookie; _session.sig=$session_sig_cookie; _logto={\"appId\":\"$APP_ID\"}")
authorization_code=$(printf "%s\n" "$response" | grep -oE 'code=[^&"]*' | head -1 | cut -d= -f2)

response=$(curl -sk --request POST "$GATEWAY/d2e/oauth/token" \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=authorization_code' \
  --data-urlencode "client_id=$APP_ID" \
  --data-urlencode "redirect_uri=$GATEWAY/d2e/portal/login-callback" \
  --data-urlencode "code=$authorization_code" \
  --data-urlencode 'code_verifier=kqVLhCyXRJ3Y9mXie6F9d1FW8AUbTUzIuJiqUf1SM9I')

BEARER_TOKEN=$(printf '%s' "$response" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"\([^"]*\)"/\1/')
REFRESH_TOKEN=$(printf '%s' "$response" | grep -o '"refresh_token":"[^"]*"' | sed 's/"refresh_token":"\([^"]*\)"/\1/')
if [ -z "$BEARER_TOKEN" ]; then
  echo "Logto login produced no access_token: $response" >&2
  exit 1
fi
IDP_SUB=$(decode_jwt_sub "$BEARER_TOKEN")
publish
echo "Logged in against Logto as $SEED_USER (sub $IDP_SUB)."
