#!/usr/bin/env node
/**
 * Postinstall for the Atlas3 plugin: copy the prebuilt @ohdsi/atlas3 dist into
 * resources/atlas, overlay d2e runtime config (config-local.json, plugins.json),
 * and apply d2e branding. Served as-is at /atlas; no Atlas3 source changes.
 */

import { cpSync, mkdirSync, rmSync, existsSync, copyFileSync, readFileSync, writeFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const resourcesDir = join(rootDir, 'resources', 'atlas');
const atlasDistDir = join(rootDir, 'node_modules', '@ohdsi', 'atlas3', 'dist');

console.log('[postinstall] Setting up Atlas3 plugin resources...');

if (!existsSync(atlasDistDir)) {
  console.error('[postinstall] ERROR: @ohdsi/atlas3 dist not found at', atlasDistDir);
  console.error('[postinstall] Did the GitHub Packages install succeed? Ensure GITHUB_TOKEN is set (see .npmrc).');
  process.exit(1);
}

// Reset resources/atlas so a previous Atlas build doesn't bleed through.
rmSync(resourcesDir, { recursive: true, force: true });
mkdirSync(resourcesDir, { recursive: true });

// Copy the entire prebuilt Atlas3 dist (index.html, assets/, vendor/, config/, ...).
console.log('[postinstall] Copying @ohdsi/atlas3 dist to resources/atlas...');
cpSync(atlasDistDir, resourcesDir, { recursive: true });

// @ohdsi/atlas3 dist omits the single-spa + React UMD files its index.html loads
// to register the plugin runtime; supply them from node_modules.
const vendorDir = join(resourcesDir, 'vendor');
mkdirSync(vendorDir, { recursive: true });
const vendorFiles = [
  ['single-spa-vue/dist/system/single-spa-vue.js', 'single-spa-vue.js'],
  ['single-spa-react/lib/system/single-spa-react.js', 'single-spa-react.js'],
  ['react/umd/react.production.min.js', 'react.production.min.js'],
  ['react/umd/react.development.js', 'react.development.js'],
  ['react-dom/umd/react-dom.production.min.js', 'react-dom.production.min.js'],
  ['react-dom/umd/react-dom.development.js', 'react-dom.development.js'],
];
for (const [from, to] of vendorFiles) {
  const src = join(rootDir, 'node_modules', from);
  if (existsSync(src)) {
    copyFileSync(src, join(vendorDir, to));
  } else {
    console.warn('[postinstall] WARN: vendor file missing in node_modules:', from);
  }
}
console.log('[postinstall] Supplied single-spa/react vendor files for the Atlas3 plugin runtime');

// Atlas3's built assets are served as published. Branding comes from
// settings.theme in plugins.standalone.json (OHDSI/Atlas3#184), and the WebAPI
// fixes this file used to graft into the bundle are upstream: the cache-status
// retry and concept-set tag snapshot in OHDSI/Atlas3#183, and the bare-int tag
// body in OHDSI/trex#212, which removed the reason to rewrite the request at
// all. Nothing here depends on the minified output any more, so an atlas3 bump
// can no longer silently stop applying.

// Overlay d2e runtime config: point Atlas3 at WebAPI through d2e.
const configLocalSrc = join(rootDir, 'config-local.json');
if (!existsSync(configLocalSrc)) {
  console.error('[postinstall] ERROR: config-local.json source not found at', configLocalSrc);
  process.exit(1);
}
copyFileSync(configLocalSrc, join(resourcesDir, 'config-local.json'));
console.log('[postinstall] Wrote resources/atlas/config-local.json');

// Overlay nav/theme/header config for the standalone /atlas serve.
const pluginsConfigSrc = join(rootDir, 'plugins.standalone.json');
if (existsSync(pluginsConfigSrc)) {
  mkdirSync(join(resourcesDir, 'config'), { recursive: true });
  copyFileSync(pluginsConfigSrc, join(resourcesDir, 'config', 'plugins.json'));
  console.log('[postinstall] Wrote resources/atlas/config/plugins.json (from plugins.standalone.json)');
}

// Make the d2e logo referenced by the portal config available under /atlas/config.
const logoSrc = join(rootDir, 'd2e2.svg');
if (existsSync(logoSrc)) {
  mkdirSync(join(resourcesDir, 'config'), { recursive: true });
  copyFileSync(logoSrc, join(resourcesDir, 'config', 'd2e2.svg'));
}

// Make the d2e portal landing illustration (LandingView hero image) available
// under /atlas/config; see the LandingView repoint above.
const landingImageSrc = join(rootDir, 'landing-page-illustration.svg');
if (existsSync(landingImageSrc)) {
  mkdirSync(join(resourcesDir, 'config'), { recursive: true });
  copyFileSync(landingImageSrc, join(resourcesDir, 'config', 'landing-page-illustration.svg'));
} else {
  // The LandingView repoint above unconditionally points at this file, so a
  // missing source means a broken landing image — surface it loudly.
  console.warn('[postinstall] WARN: landing-page-illustration.svg missing at', landingImageSrc, '- landing image will 404');
}

// Helper scripts injected into Atlas3's index.html:
//  - login-guard.js: silent-SSO guard; runs first, blocks the WebAPI HS256 fallback.
//  - user-link.js: routes the navbar user menu to the d2e portal account page.
//  - token-keeper.js: refreshes the Logto bearerToken before expiry.
//  - analysis-default.js: opens the Wizard when entering the Analysis hub.
const headScripts = ['login-guard.js', 'user-link.js', 'token-keeper.js', 'analysis-default.js'];
let indexHtml = readFileSync(join(resourcesDir, 'index.html'), 'utf8');
let indexChanged = false;
for (const script of headScripts) {
  const src = join(rootDir, 'token-keeper', script);
  if (!existsSync(src)) continue;
  copyFileSync(src, join(resourcesDir, script));
  if (!indexHtml.includes(script)) {
    indexHtml = indexHtml.replace('</head>', `    <script src="./${script}"></script>\n  </head>`);
    indexChanged = true;
  }
}
if (indexChanged) writeFileSync(join(resourcesDir, 'index.html'), indexHtml);
console.log('[postinstall] Injected helper scripts into Atlas3 index.html');

// Portal resources directory (for the /atlas-portal iframe wrapper build).
mkdirSync(join(rootDir, 'resources', 'portal'), { recursive: true });

// Standalone login bridge (served at /atlas-login): copy the static page that
// performs a Logto OIDC login and seeds localStorage.bearerToken for Atlas3.
const loginSrc = join(rootDir, 'login-bridge');
const loginDest = join(rootDir, 'resources', 'login');
if (existsSync(loginSrc)) {
  rmSync(loginDest, { recursive: true, force: true });
  mkdirSync(loginDest, { recursive: true });
  cpSync(loginSrc, loginDest, { recursive: true });
  console.log('[postinstall] Copied login bridge to resources/login');
}

// Table-driven plugin loader: copy each published SystemJS plugin's dist into
// resources/atlas/plugins/<id>/ and apply any endpoint repoints. Mirrors how
// @ohdsi/atlas3 itself is staged; see plugins.standalone.json for registration.
const PLUGINS = [
  {
    pkg: '@ohdsi/pythia-plugin',
    id: 'pythia-plugin',
    // Point the chat endpoint at the agent fn served by trex at /d2e/agent.
    repoints: [['/WebAPI/trexsql/agent', '/d2e/agent']],
  },
  {
    pkg: '@ohdsi/results-viewer',
    id: 'results-viewer',
    repoints: [],
  },
  { pkg: '@ohdsi/strategus-plugin', id: 'strategus-plugin', repoints: [] },
  { pkg: '@ohdsi/notebook-plugin', id: 'notebook-plugin', repoints: [] },
  { pkg: '@ohdsi/network-plugin', id: 'network-plugin', repoints: [] },
  { pkg: '@ohdsi/studies-plugin', id: 'studies-plugin', repoints: [] },
  { pkg: '@data2evidence/atlas-data-quality', id: 'data-quality', repoints: [] },
];

for (const { pkg, id, repoints } of PLUGINS) {
  const src = join(rootDir, 'node_modules', ...pkg.split('/'), 'dist');
  const dest = join(resourcesDir, 'plugins', id);
  if (!existsSync(src)) {
    console.warn(`[postinstall] WARN: ${pkg} dist not found at ${src}; skipping ${id}`);
    continue;
  }
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  cpSync(src, dest, { recursive: true });
  const entry = join(dest, 'index.system.js');
  if (repoints.length && existsSync(entry)) {
    let js = readFileSync(entry, 'utf8');
    let changed = false;
    for (const [from, to] of repoints) {
      if (js.includes(from)) { js = js.split(from).join(to); changed = true; }
    }
    if (changed) {
      writeFileSync(entry, js);
      console.log(`[postinstall] Applied repoints for ${id}: ${repoints.map(([f, t]) => `${f}->${t}`).join(', ')}`);
    }
  }
  console.log(`[postinstall] Served ${id} at /atlas/plugins/${id}`);
}

console.log('[postinstall] Atlas3 plugin setup complete!');
