import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import path from 'path'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { createRequire } from 'module'

// The d4l web components use Stencil lazy loading: entry chunks are resolved at
// runtime relative to the importing chunk's URL, invisible to Rollup's static
// analysis. Here the importing chunk is the single entry index.system.js at the
// output root, so ship the whole esm dist (loader, runtime, entry chunks,
// polyfills) at the output root; src/bootstrap/d4lLoaderNativeImport.ts loads
// the loader from there with a native dynamic import (Rollup's system format
// rewrites import() to context.import(), and SystemJS cannot evaluate the ESM
// loader), so only one Stencil runtime instance exists.
// The package location is resolved through createRequire because bun hoists
// workspace deps to plugins/ui/node_modules instead of the app folder.
function copyD4lStencilChunks(): PluginOption {
  return {
    name: 'copy-d4l-stencil-chunks',
    closeBundle() {
      const require = createRequire(import.meta.url)
      const d4lPkg = require.resolve('@d4l/web-components-library/package.json')
      const src = path.join(path.dirname(d4lPkg), 'dist/esm')
      const dest = path.resolve(__dirname, 'dist-atlas-native')
      for (const sub of ['', 'polyfills']) {
        mkdirSync(path.join(dest, sub), { recursive: true })
        for (const f of readdirSync(path.join(src, sub))) {
          if (f.endsWith('.js')) copyFileSync(path.join(src, sub, f), path.join(dest, sub, f))
        }
      }
    },
  }
}

// Native Atlas3 single-spa plugin build for Patient Analytics (no iframe).
// Lib mode, SystemJS format, single entry index.system.js, styles injected
// into the host document head at runtime. Build-relevant parts are cloned
// from vite.config.ts; the d4l loader alias and chunk staging follow the
// proven pattern from vite.config.atlas-app.ts, adapted to the output root.
export default defineConfig({
  base: '',
  logLevel: 'info',

  plugins: [
    copyD4lStencilChunks(),
    cssInjectedByJsPlugin(),
    vue({
      template: {
        transformAssetUrls,
        compilerOptions: {
          // Custom element support for d4l web components
          isCustomElement: tag => tag.startsWith('d4l-'),
        },
      },
    }),
    vuetify({
      autoImport: true,
      styles: {
        configFile: 'src/styles/vuetify-settings.scss',
      },
    }),
  ] as PluginOption[],

  // Expose VITE_ prefixed env variables to the client
  envPrefix: 'VITE_',

  define: {
    // Vue feature flags (matching webpack DefinePlugin)
    __VUE_OPTIONS_API__: JSON.stringify(true),
    __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
    'import.meta.env.VITE_STANDALONE_ATLAS': JSON.stringify('false'),
    // Process env replacements (lightweight alternative to vite-plugin-node-polyfills)
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.VUE_APP_API_BASE_URL': JSON.stringify(''),
    // Global process object shim for libraries that check process.env or process directly
    'process.env': JSON.stringify({}),
    // Some libraries check `process` directly (not just process.env)
    process: JSON.stringify({ env: { NODE_ENV: 'production' } }),
  },

  resolve: {
    alias: {
      // Load the d4l loader from the un-bundled Stencil esm files staged next
      // to index.system.js (see copyD4lStencilChunks above)
      '@d4l/web-components-library/dist/loader': path.resolve(__dirname, 'src/bootstrap/d4lLoaderNativeImport.ts'),
      '@': path.resolve(__dirname, './src'),
      // Dedupe Vue to prevent multiple instances (matching webpack alias)
      vue: path.resolve(__dirname, 'node_modules/vue'),
      // D3 v3 wrapper - provides access to window.d3 (loaded from public/vendor)
      d3: path.resolve(__dirname, './src/lib/d3.ts'),
    },
  },

  css: {
    postcss: {
      plugins: [
        // Remove deprecated `color-adjust` property from third-party CSS.
        // These files already include `print-color-adjust` alongside it, so removing is safe.
        {
          postcssPlugin: 'remove-color-adjust',
          Declaration: {
            'color-adjust': decl => {
              decl.remove()
            },
          },
        },
      ],
    },
    preprocessorOptions: {
      scss: {
        // Use modern-compiler API for better performance with sass
        api: 'modern-compiler',
        quietDeps: true,
        // Bootstrap scoping in style.scss requires nested @import which cannot use @use
        silenceDeprecations: ['import'],
      } as Record<string, unknown>,
    },
  },

  publicDir: false,

  build: {
    outDir: path.resolve(__dirname, 'dist-atlas-native'),
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    lib: {
      entry: path.resolve(__dirname, 'src/atlas-lifecycles.ts'),
      fileName: () => 'index.system.js',
      formats: ['system'],
    },
    rollupOptions: {
      // import-map-overrides is provided by portal, don't bundle it
      external: ['import-map-overrides'],
      output: {
        // Map externals to global variables
        globals: {
          'import-map-overrides': 'importMapOverrides',
        },
        entryFileNames: 'index.system.js',
      },
    },
  },
})
