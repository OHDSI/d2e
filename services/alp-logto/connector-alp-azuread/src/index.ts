import { conditional } from "@silverhand/essentials";
import { got, HTTPError } from "got";
import { jwtDecode } from "jwt-decode";
import path from "node:path";

import type {
  GetAuthorizationUri,
  GetUserInfo,
  GetConnectorConfig,
  CreateConnector,
  SocialConnector,
} from "@logto/connector-kit";
import {
  ConnectorError,
  ConnectorErrorCodes,
  validateConfig,
  ConnectorType,
  parseJson,
} from "@logto/connector-kit";

import {
  defaultScopes,
  defaultMetadata,
  defaultTimeout,
  graphAPIEndpoint,
  graphAPIMemberOfEndpoint,
} from "./constant.js";
import type { AzureADConfig } from "./types.js";
import {
  azureADConfigGuard,
  userInfoResponseGuard,
  authResponseGuard,
} from "./types.js";

// Base URL this connector uses to call Logto's own API. When Logto serves its
// port over TLS there is no plaintext listener left, so http://localhost fails
// with ECONNRESET — LOGTO__SELF_BASE_URL then supplies the internal HTTPS URL
// (a name the internal cert covers; localhost is not in its SAN). The http
// fallback keeps non-TLS deployments working unchanged.
const ENDPOINT =
  process.env.LOGTO__SELF_BASE_URL || `http://localhost:${process.env.PORT}`;
const RESEARCHER_ROLE_PREFIX = "role.researcher.";

const parseScopes = (scopesConfig?: string): string[] => {
  if (!scopesConfig || scopesConfig.trim() === "") {
    return defaultScopes;
  }
  return scopesConfig.split(",").map((s) => s.trim()).filter(Boolean);
};

const getAuthorizationUri =
  (getConfig: GetConnectorConfig): GetAuthorizationUri =>
  async ({ state, redirectUri }) => {
    const config = await getConfig(defaultMetadata.id);
    validateConfig(config, azureADConfigGuard);
    const { clientId, cloudInstance, tenantId, scopes: scopesConfig } = config;
    const scopes = parseScopes(scopesConfig);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: scopes.join(" "),
      state,
    });

    const authorityUri = new URL(
      path.join(cloudInstance, tenantId, "oauth2/authorize")
    ).toString();

    console.log(`[AzureAD Connector] Authorization URI: ${`${authorityUri}?${params.toString()}`}`);

    return `${authorityUri}?${params.toString()}`;
  };

