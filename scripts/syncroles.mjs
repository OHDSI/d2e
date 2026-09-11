#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from "node:fs/promises";
import readline from "node:readline";
import { Agent, fetch } from "undici";
import { execSync } from 'node:child_process';


// Helper functions
function getCookie(setCookieHeaders, name) {
  for (const cookie of setCookieHeaders) {
    const match = cookie.match(new RegExp(`${name}=([^;]+)`));
    if (match) return match[1];
  }
  return null;
}

function extractAuthCode(url) {
    if (!url) return '';
    const regex = /code=([^&]+)/;
    const match = url.match(regex);
    return match ? match[1] : '';
}

function prompt(question, defaultValue) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` [${defaultValue}]` : '';
  return new Promise(resolve => {
    rl.question(`${question}${suffix}: `, answer => {
      rl.close();
      resolve(answer.trim() || defaultValue || '');
    });
  });
}

function promptPassword(question) {
  return new Promise((resolve, reject) => {
    process.stdout.write(`${question}: `);
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    let password = '';
    const onData = (ch) => {
      switch (ch) {
        case '\n':
        case '\r':
        case '\u0004':
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stdin.removeListener('data', onData);
          process.stdout.write('\n');
          resolve(password);
          return;
        case '\u0003':
          process.stdout.write('\n');
          process.exit(1);
        case '\u007f':
        case '\b':
          if (password.length > 0) {
            password = password.slice(0, -1);
            process.stdout.write('\b \b');
          }
          return;
        default:
          password += ch;
          process.stdout.write('*');
      }
    };
    process.stdin.on('data', onData);
  });
}

const args = process.argv.slice(2);
const vIndex_envfile = args.indexOf("-n");
let envfile;
if (vIndex_envfile !== -1 && !args[vIndex_envfile + 1].startsWith("-")) {
  envfile = args[vIndex_envfile + 1];
} else {
  envfile = ".env";
}
try {
  await fs.access(envfile);
  dotenv.config({ path: envfile, debug: false });
} catch {
  console.log(`FATAL ${envfile} not found`);
  process.exit(1);
}
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const app_client_id = process.env.LOGTO__D2E_APP__CLIENT_ID || process.env.LOGTO__ALP_APP__CLIENT_ID;
let public_fqdn = process.env.CADDY__D2E__PUBLIC_FQDN || process.env.CADDY__ALP__PUBLIC_FQDN || "localhost";
let port = process.env.PORT ? `:${process.env.PORT}` : ":443";
let CADDY__D2E__PUBLIC_FQDN = `${public_fqdn}${port}`;
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

console.log('\nSyncing usermgmt roles to Logto...\n');

const username = await prompt('Admin username', 'admin');
const password = await promptPassword('Admin password');
if (!password) {
  console.error('Password is required.');
  process.exit(1);
}

// Start OIDC auth flow
// CommonJS on purpose: these scripts are transpiled to CJS and run on Node 18,
// which refuses require() of an ES module -- and the transform turns every
// import form, dynamic ones included, into require().
const { selectedIdp, trexSetupBearer, readServiceRoleKey } = require('./lib/idp-login.cjs');

let BEARER_TOKEN;

