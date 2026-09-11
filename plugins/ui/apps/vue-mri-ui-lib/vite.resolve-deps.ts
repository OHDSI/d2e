import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import path from 'path'

const require = createRequire(path.join(__dirname, 'vite.resolve-deps.ts'))

/**
 * Resolve a package's directory wherever it actually installed.
 *
 * `vue` and `vuetify` land app-locally under the isolated atlas build
 * (`npm install --workspaces=false`) but are hoisted to
 * `plugins/ui/node_modules` by the bun workspace install that CI and local
 * development use. Hardcoding `<app>/node_modules/<pkg>` therefore builds
 * fine in the atlas job and fails everywhere else with ENOENT.
 */
function packageDir(name: string): string {
  try {
    return path.dirname(require.resolve(`${name}/package.json`))
  } catch {
    const appLocal = path.resolve(__dirname, 'node_modules', name)
    if (existsSync(appLocal)) return appLocal
    throw new Error(
      `vite.resolve-deps: cannot resolve "${name}" from ${__dirname}. ` +
        'Run the workspace install (bun install in plugins/ui) first.'
    )
  }
}

export const vueDir = packageDir('vue')
export const vuetifyDir = packageDir('vuetify')
