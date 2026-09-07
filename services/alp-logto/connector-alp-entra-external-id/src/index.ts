import { conditional } from "@silverhand/essentials";
import { got } from "got";
import { jwtDecode } from "jwt-decode";

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
} from "@logto/connector-kit";

import {
  defaultScopes,
  defaultMetadata,
} from "./constant.js";
import type { EntraExternalIdConfig, IdTokenClaims } from "./types.js";
import {
  entraExternalIdConfigGuard,
  idTokenClaimsGuard,
  authResponseGuard,
} from "./types.js";

// Base URL this connector uses to call Logto's own API. When Logto serves its
// port over TLS there is no plaintext listener left, so http://localhost fails
// with ECONNRESET — LOGTO__SELF_BASE_URL then supplies the internal HTTPS URL
// (a name the internal cert covers; localhost is not in its SAN). The http
// fallback keeps non-TLS deployments working unchanged.
const ENDPOINT =
  process.env.LOGTO__SELF_BASE_URL || `http://localhost:${process.env.PORT}`;
const defaultTimeout = 5000;

const parseScopes = (scopesConfig?: string): string[] => {
  if (!scopesConfig || scopesConfig.trim() === "") {
    return defaultScopes;
  }
  return scopesConfig.split(",").map((s) => s.trim()).filter(Boolean);
};

const buildAuthorityUrl = (
  tenantSubdomain: string,
  tenantId: string,
  path: string
): string =>
  `https://${tenantSubdomain}.ciamlogin.com/${tenantId}/${path}`;

const looksLikeEmail = (value?: string): boolean =>
  !!value && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const pickEmail = (claims: IdTokenClaims): string | undefined => {
  if (claims.email) return claims.email;
  if (claims.emails && claims.emails.length > 0) return claims.emails[0];
  if (looksLikeEmail(claims.preferred_username)) return claims.preferred_username;
  return undefined;
};

const pickName = (claims: IdTokenClaims): string | undefined => {
  if (claims.name) return claims.name;
  const composed = [claims.given_name, claims.family_name]
    .filter(Boolean)
    .join(" ")
    .trim();
  return composed || claims.preferred_username || undefined;
};

const getAuthorizationUri =
  (getConfig: GetConnectorConfig): GetAuthorizationUri =>
  async ({ state, redirectUri }) => {
    const config = await getConfig(defaultMetadata.id);
    validateConfig(config, entraExternalIdConfigGuard);
    const { clientId, tenantSubdomain, tenantId, scopes: scopesConfig } = config;
    const scopes = parseScopes(scopesConfig);

    const params = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      response_mode: "query",
      scope: scopes.join(" "),
      state,
    });

    const authorityUri = buildAuthorityUrl(
      tenantSubdomain,
      tenantId,
      "oauth2/v2.0/authorize"
    );

    console.log(
      `[EntraExternalID Connector] Authorization URI: ${authorityUri}?${params.toString()}`
    );

    return `${authorityUri}?${params.toString()}`;
  };

const getAccessToken = async (
  config: EntraExternalIdConfig,
  code: string,
  redirectUri: string
) => {
  const { clientId, clientSecret, tenantSubdomain, tenantId, scopes: scopesConfig } = config;
  const scopes = parseScopes(scopesConfig);
  try {
    const tokenUri = buildAuthorityUrl(
      tenantSubdomain,
      tenantId,
      "oauth2/v2.0/token"
    );
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
      console.error(`[EntraExternalID Connector] ${errorMessage}`);
      throw new ConnectorError(ConnectorErrorCodes.General, errorMessage);
    }

    const authResult: any = await response.json();

    return {
      accessToken: authResult.access_token as string,
      idToken: authResult.id_token as string | undefined,
      refreshToken: authResult.refresh_token as string | undefined,
    };
  } catch (error: any) {
    console.error("Error exchanging authorization code for token:", error);
    throw error;
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

    return JSON.parse(httpResponse.body);
  } catch (e) {
    console.error(e);
  }
};

const provisionLogtoUserIfMissing = async (
  sub: string,
  email: string | undefined,
  name: string | undefined
) => {
  if (!email) {
    console.warn(
      "[EntraExternalID Connector] No email in id_token; cannot provision Logto user."
    );
    return;
  }

  const logtoAPItoken: any = await getM2MLogtoAPIToken();
  if (!logtoAPItoken) {
    console.error(
      "[EntraExternalID Connector] Failed to obtain M2M API token; skipping provisioning."
    );
    return;
  }

  const existingUserId: string | undefined = await getLogtoUserIdByEmail(
    email,
    logtoAPItoken
  );
  if (existingUserId) {
    return;
  }

  let username = (name || "").replace(/[^a-zA-Z0-9_]/g, "_");
  const logtoUsersByName = await getLogtoUsersByName(username, logtoAPItoken);
  if (logtoUsersByName?.length > 0) {
    const revisedUsername = `${username}_${Date.now()}`;
    console.warn(
      `Username ${username} is already taken. Create Logto user with name: ${revisedUsername}`
    );
    username = revisedUsername;
  }

  const newUser = await addUser(name ?? "", username, email, logtoAPItoken);
  if (!newUser?.id) {
    console.warn(
      `[EntraExternalID Connector] Unable to create Logto user with email: ${email}`
    );
    return;
  }

  const identityDetails = { id: sub, name, email };
  await updateUserIdentity(
    newUser.id,
    defaultMetadata.id,
    { userId: sub, details: identityDetails },
    logtoAPItoken
  );
};

const getUserInfo =
  (getConfig: GetConnectorConfig): GetUserInfo =>
  async (data) => {
    const { code, redirectUri } = await authorizationCallbackHandler(data);

    const config = await getConfig(defaultMetadata.id);
    validateConfig(config, entraExternalIdConfigGuard);

    const { idToken } = await getAccessToken(config, code, redirectUri);

    if (!idToken) {
      throw new ConnectorError(
        ConnectorErrorCodes.InvalidResponse,
        "id_token missing from token response — ensure the 'openid' scope is requested."
      );
    }

    let rawClaims: unknown;
    try {
      rawClaims = jwtDecode(idToken);
    } catch (error) {
      throw new ConnectorError(
        ConnectorErrorCodes.InvalidResponse,
        `Failed to decode id_token: ${(error as Error).message}`
      );
    }

    const result = idTokenClaimsGuard.safeParse(rawClaims);
    if (!result.success) {
      throw new ConnectorError(
        ConnectorErrorCodes.InvalidResponse,
        result.error
      );
    }

    const claims = result.data;
    const email = pickEmail(claims);
    const name = pickName(claims);

    console.log(
      `[EntraExternalID Connector] Resolved profile: sub=${claims.sub} email=${email ?? "(none)"} name=${name ?? "(none)"}`
    );

    await provisionLogtoUserIfMissing(claims.sub, email, name);

    return {
      id: claims.sub,
      email: conditional(email),
      name: conditional(name),
    };
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

const createEntraExternalIdConnector: CreateConnector<SocialConnector> = async ({
  getConfig,
}) => {
  return {
    metadata: defaultMetadata,
    type: ConnectorType.Social,
    configGuard: entraExternalIdConfigGuard,
    getAuthorizationUri: getAuthorizationUri(getConfig),
    getUserInfo: getUserInfo(getConfig),
  };
};

export default createEntraExternalIdConnector;
