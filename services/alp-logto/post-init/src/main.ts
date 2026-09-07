import * as logto from "./middleware/logto";
import * as pg from "pg";

async function create(
  path: string,
  headers: object,
  data: object,
  hasResponseBody = true,
) {
  try {
    console.log(`Request creation ${path}`);
    console.log(`${JSON.stringify(data)}`);
    const resp = await logto.post(path, headers, data);
    console.log(`Responded with ${resp.status}`);

    if (resp.ok) {
      if (hasResponseBody) {
        let json = await resp.json();
        return json;
      }
    } else {
      console.error("Request failed");
      console.error(resp.statusText, " ", path);
      return -1;
    }
  } catch (error) {
    throw error;
  }
}

async function update(
  path: string,
  headers: object,
  data: object,
  hasResponseBody = true,
) {
  try {
    console.log(`Request update ${path}`);
    const resp = await logto.patch(path, headers, data);
    console.log(`Responded with ${resp.status}`);

    if (resp.ok) {
      if (hasResponseBody) {
        let json = await resp.json();
        return json;
      }
    } else {
      console.error("Request failed");
      console.error(resp.statusText, " ", path);
      return -1;
    }
  } catch (error) {
    throw error;
  }
}

async function upsert(
  path: string,
  headers: object,
  data: object,
  hasResponseBody = true,
) {
  try {
    console.log(`Request create/update ${path}`);
    const resp = await logto.put(path, headers, data);
    console.log(`Responded with ${resp.status}`);

    if (resp.ok) {
      if (hasResponseBody) {
        let json = await resp.json();
        return json;
      }
    } else {
      console.error("Request failed");
      console.error(resp.statusText, " ", path);
      return -1;
    }
  } catch (error) {
    throw error;
  }
}

async function fetchExisting(path: string, headers: object, showLog = true) {
  try {
    showLog && console.log(`Request existing ${path}`);
    const resp = await logto.get(path, headers);
    showLog && console.log(`Responded with ${resp.status}`);

    if (resp.ok) {
      let json = await resp.json();
      showLog && console.log(JSON.stringify(json));
      return json;
    } else {
      console.error("Request failed");
      console.error(resp.statusText, " ", path);
      return -1;
    }
  } catch (error) {
    throw error;
  }
}

async function queryPostgres(
  client: pg.Client,
  query: string,
  values: Array<string | number>,
) {
  return await client.query(query, values);
}

// Ensure Logto signs OIDC tokens with RS256: WebAPI's Spring OIDC decoder rejects
// Logto's default ES384 ("Another algorithm expected"). Rotate to an RSA key and
// drop non-RSA keys so only RS256 tokens are issued. Idempotent.
async function ensureRsaSigningKey(headers: any) {
  console.log(
    "*********************************** OIDC SIGNING KEY ******************************************",
  );
  const resp = await logto.get("configs/oidc/private-keys", headers);
  if (!resp.ok) {
    console.warn(
      `Could not read OIDC private-keys (status ${resp.status}); skipping RSA rotation`,
    );
    return;
  }
  const keys: Array<{ id: string; signingKeyAlgorithm: string }> =
    await resp.json();

  // The active signing key is the newest (first) entry.
  if (keys[0]?.signingKeyAlgorithm !== "RSA") {
    console.log("Rotating OIDC signing key to RSA (RS256) for WebAPI compatibility");
    const rot = await logto.post("configs/oidc/private-keys/rotate", headers, {
      signingKeyAlgorithm: "RSA",
    });
    console.log(`Rotate OIDC signing key -> RSA: status ${rot.status}`);
  } else {
    console.log("OIDC signing key already RSA; no rotation needed");
  }

  // Drop any non-RSA (e.g. EC/ES384) keys so only RS256 tokens are ever issued.
  const afterResp = await logto.get("configs/oidc/private-keys", headers);
  if (!afterResp.ok) {
    console.warn(
      `Could not re-read OIDC private-keys (status ${afterResp.status}); skipping non-RSA cleanup`,
    );
    return;
  }
  const after = await afterResp.json();
  for (const key of after as Array<{ id: string; signingKeyAlgorithm: string }>) {
    if (key.signingKeyAlgorithm !== "RSA") {
      const d = await logto.del(`configs/oidc/private-keys/${key.id}`, headers);
      console.log(`Removed non-RSA OIDC key ${key.id}: status ${d.status}`);
    }
  }
}

