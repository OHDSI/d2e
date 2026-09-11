import { readFileSync, writeFileSync, mkdirSync, unlinkSync, readdirSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const content = readFileSync(join(__dirname, "../docker-compose.yml"), "utf8");

// Bundle the atlas-db-init SQL scripts so the distributed CLI can stage them
// next to the embedded compose file. trex bind-mounts ./services/atlas-db-init
// into /usr/src/atlas-db-init, a path that only exists at repo root.
const atlasDbInitDir = join(__dirname, "../services/atlas-db-init");
const atlasDbInitScripts = Object.fromEntries(
  readdirSync(atlasDbInitDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => [f, readFileSync(join(atlasDbInitDir, f), "utf8")])
);

// Same for the notebook-schema migration plugin: trex mounts it onto its plugin
// path, so an unstaged mount would leave an empty plugin directory behind.
const notebookDir = join(__dirname, "../services/trex/migrations/notebook");
const notebookSchemaFiles = {
  "package.json": readFileSync(join(notebookDir, "package.json"), "utf8"),
  ...Object.fromEntries(
    readdirSync(join(notebookDir, "migrations"))
      .filter((f) => f.endsWith(".sql"))
      .sort()
      .map((f) => [
        `migrations/${f}`,
        readFileSync(join(notebookDir, "migrations", f), "utf8"),
      ])
  ),
};

writeFileSync(
  join(__dirname, "docker-compose-embed.ts"),
  `export const dockerComposeContent = ${JSON.stringify(content)};\n` +
    `export const atlasDbInitScripts: Record<string, string> = ${JSON.stringify(
      atlasDbInitScripts
    )};\n` +
    `export const notebookSchemaFiles: Record<string, string> = ${JSON.stringify(
      notebookSchemaFiles
    )};\n`
);

const SCRIPT_MAP = {
  "setupdemo.mjs":                { fn: "setupDemo" },
  "check-setupdemo-flow.mjs":     { fn: "checkSetupDemoFlow" },
  "setuphttptestenv.mjs":         { fn: "setupHTTPTestEnv" },
  "setupdemohana.mjs":            { fn: "setupDemoHana" },
  "check-setupdemohana-flow.mjs": { fn: "checkSetupDemoHanaFlow" },
  "syncroles.mjs":                { fn: "syncRoles" },
  "get-noproxy.mjs":              { fn: "getNoProxy", paramExpr: "nodeModulesPath", argvBlock: "NOPROXY" },
  // Unlike the scripts above, this one is already a real ES module with named
  // exports (planMigration, canonicalRoleNames, runMigration) — those are unit
  // tested directly, which the wrap-into-a-function transform below would
  // break. cli.ts dynamic-imports it by path, so it only needs to sit next to
  // dist/cli.js, not be rewritten.
  "migrate-idp-roles.mjs":        { copy: true },
};

const ARGV_BLOCK =
`const args = process.argv.slice(2);
const vIndex_envfile = args.indexOf("-n");
let envfile;
if (vIndex_envfile !== -1 && !args[vIndex_envfile + 1].startsWith("-")) {
  envfile = args[vIndex_envfile + 1];
} else {
  envfile = ".env";
}`;

const NOPROXY_ARGV_BLOCK =
`const args = process.argv.slice(2);
const vIndex_nodeModulesPath = args.indexOf("-p");
let nodeModulesPath;
if (vIndex_nodeModulesPath !== -1 && !args[vIndex_nodeModulesPath + 1].startsWith("-")) {
  nodeModulesPath = args[vIndex_nodeModulesPath + 1];
} else {
  nodeModulesPath = ".";
}`;

const distDir = join(__dirname, "dist");
mkdirSync(distDir, { recursive: true });

const generatedPaths = [];

const ARGV_BLOCKS = { NOPROXY: NOPROXY_ARGV_BLOCK };

// Shared modules the scripts import at runtime. The transform below rewrites
// each script into a function but leaves its imports alone, so anything it
// imports has to exist next to the emitted file or the CLI fails at require
// time with MODULE_NOT_FOUND.
mkdirSync(join(distDir, "lib"), { recursive: true });
for (const lib of readdirSync(join(__dirname, "lib"))) {
  if (!lib.endsWith(".mjs") && !lib.endsWith(".cjs")) continue;
  writeFileSync(join(distDir, "lib", lib), readFileSync(join(__dirname, "lib", lib), "utf8"));
  console.log(`Copied lib/${lib} to dist/lib/`);
}

for (const [filename, { fn, paramExpr, argvBlock: argvBlockKey, copy }] of Object.entries(SCRIPT_MAP)) {
  const src = readFileSync(join(__dirname, filename), "utf8");

  if (copy) {
    writeFileSync(join(distDir, filename), src);
    console.log(`Copied ${filename} to dist/`);
    continue;
  }

  const block = argvBlockKey ? ARGV_BLOCKS[argvBlockKey] : ARGV_BLOCK;
  const param = paramExpr ?? 'envfile = ".env"';

  if (!src.includes(block)) {
    console.error(`embed-assets: could not find argv block in ${filename} — skipping`);
    continue;
  }

  let code = src
    .replace(/^#!.*\n/, "")                                                   // remove shebang
    .replace(block, `export async function ${fn}(${param}) {`)                // replace entry point
    .replace(/process\.exit\(1\)/g, "throw new Error('exit 1')")              // propagate errors
    .trimEnd() + "\n}\n";

  code = `// @ts-nocheck\n// Auto-generated from ${filename} — do not edit directly.\n${code}`;

  const outPath = join(distDir, filename.replace(".mjs", ".ts"));
  writeFileSync(outPath, code);
  generatedPaths.push(outPath);
  console.log(`Generated ${outPath}`);
}

if (generatedPaths.length > 0) {
  const tscExt = process.platform === "win32" ? ".cmd" : "";
  const tscBin = resolve(__dirname, `../node_modules/.bin/tsc${tscExt}`);
  execFileSync(tscBin, [
    "--module", "commonjs",
    "--esModuleInterop", "true",
    "--skipLibCheck",
    "--target", "es2019",
    "--declaration",
    "--sourceMap",
    "--outDir", distDir,
    "--rootDir", distDir,
    ...generatedPaths,
  ], { stdio: "inherit" });

  for (const p of generatedPaths) {
    unlinkSync(p);
  }
}
