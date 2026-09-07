# TLS

## Caddy validate TLS**INTERNAL**CA_CRT TLS**INTERNAL**CRT TLS**INTERNAL**KEY

- `gen-tls.sh` copies certs from Caddy container at runtime

- Setup

```bash
mkdir private-crt
cd private-crt
CONTAINER_NAME=alp-caddy
TLS_CA_NAME=alp-internal
DOMAIN_NAME=d2e.local
CONTAINER_CRT_DIR=/data/caddy/certificates/$TLS_CA_NAME/wildcard_.$DOMAIN_NAME
CONTAINER_CA_DIR=/data/caddy/pki/authorities/$TLS_CA_NAME
```

- Option 1 - copy certs from Caddy container
  > [!NOTE]
  >
  > - TLS**INTERNAL**CRT.crt contains CA and CRT => extract CRT only

```bash
docker exec $CONTAINER_NAME cat $CONTAINER_CRT_DIR/wildcard_.${DOMAIN_NAME}.crt | head -n 12 | awk '/-----BEGIN CERTIFICATE-----/,/-----END CERTIFICATE-----/' > TLS__INTERNAL__CRT.crt
docker cp $CONTAINER_NAME:$CONTAINER_CRT_DIR/wildcard_.${DOMAIN_NAME}.key TLS__INTERNAL__KEY.key
docker cp $CONTAINER_NAME:$CONTAINER_CA_DIR/root.crt TLS__INTERNAL__CA_CRT.crt
```

- Option 2 - echo certs from env-var

```bash
source ../.env.local
echo $TLS__INTERNAL__CRT > TLS__INTERNAL__CRT.crt
echo $TLS__INTERNAL__KEY > TLS__INTERNAL__KEY.key
echo $TLS__INTERNAL__CA_CRT > TLS__INTERNAL__CA_CRT.crt
```

- Validate CA matches CRT

```bash
openssl verify -verbose -CAfile TLS__INTERNAL__CA_CRT.crt TLS__INTERNAL__CRT.crt
```

> TLS**INTERNAL**CRT.crt: OK

- Validate CRT SAN

```bash
openssl x509 -noout -ext subjectAltName -in TLS__INTERNAL__CRT.crt
```

> X509v3 Subject Alternative Name: critical
> DNS:\*.d2e.local

## Internal domain

Service-to-service TLS uses one internal DNS domain, `TLS__INTERNAL__DOMAIN`, defaulting to
`d2e.local`. Internal HTTPS verification is strict — both the certificate chain and the
hostname are checked — so this value **must** match the generated certificate's SAN
(`*.<domain>` plus the bare domain). Certificate generation builds the SAN from the same
variable and writes the resolved value back into the env file, so the two cannot drift.

Verify a running deployment from inside the network:

```bash
docker exec <project>-trex sh -c \
  "printf '' | openssl s_client -connect <project>-logto-1.d2e.local:3001 \
     -servername <project>-logto-1.d2e.local -verify_hostname <project>-logto-1.d2e.local \
     -verify_return_error -CAfile /usr/src/cert/ca.pem" 2>/dev/null | grep 'Verify return code'
```

> Verify return code: 0 (ok)

`-verify_hostname` matters: without it `openssl s_client` checks nothing (`-servername` only
sets SNI), and a certificate whose SAN does not cover the name being dialled looks like a pass.

### Upgrading an existing deployment

- **If your env file sets `TLS__INTERNAL__DOMAIN` explicitly to something other than the
  certificate's SAN** (e.g. a older `alp.local` value against a `*.d2e.local` certificate),
  every internal HTTPS hop fails hostname verification. Either set it to match the
  certificate, or regenerate certificates so the SAN is rebuilt from your value.
- **If your env file only has the older `TLS__INTERNAL__DOMAIN_NAME`**, certificate
  generation still honours it and then writes `TLS__INTERNAL__DOMAIN` with the same value.
  Note this happens silently: regenerating without that variable present in the environment
  resolves the domain to the `d2e.local` default, and the certificate is issued to match.
