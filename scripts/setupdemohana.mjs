#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from "node:fs/promises";
import { Agent, fetch } from "undici";
import * as crypto from 'crypto';
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
const public_key = process.env.DB_CREDENTIALS__INTERNAL__PUBLIC_KEY;
let public_fqdn = process.env.CADDY__D2E__PUBLIC_FQDN || process.env.CADDY__ALP__PUBLIC_FQDN || "localhost";
let port = process.env.PORT ? `:${process.env.PORT}` : ":443";
let CADDY__D2E__PUBLIC_FQDN = `${public_fqdn}${port}`;
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });
const HANA_SYSTEM_PASSWORD = process.env.HANA_SYSTEM_PASSWORD;

// CommonJS on purpose: these scripts are transpiled to CJS and run on Node 18,
// which refuses require() of an ES module -- and the transform turns every
// import form, dynamic ones included, into require().
const { selectedIdp, trexSetupBearer, readServiceRoleKey } = require('./lib/idp-login.cjs');
const { resolveInitialUserId } = require('./lib/seed-user.cjs');

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
  var url= `https://${CADDY__D2E__PUBLIC_FQDN}/oidc/auth?redirect_uri=https://${CADDY__D2E__PUBLIC_FQDN}/d2e/portal/login-callback&client_id=${app_client_id}&response_type=code&state=lbFDB1hcko&scope=openid%20offline_access%20profile%20email&nonce=Osptnuwqc47w&code_challenge=n6eqz8p8jj1L9Qu7pY2_GrWO7XyaQbWrcs54x9OAnPg&code_challenge_method=S256`
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
  var logtoObj = JSON.parse(logto_cookie);
  var appId = logtoObj.appId;

  // Sign in
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/api/interaction`;
  const body = {
    event: "SignIn",
    identifier: {
      username: "admin",
      password: "Updatepassword12345"
    }
  };

  var response = await fetch(url, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "Referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
      "Cookie": `_interaction=${interaction_cookie}; ` +
                `_interaction.sig=${interaction_sig_cookie}; ` +
                 `_logto={\"appId\":\"${app_client_id}\"}; `
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
  var text = await response.text();

  // Get session
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/oidc/auth/${interaction_cookie}`;
  var response = await fetch(url, {
      method: "GET",
      headers: {
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _logto={\"appId\":\"${app_client_id}\"}`
      },
      redirect: 'manual',
      dispatcher: insecureAgent  
  });

  var setCookieHeaders = response.headers.getSetCookie();
  var interaction_cookie = getCookie(setCookieHeaders, '_interaction');
  var interaction_sig_cookie = getCookie(setCookieHeaders, '_interaction.sig');
  var interaction_resume_cookie = getCookie(setCookieHeaders, '_interaction_resume');
  var interaction_resume_sig_cookie = getCookie(setCookieHeaders, '_interaction_resume.sig');
  var logto_cookie = getCookie(setCookieHeaders, '_logto');
  var session_cookie = getCookie(setCookieHeaders, '_session');
  var session_sig_cookie = getCookie(setCookieHeaders, '_session.sig');

  //Submit consent page
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/consent`;
  var response = await fetch(url, {
      method: "GET",
      headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={\"appId\":\"${app_client_id}\"}`
      },
      redirect: 'manual',
      dispatcher: insecureAgent
  });

  //Get authorization code
  var url = `https://${CADDY__D2E__PUBLIC_FQDN}/oidc/auth/${interaction_cookie}`;
  var response = await fetch(url, {
      method: "GET",
      headers: {
          "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={\"appId\":\"${app_client_id}\"}`
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
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={\"appId\":\"${app_client_id}\"}`
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
          "Cookie": `_interaction=${interaction_cookie}; _interaction.sig=${interaction_sig_cookie}; _interaction_resume=${interaction_resume_cookie}; _interaction_resume.sig=${interaction_resume_sig_cookie}; _session=${session_cookie}; _session.sig=${session_sig_cookie}; _logto={\"appId\":\"${app_client_id}\"}`,
          "origin": `https://${CADDY__D2E__PUBLIC_FQDN}`,
          "referer": `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/portal/login-callback?code=2sxkx6uCahwOfKo1cwzLaAq5MfdBJrMcqCLNHvOTXFv&state=odSrnZhVyE&iss=https%3A%2F%2Flocalhost%3A%2F41100%2Foidc`
      },
      body: params,
      dispatcher: insecureAgent   
  });
  const tokenResponse = await response.json();
  BEARER_TOKEN = tokenResponse.access_token;
}



async function createCredentials (password, public_key) {
    try {
        var salt = crypto.randomBytes(16).toString('base64');
        var passwordSalt = password.concat(salt);
        var encryptedCredential = crypto.publicEncrypt({
            key: public_key,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: "sha256",
            passphrase:`${process.env.DB_CREDENTIALS__INTERNAL__PRIVATE_KEY_PASSPHRASE}`
        },Buffer.from(passwordSalt));
        return [encryptedCredential.toString("base64"),salt];
    } catch (error) {
        console.log('Error in creating credentials');
        console.error(error);
        process.exit(1);
    }
}; 