if (selectedIdp() === 'trex') {
  BEARER_TOKEN = await trexSetupBearer({
    gateway: `https://${CADDY__D2E__PUBLIC_FQDN}`,
    email: process.env.D2E__SETUP_USER || 'd2e-setup@d2e.local',
    password: process.env.D2E__SETUP_PASSWORD || 'D2e-Setup-Passw0rd!',
    clientId: process.env.TREX__OIDC__WEBAPI_CLIENT_ID || 'd2e-webapi',
    clientSecret: process.env.TREX__OIDC__WEBAPI_CLIENT_SECRET,
    serviceRoleKey: process.env.TREX__SERVICE_ROLE_KEY || readServiceRoleKey(),
  });
} else {
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/oidc/auth?redirect_uri=https://${CADDY__D2E__PUBLIC_FQDN}/d2e/portal/login-callback&client_id=${app_client_id}&response_type=code&state=lbFDB1hcko&scope=openid%20offline_access%20profile%20email&nonce=Osptnuwqc47w&code_challenge=n6eqz8p8jj1L9Qu7pY2_GrWO7XyaQbWrcs54x9OAnPg&code_challenge_method=S256`;
  var response = await fetch(url, {
    method: "GET",
    dispatcher: insecureAgent,
    redirect: 'manual',
  });
  var setCookieHeaders = response.headers.getSetCookie();
  var interaction_cookie = getCookie(setCookieHeaders, '_interaction');
  var interaction_sig_cookie = getCookie(setCookieHeaders, '_interaction.sig');
  var interaction_resume_cookie = getCookie(setCookieHeaders, '_interaction_resume');
  var interaction_resume_sig_cookie = getCookie(setCookieHeaders, '_interaction_resume.sig');
  var logto_cookie = getCookie(setCookieHeaders, '_logto');

  // Sign in
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/api/interaction`;
  const body = {
    event: "SignIn",
    identifier: { username, password }
  };

  var response = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "Referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
      "Cookie": `_interaction=${interaction_cookie}; ` +
                `_interaction.sig=${interaction_sig_cookie}; ` +
                 `_logto={"appId":"${app_client_id}"}; `
    },
    body: JSON.stringify(body),
    redirect: 'manual',
    dispatcher: insecureAgent
  });

  // Submit sign in page
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/api/interaction/submit`;
  var response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "Referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
      "Cookie": `_interaction=${interaction_cookie}; ` +
                `_interaction.sig=${interaction_sig_cookie}; ` +
                 `_logto=$ `
    },
    body: JSON.stringify(body),
    dispatcher: insecureAgent
  });

  // Get session
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/oidc/auth/${interaction_cookie}`;
  var response = await fetch(url, {
      method: "GET",
      headers: {
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _logto={"appId":"${app_client_id}"}`
      },
      redirect: 'manual',
      dispatcher: insecureAgent
  });

  var setCookieHeaders = response.headers.getSetCookie();
  var interaction_cookie = getCookie(setCookieHeaders, '_interaction');
  var interaction_sig_cookie = getCookie(setCookieHeaders, '_interaction.sig');
  var interaction_resume_cookie = getCookie(setCookieHeaders, '_interaction_resume');
  var interaction_resume_sig_cookie = getCookie(setCookieHeaders, '_interaction_resume.sig');
  var session_cookie = getCookie(setCookieHeaders, '_session');
  var session_sig_cookie = getCookie(setCookieHeaders, '_session.sig');

  // Submit consent page
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/consent`;
  var response = await fetch(url, {
      method: "GET",
      headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={"appId":"${app_client_id}"}`
      },
      redirect: 'manual',
      dispatcher: insecureAgent
  });

  // Get authorization code
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/oidc/auth/${interaction_cookie}`;
  var response = await fetch(url, {
      method: "GET",
      headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={"appId":"${app_client_id}"}`
      },
      dispatcher: insecureAgent,
      redirect: 'manual',
  });

  const authCodeLocation = await response.text();
  const authorization_code = extractAuthCode(authCodeLocation || '');

  // Complete Login
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/portal/login-callback?code=${authorization_code}&state=lbFDB1hcko&iss=https%3A%2F%2Flocalhost%3A41100%2Foidc`;
  var response = await fetch(url, {
      method: "GET",
      headers: {
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={"appId":"${app_client_id}"}`
      },
      redirect: 'manual',
      dispatcher: insecureAgent
  });

  // Get Bearer token
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/oauth/token`;
  var params = new URLSearchParams();
  params.append('grant_type', 'authorization_code');
  params.append('client_id', app_client_id);
  params.append('redirect_uri', `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/portal/login-callback`);
  params.append('code', authorization_code);
  params.append('code_verifier', 'kqVLhCyXRJ3Y9mXie6F9d1FW8AUbTUzIuJiqUf1SM9I');
  var response = await fetch(url, {
      method: "POST",
      headers: {
          "accept": "application/json, text/javascript, */*; q=0.01",
          "content-type": "application/x-www-form-urlencoded",
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={"appId":"${app_client_id}"}`,
          "origin": `https://${CADDY__D2E__PUBLIC_FQDN}`,
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/portal/login-callback`
      },
      body: params,
      dispatcher: insecureAgent
  });
  const tokenResponse = await response.json();
  BEARER_TOKEN = tokenResponse.access_token;
}


if (!BEARER_TOKEN) {
  console.error('Failed to obtain bearer token. Authentication failed.');
  process.exit(1);
}

// Call sync-roles-to-logto endpoint
console.log('Calling sync-roles-to-logto endpoint...\n');
var url = `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/usermgmt/api/user-group/sync-roles-to-logto`;
var response = await fetch(url, {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${BEARER_TOKEN}`,
        "content-type": "application/json"
    },
    dispatcher: insecureAgent
});

if (!response.ok) {
  const errorText = await response.text();
  console.error(`Sync failed with status ${response.status}: ${errorText}`);
  process.exit(1);
}

const result = await response.json();
console.log('Sync results:');
console.log(`  Total role assignments: ${result.total}`);
console.log(`  Synced:  ${result.synced}`);
console.log(`  Skipped: ${result.skipped}`);
console.log(`  Failed:  ${result.failed}`);

if (result.skips && result.skips.length > 0) {
  console.log('\nSkipped:');
  for (const s of result.skips) {
    console.log(`  User ${s.username} (${s.userId}): ${s.reason}`);
  }
}

if (result.failures && result.failures.length > 0) {
  console.log('\nFailures:');
  for (const f of result.failures) {
    console.log(`  User ${f.username} (${f.userId}): ${f.error}`);
  }
  console.log('\nRe-run this command to retry failed users.');
  process.exit(1);
} else {
  // Set USER_MGMT__ROLE_SOURCE=logto in the env file
  const envContent = await fs.readFile(envfile, 'utf-8');
  const roleSourceRegex = /^USER_MGMT__ROLE_SOURCE=.*$/m;
  let updatedContent;
  if (roleSourceRegex.test(envContent)) {
    updatedContent = envContent.replace(roleSourceRegex, 'USER_MGMT__ROLE_SOURCE=logto');
  } else {
    updatedContent = envContent.trimEnd() + '\nUSER_MGMT__ROLE_SOURCE=logto\n';
  }
  await fs.writeFile(envfile, updatedContent);
  console.log(`\nAll roles synced successfully. Set USER_MGMT__ROLE_SOURCE=logto in ${envfile}`);
}
