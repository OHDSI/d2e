# Where data characterization and DQD run

HANA datasets run against the **source database**, not the trex cache. The trex
pgwire passthrough cannot resolve HANA schemas, so a run routed through it fails
in `get_cdm_source` with:

```
Catalog Error: Table with name cdm_source does not exist!
```

Every other dialect keeps using trex unless the caller passes
`useSourceConnection: true` in the flow-run request body.

To send HANA back through trex once that passthrough is fixed, set the Prefect
variable `dc_direct_dialects_use_trex` to `true` -- it applies to both data
characterization and DQD and takes effect on the next run, with no redeploy. Any
other value, or an unset variable, leaves HANA on the direct connection. The
variable is deliberately not seeded from an environment variable, so a value set
in the Prefect UI survives restarts.

An explicit `useSourceConnection` in the request always wins over both the
default and the variable.


#### In order to create an input for the running flows that depend on user token, use the following script
```
# POST request to create input user token
curl --location --request POST 'https://localhost:41100/jobplugins/prefect/flow-run/:flow-run-id/input-auth-token' \
--header 'Authorization: Bearer <AUTH_TOKEN>'

# DELETE request to delete input user token
curl --location --request DELETE 'https://localhost:41100/jobplugins/prefect/flow-run/:flow-run-id/input-auth-token' \
--header 'Authorization: Bearer <AUTH_TOKEN>'
```