// Register the Atlas login bridge's redirect URI (/atlas-login/) on the Logto app
// so direct /atlas login works. Origin derived from the existing portal callback
// URI to stay environment-agnostic. Idempotent.
async function ensureAtlasLoginRedirectUri(headers: any, appId: string) {
  const resp = await logto.get(`applications/${appId}`, headers);
  if (!resp.ok) {
    console.warn(`Could not read application ${appId} (status ${resp.status}); skipping Atlas login redirect URI`);
    return;
  }
  const app = await resp.json();
  const meta = app.oidcClientMetadata || {};
  const uris: string[] = meta.redirectUris || [];

  // Derive origin from a known portal callback entry.
  const portalCb = uris.find((u) => u.includes("/d2e/portal/login-callback"));
  if (!portalCb) {
    console.warn("No portal login-callback redirect URI found; skipping Atlas login redirect URI");
    return;
  }
  const origin = new URL(portalCb).origin;
  const bridgeUri = `${origin}/atlas-login/`;

  if (uris.includes(bridgeUri)) {
    console.log(`Atlas login redirect URI already registered: ${bridgeUri}`);
    return;
  }
  meta.redirectUris = uris.concat(bridgeUri);
  const patch = await logto.patch(`applications/${appId}`, headers, {
    oidcClientMetadata: meta,
  });
  console.log(`Registered Atlas login redirect URI ${bridgeUri}: status ${patch.status}`);
}

