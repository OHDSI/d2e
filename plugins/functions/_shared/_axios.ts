// Drop-in, fetch-based replacement for axios, scoped to the trex worker runtime.
//
// Why: in the trexas worker runtime the Node-compat HTTPS layer (axios / node:https)
// does not perform TLS correctly — public HTTPS fails with `socket hang up` and
// internal HTTPS degrades to a plaintext request against the TLS port. Native
// `fetch` works (public inherently; internal via the cert_provider fix +
// DENO_TLS_CA_STORE=system). This module implements the small axios surface the
// plugin-functions actually use, on top of `fetch`, so it can be wired in via each
// function's deno.json import map ("axios" -> this file) with no call-site changes.
//
// Surface implemented (from an audit of plugins/functions usage):
//   axios.get/post/put/patch/delete, axios.defaults.timeout,
//   axios.interceptors.response.use, axios.isAxiosError, named isAxiosError,
//   and loose type aliases. Config honored: headers, timeout, responseType:"arraybuffer".
//   httpsAgent is accepted and ignored. Non-2xx rejects with an axios-shaped error.
//

import { Buffer } from "node:buffer";

export type AxiosRequestConfig = any;
export type AxiosResponse<T = any> = {
  data: T;
  status: number;
  statusText: string;
  headers: any;
  config: any;
};
export type AxiosError<T = any> = Error & {
  config?: any;
  code?: string;
  status?: number;
  request?: any;
  response?: { status: number; statusText: string; data: T; headers?: any };
  isAxiosError: boolean;
};
export type AxiosInstance = any;

type ResponseInterceptor = {
  onFulfilled?: (r: any) => any;
  onRejected?: (e: any) => any;
};

const responseInterceptors: ResponseInterceptor[] = [];
const defaults: { timeout?: number; headers?: Record<string, any> } = {};

export function isAxiosError(e: any): boolean {
  return !!(e && e.isAxiosError === true);
}

function makeError(
  message: string,
  config: any,
  code?: string,
  response?: { status: number; statusText: string; data: any; headers?: any },
): AxiosError {
  const err = new Error(message) as AxiosError;
  err.isAxiosError = true;
  err.config = config;
  if (code) err.code = code;
  if (response) {
    err.response = response;
    err.status = response.status;
  }
  return err;
}

function hasHeader(headers: Record<string, string>, name: string): boolean {
  const lower = name.toLowerCase();
  return Object.keys(headers).some((h) => h.toLowerCase() === lower);
}

async function core(
  method: string,
  url: string,
  data: any,
  config: AxiosRequestConfig = {},
): Promise<AxiosResponse> {
  const headers: Record<string, string> = {
    ...(defaults.headers || {}),
    ...(config.headers || {}),
  };

  let body: any = undefined;
  if (data !== undefined && data !== null && method !== "GET" && method !== "HEAD") {
    if (
      typeof data === "string" ||
      data instanceof Uint8Array ||
      data instanceof ArrayBuffer ||
      data instanceof URLSearchParams ||
      data instanceof FormData
    ) {
      body = data;
    } else {
      body = JSON.stringify(data);
      if (!hasHeader(headers, "content-type")) {
        headers["Content-Type"] = "application/json";
      }
    }
  }

  const timeout: number | undefined = config.timeout ?? defaults.timeout;
  const controller = new AbortController();
  const timer = timeout ? setTimeout(() => controller.abort(), timeout) : undefined;
  // A caller-supplied signal is chained into our controller rather than replacing
  // it. Passing config.signal straight to fetch would leave the timeout aborting a
  // controller nobody is listening to, so the request could outlive `timeout`.
  if (config.signal) {
    if (config.signal.aborted) {
      controller.abort();
    } else {
      config.signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }
  const cfgForError = { method: method.toLowerCase(), url, headers };

  // The timer is cleared in the `finally` below, not as soon as `fetch` resolves:
  // fetch settles when the response *headers* arrive, so clearing it there would
  // leave a server that stalls the body hanging forever. axios's `timeout`
  // covered the whole response, and these calls now traverse TLS.
  try {
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers,
        body,
        signal: controller.signal,
      });
    } catch (e: any) {
      const aborted = e?.name === "AbortError";
      throw makeError(
        aborted ? `timeout of ${timeout}ms exceeded` : (e?.message || "Network Error"),
        cfgForError,
        aborted ? "ECONNABORTED" : "ERR_NETWORK",
      );
    }

    let payload: any;
    try {
      if (config.responseType === "arraybuffer") {
        // Must be a Buffer, not a Uint8Array: Express's res.send only treats a
        // payload as binary when Buffer.isBuffer() is true, and otherwise
        // serialises it via res.json() as {"0":1,"1":2,...}.
        payload = Buffer.from(await res.arrayBuffer());
      } else {
        const text = await res.text();
        if (text) {
          try {
            payload = JSON.parse(text);
          } catch {
            payload = text;
          }
        } else {
          payload = "";
        }
      }
    } catch (e: any) {
      const aborted = e?.name === "AbortError";
      throw makeError(
        aborted ? `timeout of ${timeout}ms exceeded` : (e?.message || "Network Error"),
        cfgForError,
        aborted ? "ECONNABORTED" : "ERR_NETWORK",
      );
    }

    // A lowercase-keyed plain object, as axios returned. Call sites use bracket
    // access (e.g. headers['total-number']), which a Headers instance does not
    // support. Caveat: Headers iteration yields each set-cookie separately, so
    // fromEntries keeps only the last one, where axios exposed an array. Nothing
    // under plugins/functions reads set-cookie off a response, so this is not a
    // live regression.
    const resHeaders = Object.fromEntries(res.headers);

    if (res.status >= 200 && res.status < 300) {
      return {
        data: payload,
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
        config: cfgForError,
      };
    }

    throw makeError(
      `Request failed with status code ${res.status}`,
      cfgForError,
      "ERR_BAD_REQUEST",
      { status: res.status, statusText: res.statusText, data: payload, headers: resHeaders },
    );
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function request(method: string, url: string, data: any, config: any): Promise<any> {
  try {
    let response = await core(method, url, data, config);
    for (const i of responseInterceptors) {
      if (i.onFulfilled) response = await i.onFulfilled(response);
    }
    return response;
  } catch (error) {
    // Apply response-interceptor error handlers. An onRejected that returns a
    // value resolves the request (used by jobplugins' request-util); one that
    // throws propagates (used by the other request-util copies).
    for (const i of responseInterceptors) {
      if (i.onRejected) return await i.onRejected(error);
    }
    throw error;
  }
}

const axios = {
  defaults,
  interceptors: {
    response: {
      use(onFulfilled?: (r: any) => any, onRejected?: (e: any) => any): number {
        responseInterceptors.push({ onFulfilled, onRejected });
        return responseInterceptors.length - 1;
      },
      eject(_id: number): void {},
    },
    request: {
      use(): number {
        return 0;
      },
      eject(): void {},
    },
  },
  isAxiosError,
  get: <T = any>(url: string, config?: any): Promise<AxiosResponse<T>> =>
    request("GET", url, undefined, config),
  delete: <T = any>(url: string, config?: any): Promise<AxiosResponse<T>> =>
    request("DELETE", url, undefined, config),
  head: <T = any>(url: string, config?: any): Promise<AxiosResponse<T>> =>
    request("HEAD", url, undefined, config),
  post: <T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> =>
    request("POST", url, data, config),
  put: <T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> =>
    request("PUT", url, data, config),
  patch: <T = any>(url: string, data?: any, config?: any): Promise<AxiosResponse<T>> =>
    request("PATCH", url, data, config),
};

export default axios;
