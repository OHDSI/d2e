import { VanillaOidc } from "@axa-fr/react-oidc/dist/vanilla/vanillaOidc";
import { AccessTokenPayload } from "../../../types";

export const getOidcToken = async (redirect = true): Promise<string | void> => {
  const getOidc = VanillaOidc.get;
  const oidc = getOidc();

  try {
    const uaaToken = await oidc.getValidTokenAsync();
    return uaaToken?.tokens?.accessToken;
  } catch (err) {
    console.error("[getOidcToken]", err);
    if (redirect) {
      await oidc.logoutAsync();
    }
  }
};

export const getOidcTokenPayload = async (): Promise<AccessTokenPayload | undefined> => {
  const getOidc = VanillaOidc.get;
  const oidc = getOidc();

  try {
    const uaaToken = await oidc.getValidTokenAsync();
    return uaaToken?.tokens?.accessTokenPayload as AccessTokenPayload;
  } catch (err) {
    console.error("[getOidcTokenPayload]", err);
  }
};

export const refreshOidcToken = async (): Promise<string | void> => {
  const getOidc = VanillaOidc.get;
  const oidc = getOidc();

  try {
    await oidc.renewTokensAsync();
    const uaaToken = await oidc.getValidTokenAsync();
    return uaaToken?.tokens?.accessToken;
  } catch (err) {
    console.error("[refreshOidcToken]", err);
  }
};

export const oidcLogout = async (): Promise<void> => {
  const getOidc = VanillaOidc.get;
  const oidc = getOidc();

  try {
    sessionStorage.setItem("is_logout", "1");
    await oidc.logoutAsync(`${window.location.origin}/d2e/portal`);
  } catch (err) {
    console.error("[oidcLogout]", err);
  }
};

export const isOidcAuthenticated = () => {
  const getOidc = VanillaOidc.get;
  const oidc = getOidc();
  if (!!oidc) return oidc.tokens !== null;
  else return false;
};
