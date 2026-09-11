#!/usr/bin/env bash

echo "Start of HTTP Test Script, run on local machine"

[ -f .env.local ] && mv .env.local .env.local.http-tests-backup

export TESTSCHEMA="$TESTSCHEMA"
export isTestEnv="true"
export isHttpTestRun="true"
export DOCKER_TAG_NAME="local"
export OP_VAULT_NAME=Singapore

export HANASERVER="$HANASERVER"
export HDIUSER="$HDIUSER"
export HDIPORT="$HDIPORT"
export HDIPW="$HDIPW"
export TESTSYSTEMPW="$TESTSYSTEMPW"
export TESTPORT="$TESTPORT"

eval $(op signin)

yarn --cwd internal get:drivers

ENV_NAME="base-all" OVERWRITE=true ./internal/scripts/get-op.sh
ENV_NAME="base-local" OVERWRITE=true ./internal/scripts/get-op.sh
wc -l .env.base-all.yml .env.base-local.yml
OVERWRITE=true yarn --cwd internal gen:env

# Use different volumes
if [[ "$OSTYPE" == "darwin"* ]]; then
    # caddy's volume is not unique, so handled differently
    sed -i '' 's/^  caddy:$/  http-test-volume-1:/' "docker-compose.yml"
    sed -i '' 's/- caddy:/- http-test-volume-1:/' "docker-compose.yml"
    sed -i '' 's/cdw-config-duckdb-data-1:/http-test-volume-cdw-config:/' "docker-compose.yml"
    sed -i '' 's/minio-data-1:/http-test-volume-4:/' "docker-compose.yml"
    sed -i '' 's/pg-minerva-data-1:/http-test-volume-5:/' "docker-compose.yml"
    sed -i '' 's/r-libs:/http-test-volume-7:/' "docker-compose.yml"
    sed -i '' '1,/trex:/s/  trex:/  http-test-volume-trex:/' "docker-compose.yml" # for trex volume, does not replace service name
    sed -i '' 's/- trex:/- http-test-volume-trex:/' "docker-compose.yml"
    sed -i '' 's/fhir-schema-file-1:/http-test-volume-fhir:/' "docker-compose.yml"

elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # caddy's volume is not unique, so handled differently
    sed -i 's/^  caddy:$/  http-test-volume-1:/' "docker-compose.yml"
    sed -i 's/- caddy:/- http-test-volume-1:/' "docker-compose.yml"
    sed -i 's/cdw-config-duckdb-data-1:/http-test-volume-cdw-config:/' "docker-compose.yml"
    sed -i 's/minio-data-1:/http-test-volume-4:/' "docker-compose.yml"
    sed -i 's/pg-minerva-data-1:/http-test-volume-5:/' "docker-compose.yml"
    sed -i 's/r-libs:/http-test-volume-7:/' "docker-compose.yml"
    sed -i '0,/trex:/s/  trex:/  http-test-volume-trex:/' docker-compose.yml
    sed -i 's/- trex:/- http-test-volume-trex:/' "docker-compose.yml"
    sed -i 's/fhir-schema-file-1:/http-test-volume-fhir:/' "docker-compose.yml"
else
    echo "Unsupported OS: $OSTYPE"
    exit 1
fi

######################################################
# Steps below correspond to steps in http-tests.yml
######################################################

########################
# Setup Test DB
yarn --prefer-offline
yarn inittestdb

########################
# Build system services
########################
yarn build

########################
# Manipulate configuration
########################
yq -i '.networks.alp.external=true' docker-compose.yml

########################
# Create network for external to use
########################
docker network create alp

########################
# Get and set logto values
########################
# due to logic in analytics service getDBConnections
echo "NODE_ENV=production" >>.env.local
export LOGTO__D2E_APP__CLIENT_ID=$(cat .env.local | grep LOGTO__D2E_APP__CLIENT_ID | cut -d'=' -f2 | head -n 1)
echo "LOGTO__D2E_APP__CLIENT_ID=$LOGTO__D2E_APP__CLIENT_ID" >>$GITHUB_ENV # Make available to subsequent github actions steps

########################
# Start system services
########################
yarn start -d
echo "Waiting 120 secs for services to start..."
sleep 120

########################
# Check status of docker containers
########################
docker ps -a

