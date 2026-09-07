import { getOidcToken, isOidcAuthenticated, oidcLogout, refreshOidcToken } from "./oidc/oidc";

export const getAuthToken = async (redirect = true): Promise<string | void> => {
  return await getOidcToken(redirect);
};

export const refreshAuthToken = async (): Promise<string | void> => {
  return await refreshOidcToken();
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
