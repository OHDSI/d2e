import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import vuetify from 'vite-plugin-vuetify';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Mirrors trex-notebook/plugins/studies: a SystemJS lib build that Atlas3's
// PluginLoader imports as /atlas/plugins/data-quality/index.system.js.
// `vue` is the only external — the host re-exports it through the SystemJS
// import map in resources/atlas/index.html, so the plugin must not bundle a
// second copy. Everything else (vuetify, @ohdsi/atlas-ui) is bundled.
const OUT_DIR = process.env.DATA_QUALITY_OUT_DIR
  ? join(__dirname, process.env.DATA_QUALITY_OUT_DIR)
  : join(__dirname, 'dist');

export default defineConfig(({ command }) => ({
  plugins: [
    vue(),
    // styles: 'none' for the library build — the Atlas host already ships
    // Vuetify's stylesheet, so it only needs the component code. The dev harness
    // (src/dev.ts) has no host to borrow from, so there the plugin wires
    // Vuetify's prebuilt CSS in as usual.
    vuetify({ autoImport: true, styles: command === 'serve' ? true : 'none' }),
  ],
  build: {
    cssCodeSplit: false,
    lib: {
      entry: './src/main.ts',
      formats: ['system'],
      fileName: 'index',
    },
    rollupOptions: {
      external: ['vue'],
      output: {
        format: 'system',
        globals: { vue: 'vue' },
      },
    },
    outDir: OUT_DIR,
    emptyOutDir: true,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
  test: {
    environment: 'happy-dom',
    globals: false,
    include: ['src/**/*.spec.ts', 'tests/**/*.spec.ts'],
    exclude: ['tests/e2e/**'],
    // Transform vuetify and @ohdsi/atlas-ui rather than treating them as
    // external, so their `.css` imports go through vite instead of Node's ESM
    // loader — otherwise rendering either throws "Unknown file extension .css".
    server: { deps: { inline: ['vuetify', '@ohdsi/atlas-ui'] } },
  },
}));
