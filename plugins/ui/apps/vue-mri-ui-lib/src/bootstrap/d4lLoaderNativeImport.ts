/**
 * Build-time alias target for '@d4l/web-components-library/dist/loader' in the
 * native Atlas3 plugin build (vite.config.atlas-native.ts).
 *
 * Same role as d4lLoaderNativeEsm.ts, but Rollup's system output format rewrites
 * import() to context.import() (SystemJS), and SystemJS evaluates the ESM loader
 * as a classic script, which fails with "Unexpected token 'export'". Forcing a
 * native dynamic import keeps the browser module loader on the job; the d4l esm
 * files stay un-bundled next to index.system.js so there is exactly one Stencil
 * runtime instance.
 */

const nativeImport = (url: string): Promise<any> =>
  (new Function('u', 'return import(u)') as (u: string) => Promise<any>)(url)

const runtimeImport = (relative: string): Promise<any> => nativeImport(new URL(relative, import.meta.url).href)

export const applyPolyfills = async (): Promise<unknown> => {
  const mod = await runtimeImport('./polyfills/index.js')
  return mod.applyPolyfills()
}

export const defineCustomElements = async (win?: Window, options?: unknown): Promise<unknown> => {
  const mod = await runtimeImport('./loader.js')
  return mod.defineCustomElements(win, options)
}
