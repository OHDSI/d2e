import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

// Builds the distributable artifact. The application consumes this package
// through source aliases (see apps/vue-mri-ui-lib/vite.config.ts), so this
// build exists for other consumers and as the published contract.
export default defineConfig({
  plugins: [vue()],
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/index.ts"),
      formats: ["es"],
      fileName: () => "index.js",
      cssFileName: "index",
    },
    rollupOptions: {
      // vue and vuetify are peer dependencies and must never be bundled.
      external: ["vue", "vuetify", /^vuetify\//],
    },
    cssCodeSplit: false,
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
  },
});