- **No action is needed** if you never set either variable — defaults are consistent.

### Kubernetes deployments

In Kubernetes the internal hops are addressed by cluster service DNS, not by
`TLS__INTERNAL__DOMAIN`. The certificate supplied via `global.secrets.TLS__INTERNAL__CRT`
must therefore also cover the cluster's service DNS, or every internal hop fails hostname
verification once TLS is enabled:

```
DNS:*.<namespace>.svc.cluster.local
DNS:*.<namespace>.svc
```

A wildcard matches exactly one label, so `*.d2e.cluster.local` does **not** cover
`idp.d2e.svc.cluster.local`. `<namespace>` is the release namespace, so deploying into a
different namespace requires a certificate issued for that namespace.

Keep the `*.d2e.local` entries alongside these so one certificate still serves both
docker-compose and Kubernetes.

#### `SERVICE_ROUTES` must include a `prefect` route

`config.SERVICE_ROUTES` is supplied in values, not templated by the chart, and is seeded
verbatim into Prefect as the `service_routes` variable. It **must** contain a `prefect` entry:
the Prefect client throws `No url is set for Prefect` in its constructor when the key is absent,
which aborts seeding before any request is made — no variables, no secrets, and every flow then
fails with `Unable to find block document named trex-sql-password`.

For a release in namespace `<namespace>`:

```json
"prefect": "https://dataflow-gen.<namespace>.svc.cluster.local:443/d2e/api"
```

Port 443 is the Service port, which targets container port 41120 — unlike docker-compose, which
dials 41120 directly. Every route in this map must use a name the certificate's SAN covers, so
`<namespace>` has to match the release.

`charts/d2e-services/ci/test-values.yaml` carries a working example, pinned to the `d2e`
namespace that CI deploys into:

```json
{
  "alpdb":   "https://trex.d2e.svc.cluster.local:443/gateway/api/db",
  "analytics": "https://trex.d2e.svc.cluster.local:443",
  "trex":    "https://trex.d2e.svc.cluster.local:443",
  "logto":   "https://idp.d2e.svc.cluster.local:443",
  "prefect": "https://dataflow-gen.d2e.svc.cluster.local:443/d2e/api"
}
```

Copy the shape, not the namespace.

#### Image requirements

Two behaviours internal TLS depends on live in the trex image, not the chart, so a chart
deployed with an older image will fail in ways the manifests cannot explain:

- **Prefect readiness wait.** nginx binds Prefect's port before Prefect is listening and answers
  502 in the gap. Kubernetes cannot order this away — `dataflow-gen` and `trex` are containers in
  the same pod, so they start in parallel, and an initContainer that waited for Prefect would
  deadlock because initContainers complete before `dataflow-gen` starts. The wait therefore lives
  in the seeding function (`PrefectAPI.waitUntilReady`). Without it, seeding races Prefect's
  startup and can leave every secret uncreated.
- **Runtime CA trust for the embedded WebAPI.** The GraalVM native image bakes its truststore at
  build time and ignores the OS store, so it reads `WEBAPI_TRUST_CERTS` instead. Confirm the
  image supports it:

  ```bash
  docker run --rm --entrypoint sh <trex-image> -c \
    'grep -ac WEBAPI_TRUST_CERTS /usr/lib/libwebapi-native.so'
  ```

  Expect `1` or more. A `0` means OIDC discovery over internal TLS will fail with
  `PKIX path building failed` and trex will not finish booting.

#### Which hops are on TLS

All four internal service-to-service hops in `charts/d2e-services`, with no verification
bypasses:

