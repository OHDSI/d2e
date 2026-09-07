#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const args = process.argv.slice(2);
const vIndex_nodeModulesPath = args.indexOf("-p");
let nodeModulesPath;
if (vIndex_nodeModulesPath !== -1 && !args[vIndex_nodeModulesPath + 1].startsWith("-")) {
  nodeModulesPath = args[vIndex_nodeModulesPath + 1];
} else {
  nodeModulesPath = ".";
}
console.log(`Using node_modules path: ${nodeModulesPath}`);

let dockerConfigPath;
if (process.env.DOCKER_CONFIG_PATH) {
  dockerConfigPath = process.env.DOCKER_CONFIG_PATH;
} else if (fs.existsSync(`${process.env.HOME}/.docker/config.json`)) {
  dockerConfigPath = `${process.env.HOME}/.docker/config.json`;
} else {
  console.log("Can't find Docker config path. You can set DOCKER_CONFIG_PATH to define the path or create the config.json file. Exiting");
  process.exit(1);
}
console.log(`Using docker config at: ${dockerConfigPath}`);

const dockerComposePath = path.join(nodeModulesPath, 'docker-compose.yml');
let composeFile;
if (fs.existsSync(dockerComposePath)) {
  console.log(`Found docker-compose.yml at: ${dockerComposePath}`);
  composeFile = dockerComposePath;
} else {
  console.log(`No docker-compose.yml found at: ${dockerComposePath}`);
  process.exit(1);
}

const dcConfigOutput = execSync(
  `docker compose -f ${composeFile} --profile "*" config --format json 2>/dev/null`,
  { encoding: 'utf-8' }
);
const dcContainerName = JSON.parse(dcConfigOutput);

const containerNames = Object.values(dcContainerName.services || {})
  .map(service => service.container_name)
  .filter(name => name && name !== null)
  .join(',');

// Read the internal domain rather than hardcoding it: a deployment that
// overrides TLS__INTERNAL__DOMAIN is exactly the one that would otherwise lose
// NO_PROXY coverage and start routing every internal call through the proxy.
const internalDomain = process.env.TLS__INTERNAL__DOMAIN || 'd2e.local';
let newNoProxy = `.${internalDomain},registry-1.docker.io,localhost,::1,${containerNames}`;
let newHttpProxy = process.env.HTTP_PROXY || '';
let newHttpsProxy = process.env.HTTPS_PROXY || '';

let dockerConfig = {};
if (fs.existsSync(dockerConfigPath)) {
  dockerConfig = JSON.parse(fs.readFileSync(dockerConfigPath, 'utf-8'));
}

dockerConfig.proxies = dockerConfig.proxies || {};
dockerConfig.proxies.default = dockerConfig.proxies.default || {};
dockerConfig.proxies.default.httpProxy = [dockerConfig.proxies.default.httpProxy, newHttpProxy].filter(Boolean).join(',');
dockerConfig.proxies.default.httpsProxy = [dockerConfig.proxies.default.httpsProxy, newHttpsProxy].filter(Boolean).join(',');
dockerConfig.proxies.default.noProxy = [dockerConfig.proxies.default.noProxy, newNoProxy].filter(Boolean).join(',');

console.log(`New docker config to update:\n${JSON.stringify(dockerConfig, null, 2)}`);
