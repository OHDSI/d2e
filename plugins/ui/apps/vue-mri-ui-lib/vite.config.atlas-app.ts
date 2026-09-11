import { defineConfig } from 'vite'
import type { PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import path from 'path'
import { copyFileSync, mkdirSync, readdirSync } from 'fs'
import { vueDir, vuetifyDir } from './vite.resolve-deps'

// The d4l web components use Stencil lazy loading: entry chunks are resolved at
// runtime relative to the importing chunk's URL, invisible to Rollup's static
// analysis. Ship the whole esm dist (loader, runtime, entry chunks, polyfills)
// next to the emitted chunks; src/bootstrap/d4lLoaderNativeEsm.ts loads the
// loader from there so only one Stencil runtime instance exists.
function copyD4lStencilChunks(): PluginOption {
  return {
    name: 'copy-d4l-stencil-chunks',
    closeBundle() {
      const src = path.resolve(__dirname, 'node_modules/@d4l/web-components-library/dist/esm')
      const dest = path.resolve(__dirname, 'dist-atlas/app/js')
      for (const sub of ['', 'polyfills']) {
        mkdirSync(path.join(dest, sub), { recursive: true })
        for (const f of readdirSync(path.join(src, sub))) {
          if (f.endsWith('.js')) copyFileSync(path.join(src, sub, f), path.join(dest, sub, f))
        }
      }
    },
  }
}

// Standalone PA app for the Atlas3 shell, hosted in an iframe at
// /atlas/plugins/patient-analytics/app/atlas-iframe.html. Regular app build
// (not lib mode) with relative base so assets resolve under the plugin dir.
// Styles load unscoped, exactly as in the portal — the iframe isolates them.
export default defineConfig({
  base: './',

  plugins: [
    copyD4lStencilChunks(),
    vue({
      template: {
        transformAssetUrls,
        compilerOptions: {
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

  envPrefix: 'VITE_',

  define: {
    __VUE_OPTIONS_API__: JSON.stringify(true),
    __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
    __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
    'import.meta.env.VITE_STANDALONE_ATLAS': JSON.stringify('false'),
    'process.env.NODE_ENV': JSON.stringify('production'),
    'process.env.VUE_APP_API_BASE_URL': JSON.stringify(''),
    'process.env': JSON.stringify({}),
    process: JSON.stringify({ env: { NODE_ENV: 'production' } }),
  },

  resolve: {
    alias: [
      {
        find: '@d4l/web-components-library/dist/loader',
        replacement: path.resolve(__dirname, 'src/bootstrap/d4lLoaderNativeEsm.ts'),
      },
      // @d2e/ui is private and unpublished, so the CI atlas build (npm install
      // --workspaces=false) cannot resolve it from the registry. Source-export it
      // from the lib and keep vue/vuetify on the app's installed copy so the
      // library's own bare imports resolve during the isolated install.
      { find: '@d2e/ui/tokens.css', replacement: path.resolve(__dirname, '../../libs/d2e-ui/src/tokens/tokens.css') },
      { find: '@d2e/ui', replacement: path.resolve(__dirname, '../../libs/d2e-ui/src/index.ts') },
      { find: 'vue', replacement: vueDir },
      { find: 'vuetify/styles', replacement: path.join(vuetifyDir, 'lib/styles/main.css') },
      {
        find: /^vuetify\/(components|directives)(\/(.+))?$/,
        replacement: path.join(vuetifyDir, 'lib/$1$2'),
      },
      { find: /^vuetify$/, replacement: path.join(vuetifyDir, 'lib/framework.js') },
      { find: 'd3', replacement: path.resolve(__dirname, './src/lib/d3.ts') },
      { find: '@', replacement: path.resolve(__dirname, './src') },
    ],
  },

  css: {
    postcss: {
      plugins: [
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
        api: 'modern-compiler',
        quietDeps: true,
        silenceDeprecations: ['import'],
      } as Record<string, unknown>,
    },
  },

  publicDir: false,

  build: {
    outDir: path.resolve(__dirname, 'dist-atlas/app'),
    emptyOutDir: true,
    sourcemap: false,
    minify: true,
    rollupOptions: {
      input: path.resolve(__dirname, 'atlas-iframe.html'),
      output: {
        chunkFileNames: 'js/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
})