| Hop | Listener | Terminated by |
|---|---|---|
| `idp` :443→3001, `idp-admin` :443→3002 | Logto, natively | `HTTPS_CERT_PATH` / `HTTPS_KEY_PATH` |
| `dataflow-gen` :443→41120 | nginx in front of Prefect on loopback :41121 | the image entrypoint |
| `storage` :443→9000 | nginx in front of storage-api on loopback :9001 | the image entrypoint |
| `trex` :443→33000 | trexas, natively | `tls_cert_path` in `SWARM_CONFIG` |

Note `trex-http` (:443→33001) is the same trexas routes without TLS. Nothing in the chart
addresses it any more; prefer `trex` for any new in-cluster caller.

#### How the material reaches the pods

The CA, and for Logto the server cert and key, are mounted from the existing chart Secret —
the same mechanism `caddy-local-pki` already uses — at fixed paths:

```
/etc/d2e/tls/ca.pem      # every pod that verifies an internal upstream
/etc/d2e/tls/cert.pem    # logto pod only
/etc/d2e/tls/key.pem     # logto pod only, mode 0400
```

Only the Logto pod terminates TLS on the mounted pair, so only it receives the private key.
`trex`, `dataflow-gen` and `storage` write their own cert from the `TLS__INTERNAL__*` env
their entrypoints read.

#### Trust is one mechanism per runtime

This is the load-bearing detail. A pod-level `curl` check can pass while another runtime in
the same container still fails, so verify per runtime rather than per pod:

| Runtime | Mechanism | Where |
|---|---|---|
| shell / `wget` / `curl` | OS trust store (`update-ca-certificates`) | trex, dataflow-gen, storage, worker |
| Deno edge functions | `DENO_TLS_CA_STORE=system` | trex |
| GraalVM native WebAPI | `WEBAPI_TRUST_CERTS` — it ignores the OS store entirely | trex |
| Python | append to `certifi.where()` — it does not read the OS store | worker, dataflow-gen |
| Node | `NODE_EXTRA_CA_CERTS` | logto, logto-post-init |
| Caddy | `tls_trust_pool file` (needs Caddy ≥ 2.8; the chart runs 2.11) | gateway |
| init containers | `wget --ca-certificate=/etc/d2e/tls/ca.pem` | logto-check, dependencies-check |

Liveness and readiness probes are the one place validation is skipped. `httpGet` probes use
`scheme: HTTPS` — the kubelet does not verify server certificates, so no CA is involved — and
the `exec` probes dial `127.0.0.1` with `--no-check-certificate`. Neither is a hop a CA could
verify: probes must not route through a Service (a readiness probe that does can never pass,
since the Service has no ready endpoints until the probe succeeds), and no certificate covers
a loopback address without an IP SAN. Real in-cluster callers exercise the chain.

#### Known gaps

- **SSO stays broken in Kubernetes** until the Logto connector fix ships. `LOGTO__SELF_BASE_URL`
  is set, but it stays inert until `data2evidence/logto` is rebuilt and the digest in
  `services/alp-logto/Dockerfile` is bumped — the same cross-repo sequence as docker-compose.
  Until that completes, social/enterprise connectors fail with `ECONNRESET`.
- **`config.SERVICE_ROUTES` cannot be templated.** It arrives from a values file, which has no
  access to `.Release.Namespace`, so its hostnames are literal. Deploying into a namespace
  other than the one the values file names requires overriding `config.SERVICE_ROUTES` to
  match.
- **`TLS__EXTRA__CA_CRTS` is not wired in the chart.** Reaching an upstream with its own
  external CA (see below) is currently a docker-compose-only capability.

## Trusting an external CA

Some upstreams are not ours and are not chained to the internal CA — the PS config server is
typically external/HANA-side. Add its CA to `TLS__EXTRA__CA_CRTS` (one or more concatenated
PEM blocks); the trex entrypoint installs them into the OS trust store before startup, where
`DENO_TLS_CA_STORE=system` consumers pick them up.

The value needs **real newlines**. A `.env`-style string containing literal `\n` is rejected
at startup with a `FATAL` message rather than silently trusting nothing. There is deliberately
no option to skip verification.
