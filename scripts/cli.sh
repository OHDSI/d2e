#!/usr/bin/env bash
set -o errexit

version=0.15.0 #default/base version
LATEST_DOCKER_TAG_NAME=0.15.0-beta


cmd=""
script_full_path=$(dirname "$0")

if [[ -n "$D2ECLI_NODE_MODULES_PATH" ]]; then
  node_modules_path=$D2ECLI_NODE_MODULES_PATH
elif [ -d "$script_full_path/../lib/node_modules/d2e/" ]; then
  node_modules_path=$script_full_path/../lib/node_modules/d2e/
elif [ -d "$script_full_path/../d2e/" ]; then
  node_modules_path=$script_full_path/../d2e/
elif [ -d "$script_full_path/../lib/node_modules/@ohdsi/d2e/" ]; then
  node_modules_path=$script_full_path/../lib/node_modules/@ohdsi/d2e/
elif [ -d "$script_full_path/../@ohdsi/d2e/" ]; then
  node_modules_path=$script_full_path/../@ohdsi/d2e/
elif [ -d "$script_full_path/../lib/node_modules/@data2evidence/cli/" ]; then
  node_modules_path=$script_full_path/../lib/node_modules/@data2evidence/cli/
elif [ -d "$script_full_path/../@data2evidence/cli/" ]; then
  node_modules_path=$script_full_path/../@data2evidence/cli/
elif [[ "$(basename "$0")" == "cli.sh" || "$(basename "$(dirname "$0")")" == "scripts" ]]; then
  node_modules_path=$script_full_path/..
else
  echo "Can't find d2e cli node_modules dir. You can set D2ECLI_NODE_MODULES_PATH to define the path. Exiting"
  exit -1
fi

export CADDY__CONFIG=${CADDY__CONFIG:-./.deploy/caddy-config}
export ENV_TYPE=${ENV_TYPE:-remote}
DOCKER_LOG_LEVEL=${DOCKER_LOG_LEVEL:-ERROR}

ENV_EXAMPLE=$node_modules_path/env.example
GIT_BASE_DIR=.

env=.env
context=""
demo=""
minio=""
compose=""
args=""
services=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -d|--function-path) function_path="$2"; shift ;;
        -e|--demo) demo=--profile="demodb" ;;
        --minio) minio=--profile="minio" ;;
        -c|--compose-file) compose="--file $2"; shift ;;
        -t|--docker-context) context="--context $2"; shift ;;
        -v|--version) version="$2"; shift ;;
        -a|--args) args="$2"; shift ;;
        -n|--env-file) env="$2"; shift ;;
        -p|--port) PORT="$2"; shift ;;
        -s|--services) services="$2"; shift ;;
        --hana) hana=--profile="hana" ;;
        --pull) pull=true;;
        *) if [[ -z ${cmd:-} ]]; then
               cmd=$1
           else
               echo "Unexpected argument after command: $1"
               exit 1
           fi
    esac
    shift
done


if [ -n "${function_path:-}" ]; then
    dev="--file $node_modules_path/docker-compose-local.yml --env-file $env"
    export D2E_FUNCTIONS=$function_path
else
    dev="--env-file $env"
fi
ENVFILE=$env
# export PROJECT_NAME=${PROJECT_NAME:-d2e}

