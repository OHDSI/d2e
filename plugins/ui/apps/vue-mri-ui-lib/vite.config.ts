/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import type { PluginOption } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify, { transformAssetUrls } from 'vite-plugin-vuetify'
import basicSsl from '@vitejs/plugin-basic-ssl'
import cssInjectedByJsPlugin from 'vite-plugin-css-injected-by-js'
import path from 'path'
import { vueDir, vuetifyDir } from './vite.resolve-deps'

// https://vitejs.dev/config/
export default defineConfig(({ command, mode }) => {
  // Load env files with VITE_ prefix (Vite's default behavior)
  const env = loadEnv(mode, process.cwd(), '')
  const isProduction = mode === 'production'
  const isBuild = command === 'build'
  const isServe = command === 'serve'
  const isPreview = process.argv.includes('preview')

  // Parse navigation items for client routes (matching webpack config)
  const navigationItems = JSON.parse(env.VITE_NAVIGATION_ITEMS || '[]')
  const clientRoutes = navigationItems
    .map((item: { route?: string }) => item.route)
    .filter((route: string | undefined): route is string => !!route && route.startsWith('/'))
    .concat('/cohorts')

  if (!isProduction) {
    console.log('Mode       :', mode)
    console.log('Production :', isProduction)
    console.log('Build      :', isBuild)
    console.log('Client Routes:', clientRoutes)
    console.log('VITE_CLIENT_ID:', env.VITE_CLIENT_ID)
    console.log('VITE_REDIRECT_URL:', env.VITE_REDIRECT_URL)
  }

  const backendTarget = env.VITE_STANDALONE_ATLAS === 'true' ? 'http://localhost:3131' : 'https://localhost:41100'

  const rootProxyConfig = {
    target: backendTarget,
    changeOrigin: true,
    secure: false,
    ws: false,
    bypass: (req, _res, _options) => {
      const url = req.url || ''
      const path = url.split('?')[0] || ''
      const isAtlasAsset = path === '/atlas' || path.startsWith('/atlas/')

      if (/^\/plugins\/[^/]+\/devx-api\/apps\/[^/]+\/proxy(\/|$)/.test(path)) {
        return url
      }

      if (url.startsWith('/@') || url.startsWith('/node_modules/') || url.startsWith('/src/')) {
        return url
      }

      if (path === '/' || path === '' || path === '/index.html') {
        return url
      }

      if (isAtlasAsset) {
        return null
      }

      if (
        url.endsWith('.ico') ||
        (url.endsWith('.js') && !url.includes('/d2e/') && !url.includes('/api/')) ||
        url.endsWith('.css') ||
        url.endsWith('.png') ||
        url.endsWith('.svg') ||
        (url.endsWith('.json') && url.startsWith('/assets'))
      ) {
        return url
      }

      if (clientRoutes.some((route: string) => path.startsWith(route))) {
        return url
      }

      return null
    },
  }

  return {
    // Base path for assets (empty string matches webpack publicPath: '')
    base: '',
    logLevel: 'info',

    plugins: [
      isBuild && cssInjectedByJsPlugin(),
      vue({
        template: {
          transformAssetUrls,
          compilerOptions: {
            // Custom element support for d4l web components (matching webpack config)
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
      !isBuild &&
        basicSsl({
          name: 'vue-mri-ui-lib-localhost',
          domains: ['localhost'],
          certDir: './.devServer/cert',
        }),
      // Replace %VITE_*% placeholders in HTML with env values
      htmlEnvPlugin(env),
    ] as PluginOption[],

    // Expose VITE_ prefixed env variables to the client
    envPrefix: 'VITE_',

    define: {
      // Vue feature flags (matching webpack DefinePlugin)
      __VUE_OPTIONS_API__: JSON.stringify(true),
      __VUE_PROD_DEVTOOLS__: JSON.stringify(false),
      __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: JSON.stringify(false),
      // Process env replacements (lightweight alternative to vite-plugin-node-polyfills)
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.VUE_APP_API_BASE_URL': JSON.stringify(env.VITE_API_BASE_URL || ''),
      // Global process object shim for libraries that check process.env or process directly
      'process.env': JSON.stringify({}),
      // Some libraries check `process` directly (not just process.env)
      process: JSON.stringify({ env: { NODE_ENV: mode } }),
    },

    resolve: {
      alias: [
        // @d2e/ui is private and unpublished, so the CI atlas build (npm install
        // --workspaces=false) cannot resolve it from the registry. Source-export it
        // from the lib and keep vue/vuetify on the app's installed copy so the
        // library's own bare imports resolve during the isolated install.
        { find: '@d2e/ui/tokens.css', replacement: path.resolve(__dirname, '../../libs/d2e-ui/src/tokens/tokens.css') },
        { find: '@d2e/ui', replacement: path.resolve(__dirname, '../../libs/d2e-ui/src/index.ts') },
        // Dedupe Vue to prevent multiple instances (matching webpack alias)
        { find: 'vue', replacement: vueDir },
        // Vuetify ships its entries under lib/ and routes subpaths through its
        // exports map. Resolve the JS entries the library (and app) use to the
        // app's installed copy; leave Sass subpaths (vuetify/settings) alone so
        // the Sass node importer can find them via the package's partials.
        { find: 'vuetify/styles', replacement: path.join(vuetifyDir, 'lib/styles/main.css') },
        {
          find: /^vuetify\/(components|directives)(\/(.+))?$/,
          replacement: path.join(vuetifyDir, 'lib/$1$2'),
        },
        { find: /^vuetify$/, replacement: path.join(vuetifyDir, 'lib/framework.js') },
        // D3 v3 wrapper - provides access to window.d3 (loaded from public/vendor)
        { find: 'd3', replacement: path.resolve(__dirname, './src/lib/d3.ts') },
        // App-local imports (matching webpack alias)
        { find: '@', replacement: path.resolve(__dirname, './src') },
      ],
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

    // Public directory for static assets (favicon, authenticate.js, system.min.js, etc.)
    publicDir: 'public',

    build: {
      outDir: isProduction ? path.resolve(__dirname, '../../resources/mri') : path.resolve(__dirname, 'dist'),
      emptyOutDir: true,
      sourcemap: !isProduction, // Disable source maps in production to reduce memory usage
      minify: isProduction,
      // Copy public folder contents to outDir
      copyPublicDir: true,
      ...(isBuild
        ? {
            lib: {
              entry: path.resolve(__dirname, 'src/lifecycles.ts'),
              fileName: () => 'lifecycles.js',
              formats: ['system'] as const,
            },
          }
        : {}),
      rollupOptions: {
        // import-map-overrides is provided by portal, don't bundle it
        external: ['import-map-overrides'],
        output: {
          // Map externals to global variables
          globals: {
            'import-map-overrides': 'importMapOverrides',
          },
          entryFileNames: isBuild ? 'lifecycles.js' : 'js/[name]-[hash].js',
          chunkFileNames: 'js/[name]-[hash].js',
          assetFileNames: assetInfo => {
            const name = assetInfo.names?.[0] || assetInfo.name || ''
            if (name.endsWith('.css')) {
              return 'css/[name]-[hash][extname]'
            }
            return 'assets/[name]-[hash][extname]'
          },
        },
      },
    },

    server: {
      host: 'localhost',
      port: 8081,
      // Enable strict port - fail if port is already in use
      strictPort: true,
      // Enable HMR
      hmr: {
        overlay: true,
      },
      proxy: {
        // Proxy configuration (matching webpack devServer.proxy)
        '/': rootProxyConfig,
      },
    },

    preview: {
      port: 8085,
      ...(isPreview ? { https: false as any } : {}),
      proxy: {
        '/': rootProxyConfig,
      },
    },

    optimizeDeps: {
      include: ['vue', 'vuex', 'single-spa', 'axios', 'lodash', 'echarts', 'vue-multiselect'],
    },

    // Vitest configuration
    test: {
      globals: true,
      environment: 'happy-dom',
      setupFiles: ['./vitest.setup.ts'],
      include: ['src/**/__tests__/*.test.ts'],
      server: {
        deps: {
          inline: ['vuetify'],
        },
      },
      coverage: {
        reporter: ['text', 'html', 'cobertura'],
        include: ['src/**/*.ts', 'src/**/*.vue'],
        exclude: ['src/**/*.d.ts', 'src/**/__tests__/*.ts'],
      },
    },
  }
})

/**
 * Plugin to replace %VITE_*% placeholders in HTML with environment variable values.
 * This is needed because AUTH_CONFIG must be set in a synchronous script (not a module)
 * before authenticate.js runs, and import.meta.env is only available in modules.
 */
function htmlEnvPlugin(env: Record<string, string>): PluginOption {
  return {
    name: 'html-env-plugin',
    transformIndexHtml(html) {
      // Replace all %VITE_*% placeholders with their env values
      return html.replace(/%VITE_([A-Z_]+)%/g, (_match, envName) => {
        const value = env[`VITE_${envName}`] || ''
        return value
      })
    },
  }
}