########################
# Login and get Bearer token and sub
########################
D2E_IDP_SELECTED="${D2E_IDP:-logto}"
if [ "$D2E_IDP_SELECTED" = "trex" ]; then
  # Three calls instead of Logto's interaction dance; see the helper for why the
  # authorization-code flow is required rather than the password grant.
  # shellcheck source=/dev/null
  source "$(git rev-parse --show-toplevel)/tests/backend_integration_tests/lib/trex-login.sh"
  TREX__OIDC__WEBAPI_CLIENT_SECRET=$(grep -E '^TREX__OIDC__WEBAPI_CLIENT_SECRET=' .env.local | cut -d'=' -f2-)
  SEED_USER=$(printf '%s' "${D2E__SEED_USER:-$LOGTO__USER}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["username"])')
  SEED_PASS=$(printf '%s' "${D2E__SEED_USER:-$LOGTO__USER}" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d.get("initialPassword") or d["password"])')
  case "$SEED_USER" in
    *@*) SEED_EMAIL="$SEED_USER" ;;
    *)   SEED_EMAIL="$SEED_USER@${D2E__SEED_USER_DOMAIN:-trex.local}" ;;
  esac
  trex_login "https://localhost:41100" "$SEED_EMAIL" "$SEED_PASS" \
    "${TREX__OIDC__WEBAPI_CLIENT_ID:-d2e-webapi}" "$TREX__OIDC__WEBAPI_CLIENT_SECRET"
  export BEARER_TOKEN
  echo "BEARER_TOKEN=$BEARER_TOKEN" >>$GITHUB_ENV
