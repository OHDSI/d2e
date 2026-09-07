# Environment Variables

| key                                             | type           | comment                                                                             |
| ----------------------------------------------- | -------------- | ----------------------------------------------------------------------------------- |
| `CADDY__D2E__PUBLIC_FQDN`                       | string         | Public FQDN                                                                         |
| `D2E_CPU_LIMIT`                                 | string         | Dynamically Calculated Limit                                                        |
| `D2E_MEMORY_LIMIT`                              | string         | Dynamically Calculated Limit                                                        |
| `DB_CREDENTIALS__INTERNAL__DECRYPT_PRIVATE_KEY` | rsaPrivateKey  | To Encrypt Dbcredentials Entered In Admin>Setup>Databases>Configure (No Passphrase) |
| `DB_CREDENTIALS__INTERNAL__PUBLIC_KEY`          | x509publicKey  | To Encrypt Database Credentials String                                              |
| `DICOM__HEALTH_CHECK_PASSWORD`                  | string         | deprecated                                                                          |
| `DOCKER_TAG_NAME`                               | string         | default tag                                                                         |
| `ENV_TYPE`                                      | string         | local or remote ; also refers to .env.${ENV_TYPE}                                   |
| `GH_TOKEN`                                      | string         | GitHub Token Passed To Trex                                                         |
| `LOGTO_API_M2M_CLIENT_ID`                       | password       | Logto Api M2m Client Id                                                             |
| `LOGTO_API_M2M_CLIENT_SECRET`                   | password       | Logto Api M2m Client Secret                                                         |
| `LOGTO__D2E_APP__CLIENT_ID`                     | string         | Logto Alp App Client Id                                                             |
| `LOGTO__D2E_APP__CLIENT_SECRET`                 | password       | Logto Alp App Client Secret                                                         |
| `LOGTO__D2E_DATA__CLIENT_ID`                    | string         | Logto Alp Data Client Id                                                            |
| `LOGTO__D2E_DATA__CLIENT_SECRET`                | password       | Logto Alp Data Client Secret                                                        |
| `LOGTO__D2E_SVC__CLIENT_ID`                     | string         | Logto Alp Svc Client Id                                                             |
| `LOGTO__D2E_SVC__CLIENT_SECRET`                 | password       | Logto Alp Svc Client Secret                                                         |
| `LOGTO__CLIENTID_PASSWORD__BASIC_AUTH`          | base64 encoded | From `LOGTO_API_M2M_CLIENT_ID` & `LOGTO_API_M2M_CLIENT_SECRET`                      |
| `LOGTO__SELF_BASE_URL`                          | string         | Base URL Logto's bundled connectors use to reach Logto's own API; must be a name the internal certificate covers |
| `MINIO__SECRET_KEY`                             | password       | Meilisearch Secret_Key                                                              |
| `OTEL_EXPORTER_OTLP_ENDPOINT`                   | url            | OTLP collector endpoint, e.g. `http://jaeger:4318`. Empty disables export.          |
| `OTEL_EXPORTER_OTLP_HEADERS`                    | string         | Optional OTLP exporter headers, e.g. `key=value,key2=value2`.                       |
| `OTEL_EXPORTER_OTLP_PROTOCOL`                   | string         | OTLP wire protocol, e.g. `grpc` or `http/protobuf`.                                 |
| `OTEL_SERVICE_NAME`                             | string         | Service name reported in emitted spans.                                             |
| `PG_ADMIN_PASSWORD`                             | password       | Admin Permissions                                                                   |
| `PG_SUPER_PASSWORD`                             | password       | All Permissions                                                                     |
| `PG_WRITE_PASSWORD`                             | password       | Write Permissions Only                                                              |
| `PG__LOGTO_MANAGER_PASSWORD`                    | string         |
| `REDIS_PASSWORD`                                | string         | Redis Password                                                                      |
| `TLS__CADDY_DIRECTIVE`                          | string         | Generate self-signed or public x509 certificate                                     |
| `TLS__EXTRA__CA_CRTS`                           | string         | Extra trust anchors for non-internal upstreams; concatenated PEM blocks with real newlines |
| `TLS__INTERNAL__DOMAIN`                         | string         | Internal DNS domain for service-to-service TLS; must match the certificate SAN (default `d2e.local`) |
| `TREX_OTEL_ENABLED`                             | bool           | Passes `--enable-otel` to trex; empty/unset keeps telemetry off (default).          |
| `USERMGMT__AUTO_PROVISION_ENABLED`              | bool           | Auto-create a usermgmt.user row on first federated OIDC login (default `false`).    |
| `USERMGMT__AUTO_PROVISION_CONNECTORS`           | csv            | Logto social-connector targets allowed to auto-provision (e.g. `physionet,oidc`).   |
| `USERMGMT__AUTO_PROVISION_DEFAULT_TENANT_ID`    | uuid           | Tenant for the default TENANT_VIEWER group; falls back to `APP__TENANT_ID`.         |
| `USERMGMT__AUTO_PROVISION_ROLE_HOOK_URL`        | url            | Optional. POSTs `{idpUserId,email,connectorId,accessToken}` and merges `{roles:[]}`.|
| `USERMGMT__AUTO_PROVISION_ROLE_HOOK_SECRET`     | password       | Optional bearer token sent to the role hook.                                        |
| `USERMGMT__AUTO_PROVISION_ROLE_HOOK_TIMEOUT_MS` | number         | Role hook abort timeout in ms (default `5000`).                                     |
| `USERMGMT__ENTITLEMENTS_SYNC_ENABLED`           | bool           | Reconcile STUDY_RESEARCHER groups against the upstream IdP's entitlements view on every login (default `false`). |
| `USERMGMT__ENTITLEMENTS_PHYSIONET_BASE_URL`     | url            | PhysioNet base URL the entitlements sync calls (e.g. `https://physionet.org`).      |
| `USERMGMT__ENTITLEMENTS_TIMEOUT_MS`             | number         | Entitlements fetch abort timeout in ms (default `10000`).                           |
| `USERMGMT__ENTITLEMENTS_TOKEN_CLAIM`            | string         | JWT claim name carrying the upstream access token (default `physionet_access_token`). |
| `USERMGMT__ENTITLEMENTS_DATASET_MAPPING`        | json           | Fallback map of `token_dataset_code` → PhysioNet `slug/version` used when the `portal.dataset` PhysioNet columns are absent, e.g. `{"mimic-iv":"mimiciv/2.2"}`. |
| `LOGTO__SOCIAL_SIGNIN_TARGETS`                  | csv            | Logto social-connector targets to enable on the sign-in screen. Defaults to the target of `LOGTO__CONNECTOR_CONFIG`. |
| `LOGTO__ENABLE_REGISTRATION`                    | bool           | Show the self-service Register button on the sign-in screen (`SignInAndRegister`). Default `false` so connectors like Entra keep a pure sign-in screen; set `true` for self-registration (e.g. PhysioNet). |

## Network federation (network-api)

The `network-api` function (`plugins/functions/network-api`) is inactive until these are set.

| key                          | type     | comment                                                                            |
| ----------------------------- | -------- | ----------------------------------------------------------------------------------- |
| `NETWORK_COGNITO_DOMAIN`      | url      | Cognito hosted-UI domain for the site's machine-to-machine client credentials flow. |
| `NETWORK_CENTRAL_API_URL`     | url      | Base URL of the central network API this site registers with and calls.            |
| `NETWORK_MACHINE_CLIENT_ID`   | string   | Per-site Cognito confidential client id used for the client-credentials grant.      |
| `NETWORK_CLIENT_SECRET`       | password | Per-site Cognito confidential client secret paired with `NETWORK_MACHINE_CLIENT_ID`. |
| `NETWORK_TOKEN_SCOPE`         | string   | Optional OAuth scope requested on the client-credentials token exchange.            |
| `NETWORK_ENC_KEY`             | password | Key used to encrypt stored network credentials at rest.                             |