const getAccessToken = async (
  config: AzureADConfig,
  code: string,
  redirectUri: string
) => {
  const { clientId, clientSecret, cloudInstance, tenantId, scopes: scopesConfig } = config;
  const scopes = parseScopes(scopesConfig);
  try {
    const tokenUri = new URL(
      path.join(cloudInstance, tenantId, "oauth2/v2.0/token")
    ).toString();
    const response = await fetch(tokenUri, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        scope: scopes.join(" "),
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    if (!response.ok) {
      const errorData: any = await response.json();
      const errorMessage = `Token exchange failed: ${errorData.error_description || JSON.stringify(errorData)}`;
      console.error(`[AzureAD Connector] ${errorMessage}`);
      throw new ConnectorError(ConnectorErrorCodes.General, errorMessage);
    }

    const authResult = await response.json();

    await assignLogtoRolesByAzureGroups(
      authResult.id_token,
      authResult.access_token
    );

    return {
      accessToken: authResult.access_token,
      idToken: authResult.id_token,
      refreshToken: authResult.refresh_token,
    };
  } catch (error: any) {
    console.error("Error exchanging authorization code for token:", error);
    throw error;
  }
};

const getUserGroups = async (accessToken: string): Promise<string[]> => {
  try {
    const response = await got.get(graphAPIMemberOfEndpoint, {
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
      timeout: { request: defaultTimeout },
    });

    const data = JSON.parse(response.body);

    // Filter for groups and extract IDs
    const groups = data.value
      .filter((item: any) => item["@odata.type"] === "#microsoft.graph.group")
      .map((group: any) => group.id);

    console.log(`User groups from Graph API: ${JSON.stringify(groups)}`);
    return groups;
  } catch (error) {
    console.error("Error fetching user groups from Graph API:", error);
    return []; // Fail silently - no roles will be assigned
  }
};

const assignLogtoRolesByAzureGroups = async (
  idToken: string,
  accessToken: string
) => {
  // decode id token
  const decodedIdToken: any = jwtDecode(idToken);
  const decodedAccessToken: any = jwtDecode(accessToken);

  // Fetch groups via Graph API instead of token claim
  const azureGroups = await getUserGroups(accessToken);
  const rolesGroupMap = JSON.parse(process.env.LOGTO_ROLES_AZ_GROUPS_MAPPING!);
  const eligibleLogtoRoles = Object.keys(rolesGroupMap || {}).filter(
    (role) => azureGroups?.indexOf(rolesGroupMap[role]) > -1
  );
  console.log(`Eligible Logto roles based on Azure groups: ${JSON.stringify(eligibleLogtoRoles)}`);

  const oid = decodedIdToken["oid"];
  const name = decodedIdToken["name"];
  const email = decodedAccessToken["email"] || decodedAccessToken["upn"]; // For D4L & MS
  const logtoAPItoken: any = await getM2MLogtoAPIToken();
  let logtoUserID: string = await getLogtoUserIdByEmail(email, logtoAPItoken);

  if (!logtoUserID) {
    let username = (name || "").replace(/[^a-zA-Z0-9_]/g, "_");

    // Verify if username is taken
    const logtoUsersByName = await getLogtoUsersByName(username, logtoAPItoken);
    if (logtoUsersByName?.length > 0) {
      const revisedUsername = `${username}_${Date.now()}`;
      console.warn(
        `Username ${username} is already taken. Create Logto user with name: ${revisedUsername}`
      );
      username = revisedUsername;
    }

    // Create user
    const newUser = await addUser(name, username, email, logtoAPItoken);
    if (newUser?.id) {
      logtoUserID = newUser.id;

      const identityDetails = { id: oid, name, email };
      await updateUserIdentity(
        newUser?.id,
        defaultMetadata.id,
        { userId: oid, details: identityDetails },
        logtoAPItoken
      );
    } else {
      console.warn(`Unable to find Logto user with email: ${email}`);
      return;
    }
  }

  // Fetch existing roles and ensure all eligible roles exist (create if missing)
  let logtoRoles = (await getLogtoRoles(logtoAPItoken)) || [];
  logtoRoles = await ensureEligibleRolesExist(eligibleLogtoRoles, logtoRoles, logtoAPItoken);
  const userRoles = (await getUserRoles(logtoUserID, logtoAPItoken)) || [];
  // console.log(`USER ${logtoUserID} ROLES ${JSON.stringify(userRoles)}`);

  // Assign eligible roles the user doesn't have yet
  const toBeAssignedLogtoRoles = logtoRoles.filter(
    (role: any) =>
      eligibleLogtoRoles.includes(role.name) &&
      !userRoles.some((userRole: any) => userRole.name === role.name),
  );
  // console.log(`TO BE ASSIGNED LOGTO ROLES ${JSON.stringify(toBeAssignedLogtoRoles)}`);
  for (const logtoRole of toBeAssignedLogtoRoles) {
    await assignRolesToUser(logtoRole.id, logtoUserID, logtoAPItoken);
  }

  // Remove only mapping-managed roles the user is no longer eligible for
  const mappedRoleNames = Object.keys(rolesGroupMap);
  const toBeRemovedLogtoRoles = userRoles.filter(
    (role: any) =>
      mappedRoleNames.includes(role.name) &&
      !eligibleLogtoRoles.includes(role.name),
  );
  // console.log(`TO BE REMOVED LOGTO ROLES ${JSON.stringify(toBeRemovedLogtoRoles)}`);
  for (const logtoRole of toBeRemovedLogtoRoles) {
    await removeRolesFromUser(logtoRole.id, logtoUserID, logtoAPItoken);
  }
};

const getM2MLogtoAPIToken = async () => {
  try {
    const httpResponse = await got.post(`${ENDPOINT}/oidc/token`, {
      form: {
        grant_type: "client_credentials",
        client_id: process.env.LOGTO_API_M2M_CLIENT_ID,
        client_secret: process.env.LOGTO_API_M2M_CLIENT_SECRET,
        resource: "https://default.logto.app/api",
        scope: "all",
      },
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      timeout: { request: defaultTimeout },
    });

    // console.log(`API TOKEN ${JSON.stringify(httpResponse.body)}`);

    return JSON.parse(httpResponse.body).access_token!;
  } catch (e) {
    console.error(e);
  }
};

const getLogtoUserIdByEmail = async (email: string, apiToken: string) => {
  try {
    const httpResponse = await got.get(`${ENDPOINT}/api/users`, {
      searchParams: {
        ["search.primaryEmail"]: email,
      },
      headers: {
        authorization: `Bearer ${apiToken}`,
      },
      timeout: { request: defaultTimeout },
    });

    // console.log(`Logto USER INFO ${JSON.stringify(httpResponse.body)}`);

    return JSON.parse(httpResponse.body)[0]?.id;
  } catch (e) {
    console.error(e);
  }
};

const getLogtoUsersByName = async (username: string, apiToken: string) => {
  try {
    const httpResponse = await got.get(`${ENDPOINT}/api/users`, {
      searchParams: {
        ["search.username"]: username,
        ["mode.username"]: "exact",
      },
      headers: {
        authorization: `Bearer ${apiToken}`,
      },
      timeout: { request: defaultTimeout },
    });

    console.log(
      `Logto USER INFO by username ${JSON.stringify(httpResponse.body)}`
    );

    return JSON.parse(httpResponse.body);
  } catch (e) {
    console.error(e);
  }
};

const fetchAllPages = async <T = any>(
  path: string,
  apiToken: string,
  pageSize = 100,
): Promise<T[]> => {
  let page = 1;
  const allItems: T[] = [];

  while (true) {
    const url = `${ENDPOINT}${path}${path.includes("?") ? "&" : "?"}page=${page}&page_size=${pageSize}`;
    const response = await got.get(url, {
      headers: {
        authorization: `Bearer ${apiToken}`,
      },
      timeout: { request: defaultTimeout },
    });

    const items = JSON.parse(response.body) as T[];
    allItems.push(...items);

    const totalNumber = Number(response.headers["total-number"]);
    if (!totalNumber || allItems.length >= totalNumber || items.length === 0) {
      break;
    }
    page++;
  }

  return allItems;
};

const getLogtoRoles = async (apiToken: string) => {
  try {
    return await fetchAllPages(`/api/roles`, apiToken);
  } catch (e) {
    console.error(e);
  }
};

const getDefaultResourceId = async (
  apiToken: string,
): Promise<string | undefined> => {
  try {
    const resources = await fetchAllPages<{ id: string; isDefault?: boolean }>(
      `/api/resources`,
      apiToken,
    );
    const defaultResource = resources.find((r) => r.isDefault);
    return defaultResource?.id;
  } catch (e) {
    console.error("Error fetching default resource:", e);
  }
};

const createLogtoRole = async (
  roleName: string,
  apiToken: string,
): Promise<any> => {
  try {
    console.log(`Creating Logto role: ${roleName}`);
    const httpResponse = await got.post(`${ENDPOINT}/api/roles`, {
      headers: {
        authorization: `Bearer ${apiToken}`,
        "content-type": "application/json",
      },
      json: {
        name: roleName,
        description: `Role: ${roleName}`,
        type: "User",
      },
      timeout: { request: defaultTimeout },
    });

    return JSON.parse(httpResponse.body);
  } catch (e) {
    console.error(`Error creating role ${roleName}:`, e);
  }
};

const ensureScopeForRole = async (
  roleId: string,
  scopeName: string,
  resourceId: string,
  apiToken: string,
): Promise<void> => {
  try {
    console.log(`Ensuring scope ${scopeName} exists for role ${roleId}`);

    // Find or create scope on the default resource
    const existingScopes = await fetchAllPages<{ id: string; name: string }>(
      `/api/resources/${resourceId}/scopes`,
      apiToken,
    );
    let scope: { id: string; name: string } | undefined = existingScopes.find(
      (s) => s.name === scopeName,
    );

    if (!scope) {
      console.log(`Creating scope ${scopeName} on resource ${resourceId}`);
      const createScopeResponse = await got.post(
        `${ENDPOINT}/api/resources/${resourceId}/scopes`,
        {
          headers: {
            authorization: `Bearer ${apiToken}`,
            "content-type": "application/json",
          },
          json: {
            name: scopeName,
            description: scopeName,
          },
          timeout: { request: defaultTimeout },
        },
      );
      scope = JSON.parse(createScopeResponse.body);
    }

    // Assign scope to role if not already assigned
    const existingRoleScopes = await fetchAllPages<{ id: string }>(
      `/api/roles/${roleId}/scopes`,
      apiToken,
    );
    const alreadyAssigned = existingRoleScopes.some((s) => s.id === scope!.id);

    if (!alreadyAssigned) {
      console.log(`Assigning scope ${scopeName} to role ${roleId}`);
      await got.post(`${ENDPOINT}/api/roles/${roleId}/scopes`, {
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        json: {
          scopeIds: [scope!.id],
        },
        timeout: { request: defaultTimeout },
      });
    }
  } catch (e) {
    console.error(`Error ensuring scope ${scopeName} for role ${roleId}:`, e);
  }
};

const ensureEligibleRolesExist = async (
  eligibleLogtoRoleNames: string[],
  existingLogtoRoles: any[],
  apiToken: string,
): Promise<any[]> => {
  const updatedRoles = [...existingLogtoRoles];
  let resourceId: string | undefined;

  for (const roleName of eligibleLogtoRoleNames) {
    const roleExists = updatedRoles.some((r: any) => r.name === roleName);
    if (roleExists) continue;

    // Role does not exist -- create it
    const newRole = await createLogtoRole(roleName, apiToken);
    if (!newRole?.id) {
      console.error(`Failed to create role ${roleName}, skipping`);
      continue;
    }

    // For researcher roles, also create scope and assign to role
    if (roleName.startsWith(RESEARCHER_ROLE_PREFIX)) {
      if (!resourceId) {
        resourceId = await getDefaultResourceId(apiToken);
      }
      if (resourceId) {
        await ensureScopeForRole(newRole.id, roleName, resourceId, apiToken);
      } else {
        console.error(
          `Default resource not found, cannot create scope for ${roleName}`,
        );
      }
    }

    updatedRoles.push(newRole);
  }

  return updatedRoles;
};

const getUserRoles = async (userId: string, apiToken: string) => {
  try {
    return await fetchAllPages(`/api/users/${userId}/roles`, apiToken);
  } catch (e) {
    console.error(e);
  }
};

const addUser = async (
  name: string,
  username: string,
  email: string,
  apiToken: string
) => {
  try {
    const httpResponse = await got.post(`${ENDPOINT}/api/users`, {
      headers: {
        authorization: `Bearer ${apiToken}`,
      },
      json: {
        name,
        primaryEmail: email,
        username,
      },
      timeout: { request: defaultTimeout },
    });

    // console.log(`Logto User creation ${JSON.stringify(httpResponse.body)}`);

    return JSON.parse(httpResponse.body) as { id: string };
  } catch (e) {
    console.error(e);
  }
};

const updateUserIdentity = async (
  userId: string,
  target: string,
  data: object,
  apiToken: string
) => {
  try {
    const httpResponse = await got.put(
      `${ENDPOINT}/api/users/${userId}/identities/${target}`,
      {
        headers: {
          authorization: `Bearer ${apiToken}`,
        },
        json: data,
        timeout: { request: defaultTimeout },
      }
    );

    // console.log(`Logto User identity update ${JSON.stringify(httpResponse.body)}`);

    return JSON.parse(httpResponse.body);
  } catch (e) {
    console.error(e);
  }
};

const assignRolesToUser = async (
  roleId: string,
  userId: string,
  apiToken: string
) => {
  try {
    console.log(`assignRolesToUser roleid ${roleId}, userId ${userId}`);
    const httpResponse = await got.post(
      `${ENDPOINT}/api/roles/${roleId}/users`,
      {
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        json: {
          userIds: [userId],
        },
        timeout: { request: defaultTimeout },
      }
    );

    // console.log(`Logto Roles assignment ${JSON.stringify(httpResponse)}`);
  } catch (e) {
    console.error(e);
  }
};

const removeRolesFromUser = async (
  roleId: string,
  userId: string,
  apiToken: string
) => {
  try {
    console.log(`removeRolesFromUser roleid ${roleId}, userId ${userId}`);
    const httpResponse = await got.delete(
      `${ENDPOINT}/api/users/${userId}/roles/${roleId}`,
      {
        headers: {
          authorization: `Bearer ${apiToken}`,
          "content-type": "application/json",
        },
        timeout: { request: defaultTimeout },
      }
    );

    // console.log(`Logto Roles removal ${JSON.stringify(httpResponse)}`);
  } catch (e) {
    console.error(e);
  }
};

const getUserInfo =
  (getConfig: GetConnectorConfig): GetUserInfo =>
  async (data) => {
    const { code, redirectUri } = await authorizationCallbackHandler(data);

    // Temporarily keep this as this is a refactor, which should not change the logics.
    const config = await getConfig(defaultMetadata.id);
    validateConfig(config, azureADConfigGuard);

    const { accessToken, idToken, refreshToken } = await getAccessToken(
      config,
      code,
      redirectUri
    );

    // throw new Error("asdfasdfasdfasdfsd")

    try {
      const httpResponse = await got.get(graphAPIEndpoint, {
        headers: {
          authorization: `Bearer ${accessToken}`,
        },
        timeout: { request: defaultTimeout },
      });

      const result = userInfoResponseGuard.safeParse(
        parseJson(httpResponse.body)
      );

      if (!result.success) {
        throw new ConnectorError(
          ConnectorErrorCodes.InvalidResponse,
          result.error
        );
      }

      const { id, mail, userPrincipalName, displayName } = result.data;

      // @ts-ignore
      globalThis.tokenMap = globalThis.tokenMap || {};
      // @ts-ignore
      globalThis.refreshTokenMap = globalThis.refreshTokenMap || {};
      const mapId = mail || userPrincipalName;
      // @ts-ignore
      globalThis.tokenMap[mapId] = idToken;
      // @ts-ignore
      globalThis.refreshTokenMap[mapId] = refreshToken;

      return {
        id,
        email: conditional(mail),
        name: conditional(displayName),
      };
    } catch (error: unknown) {
      if (error instanceof HTTPError) {
        const { statusCode, body: rawBody } = error.response;

        if (statusCode === 401) {
          throw new ConnectorError(
            ConnectorErrorCodes.SocialAccessTokenInvalid
          );
        }

        throw new ConnectorError(
          ConnectorErrorCodes.General,
          JSON.stringify(rawBody)
        );
      }

      throw error;
    }
  };

const authorizationCallbackHandler = async (parameterObject: unknown) => {
  const result = authResponseGuard.safeParse(parameterObject);

  if (!result.success) {
    throw new ConnectorError(
      ConnectorErrorCodes.General,
      JSON.stringify(parameterObject)
    );
  }

  return result.data;
};

const createAzureAdConnector: CreateConnector<SocialConnector> = async ({
  getConfig,
}) => {
  return {
    metadata: defaultMetadata,
    type: ConnectorType.Social,
    configGuard: azureADConfigGuard,
    getAuthorizationUri: getAuthorizationUri(getConfig),
    getUserInfo: getUserInfo(getConfig),
  };
};

export default createAzureAdConnector;