async function main() {
  let apps: Array<{ name: string; id: string }> =
    JSON.parse(process.env.LOGTO__CLIENT_APPS) || [];

  let resource: { name: string } = JSON.parse(process.env.LOGTO__RESOURCE) || {
    name: "alp-default",
    indicator: "https://alp-default",
    accessTokenTtl: 3600,
  };

  let user: { username: string; initialPassword: string } = JSON.parse(
    process.env.LOGTO__USER,
  );

  let scopes: Array<{ name: string }> =
    JSON.parse(process.env.LOGTO__SCOPES) || [];

  let roles: Array<{ name: string }> =
    JSON.parse(process.env.LOGTO__ROLES) || [];

  let jwt = await logto.fetchToken();
  let accessToken: string = jwt.access_token;
  const headers = {
    Authorization: `Bearer ${accessToken}`,
  };

  // Make sure WebAPI (RS256) can verify Logto tokens before anything else.
  await ensureRsaSigningKey(headers);

  // Re-fetch a token signed by the new RSA key.
  jwt = await logto.fetchToken();
  accessToken = jwt.access_token;
  headers.Authorization = `Bearer ${accessToken}`;

  // Allow the standalone Atlas login bridge's redirect URI on the OIDC app(s).
  for (const app of apps) {
    await ensureAtlasLoginRedirectUri(headers, app.id);
  }

  // Create Apps
  console.log(
    "*********************************** APPLICATIONS **********************************************",
  );

  const fetchExistingApps: Array<Object> = await fetchExisting(
    "applications",
    headers,
  );
  const APP_ENVS: string[] = [];
  for (const app of apps) {
    const appExists = fetchExistingApps.find(
      (existingApp: any) => existingApp.name === app.name,
    );

    if (appExists) {
      await update(`applications/${app.id}`, headers, app); //Update other attributes such as oidcClientMetadata and custom_client_metadata
    }
  }

  // Create Resource
  console.log(
    "*********************************** RESOURCE **********************************************",
  );
  const fetchExistingResources: Array<{ name: string }> = await fetchExisting(
    "resources",
    headers,
  );
  const resourceExists = fetchExistingResources.find(
    (existingRes: any) => existingRes.name === resource.name,
  );
  let { id: resourceId, isDefault } =
    resourceExists || (await create("resources", headers, resource));

  if (resourceExists) {
    const updated = await update(`resources/${resourceId}`, headers, resource);
    isDefault = updated.isDefault;
  }

  if (!isDefault) {
    // Set the resource as the default
    await logto.patch(`resources/${resourceId}/is-default`, headers, {
      isDefault: true,
    });
  }

  console.log(
    "*********************************************************************************\n",
  );

  // Create Users
  console.log(
    "*********************************** USERS **********************************************",
  );
  const fetchExistingUsers: Array<{ username: string }> = await fetchExisting(
    "users",
    headers,
  );
  // The Logto management API doesn't return `tenant_id` in the user listing,
  // so guarding on it here would always falsy-fail and we would attempt to
  // recreate the user on every restart, fail, and silently skip USER-ROLES.
  const userExists = fetchExistingUsers.find(
    (existingUser: any) => existingUser.username === user.username,
  );
  let logtoAdminUser = userExists || (await create("users", headers, user));

  if (userExists) {
    await update(`users/${logtoAdminUser.id}`, headers, user);
  }

  if (!logtoAdminUser["lastSignInAt"])
    await logto.patch(`users/${logtoAdminUser.id}/password`, headers, {
      password: user["initialPassword"],
    });

  console.log(
    "*********************************************************************************\n",
  );

  // Create Scopes
  console.log(
    "*********************************** SCOPES **********************************************",
  );
  const fetchExistingResourceScopes: Array<Object> = await fetchExisting(
    `resources/${resourceId}/scopes?page_size=100`,
    headers,
  );
  let logtoScopes: Array<LogtoScope> = [];
  for (const s of scopes) {
    const resourceScopeExists = fetchExistingResourceScopes.find(
      (existingResourceScope: any) => existingResourceScope.name === s.name,
    );
    let logtoScope =
      resourceScopeExists ||
      (await create(`resources/${resourceId}/scopes`, headers, s));

    if (resourceScopeExists) {
      await update(
        `resources/${resourceId}/scopes/${logtoScope.id}`,
        headers,
        s,
      );
    }

    logtoScopes.push(logtoScope);
  }
  console.log(
    "*********************************************************************************\n",
  );

  // Create Roles
  console.log(
    "*********************************** ROLES **********************************************",
  );
  const fetchExistingRoles: Array<Object> = await fetchExisting(
    "roles?page_size=100",
    headers,
  );
  let logtoRoles: Array<LogtoScope> = [];
  for (const r of roles) {
    const roleExists = fetchExistingRoles.find(
      (existingRole: any) => existingRole.name === r.name,
    );
    let logtoRole = roleExists || (await create("roles", headers, r));

    if (roleExists) {
      await update(`roles/${logtoRole.id}`, headers, r);
    }

    logtoRoles.push(logtoRole);
  }
  console.log(
    "*********************************************************************************\n",
  );

  // Create Roles-scopes
  console.log(
    "*********************************** ROLES-SCOPES **********************************************",
  );
  let roleScopes: Array<{
    roleId: string;
    scopeId: string;
    scopeName: string;
  }> = [];

  if (process.env.LOGTO__ROLES_SCOPES) {
    const mapping: Array<{ roleName: string; scopeNames: string[] }> =
      JSON.parse(process.env.LOGTO__ROLES_SCOPES);
    for (const m of mapping) {
      const role = logtoRoles.find((r: any) => r.name === m.roleName);
      if (!role) {
        console.warn(
          `LOGTO__ROLES_SCOPES: role "${m.roleName}" not found, skipping`,
        );
        continue;
      }
      for (const scopeName of m.scopeNames) {
        const scope = logtoScopes.find((s: any) => s.name === scopeName);
        if (!scope) {
          console.warn(
            `LOGTO__ROLES_SCOPES: scope "${scopeName}" not found for role "${m.roleName}", skipping`,
          );
          continue;
        }
        roleScopes.push({
          roleId: (role as any).id,
          scopeId: (scope as any).id,
          scopeName: (scope as any).name,
        });
      }
    }
  } else {
    roleScopes = logtoRoles.map((r, indx) => ({
      roleId: r.id,
      scopeId: logtoScopes[indx]["id"],
      scopeName: logtoScopes[indx]["name"],
    }));
  }

  for (const rs of roleScopes) {
    const fetchExistingRoleScopes: Array<Object> = await fetchExisting(
      `roles/${rs.roleId}/scopes`,
      headers,
    );
    const scopeExists = fetchExistingRoleScopes.find(
      (existingScope: any) => existingScope.name === rs.scopeName,
    );

    scopeExists ||
      (await create(`roles/${rs.roleId}/scopes`, headers, {
        scopeIds: [rs.scopeId],
      }));
  }
  console.log(
    "*********************************************************************************\n",
  );

  let userRoles: Array<{ userId: string; roleIds: Array<string> }> = [];
  if (logtoAdminUser && logtoAdminUser["id"]) {
    // Create User-roles
    console.log(
      "*********************************** USER-ROLES **********************************************",
    );
    userRoles = [
      {
        userId: logtoAdminUser["id"],
        roleIds: logtoRoles.map((r) => r["id"]),
      },
    ];
    for (const ur of userRoles) {
      const fetchExistingUserRoles: Array<Object> = await fetchExisting(
        `users/${ur.userId}/roles`,
        headers,
      );

      const missingRoleIDs = [];

      for (const roleId of ur.roleIds) {
        const userRoleExist = fetchExistingUserRoles.find(
          (existingRole: any) => existingRole.id === roleId,
        );
        if (!userRoleExist) missingRoleIDs.push(roleId);
      }

      missingRoleIDs.length &&
        (await create(
          `users/${ur.userId}/roles`,
          headers,
          {
            roleIds: missingRoleIDs,
          },
          false,
        ));
    }
    console.log(
      "*********************************************************************************\n",
    );
  }

  // Create Sign-in Experiences
  console.log(
    "*********************************** SIGN-IN EXPERIENCES **********************************************",
  );
  let signinExperience = {
    tenantId: "default",
    id: "default",
    branding: {
      favicon: `https://${process.env.CADDY__D2E__PUBLIC_FQDN}/d2e/portal/assets/favicon.ico`,
      logoUrl: `https://${process.env.CADDY__D2E__PUBLIC_FQDN}/d2e/portal/assets/d2e-data2evidence.png`,
    },
    color: {
      primaryColor: "#000080",
      isDarkModeEnabled: false,
      darkPrimaryColor: "#0000B3",
    },
    customCss:
      process.env.LOGTO__CUSTOM_CSS ||
      `[data-logto-signature="secured"][data-logto-signature="secured"] { display: none !important; }
img[alt="app logo"] { height: 40px; margin-bottom: 20px; }
button[name="submit"]{ background: #000080 !important; }`,
    // Registration is opt-in via LOGTO__ENABLE_REGISTRATION so that connectors
    // which don't want a self-service Register button (e.g. Entra / Entra
    // External ID) keep a pure sign-in screen even when LOGTO__CONNECTOR_CONFIG
    // is set. PhysioNet-style self-registration deployments set it to "true".
    signInMode: process.env.LOGTO__ENABLE_REGISTRATION === "true" ? "SignInAndRegister" : "SignIn",
    unknownSessionRedirectUrl: `https://${process.env.CADDY__D2E__PUBLIC_FQDN}/d2e/portal`,
    termsOfUseUrl: process.env.LOGTO__TERM_OF_USE_URL || "",
    privacyPolicyUrl: process.env.LOGTO__PRIVACY_POLICY_URL || "",
    // Issue #2713 / Option B: Logto is the single server-side enforcement
    // point for password rules across all flows (add user, admin change,
    // self-service change).
    // D2: characterTypes.min counts categories (lower/upper/digit/symbol);
    // min 3 is the closest server-side approximation of the UI checklist's
    // "letter + number + special char" rule.
    // D6: rejects are all off so the backend never rejects a password the
    // UI checklist has approved.
    passwordPolicy: {
      length: { min: 8, max: 256 }, // D1
      characterTypes: { min: 3 },
      rejects: {
        pwned: false,
        repetitionAndSequence: false,
        userInfo: false,
        words: [] as string[],
      },
    },
  };

  await update("sign-in-exp", headers, signinExperience);
  console.log(
    "*********************************************************************************\n",
  );

  if (process.env.LOGTO__CUSTOM_JWT) {
    // Create custom JWT
    console.log(
      "*********************************** CONFIGS **********************************************",
    );

    const payload = JSON.parse(process.env.LOGTO__CUSTOM_JWT);

    // Inject scope-rewrite rules (e.g. `source-user-<id>` → `Source user (<id>)`) into the customizer
    if (process.env.LOGTO__JWT_SCOPE_REWRITES) {
      const parsed = JSON.parse(process.env.LOGTO__JWT_SCOPE_REWRITES);
      if (!Array.isArray(parsed)) {
        throw new Error("LOGTO__JWT_SCOPE_REWRITES must be a JSON array");
      }
      payload.environmentVariables = payload.environmentVariables || {};
      payload.environmentVariables.scopeRewrites = JSON.stringify(parsed);
    }

    // The access token must carry the human username/name claims so that
    // downstream consumers (OHDSI WebAPI, Atlas3) display the real login instead
    // of the opaque Logto `sub` (e.g. "zqxtfkfcpma4"). The access-token JWT
    // customizer runs with a `context.user` object that exposes `username`,
    // `name` and `primaryEmail` (see contextSample), and the canonical script in
    // docker-compose.yml returns `username`, `name`, `preferred_username` and
    // `email`. Warn loudly if the supplied script omits the username claim so a
    // misconfigured LOGTO__CUSTOM_JWT does not silently regress Atlas3 back to
    // showing the `sub`.
    if (
      typeof payload.script === "string" &&
      !payload.script.includes("username")
    ) {
      console.warn(
        "WARNING: LOGTO__CUSTOM_JWT script does not emit a `username` claim. " +
          "Atlas3 / OHDSI WebAPI will fall back to displaying the opaque Logto `sub`. " +
          "Add `username: context.user?.username` (and optionally `name`/`preferred_username`) " +
          "to the customizer's returned claims.",
      );
    }

    console.log("payload", payload);
    await upsert("configs/jwt-customizer/access-token", headers, payload);

    console.log(
      "*********************************************************************************\n",
    );
  }

  if (process.env.LOGTO__CONNECTOR_CONFIG) {
    console.log(
      "*********************************** SOCIAL CONNECTOR **********************************************",
    );
    const parsedConnectorConfig = JSON.parse(
      process.env.LOGTO__CONNECTOR_CONFIG,
    );
    const connectorEnvConfigs: any[] = Array.isArray(parsedConnectorConfig)
      ? parsedConnectorConfig
      : [parsedConnectorConfig];
    const socialSignInConnectorTargets: string[] = [];

    for (const connectorEnvConfig of connectorEnvConfigs) {
      const connectorTargetId = connectorEnvConfig.metadata?.target || connectorEnvConfig.connectorId;
      socialSignInConnectorTargets.push(connectorTargetId);

      //Verify if existing connector exist
      const connectorDBConfig: any = await fetchExisting(
        `connectors/${connectorEnvConfig.id}`,
        headers,
      );
      // console.log(`connectorDBConfig ${Object.keys(connectorDBConfig).length}`)
      if (connectorDBConfig && Object.keys(connectorDBConfig).length > 0) {
        //update
        const connectorCallbackId = connectorEnvConfig.id;
        delete connectorEnvConfig.id;
        delete connectorEnvConfig.connectorId;
        await logto.patch(
          `connectors/${connectorCallbackId}`,
          headers,
          connectorEnvConfig,
        );
        console.log(`Social connector ${connectorTargetId} updated..`);
      } else {
        // create
        await logto.post("connectors", headers, connectorEnvConfig);
        console.log(`Social connector ${connectorTargetId} created..`);
      }
    }

    // Update Sign-in Experiences
    console.log(
      "*********************************** SIGN-IN EXPERIENCES **********************************************",
    );
    // Prefer explicit env var (LOGTO__SOCIAL_SIGNIN_TARGETS, CSV) over
    // the targets collected from connectorId/metadata above.
    const envTargets = (process.env.LOGTO__SOCIAL_SIGNIN_TARGETS || "")
      .split(",").map(s => s.trim()).filter(Boolean)
    if (envTargets.length > 0) {
      socialSignInConnectorTargets.length = 0
      socialSignInConnectorTargets.push(...envTargets)
    }

    const signinExperienceSocialConnector: {
      branding: Object;
      color: Object;
      customCss: string;
      tenantId: string;
      id: string;
      signInMode: string;
      socialSignIn: Object;
      signUp: Object;
      signIn: Object;
      socialSignInConnectorTargets: string[];
    } = {
      ...signinExperience,
      signInMode: process.env.LOGTO__ENABLE_REGISTRATION === "true" ? "SignInAndRegister" : "SignIn",
      socialSignIn: { automaticAccountLinking: true },
      signUp: { verify: false, password: false, identifiers: [] },
      signIn: {
        methods: [
          {
            password: true,
            identifier: "username",
            verificationCode: false,
            isPasswordPrimary: true,
          },
        ],
      },
      socialSignInConnectorTargets,
    };

    if (process.env.LOGTO__DISABLE_BASIC_AUTH === "true") {
      signinExperienceSocialConnector["signIn"] = { methods: [] };
      signinExperienceSocialConnector["signUp"] = {
        verify: false,
        password: false,
        identifiers: [],
      };
    }

    await update("sign-in-exp", headers, signinExperienceSocialConnector);
    // console.log(`signinExperienceSocialConnector ${JSON.stringify(signinExperienceSocialConnector)}`)
    console.log(
      "*********************************************************************************\n",
    );
    console.log(
      "*********************************************************************************\n",
    );
  }

  console.log(
    "*********************************** SUMMARY **********************************\n",
  );

  const createdApps: Array<Object> = (
    await fetchExisting("applications", headers, false)
  ).filter((a: any) => apps.map((x) => x.name).includes(a.name));

  console.log(
    `Applications created: ${
      createdApps.length
    } \n Applications creation successful: ${createdApps.length == apps.length}`,
  );

  const createdResources: Array<Object> = (
    await fetchExisting("resources", headers, false)
  ).filter((a: any) => resource.name === a.name);

  console.log(
    `Resources created: ${
      createdResources.length
    } \n Resources creation successful: ${createdResources.length == 1}`,
  );

  const createdUsers: Array<Object> = (
    await fetchExisting("users", headers, false)
  ).filter((a: any) => user.username === a.username);

  console.log(
    `Users created: ${createdUsers.length} \n Users creation successful: ${
      createdUsers.length == 1
    }`,
  );

  const createdScopes: Array<Object> = (
    await fetchExisting(`resources/${resourceId}/scopes`, headers, false)
  ).filter((s: any) => scopes.map((x) => x.name).includes(s.name));

  console.log(
    `Scopes created: ${createdScopes.length} \n Scopes creation successful: ${
      createdScopes.length == scopes.length
    }`,
  );

  const createdRoles: Array<Object> = (
    await fetchExisting("roles", headers, false)
  ).filter((r: any) => roles.map((x) => x.name).includes(r.name));

  console.log(
    `Roles created: ${createdRoles.length} \n Roles creation successful: ${
      createdRoles.length == roles.length
    }`,
  );

  const createdRoleScopes: Array<Object> = (
    await Promise.all(
      roleScopes.map((rs) =>
        fetchExisting(`roles/${rs.roleId}/scopes`, headers, false),
      ),
    )
  ).filter((rs: any) => roleScopes.map((x) => x.scopeName === rs.name));

  console.log(
    `Roles-Scopes created: ${
      createdRoleScopes.length
    } \n Role-Scopes creation successful: ${
      createdRoleScopes.length == roleScopes.length
    }`,
  );

  const createdUserRoles: Array<Object> = (
    await Promise.all(
      userRoles.map((ur) =>
        fetchExisting(`users/${ur.userId}/roles`, headers, false),
      ),
    )
  )
    .filter((rs: any) => userRoles.map((x) => x.roleIds === rs.id))
    .flat();

  console.log(
    `Users-Roles created: ${
      createdUserRoles.length
    } \n User-Roles creation successful: ${
      createdUserRoles.length == userRoles.map((x) => x.roleIds).flat().length
    }`,
  );
}

