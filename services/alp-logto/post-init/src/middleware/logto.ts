// Mirrors what docker-compose builds for this variable:
// https://${PROJECT_NAME:-d2e}-logto-1.${TLS__INTERNAL__DOMAIN:-d2e.local}:3002
// The previous literal used a container name (alp-logto-1) that no deployment
// creates, so the fallback failed DNS resolution rather than degrading.
const projectName = process.env.PROJECT_NAME || "d2e";
const internalDomain = process.env.TLS__INTERNAL__DOMAIN || "d2e.local";
let LOGTO__ADMIN_SERVER__FQDN_URL =
  process.env.LOGTO__ADMIN_SERVER__FQDN_URL ||
  `https://${projectName}-logto-1.${internalDomain}:3002`;
let LOGTO__CLIENTID_PASSWORD__BASIC_AUTH =
  process.env.LOGTO__CLIENTID_PASSWORD__BASIC_AUTH;

// TODO: remove any type
function encodeData(data: any) {
  var formBody = [];
  for (var property in data) {
    var encodedKey = encodeURIComponent(property);
    var encodedValue = encodeURIComponent(data[property]);
    formBody.push(encodedKey + "=" + encodedValue);
  }
  return formBody.join("&");
}

export async function fetchToken() {
  let r = await fetch(`${LOGTO__ADMIN_SERVER__FQDN_URL}/oidc/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${LOGTO__CLIENTID_PASSWORD__BASIC_AUTH}`,
    },
    body: encodeData({
      grant_type: "client_credentials",
      resource: "https://default.logto.app/api",
      scope: "all",
    }),
  });
  let jwt = await r.json();
  console.log(jwt);
  return jwt;
}

export async function post(
  path: string,
  headers: any,
  data: object
): Promise<Response> {
  const resp = await fetch(`${LOGTO__ADMIN_SERVER__FQDN_URL}/api/${path}`, {
    method: "POST",
    headers: Object.assign({}, headers, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(data),
  });
  return resp;
}

export async function patch(
  path: string,
  headers: any,
  data: object
): Promise<Response> {
  const resp = await fetch(`${LOGTO__ADMIN_SERVER__FQDN_URL}/api/${path}`, {
    method: "PATCH",
    headers: Object.assign({}, headers, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(data),
  });
  return resp;
}

export async function put(
  path: string,
  headers: any,
  data: object
): Promise<Response> {
  const resp = await fetch(`${LOGTO__ADMIN_SERVER__FQDN_URL}/api/${path}`, {
    method: "PUT",
    headers: Object.assign({}, headers, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(data),
  });
  return resp;
}

export async function get(path: string, headers: any): Promise<Response> {
  const resp = await fetch(`${LOGTO__ADMIN_SERVER__FQDN_URL}/api/${path}`, {
    method: "GET",
    headers: Object.assign({}, headers, {
      "Content-Type": "application/json",
    }),
  });
  return resp;
}

export async function del(path: string, headers: any): Promise<Response> {
  const resp = await fetch(`${LOGTO__ADMIN_SERVER__FQDN_URL}/api/${path}`, {
    method: "DELETE",
    headers: Object.assign({}, headers, {
      "Content-Type": "application/json",
    }),
  });
  return resp;
}
