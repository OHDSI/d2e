import axios, { AxiosRequestConfig } from "axios";
import memoize from "memoizee";
import { authLogout, getAuthToken, refreshAuthToken } from "../containers/auth/auth";
import { isOidcAuthenticated } from "../containers/auth/oidc/oidc";

const PUBLIC_URL_PREFIXES = ["dataset/public/list", "config/public"];
const isPublicUrl = (url?: string) => !!url && PUBLIC_URL_PREFIXES.some((prefix) => url.startsWith(prefix));

// The backend rejects access tokens minted before the user's roles last
// changed. The token itself is still validly signed, so a silent refresh
// (which re-mints against Logto's current role state) resolves it without
// forcing a full re-login.
// Retries of a request rejected for a stale token. Three covers an
// administrator whose own authorization changes while they work; beyond that a
// token that never refreshes is a real failure, not a race.
const STALE_TOKEN_MAX_RETRIES = 3;

const isStaleTokenError = (error: any) =>
  error.response?.status === 401 &&
  (error.response.headers?.["x-token-stale"] === "1" || error.response.data?.code === "AUTHZ_STALE_TOKEN");

const client = axios.create();

client.interceptors.request.use(
  async (config) => {
    if (!isPublicUrl(config.url) && isOidcAuthenticated()) {
      const token = await getAuthToken(false);
      if (token && config.headers) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Retry logic for ERR_NETWORK_CHANGED errors (Docker container restarts during e2e tests)
client.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config;
    if (!config) return Promise.reject(error);

    const isNetworkChanged = error.code === "ERR_NETWORK" || error.message?.includes("ERR_NETWORK_CHANGED");

    if (isNetworkChanged) {
      config.__retryCount = config.__retryCount || 0;
      if (config.__retryCount < 3) {
        config.__retryCount += 1;
        console.warn(`[Portal API] ERR_NETWORK_CHANGED, retrying in 10s (attempt ${config.__retryCount}/3)...`);
        await new Promise((resolve) => setTimeout(resolve, 10000));
        return client.request(config);
      }
    }

    if (isStaleTokenError(error)) {
      // More than one attempt, because the token can go stale again between the
      // refresh and the retry: granting a role stamps the target user, and an
      // administrator changing their own permissions invalidates the very token
      // they are using. A single retry loses that race and logs the user out
      // mid-task; the bound still stops a genuinely unrefreshable token looping.
      config.__staleTokenRetries = config.__staleTokenRetries ?? 0;
      if (config.__staleTokenRetries >= STALE_TOKEN_MAX_RETRIES) {
        console.error("[Portal API] Token still stale after refresh, logging out");
        await authLogout();
        return Promise.reject(error);
      }

      console.warn("[Portal API] Access token stale (AUTHZ_STALE_TOKEN), refreshing and retrying...");
      config.__staleTokenRetries += 1;
      const token = await refreshAuthToken();
      if (!token) {
        console.error("[Portal API] Token refresh failed, logging out");
        await authLogout();
        return Promise.reject(error);
      }

      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
      return client.request(config);
    }

    return Promise.reject(error);
  }
);

const requestNoCache = async <T = any>(options: AxiosRequestConfig): Promise<T> => {
  const onSuccess = function (response: any) {
    console.debug("Request Successful!", response);
    return response.data;
  };

  const onError = function (error: any) {
    console.error("Request Failed:", error.config);

    if (error.response) {
      // Server response error
      console.error("Status:", error.response.status);
      console.error("Data:", error.response.data);
      console.error("Headers:", error.response.headers);
    } else {
      // Request setup error
      console.error("Error Message:", error.message);
    }

    return Promise.reject(error.response || error.message);
  };

  try {
    const response = await client(options);
    return onSuccess(response);
  } catch (error) {
    return onError(error);
  }
};

const isPlaywright = typeof navigator !== "undefined" && navigator.webdriver;

const memoizedRequest = memoize(requestNoCache, {
  maxAge: 800,
  promise: true,
  normalizer: (args) => JSON.stringify(args),
});

export const request = isPlaywright ? requestNoCache : memoizedRequest;
