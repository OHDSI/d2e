import { FC, useCallback, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useOidc, useOidcAccessToken, useOidcIdToken } from "@axa-fr/react-oidc";
import { api } from "../../../axios/api";
import { config } from "../../../config";
import { useToken, useUser } from "../../../contexts";
import { useDisclaimerHook } from "../../../hooks/useDisclaimer";
import env from "../../../env";

const subProp = env.REACT_APP_IDP_SUBJECT_PROP;

const RELOGIN_GUARD_KEY = "d2e_first_login_role_refresh";

interface OidcLoginSilentProps {
  onReady?: () => void;
}

let firstTimeLoggedIn = false;
let bootstrapSettled = false;
let bootstrapFailed = false;
let lastAttemptedAccessTokenIat: number | null | undefined = null;

export const OidcLoginSilent: FC<OidcLoginSilentProps> = ({ onReady }) => {
  const navigate = useNavigate();
  const { idToken, idTokenPayload } = useOidcIdToken();
  const { accessTokenPayload } = useOidcAccessToken();
  const { login } = useOidc();
  const { setIdToken, setIdTokenClaim } = useToken();
  const { setUserGroup, clearUser } = useUser();
  useDisclaimerHook();

  // `useOidcAccessToken()` and `useOidc()` return fresh identities on every render.
  // Reading them through refs keeps `loggedIn` stable, otherwise the effect below
  // re-runs on every render and its unconditional token writes re-render forever.
  const accessTokenPayloadRef = useRef(accessTokenPayload);
  accessTokenPayloadRef.current = accessTokenPayload;
  const loginRef = useRef(login);
  loginRef.current = login;

  // `isFirstLogin` gates the roles-less-token re-login check to the initial
  // bootstrap only; later renewals just re-sync userGroup/WebAPI roles.
  const loggedIn = useCallback(
    async (idpUserId: string, isFirstLogin: boolean) => {
      try {
        if (isFirstLogin) {
          const currentRoles = (accessTokenPayloadRef.current as { roles?: string[] } | undefined)?.roles;
          const tokenMissingRoles = (currentRoles?.length || 0) === 0;
          const alreadyReloggedIn = sessionStorage.getItem(RELOGIN_GUARD_KEY) === "1";

          if (tokenMissingRoles && !alreadyReloggedIn) {
            console.info("[OidcLoginSilent] token has no roles after sync; re-login to refresh claims");
            sessionStorage.setItem(RELOGIN_GUARD_KEY, "1");
            loginRef.current();

            await new Promise<void>((resolve) => setTimeout(resolve, 8000));
            return;
          }

          sessionStorage.removeItem(RELOGIN_GUARD_KEY);
        }

        const userGroups = await api.userMgmt.getUserGroupList(idpUserId, true);
        setUserGroup(idpUserId, userGroups);

        await api.userMgmt.syncWebApiRoles().catch((err) => console.warn("WebAPI role sync failed", err));
      } catch (err: any) {
        console.error("Error getting user info on login", err);
        sessionStorage.removeItem(RELOGIN_GUARD_KEY);
        bootstrapFailed = true;
        clearUser();
        navigate(err?.status === 403 ? config.ROUTES.noAccess : config.ROUTES.logout);
      }
    },
    [navigate, setUserGroup, clearUser]
  );

  const accessTokenIat = (accessTokenPayload as { iat?: number } | undefined)?.iat;

  useEffect(() => {
    setIdToken(idToken);
    setIdTokenClaim(idTokenPayload);

    const idpUserId = idTokenPayload?.[subProp];
    const isNewToken = accessTokenIat !== lastAttemptedAccessTokenIat;
    const needsSync = idpUserId && isNewToken;

    if (needsSync) {
      const isFirstLogin = !firstTimeLoggedIn || bootstrapFailed;
      firstTimeLoggedIn = true;
      bootstrapFailed = false;
      lastAttemptedAccessTokenIat = accessTokenIat;
      loggedIn(idpUserId, isFirstLogin).finally(() => {
        bootstrapSettled = true;
        onReady?.();
      });
      return;
    }

    if (bootstrapSettled) {
      onReady?.();
    }
  }, [idToken, idTokenPayload, accessTokenIat, loggedIn, onReady]);

  return null;
};
