const _env = Deno.env.toObject();

export const env = {
  USER_MGMT_PATH: Deno.env.get("USER_MGMT__PATH")!,
  PG_HOST: Deno.env.get("PG__HOST")!,
  PG_PORT: Number(Deno.env.get("PG__PORT")!),
  PG_DB_NAME: Deno.env.get("PG__USER_MGMT__DB_NAME")!,
  PG_SCHEMA: Deno.env.get("PG__USER_MGMT__SCHEMA")!,
  PG_USER: Deno.env.get("PG__USER_MGMT__USER")!,
  PG_PASSWORD: Deno.env.get("PG__USER_MGMT__PASSWORD")!,
  PG_ADMIN_USER: Deno.env.get("PG__USER_MGMT__ADMIN_USER")!,
  PG_ADMIN_PASSWORD: Deno.env.get("PG__USER_MGMT__ADMIN_PASSWORD")!,
  PG_CA_ROOT_CERT: Deno.env.get("PG__CA_ROOT_CERT"),
  PG_MIN_POOL: Number(Deno.env.get("PG__MIN_POOL")),
  PG_MAX_POOL: Number(Deno.env.get("PG__MAX_POOL")) || 10,
  PG_DEBUG: Boolean(Number(Deno.env.get("PG_DEBUG"))) || false,
  PG__IDLE_TIMEOUT_IN_MS: Number(Deno.env.get("PG__IDLE_TIMEOUT_IN_MS")) || 30000,
  NODE_ENV: _env.NODE_ENV,
  PG_SSL: _env.PG__SSL,
  IDP__INITIAL_USER__UUID: _env.IDP__INITIAL_USER__UUID,
  IDP__INITIAL_USER__NAME: _env.IDP__INITIAL_USER__NAME,
  // The IdP identifies accounts by email; usermgmt by username. This is the
  // domain that turns one into the other, and it has to match what the sign-in
  // page appends to a bare username.
  IDP__INITIAL_USER__DOMAIN: _env.IDP__INITIAL_USER__DOMAIN ?? "d2e.local",
  D2E__SEED_USER: _env.D2E__SEED_USER,
  TREX_AUTH_URL: _env.TREX__AUTH_URL,
  TREX_SERVICE_ROLE_KEY: _env.TREX__SERVICE_ROLE_KEY || _env.SUPABASE_SERVICE_ROLE_KEY,
  ALP_SYSTEM_NAME: Deno.env.get("ALP__SYSTEM_NAME"),
  APP__TENANT_ID: _env.APP__TENANT_ID,
}