if [[ $version = "develop" ]]; then
  export PLUGINS_API_VERSION=${PLUGINS_API_VERSION:-latest}
  export DOCKER_TAG_NAME=${DOCKER_TAG_NAME:-develop}
  #export DOCKER_IMAGE_PREFIX=ghcr.io/ohdsi/
  export PLUGINS_IMAGE_TAG=${PLUGINS_IMAGE_TAG:-develop}
  export PLUGINS_REGISTRY=${PLUGINS_REGISTRY:-https://pkgs.dev.azure.com/data2evidence/d2e/_packaging/d2e/npm/registry/}
  export DOCKER_LOG_LEVEL=INFO
else
  export PLUGINS_API_VERSION=${PLUGINS_API_VERSION:-~$version}
  export DOCKER_TAG_NAME=${DOCKER_TAG_NAME:-${LATEST_DOCKER_TAG_NAME}}
  export PLUGINS_IMAGE_TAG=${PLUGINS_IMAGE_TAG:-${LATEST_DOCKER_TAG_NAME}}
  export PLUGINS_REGISTRY=${PLUGINS_REGISTRY:-https://pkgs.dev.azure.com/data2evidence/d2e/_packaging/stable/npm/registry/}
fi

dockerbasecmd="docker $context --log-level $DOCKER_LOG_LEVEL compose --file $node_modules_path/docker-compose.yml $demo $hana $dev $compose $args"

generate_random_secret() {
  LC_ALL=C tr -dc A-Za-z0-9 </dev/urandom | head -c 40
}

generate_uuid() {
  return uuidgen | tr "[:upper:]" "[:lower:]"
}

generate_jwt() {
  local secret="$1"
  local role="$2"
  local iss="$3"
  local iat=$(date +%s)
  local exp=$((iat + 157788000)) # 5 years expiration

  local header=$(echo -n '{"alg":"HS256","typ":"JWT"}' | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
  local payload=$(echo -n "{\"role\":\"$role\",\"iss\":\"$iss\",\"iat\":$iat,\"exp\":$exp}" | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')
  local signature=$(echo -n "$header.$payload" | openssl dgst -sha256 -hmac "$secret" -binary | base64 | tr -d '=' | tr '/+' '_-' | tr -d '\n')

  echo "$header.$payload.$signature"
}

# Setup zx command with fallbacks
setup_zx_cmd() {
  if [ -f "$node_modules_path/node_modules/.bin/zx" ]; then
    ZX_CMD="$node_modules_path/node_modules/.bin/zx"
  elif [ -f "$node_modules_path/node_modules/zx/build/cli.js" ]; then
    ZX_CMD="node $node_modules_path/node_modules/zx/build/cli.js"
  else
    echo "Error: zx not found in node_modules"
    exit 1
  fi
}

case $cmd in
    start)
        source "$ENVFILE"
        cmd="$dockerbasecmd up --force-recreate --wait"
        if [ -n "$services" ]; then
            cmd="$cmd --no-deps $services"
        fi
        if [[ -n "$pull" ]]; then
            cmd="$cmd --pull always"
        fi
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    inithana)
        echo "This will initialize SAP HANA Express Edition."
        echo "By proceeding, you agree to the SAP License Agreement."
        echo "You can view the license at: https://www.sap.com/docs/download/cmp/2016/06/sap-hana-express-dev-agmt-and-exhibit.pdf"
        
        if [[ -n "${ACCEPT_SAP_LICENSE:-}" ]]; then
            echo "CI environment detected. Auto-accepting SAP license terms..."
            license_agreement="y"
        else
            read -p "Do you agree to the SAP license terms and want to continue? (y/N): " license_agreement
        fi
        
        case "$license_agreement" in
            y|Y|yes|YES)
                echo "License accepted. Proceeding with HANA initialization..."
                ;;
            *)
                echo "License not accepted. Aborting HANA initialization."
                exit 1
                ;;
        esac
        
        source $node_modules_path/scripts/lib.sh # functions here
        hanapw=${HANAPW:-$(random-password 16)}
        echo HANA_SYSTEM_PASSWORD=$hanapw >> $ENVFILE
        cat >> $ENVFILE << 'EOF'
