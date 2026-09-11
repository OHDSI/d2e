import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// The explorer sub-project works only while it stays outside the bun
// workspace, and it is honest only while its vue and vuetify agree with the
// application. Both properties are silent when they break, so assert them.

const libRoot = fileURLToPath(new URL("../../", import.meta.url));

function readManifest(relativePath: string): Record<string, any> {
  return JSON.parse(readFileSync(resolve(libRoot, relativePath), "utf8"));
}

const workspace = readManifest("../../package.json");
const library = readManifest("package.json");
const explorer = readManifest("explorer/package.json");
const app = readManifest("../../apps/vue-mri-ui-lib/package.json");

const minorOf = (range: string): string =>
  range
    .replace(/^[^\d]*/, "")
    .split(".")
    .slice(0, 2)
    .join(".");

describe("explorer stays outside the workspace", () => {
  it("keeps the workspace globs one level deep", () => {
    // A deeper glob such as `libs/**` pulls explorer/ into the workspace. It
    // then inherits overrides.vite and Histoire stops working.
    expect(workspace.workspaces).toEqual(["libs/*", "apps/*"]);
  });

  it("keeps the workspace on vite 6 and the explorer on vite 7", () => {
    expect(workspace.overrides.vite).toMatch(/^6\./);
    expect(explorer.devDependencies.vite).toMatch(/^7\./);
  });
});

describe("explorer matches the application", () => {
  it("uses the same vuetify version", () => {
    const versions = [
      app.dependencies.vuetify,
      library.devDependencies.vuetify,
      explorer.devDependencies.vuetify,
    ];
    expect(new Set(versions).size).toBe(1);
  });

  it("uses the same vue minor version as the application", () => {
    expect(minorOf(explorer.devDependencies.vue)).toBe(
      minorOf(app.dependencies.vue),
    );
  });

  it("satisfies the library peer ranges", () => {
    expect(library.peerDependencies.vue).toMatch(/^\^3\.5/);
    expect(minorOf(explorer.devDependencies.vue)).toMatch(/^3\.5/);
    expect(minorOf(app.dependencies.vue)).toMatch(/^3\.5/);
  });
});
