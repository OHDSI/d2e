type LoggingLevel = 'info' | 'warn' | 'error'

const _env = Deno.env.toObject();

export const env = {
  USER_MGMT_PATH: Deno.env.get("USER_MGMT__PATH")!,
  USER_MGMT_PORT: Number(Deno.env.get("USER_MGMT__PORT")!) || 9002,
  USER_MGMT_LOG_LEVEL: (Deno.env.get("USER_MGMT__LOG_LEVEL") as LoggingLevel) || 'info',
  USER_MGMT_IDP_SUBJECT_PROP: Deno.env.get("USER_MGMT__IDP_SUBJECT_PROP")!,
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
  ALP_SYSTEM_NAME: Deno.env.get("ALP__SYSTEM_NAME"),
  APP_TENANT_ID: Deno.env.get("APP__TENANT_ID"),
  IDP_BASE_URL: Deno.env.get("IDP__BASE_URL"),
  IDP_RELYING_PARTY: Deno.env.get("IDP__RELYING_PARTY"),
  IDP_AUTO_PROVISION_USERS:
    Deno.env.get("IDP__AUTO_PROVISION_USERS") === 'true' ||
    Deno.env.get("IDP__RELYING_PARTY") === 'azure',
  IDP_FETCH_USER_INFO_TYPE: Deno.env.get("IDP__FETCH_USER_INFO_TYPE"),
  IDP_ALP_ADMIN_CLIENT_ID: Deno.env.get("IDP__ALP_ADMIN__CLIENT_ID"),
  IDP_ALP_ADMIN_CLIENT_SECRET: Deno.env.get("IDP__ALP_ADMIN__CLIENT_SECRET"),
  IDP_ALP_ADMIN_RESOURCE: Deno.env.get("IDP__ALP_ADMIN__RESOURCE"),
  TREX_ADMIN_URL: Deno.env.get("TREX__ADMIN_URL"),
  // Account creation, as opposed to role assignment on TREX__ADMIN_URL.
  TREX_AUTH_URL: Deno.env.get("TREX__AUTH_URL"),
  // The identity provider identifies accounts by email; this turns a bare
  // username into one, and has to match what the sign-in page appends.
  IDP_USER_DOMAIN: Deno.env.get("IDP__INITIAL_USER__DOMAIN") ?? "d2e.local",
  TREX_SERVICE_ROLE_KEY: Deno.env.get("TREX__SERVICE_ROLE_KEY"),
  SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
  IDP_ROLE_STORE: Deno.env.get("IDP__ROLE_STORE"),
  SSL_PRIVATE_KEY: Deno.env.get("TLS__INTERNAL__KEY")?.replace(/\\n/g, '\n'),
  SSL_PUBLIC_CERT: Deno.env.get("TLS__INTERNAL__CRT")?.replace(/\\n/g, '\n'),
  SSL_CA_CERT: Deno.env.get("TLS__INTERNAL__CA_CRT")?.replace(/\\n/g, '\n'),
  SERVICE_ROUTES: Deno.env.get("SERVICE_ROUTES") || '{}',
  NODE_ENV: _env.NODE_ENV,
  PG_SSL: _env.PG__SSL,
  APP__TENANT_ID: _env.APP__TENANT_ID,
  IDP__INITIAL_USER__UUID: _env.IDP__INITIAL_USER__UUID,
  IDP__INITIAL_USER__NAME: _env.IDP__INITIAL_USER__NAME,
  AUTO_GRANT_RESEARCHER_BY_DATASET_CODES:
    _env.AUTO_GRANT_RESEARCHER_BY_DATASET_CODES || _env.AZ_AUTO_GRANT_RESEARCHER_BY_DATASET_CODES,
  USER_MGMT_ROLE_SOURCE: Deno.env.get("USER_MGMT__ROLE_SOURCE"),
  // The account the setup scripts run as. It has to administer tenants to grant
  // study roles, and unlike the initial user it does not exist when the seeds
  // run - it is created on its first sign-in - so the privilege is attached
  // where the row is created instead. Unset means no account is treated this
  // way, so a deployment has to name it deliberately.
  D2E_SETUP_USER: Deno.env.get("D2E__SETUP_USER"),
  USERMGMT_AUTO_PROVISION_ENABLED: Deno.env.get("USERMGMT__AUTO_PROVISION_ENABLED") === 'true',
  USERMGMT_AUTO_PROVISION_CONNECTORS: Deno.env.get("USERMGMT__AUTO_PROVISION_CONNECTORS") || '',
  USERMGMT_AUTO_PROVISION_DEFAULT_TENANT_ID: Deno.env.get("USERMGMT__AUTO_PROVISION_DEFAULT_TENANT_ID") || Deno.env.get("APP__TENANT_ID"),
  USERMGMT_AUTO_PROVISION_ROLE_HOOK_URL: Deno.env.get("USERMGMT__AUTO_PROVISION_ROLE_HOOK_URL") || '',
  USERMGMT_AUTO_PROVISION_ROLE_HOOK_SECRET: Deno.env.get("USERMGMT__AUTO_PROVISION_ROLE_HOOK_SECRET") || '',
  USERMGMT_AUTO_PROVISION_ROLE_HOOK_TIMEOUT_MS: Number(Deno.env.get("USERMGMT__AUTO_PROVISION_ROLE_HOOK_TIMEOUT_MS")) || 5000,
  USERMGMT_ENTITLEMENTS_SYNC_ENABLED: Deno.env.get("USERMGMT__ENTITLEMENTS_SYNC_ENABLED") === 'true',
  USERMGMT_ENTITLEMENTS_PHYSIONET_BASE_URL: Deno.env.get("USERMGMT__ENTITLEMENTS_PHYSIONET_BASE_URL") || '',
  USERMGMT_ENTITLEMENTS_TIMEOUT_MS: Number(Deno.env.get("USERMGMT__ENTITLEMENTS_TIMEOUT_MS")) || 10000,
  USERMGMT_ENTITLEMENTS_TOKEN_CLAIM: Deno.env.get("USERMGMT__ENTITLEMENTS_TOKEN_CLAIM") || 'physionet_access_token',
  USERMGMT_ENTITLEMENTS_REFRESH_TOKEN_CLAIM: Deno.env.get("USERMGMT__ENTITLEMENTS_REFRESH_TOKEN_CLAIM") || 'physionet_refresh_token',
  USERMGMT_ENTITLEMENTS_PHYSIONET_CLIENT_ID: Deno.env.get("USERMGMT__ENTITLEMENTS_PHYSIONET_CLIENT_ID") || '',
  USERMGMT_ENTITLEMENTS_PHYSIONET_CLIENT_SECRET: Deno.env.get("USERMGMT__ENTITLEMENTS_PHYSIONET_CLIENT_SECRET") || '',
  USERMGMT_ENTITLEMENTS_PHYSIONET_TOKEN_PATH: Deno.env.get("USERMGMT__ENTITLEMENTS_PHYSIONET_TOKEN_PATH") || '/oauth/token/',
  USERMGMT_ENTITLEMENTS_DATASET_MAPPING: Deno.env.get("USERMGMT__ENTITLEMENTS_DATASET_MAPPING") || '',
}

export const services = JSON.parse(env.SERVICE_ROUTES)

export const getAutoGrantDatasetCodes = (): string[] => {
  const raw = env.AUTO_GRANT_RESEARCHER_BY_DATASET_CODES
  if (!raw) return []
  return raw.split(',').map(c => c.trim()).filter(c => c)
}

export const getAutoProvisionConnectors = (): string[] => {
  if (!env.USERMGMT_AUTO_PROVISION_CONNECTORS) return []
  return env.USERMGMT_AUTO_PROVISION_CONNECTORS.split(',').map(c => c.trim()).filter(c => c)
}