INSTALL_SQLALCHEMY_HANA=true
INSTALL_SQLALCHEMY="bash -c 'INSTALL_SQLALCHEMY_HANA=true /app/install_hana_drivers.sh prefect flow-run execute'"
EOF
        cmd="$dockerbasecmd --profile hana run --rm hana --master-password $hanapw --agree-to-sap-license"
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    stop)
        cmd="$dockerbasecmd stop"
        if [ -n "$services" ]; then
            cmd="$cmd $services"
        fi
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    build)
        cmd="$dockerbasecmd build"
        if [ -n "$services" ]; then      
            cmd="$cmd $services"
        fi
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    status)
        cmd="$dockerbasecmd ps"
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    logs)
        cmd="$dockerbasecmd logs -t"
        if [ -n "$services" ]; then
            cmd="$cmd $services"
        fi
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    config)
        cmd="$dockerbasecmd config"
        echo "# ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd"
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd 2> /dev/null
        ;;
    clean)
        read -p "This action will delete all docker containers and volumes. Continue (y/n)?" choice
        case "$choice" in
            y|Y)
                cmd="$dockerbasecmd down --volumes --remove-orphans"
                echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
                ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
                ;;
            *)
                echo "Aborting";;
        esac
        ;;
    cleanci)
        cmd="$dockerbasecmd down --volumes --remove-orphans"
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    patchdemodb)
        source "$ENVFILE"
        database_host=${PROJECT_NAME:-d2e}-demodb
        # Create cohort table if it doesn't exist
        docker exec $database_host psql -h localhost -U postgres -c "SET search_path TO demo_cdm; CREATE TABLE IF NOT EXISTS cohort (cohort_definition_id integer NOT NULL,subject_id integer NOT NULL,cohort_start_date DATE NOT NULL,cohort_end_date DATE NOT NULL)"
        # Update CDM version to 5.4 - the broadsea-atlasdb uses CDM 5.4 schema
        # (e.g., ADMITTED_FROM_CONCEPT_ID instead of ADMITTING_SOURCE_CONCEPT_ID)
        docker exec $database_host psql -h localhost -U postgres -c "UPDATE demo_cdm.cdm_source SET cdm_version = '5.4' WHERE cdm_version != '5.4' OR cdm_version IS NULL"
        ;;
    init)
        if [[ -n "${init_choice:-}" ]]; then
            echo "CI environment detected. Auto-accepting to overwite all values in .env file..."
            init_choice="y"
        else
            echo "WARNING: Re-running this command again will require you to run \`d2e clean\` to remove all existing containers and volumes before starting services again with \`d2e start\`."
            read -p "Do you wish to overwrite .env file? (y/n):" init_choice
        fi

        case "$init_choice" in
          y|Y)
            CADDY__D2E__PUBLIC_FQDN=${CADDY__D2E__PUBLIC_FQDN:-${CADDY__ALP__PUBLIC_FQDN:-localhost}}
            ENV_TYPE=${ENV_TYPE:-local}
            TLS__CADDY_DIRECTIVE=${TLS__CADDY_DIRECTIVE:-tls internal}
            PROJECT_NAME=${PROJECT_NAME:-d2e}
            [ -v DOTENV_FILE ] || DOTENV_FILE=$env
            DOTENV_KEYS=$DOTENV_FILE.keys

            echo . INPUTS TLS__CADDY_DIRECTIVE=\"$TLS__CADDY_DIRECTIVE\" DOTENV_FILE=$DOTENV_FILE

            # vars

            source $node_modules_path/scripts/lib.sh # functions here

            echo ". INFO generate public & private keys - DB_CREDENTIALS__INTERNAL"
            DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE=$(random-password 41)
            DB_CREDENTIALS__INTERNAL__PRIVATE_KEY="$(DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE=$DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE openssl genpkey -algorithm RSA -aes-256-cbc -pkeyopt rsa_keygen_bits:4096 -pass env:DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE -quiet)"
            DB_CREDENTIALS__INTERNAL__DECRYPT_PRIVATE_KEY="$(DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE=$DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE openssl rsa -in <(echo "${DB_CREDENTIALS__INTERNAL__PRIVATE_KEY}") -passin env:DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE)"
            DB_CREDENTIALS__INTERNAL__PUBLIC_KEY="$(DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE=$DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE openssl rsa -in <(echo "${DB_CREDENTIALS__INTERNAL__PRIVATE_KEY}") -pubout -passin env:DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE)"

            # Generate random supabase JWT secret
            JWT_SECRET=$(generate_random_secret)
            # Generate supabase service role JWT token
            ROLE="service_role"
            ISSUER="supabase"
            JWT_TOKEN=$(generate_jwt "$JWT_SECRET" "$ROLE" "$ISSUER")

            # action
            echo -n '' > $DOTENV_FILE
            echo CADDY__D2E__PUBLIC_FQDN=$CADDY__D2E__PUBLIC_FQDN >> $DOTENV_FILE
            echo DOCKER_TAG_NAME=$DOCKER_TAG_NAME >> $DOTENV_FILE
            echo ENV_TYPE=$ENV_TYPE >> $DOTENV_FILE
            echo LOGTO__D2E_APP__CLIENT_ID=$(random-password 21) >> $DOTENV_FILE
            echo LOGTO__D2E_APP__CLIENT_SECRET=$(random-password 30) >> $DOTENV_FILE
            echo LOGTO__D2E_DATA__CLIENT_ID=$(random-password 21) >> $DOTENV_FILE
            echo LOGTO__D2E_DATA__CLIENT_SECRET=$(random-password 30) >> $DOTENV_FILE
            echo LOGTO__D2E_SVC__CLIENT_ID=$(random-password 21) >> $DOTENV_FILE
            echo LOGTO__D2E_SVC__CLIENT_SECRET=$(random-password 30) >> $DOTENV_FILE
            echo LOGTO_API_M2M_CLIENT_ID=$(random-password 21) >> $DOTENV_FILE
            echo LOGTO_API_M2M_CLIENT_SECRET=$(random-password 30) >> $DOTENV_FILE
            echo MINIO__SECRET_KEY=$(random-password $DEFAULT_PASSWORD_LENGTH) >> $DOTENV_FILE
            echo PG_ADMIN_PASSWORD=$(random-password $DEFAULT_PASSWORD_LENGTH) >> $DOTENV_FILE
            echo PG_SUPER_PASSWORD=$(random-password $DEFAULT_PASSWORD_LENGTH) >> $DOTENV_FILE
            echo PG_WRITE_PASSWORD=$(random-password $DEFAULT_PASSWORD_LENGTH) >> $DOTENV_FILE
            echo DEMO__DB_PASSWORD=$(random-password 6) >> $DOTENV_FILE
            echo TLS__CADDY_DIRECTIVE=\'"$TLS__CADDY_DIRECTIVE"\' >> $DOTENV_FILE
            echo "SUPABASE_STORAGE_JWT_SECRET=$JWT_SECRET" >> $DOTENV_FILE
            echo "SUPABASE_STORAGE_JWT_TOKEN=$JWT_TOKEN" >> $DOTENV_FILE
            echo PROJECT_NAME=$PROJECT_NAME >> $DOTENV_FILE
            echo TREX__SQL__PASSWORD=$(random-password $DEFAULT_PASSWORD_LENGTH) >> $DOTENV_FILE
            # Both are hard requirements in docker-compose.yml (${VAR:?...}): trex
            # refuses to boot without a root key, and the OIDC client secret is
            # shared between the provider and WebAPI. Without these the generated
            # env file cannot start the stack at all.
            echo TREX_ROOT_KEY=$(openssl rand -base64 32) >> $DOTENV_FILE
            echo TREX__OIDC__WEBAPI_CLIENT_SECRET=$(random-password $DEFAULT_PASSWORD_LENGTH) >> $DOTENV_FILE

            source $DOTENV_FILE && echo LOGTO__CLIENTID_PASSWORD__BASIC_AUTH=$(echo -n "${LOGTO_API_M2M_CLIENT_ID}:${LOGTO_API_M2M_CLIENT_SECRET}" | base64) >> $DOTENV_FILE
            #echo PG__LOGTO_MANAGER_USER=postgres >> $DOTENV_FILE
            echo PG__LOGTO_MANAGER_PASSWORD=$(random-password $DEFAULT_PASSWORD_LENGTH) >> $DOTENV_FILE

            set-cpu-limit
            set-memory-limit
            gen-tls-internal

            # echo DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE=\'"$DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE"\' >> $DOTENV_FILE
            # echo DB_CREDENTIALS__INTERNAL__PRIVATE_KEY=\'"$DB_CREDENTIALS__INTERNAL__PRIVATE_KEY"\' >> $DOTENV_FILE
            echo DB_CREDENTIALS__INTERNAL__DECRYPT_PRIVATE_KEY=\'"$DB_CREDENTIALS__INTERNAL__DECRYPT_PRIVATE_KEY"\' >> $DOTENV_FILE
            echo DB_CREDENTIALS__INTERNAL__PUBLIC_KEY=\'"$DB_CREDENTIALS__INTERNAL__PUBLIC_KEY"\' >> $DOTENV_FILE

            # finalize
            cat $DOTENV_FILE | grep = | awk -F= '{print $1}' | grep _ | sort -u > $DOTENV_KEYS
            echo . INFO linecounts
            wc -l $DOTENV_FILE $DOTENV_KEYS | sed '$d'
            ;;
          *)
            echo "Aborting"
            exit 1
            ;;
        esac
        ;;
    pull)
        # Legacy per-group flow images retired: flows run on the pixi process
        # worker, whose image is part of the regular compose pull below.
        cmd="$dockerbasecmd pull"
        echo . ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ENV_TYPE=$ENV_TYPE CADDY__CONFIG=$CADDY__CONFIG PORT=$PORT $cmd
        ;;
    setupdemo)
        source "$ENVFILE"
        $node_modules_path/scripts/cli.sh patchdemodb -n "$ENVFILE"
        database_host=${PROJECT_NAME:-d2e}-demodb
        setup_zx_cmd
        PORT=$PORT $ZX_CMD "$node_modules_path/scripts/setupdemo.mjs" -n "$ENVFILE"
        PORT=$PORT $ZX_CMD "$node_modules_path/scripts/check-setupdemo-flow.mjs" -n "$ENVFILE"
        ;;
    setuphttptestenv)
        source "$ENVFILE"
        $node_modules_path/scripts/cli.sh patchdemodb -n "$ENVFILE"
        database_host=${PROJECT_NAME:-d2e}-demodb
        setup_zx_cmd
        PORT=$PORT $ZX_CMD "$node_modules_path/scripts/setuphttptestenv.mjs" -n "$ENVFILE"
        PORT=$PORT $ZX_CMD "$node_modules_path/scripts/check-setupdemo-flow.mjs" -n "$ENVFILE"
        ;;
    setupdemohana)
        source "$ENVFILE"
        setup_zx_cmd
        $ZX_CMD "$node_modules_path/scripts/setupdemohana.mjs" -n "$ENVFILE" 
        $ZX_CMD "$node_modules_path/scripts/check-setupdemohana-flow.mjs" -n "$ENVFILE"
        ;;
    checkflow) 
        setup_zx_cmd
        PORT=$PORT $ZX_CMD "$node_modules_path/scripts/check-setupdemo-flow.mjs" -n "$ENVFILE"
        ;;
    version)
        CLI_VERSION=$(grep -m1 '"version"' "$node_modules_path/package.json" | awk -F'"' '{print $4}')
        echo "d2e CLI version:    $CLI_VERSION"
        echo "Docker image tag:   $DOCKER_TAG_NAME"
        echo "Plugins API version: $PLUGINS_API_VERSION"
        ;;
    getnoproxy)
        setup_zx_cmd
        $ZX_CMD "$node_modules_path/scripts/get-noproxy.mjs" --script_full_path "$node_modules_path" 
        ;;
    *)
        if [ -z ${cmd:-} ]; then
            echo "d2e: command is missing"
        else
            echo "d2e: $cmd is not a d2e command."
        fi
        cat << EOT

Usage: d2e [OPTIONS] COMMAND

Commands:
  init        Initializes D2E directory and generates .env file
  start       Starts d2e services. Requires d2e init and d2e setup to be run.
  stop        Stops d2e services
  clean       Removes d2e docker containers and volumes
  setupdemo   Load d2e services. Requires d2e init and d2e setup to be run.

Options:
 -d, --function-path [PATH] Development mode. [PATH] is the path to the functions plugin (e.g. ./plugins/functions)
 -e, --demo                 Include demo database
 -c, --compose-file [PATH]  [PATH] is path to an additional docker compose file
 -t, --docker-context [CONTEXT] Use docker context
 -v, --version [VERSION]    Version of the d2e services to use
 -a, --args [ARGUMENTS]     Additional arguments for docker-compose
 -n, --env-file [FILE]      Path to environment file
 -p, --port [PORT]          Port number to use
 -s, --services [SERVICES]  Comma-separated list of services to start/stop

EOT
        ;;
esac