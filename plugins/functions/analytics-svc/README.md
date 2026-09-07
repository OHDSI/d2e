# Audit logs

Patient-access and CDM SQL audit events use the same top-level JSON envelope.
Each event is serialized as one JSON line, including SQL containing newlines.
The existing event details (`eventType`, `actor`, `occurredAt`, patient attributes,
SQL, request/database metadata, success status, and errors) are retained.

| Field | Patient access | CDM SQL |
| --- | --- | --- |
| `timestamp` | UTC ISO timestamp, equal to `occurredAt` | Same |
| `log-type` | `audit` | `audit` |
| `audit-log-type` | `access` | `access`, including failed executions |
| `trace-id` | `x-req-correlation-id`, or a generated UUID shared by events for the request | Same |
| `service-name` | `analytics-svc` | Same |
| `service-version` | Version from the deployed functions `package.json` | Same |
| `req-url` | Original request path, excluding query and fragment | Same |
| `client-id` | JWT `client_id`, falling back to `azp`, then `appid` | Same |
| `subject-id` | Existing audit actor ID | Same |
| `event-type` | `read` | `execute` (the DB method remains in `operation`) |
| `resource-type` | `patient` | `dataset` |
| `resource-id` | Patient ID | Dataset ID |

Unavailable request URLs, client IDs, and resource IDs are emitted as JSON `null`.
`subject-id` preserves the existing actor resolution, which may use an OIDC `oid`
or a third-party identity instead of the outer JWT `sub`.

The enablement flags and output destinations are unchanged:

- `IS_AUDIT_LOG_ENABLED=true` enables patient-access events.
- `IS_CDM_SQL_AUDIT_LOG_ENABLED=true` enables CDM SQL events independently.
- `AUDIT_LOG_TO_CONSOLE=true` selects JSON lines on stdout for log collection.
- Otherwise, events are appended to `/var/log/d2e/audit/patient-access.ndjson`
  and `/var/log/d2e/audit/cdm-sql-access.ndjson` respectively.

Run the focused regression tests from `plugins/functions/analytics-svc`:

```sh
deno test --no-check --allow-env --allow-read --allow-write \
  src/utils/AuditEventWriter_test.ts src/utils/AuditLogger_test.ts \
  src/utils/CdmSqlAuditLogger_test.ts src/utils/AuditLogFormat_test.ts
```

Or run from the repository root in an isolated container. A temporary copy of the
lockfile allows Deno to prune stale entries without modifying the checkout:

```sh
docker run --rm --entrypoint sh \
  -v "$PWD:/workspace" -v d2e-audit-deno-cache:/deno-dir \
  -w /workspace/plugins/functions/analytics-svc \
  ghcr.io/ohdsi/d2e-trex:develop-devx -c '
    cp deno.lock /tmp/audit-deno.lock &&
    deno test --lock=/tmp/audit-deno.lock --frozen=false --no-check \
      --allow-env --allow-read --allow-write \
      src/utils/AuditEventWriter_test.ts src/utils/AuditLogger_test.ts \
      src/utils/CdmSqlAuditLogger_test.ts src/utils/AuditLogFormat_test.ts
  '
```

# Prepare the test schema

For easiness use the Az HANA instance, which doesn't have the SSL enabled.

- Login to Az HANA using DBeaver

- Run the script at `services/analytics-svc/spec/ddl-scripts/hana/mri-hana-dll.sql` to create an empty test schema

# Run analytics-svc integration tests locally

- Start `query-gen-svc` by running the following command
```
isTestEnv=true \
TESTSCHEMA=<test_schema_name> \
yarn workspace query-gen run start
```
- Start the `analytics-svc` integration tests using the following comand with the Az HANA DB credentials:
```
HANASERVER=<HANA_AZURE_HOST> \
HDIUSER=<HANA_AZURE_SYSTEM_USER> \
HDIPORT=<HANA_AZURE_PORT> \
HDIPW=<HANA_AZURE_SYSTEM_PASSWORD> \
TESTSYSTEMPW=<HANA_AZURE_SYSTEM_PASSWORD> \
TESTPORT=<HANA_AZURE_PORT> \
TESTSCHEMA=<TEST_SCHEMA_NAME> \
isTestEnv="true" \
yarn workspace analytics run testci
```

# Run MRI HTTP tests locally

1. initialize test database

```
TESTSCHEMA=HTTPTESTSCHEMA HDIPORT=39041 HDIUSER=SYSTEM HANASERVER=<HANA_SERVER> HDIPW=<PWD> yarn inittestdb
```

2. Update `tests/backend_integration_tests/specs/environment.json` with the following values
```
"host": "https://localhost",
"appport" : "41000",
"sysappport" : "41000",
"dbhost": "<HANA_AZURE_HOST>",
"dbport": "<HANA_AZURE_PORT>",
"instance_no": 0,
"system_user": "<HANA_AZURE_SYSTEM_USER>",
"system_password": "<HANA_AZURE_SYSTEM_PASSWORD>",
"chp_admin_user": "<HANA_AZURE_SYSTEM_USER>",
"chp_admin_password": "<HANA_AZURE_SYSTEM_PASSWORD>",
"mri_admin_user": "<HANA_AZURE_SYSTEM_USER>",
"mri_admin_password": "<HANA_AZURE_SYSTEM_PASSWORD>",
"test_user": "<HANA_AZURE_SYSTEM_USER>",
"test_password": "<HANA_AZURE_SYSTEM_PASSWORD>",
"chp_technical_user": "<HANA_AZURE_SYSTEM_USER>",
"standard_schema_name": "HTTPTESTSCHEMA",
"test_schema_name": "HTTPTESTSCHEMA",
```
3. Configure environment variables

- Navigate to the `.env` files in `services` and `alp-data-node`
- uncomment the variables under `Enable for local http tests`

```
isTestEnv=true
isHttpTestRun=true
```

4. Start ALP 
```
yarn start
``` 
```
yarn start:mercury
```
  
5. Navigate to `tests/backend_integration_tests` folder and start the http tests:
```
yarn test-specs
```

## Additonal notes
1. switching database `schemas`

- update schema names in `tests/backend_integration_tests/specs/environment.json`
- update schema names in `VCAP_SERVICES` in services and alp-data-node (tagged under `httptest`)

# Change log levels during runtime
```
kubectl set env RESOURCE/NAME KEY1=VAL_1..

for example:
kubectl set env deployment/alp-data LOGLEVEL=info
```
for reference: https://kubernetes.io/docs/reference/generated/kubectl/kubectl-commands#-em-env-em-
=======
