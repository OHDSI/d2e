import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'histoire'
import { HstVue } from '@histoire/plugin-vue'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'

const explorerRoot = path.dirname(fileURLToPath(import.meta.url))
const libRoot = path.resolve(explorerRoot, '..')

export default defineConfig({
  plugins: [HstVue()],
  setupFile: './histoire.setup.ts',
  storyMatch: ['../src/components/**/*.story.vue'],
  theme: { title: 'D2E UI' },
  tree: { groups: [{ id: 'top', title: '' }, { id: 'components', title: 'Components' }] },
  vite: {
    plugins: [vue(), vuetify({ autoImport: true })],
    server: {
      fs: {
        allow: [explorerRoot, libRoot],
      },
    },
    resolve: {
      alias: {
        '@': path.join(libRoot, 'src'),
        // Use one Vue instance only. The library sources find `vue` through the
        // workspace root. Point each importer to the copy in this sub-project.
        vue: path.join(explorerRoot, 'node_modules/vue/dist/vue.runtime.esm-bundler.js'),
      },
    },
  },
})