let [encryptedCredentialsHanaRead, saltHanaRead] = await createCredentials(HANA_SYSTEM_PASSWORD, public_key);
let [encryptedCredentialsHanaAdmin, saltHanaAdmin] = await createCredentials(HANA_SYSTEM_PASSWORD, public_key); 

// Setup demo dataset hana
const encryptionKeysObjDb = {
    id: "demo_database_hana",
    host: "hana",
    port: 39041,
    code: "demo_database_hana",
    name: "HXE",
    dialect: "hana",
    authenticationMode: "Password",
    extra: {
    "Internal": {
        "Internal": {
            "schema": "CDMSYNPUF5PCT",
            "useTLS": false,
            "encrypt": false,
            "pooling": true,
            "autoCommit": true,
            "probeSchema": "TEST",
            "vocabSchema": "TEST",
            "enableAuditPolicies": true,
            "validateCertificate": false,
            "hostnameInCertificate": "hana"

        }
    }
},
    credentials: [
        {
            "username": "SYSTEM",
            "password": encryptedCredentialsHanaAdmin,
            "salt": saltHanaAdmin,
            "userScope": "Admin",
            "serviceScope": "Internal"
        },
        {
            "username": "SYSTEM",
            "password": encryptedCredentialsHanaRead,
            "salt": saltHanaRead,
            "userScope": "Read",
            "serviceScope": "Internal"
        }
    ],
    vocabSchemas: ["CDMVOCAB"],
    publications: [],
    DataPlatform: "",
    Internal: public_key,
};

console.log(`Initiating setup of HANA demo dataset...`);
var url = `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/trex/db/`;
var response = await fetch(url, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify(encryptionKeysObjDb),
    dispatcher: insecureAgent   
});

var resp = await response.json();
try { 
    const hana_db = resp.id;
    if (hana_db === "demo_database_hana") {
        console.log(`HANA demo dataset setup initiated successfully.`);
    } else {
        console.log(`Failed to initiate HANA demo dataset setup.`);
    }
} catch (err) { 
    console.log(`Failed to initiate HANA demo dataset setup.`);
    console.error(err);
    process.exit(1);
}

console.log(`Adding hana dataset...`);
let encryptionKeysObjDataset = {
    tenantId: "e0348e4d-2e17-43f2-a3c6-efd752d17c23",
    detail: {
        "name": "Demo dataset HANA",
        "summary": "",
        "description": "",
        "showRequestAccess": false
    },
    type: "hana__omop",
    tokenStudyCode: "demohana",
    schemaOption: "create_cdm",
    cdmSchemaValue: "",
    vocabSchemaValue: "",
    resultsSchemaValue: "cdmdemohana",
    dataModel: "omop5-3",
    plugin: "hana_load_plugin",
    databaseCode: "demo_database_hana",
    dialect: "hana",
    paConfigId: "92d7c6f8-3118-4256-ab22-f2f7fd19d4e7",
    visibilityStatus: "DEFAULT",
    attributes: [],
    tags: [],
    dashboards: [],
    cacheDatasetName: "",
    cacheDatasetType: "omop"
};


var url = `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/gateway/api/dataset`;
var response = await fetch(url, {
    method: "POST",
    headers: {
        "content-type": "application/json",
        "Authorization": `Bearer ${BEARER_TOKEN}`
    },
    body: JSON.stringify(encryptionKeysObjDataset),
    dispatcher: insecureAgent
});

var resp = await response.json();
if (resp.id !== undefined) {
    console.log(`HANA demo dataset added successfully.`);
    var url = `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/system-portal/dataset/list/systemadmin`;
    var response = await fetch(url, {
        method: "GET",
        headers: {
            "content-type": "application/x-www-form-urlencoded",  
            "Authorization": `Bearer ${BEARER_TOKEN}`
        },
        dispatcher: insecureAgent
    });
    var resp = await response.json();
    for (var i = 0; i < resp.length; i++) {
        var data = resp[i];
        var databaseName = data['databaseName'];
        var studyName = data['studyDetail']['name'];
        if (databaseName == "demo_database_hana" && studyName == "Demo dataset HANA") {
            var studyId = data['id'];
            var tenantId = data['tenant']['id'];
        }
    }
    var url = `https://${CADDY__D2E__PUBLIC_FQDN}/d2e/usermgmt/api/user-group/register-study-roles`;
    var bodyObj = {
        userIds: [await resolveInitialUserId({ gateway: CADDY__D2E__PUBLIC_FQDN, bearerToken: BEARER_TOKEN, dispatcher: insecureAgent })],
        tenantId: tenantId,
        studyId: studyId,
        roles: ["RESEARCHER"]
    };
    var response = await fetch(url, {
        method: "POST",
        headers: {
            "Referer": `https://${CADDY__D2E__PUBLIC_FQDN}/sign-in`,
            "client_id": app_client_id,
            "Content-Type": "application/json",
            "Authorization": `Bearer ${BEARER_TOKEN}`
        },
        body: JSON.stringify(bodyObj), 
        dispatcher: insecureAgent
    });
    console.log('Completed adding admin user access permissions to demo dataset.');
} else {
    console.log(`Failed to add HANA demo dataset.`);
    process.exit(1);
}