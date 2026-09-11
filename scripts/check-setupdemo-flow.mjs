#!/usr/bin/env node
import dotenv from 'dotenv';
import fs from "node:fs/promises";
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
let public_fqdn = process.env.CADDY__D2E__PUBLIC_FQDN || process.env.CADDY__ALP__PUBLIC_FQDN || 'localhost';
let port = process.env.PORT ? `:${process.env.PORT}` : ':443';
let CADDY__D2E__PUBLIC_FQDN = `${public_fqdn}${port}`;
const insecureAgent = new Agent({ connect: { rejectUnauthorized: false } });

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

// Monitor Flow Runs
const start = Date.now();
const duration = 600000; // 10mins
let job_runs = '';
let num_of_jobs = 0;
try {
    var inprogress_count=1;
    while (inprogress_count>0 && Date.now() < duration + start) { 
        var progressRespObj = await fetch(`https://${CADDY__D2E__PUBLIC_FQDN}/d2e/prefect/d2e/api/flow_runs/filter`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Bearer ${BEARER_TOKEN}`
            },
            dispatcher: insecureAgent  
            
        });
        var progressResp = await progressRespObj.text();

        // Check if response is valid JSON before parsing
        let jobs;
        try {
            jobs = JSON.parse(progressResp);
        } catch (parseError) {
            console.error('Failed to parse flow runs response as JSON:', progressResp);
            console.error('Bearer token might be invalid or expired');
            process.exit(1);
        }
        num_of_jobs = jobs.length;
        job_runs = jobs.map(job => `${job.name.replace(/ /g, "_")}\t${job.state_type}`).join('\n');
        const flow_status = jobs.map(job => job.state_type);
        let lines = flow_status;
        var failed_count = lines.filter(line => line === 'FAILED' || line === 'CRASHED' || line === 'PAUSED' ).length;
        var success_count = lines.filter(line => line === 'COMPLETED' ).length;
        var cancelled_count = lines.filter(line => line === 'CANCELLED' || line === 'CANCELLING').length;
        var running_count = lines.filter(line => line === 'RUNNING').length;
        var scheduled_count = lines.filter(line => line === 'SCHEDULED' || line === 'PENDING').length;
        var inprogress_count = num_of_jobs - failed_count - success_count - cancelled_count;
        console.log(`Running jobs... Jobs status: Failed:${failed_count}, Success:${success_count}, Scheduled:${scheduled_count}, Cancelled:${cancelled_count}, Running:${running_count}`);
        await new Promise(resolve => setTimeout(resolve, 15000));
    }
} catch (error) { 
    console.error(error);
    process.exit(1)
}

const end = Date.now();
const durationMs = end - start;
const durationSec = (durationMs / 1000).toFixed(2);
console.log(`=== Summary of Job Runs ===\n${job_runs}\nTime taken: ${durationSec} seconds`);
if (success_count == num_of_jobs) { 
    console.log(`Job runs completed.`);
} else if (failed_count>0) {
    console.log(`Some job runs have failed. Please refer to the Job Runs in the Admin Portal for more info.`);
    process.exit(1)
} else {
    console.log(`Please refer to the Job Runs in the Admin Portal for more info.`)
    process.exit(1)
}