else
  # Get sign in page
  response=$(curl -ik "https://localhost:41100/oidc/auth?redirect_uri=https%3A%2F%2Flocalhost%3A41100%2Fd2e%2Fportal%2Flogin-callback&client_id=$LOGTO__D2E_APP__CLIENT_ID&response_type=code&state=lbFDB1hcko&scope=openid%20offline_access%20profile%20email&nonce=Osptnuwqc47w&code_challenge=n6eqz8p8jj1L9Qu7pY2_GrWO7XyaQbWrcs54x9OAnPg&code_challenge_method=S256")
  printf "%s\n" "$response"

  # Extract cookies
  interaction_cookie=$(printf "%s\n" "$response" | grep _interaction= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  interaction_sig_cookie=$(printf "%s\n" "$response" | grep _interaction.sig= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  interaction_resume_cookie=$(printf "%s\n" "$response" | grep _interaction_resume= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  interaction_resume_sig_cookie=$(printf "%s\n" "$response" | grep _interaction_resume.sig= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  logto_cookie=$(printf "%s\n" "$response" | grep _logto= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')

  # Sign in
  response=$(curl -ik --request PUT 'https://localhost:41100/api/interaction' \
      --header 'content-type: application/json' \
      --header 'Referer: https://localhost:41100/sign-in' \
      --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _logto={\"appId\":\"$LOGTO__D2E_APP__CLIENT_ID\"}" \
      --data '{
      "event": "SignIn",
      "identifier": {
          "username": "admin",
          "password": "Updatepassword12345"
      }
  }')
  printf "%s\n" "$response"

  # Submit sign in page
  response=$(curl -ik --request POST 'https://localhost:41100/api/interaction/submit' \
      --header 'accept: application/json' \
      --header 'origin: https://localhost:41100' \
      --header 'referer: https://localhost:41100/sign-in' \
      --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _logto={\"appId\":\"$LOGTO__D2E_APP__CLIENT_ID\"}")
  printf "%s\n" "$response"

  # Get session
  response=$(curl -ik "https://localhost:41100/oidc/auth/$interaction_cookie" \
      --header 'referer: https://localhost:41100/sign-in' \
      --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _interaction_resume=$interaction_resume_cookie; _interaction_resume.sig=$interaction_resume_sig_cookie; _logto={\"appId\":\"$LOGTO__D2E_APP__CLIENT_ID\"}")
  printf "%s\n" "$response"

  interaction_cookie=$(printf "%s\n" "$response" | grep _interaction= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  interaction_sig_cookie=$(printf "%s\n" "$response" | grep _interaction.sig= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  interaction_resume_cookie=$(printf "%s\n" "$response" | grep _interaction_resume= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  interaction_resume_sig_cookie=$(printf "%s\n" "$response" | grep _interaction_resume.sig= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  logto_cookie=$(printf "%s\n" "$response" | grep _logto= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  session_cookie=$(printf "%s\n" "$response" | grep _session= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')
  session_sig_cookie=$(printf "%s\n" "$response" | grep _session.sig= | awk -F'=' '{print $2}' | awk -F'; ' '{print $1}')

  # Submit consent page
  response=$(curl -ik 'https://localhost:41100/consent' \
      --header 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
      --header 'referer: https://localhost:41100/sign-in' \
      --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _interaction_resume=$interaction_resume_cookie; _interaction_resume.sig=$interaction_resume_sig_cookie; _session=$session_cookie; _session.sig=$session_sig_cookie; _logto={\"appId\":\"$LOGTO__D2E_APP__CLIENT_ID\"}")
  printf "%s\n" "$response"

  # Get authorization code
  response=$(curl -ik "https://localhost:41100/oidc/auth/$interaction_cookie" \
      --header 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
      --header 'referer: https://localhost:41100/sign-in' \
      --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _interaction_resume=$interaction_resume_cookie; _interaction_resume.sig=$interaction_resume_sig_cookie; _session=$session_cookie; _session.sig=$session_sig_cookie; _logto={\"appId\":\"$LOGTO__D2E_APP__CLIENT_ID\"}")
  printf "%s\n" "$response"

  authorization_code=$(printf "%s\n" "$response" | sed -n 's/.*code=\([^&]*\).*/\1/p' | head -n 1)

  # Complete login
  response=$(curl -ik "https://localhost:41100/d2e/portal/login-callback?code=$authorization_code&state=lbFDB1hcko&iss=https%3A%2F%2Flocalhost%3A41100%2Foidc" \
      --header 'accept: text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7' \
      --header 'referer: https://localhost:41100/sign-in' \
      --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _interaction_resume=$interaction_resume_cookie; _interaction_resume.sig=$interaction_resume_sig_cookie; _session=$session_cookie; _session.sig=$session_sig_cookie; _logto={\"appId\":\"$LOGTO__D2E_APP__CLIENT_ID\"}")
  printf "%s\n" "$response"

  # Get Bearer token
  response=$(curl -ik 'https://localhost:41100/d2e/oauth/token' \
      --header 'accept: application/json, text/javascript, */*; q=0.01' \
      --header 'content-type: application/x-www-form-urlencoded' \
      --header "Cookie: _interaction=$interaction_cookie; _interaction.sig=$interaction_sig_cookie; _interaction_resume=$interaction_resume_cookie; _interaction_resume.sig=$interaction_resume_sig_cookie; _session=$session_cookie; _session.sig=$session_sig_cookie; _logto={\"appId\":\"$LOGTO__D2E_APP__CLIENT_ID\"}" \
      --header 'origin: https://localhost:41100' \
      --header 'referer: https://localhost:41100/d2e/portal/login-callback?code=2sxkx6uCahwOfKo1cwzLaAq5MfdBJrMcqCLNHvOTXFv&state=odSrnZhVyE&iss=https%3A%2F%2Flocalhost%3A41100%2Foidc' \
      --data-urlencode 'grant_type=authorization_code' \
      --data-urlencode "client_id=$LOGTO__D2E_APP__CLIENT_ID" \
      --data-urlencode 'redirect_uri=https://localhost:41100/d2e/portal/login-callback' \
      --data-urlencode "code=$authorization_code" \
      --data-urlencode 'code_verifier=kqVLhCyXRJ3Y9mXie6F9d1FW8AUbTUzIuJiqUf1SM9I')
  printf "%s\n" "$response"

  export BEARER_TOKEN=$(echo "$response" | grep -o '"access_token":"[^"]*"' | sed 's/"access_token":"\([^"]*\)"/\1/')
fi
echo "BEARER_TOKEN=$BEARER_TOKEN" >>$GITHUB_ENV # Make available to subsequent github actions steps

echo "BEARER TOKEN:"
echo $BEARER_TOKEN
# Get the idp sub

decode_base64_url() {
    local len=$((${#1} % 4))
    local result="$1"
    if [ $len -eq 2 ]; then
        result="$1"'=='
    elif [ $len -eq 3 ]; then
        result="$1"'='
    fi
    echo "$result" | tr '_-' '/+' | openssl enc -d -base64
}

decode_jwt() {
    decode_base64_url $(echo -n $2 | cut -d "." -f $1)
}

DECODED_TOKEN="$(decode_jwt 2 $BEARER_TOKEN)"
echo "DECODED TOKEN:"
echo $DECODED_TOKEN
export IDP_SUB=$(echo $(echo $DECODED_TOKEN | grep -o '"sub":"[^"]*"' | awk -F':' '{print $2}' | tr -d '"'))
echo "IDP_SUB=$IDP_SUB" >>$GITHUB_ENV # Make available to subsequent github actions steps
echo "IDP SUB:"
echo $IDP_SUB

# Trigger user mgmt function run to get migrations to run first
curl -ik 'https://localhost:41100/d2e/usermgmt/api/user-group/overview' \
    -H "authorization: Bearer $BEARER_TOKEN"

echo "Waiting 180 secs for user mgmt function to start and run migrations..."
sleep 180
# Endpoint to update user management with idp user id
response=$(curl -ik 'https://localhost:41100/d2e/usermgmt/api/user-group/list' \
    -H 'accept: application/json, text/plain, */*' \
    -H "authorization: Bearer $BEARER_TOKEN" \
    -H 'content-type: application/json' \
    -H 'origin: https://localhost:41100' \
    -H 'referer: https://localhost:41100/d2e/portal/no-access' \
    --data-raw "{\"userId\":\"$IDP_SUB\"}")
printf "%s\n" "$response"
USER_MGMT_ID=$(printf "%s\n" "$response" | grep -o '"userId":"[^"]*"' | awk -F':' '{print $2}' | tr -d '"')
echo "USER_MGMT_ID=$USER_MGMT_ID" >>$GITHUB_ENV # Make available to subsequent github actions steps
echo "USER_MGMT_ID:"
echo $USER_MGMT_ID

########################
# Seed db credentials
########################
echo "Seed db credentials"
docker exec alp-minerva-postgres-1 psql -h localhost -U postgres -p 5432 -d alp -c "INSERT INTO trex.db (id,host,port,name,dialect,credentials,vocab_schemas,publications,db_extra,authentication_mode) VALUES
('${TESTSCHEMA}','${HANASERVER}',${HDIPORT},'ALPDEV','hana','[ { \"id\": 1, \"username\": \"TENANT_ADMIN_USER\", \"password\": \"izLc+XGmQCVy9p9Dkch/I8pKY19AtpBQXwM+dOa92mz9pJbwm5HedYIiewwvZAdoU/6RAdReWuLeGK+j9krWlZ1VNkiVDYbN9+GU3EM76gIyIEbttmd3H/A4XAlc157TWSgJruad3SK+aTavSfMp10G44xXQyoT1MZwIGf2HBljxt2AsMh25qalA/4zYVq2deuH8M7QkEwHxkgORH+rgWs7vIvg+RUSX/nJklCAioR1Kz/ue0H3ECWaXo55sc/pCaPs99ZUnKVqjUIVNPCkxNDfs/wh3E7/Q3mH6RE76ez5oa7pLzLgAAgzTR6sfNR/LFZkb/ngsUH20pmnat9SdJzLJSbrakZGaGXSvbPs4Dbx1NYTpDBgoMvhBVt5lJHyHrQSE+L3gg3JJOT+e/gBOULu9YSL53wQEYOFwkTaz65uyda0pXxlTjiwXeAAohkWM+Px/FIcP52/B+1HzVfynO4DJKdnK02w1B+vM2COW1ysT4nbmy4a5whDNtVxmDvC2lV9oz5x0xhZ/QjSRN/TbaDvOqCUdg2sDoBo4bxeFiCYrJFv2Ex7QJkKh3VZXgTE+qWZk4RyRYVLcRVFD4js8bBJ+RKMLcAmTJBtXIuotPQ3uMZEyq53dxbkF+CLvNQaCVoeDJQCHtYQU+NC32dQipT0F5hWdKK3r65cFs50Md8o=\", \"salt\": \"GVB7oYGyiswVggS1uZm42Q==\", \"service_scope\": \"Internal\", \"db_id\": \"9addef8a-56d1-42c2-bcad-3c10035d540b\", \"created_by\": \"local\", \"created_date\": \"2024-05-20 02:02:08.102165\", \"modified_by\": \"local\", \"modified_date\": \"2024-05-20 02:02:08.102165\", \"user_scope\": \"Admin\" }, { \"id\": 2, \"username\": \"TENANT_READ_USER\", \"password\": \"Lh05IaOBUTrZpQ7iCsUsmoud0gKcBQGD0sNnppHInzElzZTpzEcCKlj5hdiHYCRWO4AFaS/slnwjbbAZvhoHSGYD1DqEoxZcL9G/Qk/7zH+2ntlPwMYlQKWGgKKLmPZ+M0fTRmo+kOsheF57hI2fPcBKJ5+MHBu9MlJb5E8MGlRXupY2kvIKwfj6FBGbz+2iiVBizmgbTkyF3d3q+qwMtmgit6M/hcl1vqPre2lA8zCRWQVA05ShO89nIIsP1aY37yrUZnsDFV50I1OgwQ7GKRJESLxkpoyipAvptYGTsPwNMFJuWiuqvT4pmk1pxzPj1svs2HhSGPQXhhOX+kLBSsdV3gGngjP/GibEv2vr2MrGijSF8cFdrNXUdVaodo3buqhbhi6AErAO6n385YaInL5OvHcNSY8vzBanpmLTzSBBhi0yabIwC3cpaJP8Uj+8z6YTHtQKiA3rsZfPeEUUUlEc9GerJUQWS6hYuleJAwo4fnybqfBO1svrz9EMtXyjAlmqpib3cusxKzfwH+HzsQpsiCAW0EF8FAA4PkYyXnMcWqZie/u1JEKrAO5fkCqgVYJOE9rsTs2EG0fMxvDICHzHwpOvrnabYwYH8fWUFlWltvPkEQZ8keyTAyhzLxFsqhNAtyydydkJBbzX6jDBe9yo7cPnhD3sYUWKHhG81Zs=\", \"salt\": \"xdowTXu8Qkat5gTTj6URuA==\", \"service_scope\": \"Internal\", \"db_id\": \"9addef8a-56d1-42c2-bcad-3c10035d540b\", \"created_by\": \"local\", \"created_date\": \"2024-05-20 02:02:08.102165\", \"modified_by\": \"local\", \"modified_date\": \"2024-05-20 02:02:08.102165\", \"user_scope\": \"Read\" } ]', '[\"CDMVOCAB\"]', '[]', '{\"schema\": \"${TESTSCHEMA}\", \"useTLS\": false, \"encrypt\": false, \"pooling\": false, \"cdwSchema\": \"${TESTSCHEMA}\", \"autoCommit\": false, \"probeSchema\": \"${TESTSCHEMA}\", \"vocabSchema\": \"CDMVOCAB\", \"configSchema\": \"MRI\", \"sslTrustStore\": \"-----BEGIN CERTIFICATE-----MIIDuTCCAqGgAwIBAgIUX/oNqJTx15vT2SI6fg9bEInu3mAwDQYJKoZIhvcNAQELBQAwIDEMMAoGA1UEChMDU1JFMRAwDgYDVQQDEwdjYS1yb290MB4XDTIwMDkwODEzMzExOFoXDTMwMDkwNjEzMzE0N1owIDEMMAoGA1UEChMDU1JFMRAwDgYDVQQDEwdjYS1yb290MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArf7hNfOgoFzY/Cfk8XrRIq4eG6rsf7o8DZKMCoLnwR+uFtzCXyY8HWsD33Po6azXIaTqhT7JFO9osbK8JhzcgiIhxDLT5y5jx77AwKjqPWezgwuKutNAw2E8U5In+1i4mDwP1jJg2pXSoxUzKYQub03Zt04VzXhUD9HT8E8oON9TgQOFMP2+14zQ8VM1OtDLImOedSmyAtk34Tytu38ra1VRIWAkwz7G2O3O5Lsn2NvljLpSasR1Y3JALN1ePeegDr05mQXnNkRkYa4AutMhbfg+P1elCuJEVKfp+80IMnmJXXHwXXbPg6VqYzZkYZRbob2ESynjy7qUL6W/MJg6JwIDAQABo4HqMIHnMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1UdDgQWBBSFTCgp1EHdFv14efJlS7Pl7xcZjzAfBgNVHSMEGDAWgBSFTCgp1EHdFv14efJlS7Pl7xcZjzA8BggrBgEFBQcBAQQwMC4wLAYIKwYBBQUHMAKGIGh0dHBzOi8vdmF1bHQuaHBzZ2MuZGUvdjEvcGtpL2NhMBIGA1UdEQQLMAmCB2NhLXJvb3QwMgYDVR0fBCswKTAnoCWgI4YhaHR0cHM6Ly92YXVsdC5ocHNnYy5kZS92MS9wa2kvY3JsMA0GCSqGSIb3DQEBCwUAA4IBAQBMhvDhtbWPc8O65zV3I76ecpvIPUY6Rc8aHRRdNzUUu6EgyGnK/KHJ0v3+k5yxP2axbDzcviHcvU/zf64FHoM7j+ObcsfwrmtbD9ZyJUcE2vRyH8yFppnHHIQP1nmVjXzAxWLysnko5D3myLcK5CJzUaTCnAld2R6cj774MyekCytbN4U3VvMKfGBJ544tfMgAPPBGAfPEB6qDBw0S5cLD1tIrsikrx8FReQHU9r+yJl4uRjz4SY/397i9QdzQGlZPpWaw/3GCnBwJiEDCwZnSK14v62LwJVH97JvX4/a5YS+GQpIEwD6cC5Ru1dbCMYTYZAcEcPDJk0ldRnahn/5u-----END CERTIFICATE-----\", \"sslCryptoProvider\": \"sapcrypto\", \"rejectUnauthorized\": false, \"enableAuditPolicies\": false, \"validateCertificate\": false, \"hostnameInCertificate\": \"alp-hn-gold-sg.southeastasia.cloudapp.azure.com\"}', 'Password') ON CONFLICT DO NOTHING"

# Restart is required for alp-trex container after seeding database credentials into the db table
docker container restart alp-trex
echo "Waiting 10 secs for alp-trex to restart..."
sleep 10

########################
# Seed dummy dataset
########################
docker exec alp-minerva-postgres-1 psql -h localhost -U postgres -p 5432 -d alp -c "INSERT INTO portal.dataset (id,tenant_id,visibility_status,database_code,schema_name,token_dataset_code,\"type\",created_by,created_date,modified_by,modified_date,data_model,source_dataset_id,pa_config_id,vocab_schema_name,dialect) VALUES
('cd13fd3e-9f35-4812-b2a1-497b232a8771','e0348e4d-2e17-43f2-a3c6-efd752d17c23','DEFAULT','$TESTSCHEMA','CDMSYNPUF1K','HTTP_TEST_TOKEN','','$IDP_SUB','2024-03-26 09:59:19.539','$IDP_SUB','2024-03-26 09:59:19.539','DUMMY MODEL',NULL,'92d7c6f8-3118-4256-ab22-f2f7fd19d4e7','CDMVOCAB','hana') ON CONFLICT DO NOTHING"

docker exec alp-minerva-postgres-1 psql -h localhost -U postgres -p 5432 -d alp -c "INSERT INTO portal.dataset_detail (id,\"name\",description,summary,show_request_access,dataset_id,created_by,created_date,modified_by,modified_date) VALUES
('4988423f-a5f9-43c4-b6a2-04d02efb2d45','hanasynpuf1k','','',false,'cd13fd3e-9f35-4812-b2a1-497b232a8771','$IDP_SUB','2024-03-26 09:59:19.539','$IDP_SUB','2024-03-26 09:59:19.539') ON CONFLICT DO NOTHING"

curl -ik 'https://localhost:41100/usermgmt/api/user-group/register-study-roles' \
    -H 'accept: application/json, text/plain, */*' \
    -H "authorization: Bearer $BEARER_TOKEN" \
    -H 'content-type: application/json' \
    -H 'origin: https://localhost:41100' \
    -H 'referer: https://localhost:41100/portal/systemadmin/dataset-overview' \
    --data-raw "{\"userIds\":[\"$USER_MGMT_ID\"],\"tenantId\":\"e0348e4d-2e17-43f2-a3c6-efd752d17c23\",\"studyId\":\"cd13fd3e-9f35-4812-b2a1-497b232a8771\",\"roles\":[\"RESEARCHER\"]}"

########################
# Install dependencies in backend integration tests
########################
cd ./tests/backend_integration_tests
yarn

########################
# Run HTTP tests
########################
yarn test-specs --test_schema_name=$TESTSCHEMA
