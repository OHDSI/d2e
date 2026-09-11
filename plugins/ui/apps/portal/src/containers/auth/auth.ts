import { getOidcToken, isOidcAuthenticated, oidcLogout, refreshOidcToken } from "./oidc/oidc";

export const getAuthToken = async (redirect = true): Promise<string | void> => {
  return await getOidcToken(redirect);
};

// The provider rotates refresh tokens: redeeming one revokes it and returns a
// replacement. Two refreshes started at once therefore present the same token,
// and the second is rejected as revoked - which reads as an unrefreshable
// session and logs the user out. Concurrent callers share the one refresh
// instead, which is what happens whenever several requests are in flight when
// authorization changes.
let refreshInFlight: Promise<string | void> | null = null;

export const refreshAuthToken = async (): Promise<string | void> => {
  if (!refreshInFlight) {
    refreshInFlight = refreshOidcToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return await refreshInFlight;
};

export const isAuthenticated = () => {
  return isOidcAuthenticated();
};

export const authLogout = async (): Promise<void> => {
  return await oidcLogout();
};

export const hasIdTokenHint = (): boolean => {
  const params = new URLSearchParams(window.location.search);
  return params.has("id_token_hint");
};