async function getDBClient() {
  const client = new pg.Client({
    user: process.env.PG__USER,
    password: process.env.PG__PASSWORD,
    host: process.env.PG__HOST,
    port: parseInt(process.env.PG__PORT),
    database: process.env.PG__DB_NAME,
    ssl: (() => {
      let ssl: any = JSON.parse(process.env.PG__SSL.toLowerCase());
      if (process.env.PG__CA_ROOT_CERT) {
        return {
          rejectUnauthorized: true,
          ca: process.env.PG__CA_ROOT_CERT,
        };
      }
      return ssl;
    })(),
    options: `--search_path=${process.env.PG__SCHEMA}`,
  });
  await client.connect();
  return client;
}

async function seeding_alp_admin() {
  let logtoAdminApp = JSON.parse(process.env.LOGTO__ALP_ADMIN_APP) || {
    application: {},
    role: {},
  };
  let alpAdminApp: {
    id: string;
    name: string;
    description: string;
    secret: string;
  } = logtoAdminApp.application;
  let alpAdminRole = logtoAdminApp.role;

  const client = await getDBClient();

  const pg_schema = process.env.PG__SCHEMA;
  let LOGTO__ADMIN_ROLE__ID = "jrmtgmb34iznwqdu5dhl1";
  let LOGTO__ADMIN_APP__ID = alpAdminApp.id;
  let LOGTO__ADMIN_APP_ROLE__ID = "34vzakbak1tp830d0s30o";
  let LOGTO__ADMIN_ROLE_SCOPE__ID = "da9va7i1g6ojghbph104e";
  let LOGTO__TENANT_ID = "default";

  console.log(
    "*********************************************************************************",
  );
  console.log(
    `Inserting ${alpAdminApp.name} application to applications table`,
  );
  await queryPostgres(
    client,
    `INSERT INTO ${pg_schema}.applications(tenant_id, id, name, secret, description, type, oidc_client_metadata) \
    VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT(id) \
    DO UPDATE SET secret = EXCLUDED.secret, oidc_client_metadata = EXCLUDED.oidc_client_metadata, custom_client_metadata = EXCLUDED.custom_client_metadata`,
    [
      LOGTO__TENANT_ID,
      LOGTO__ADMIN_APP__ID,
      `${alpAdminApp.name}`,
      `${alpAdminApp.secret}`,
      `${alpAdminApp.description}`,
      "MachineToMachine",
      '{  "redirectUris": [],  "postLogoutRedirectUris": [] }',
    ],
  );

  console.log(
    "*********************************************************************************\n",
  );
  console.log(`Inserting ${alpAdminRole.name} role to roles table`);
  await queryPostgres(
    client,
    `INSERT INTO ${pg_schema}.roles(tenant_id, id, name, description, type) 
    VALUES ($1, $2, $3, $4, $5) ON CONFLICT(id) 
    DO NOTHING;`,
    [
      LOGTO__TENANT_ID,
      LOGTO__ADMIN_ROLE__ID,
      `${alpAdminRole.name}`,
      `${alpAdminRole.description}`,
      "MachineToMachine",
    ],
  );

  console.log(
    "*********************************************************************************",
  );
  console.log(
    `Adding role ${alpAdminRole.name} to application ${alpAdminApp.name}`,
  );
  await queryPostgres(
    client,
    `INSERT INTO ${pg_schema}.applications_roles(tenant_id, id, application_id, role_id) 
    VALUES ($1, $2, $3, $4) ON CONFLICT(id) 
    DO NOTHING;`,
    [
      LOGTO__TENANT_ID,
      LOGTO__ADMIN_APP_ROLE__ID,
      LOGTO__ADMIN_APP__ID,
      LOGTO__ADMIN_ROLE__ID,
    ],
  );

  console.log(
    "*********************************************************************************\n",
  );
  console.log(`Adding scope "management-api-all" to role ${alpAdminRole.name}`);
  await queryPostgres(
    client,
    `INSERT INTO ${pg_schema}.roles_scopes(tenant_id, id, role_id, scope_id) 
    VALUES ($1, $2, $3, $4) ON CONFLICT(id) 
    DO NOTHING;`,
    [
      LOGTO__TENANT_ID,
      LOGTO__ADMIN_ROLE_SCOPE__ID,
      LOGTO__ADMIN_ROLE__ID,
      "management-api-all",
    ],
  );

  client.end();
}

async function seeding_apps() {
  console.log(
    "****************************SEEDING LOGTO APPS*****************************************************\n",
  );
  const client = await getDBClient();
  const pg_schema = process.env.PG__SCHEMA;
  let envApps: Array<{
    name: string;
    id: string;
    secret: string;
    tenant_id: string;
    type: string;
    description: string;
    oidcClientMetadata?: string;
  }> = JSON.parse(process.env.LOGTO__CLIENT_APPS) || [];
  for (const envapp of envApps) {
    console.log(`Seeding app ${envapp.name} | id ${envapp.id}`);
    await queryPostgres(
      client,
      `INSERT INTO ${pg_schema}.applications(tenant_id, id, name, secret, description, type, oidc_client_metadata) 
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT(id) 
      DO UPDATE SET secret = EXCLUDED.secret`,
      [
        "default",
        envapp.id,
        envapp.name,
        envapp.secret,
        envapp.description,
        envapp.type,
        envapp.oidcClientMetadata ??
          '{  "redirectUris": [],  "postLogoutRedirectUris": [] }',
      ],
    );
  }
  client.end();
}

(async () => {
  try {
    await seeding_alp_admin();
    await seeding_apps();
    await main();
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
