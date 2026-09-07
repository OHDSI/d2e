#!/bin/sh
set -e

mkdir -p /usr/src/cert
printf '%s' "$TLS__INTERNAL__CRT" > /usr/src/cert/cert.pem
# The key would otherwise inherit the default 022 umask and land 0644 — readable
# by every user in the container. Scoped to this one write on purpose: the
# certificate and CA are public material and must stay readable by non-root
# consumers (nginx workers, python), and /usr/src/cert must stay traversable.
(umask 077; printf '%s' "$TLS__INTERNAL__KEY" > /usr/src/cert/key.pem)
printf '%s' "$TLS__INTERNAL__CA_CRT" > /usr/src/cert/ca.pem

# Outbound trust for the internal CA (same move as trex, the dataflow worker and
# supabase-storage), so this container can reach other TLS-only internal
# services. Two mechanisms are needed: the OS store covers shell/curl, and
# Python reads certifi's bundle rather than the OS store. Skipped when the CA is
# absent so a plaintext deployment still starts.
if [ -s /usr/src/cert/ca.pem ]; then
  cp /usr/src/cert/ca.pem /usr/local/share/ca-certificates/d2e-internal-ca.crt
  update-ca-certificates
  python -c 'import certifi; open(certifi.where(), "a").write("\n" + open("/usr/src/cert/ca.pem").read() + "\n")'
fi

mkdir -p /etc/nginx/conf.d
cat <<EOT > /etc/nginx/conf.d/dataflow-gen.conf
server {
    listen 41120 ssl;
    server_name ${DATAFLOW_GEN_HOSTNAME:-dataflow-gen-1};

    ssl_certificate     /usr/src/cert/cert.pem;
    ssl_certificate_key /usr/src/cert/key.pem;

    # Prefect artifact/result payloads (e.g. DQD reports) routinely exceed
    # nginx's default 1m limit; Prefect had no such cap before nginx sat in
    # front of it for TLS termination.
    client_max_body_size 0;

    location / {
        proxy_pass http://127.0.0.1:41121;
        proxy_http_version 1.1;
        # $host strips the port; Prefect needs the real port (incl. :41120)
        # to build correct absolute redirect Location headers (e.g. the
        # trailing-slash 307 on /variables), so use $http_host instead.
        proxy_set_header Host \$http_host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        # Prefect's events API is websocket-only (/d2e/api/events/in, /out);
        # without these, nginx forwards the upgrade request as a plain GET,
        # which Prefect's ASGI router 404s on instead of upgrading.
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOT

nginx

exec prefect server start
