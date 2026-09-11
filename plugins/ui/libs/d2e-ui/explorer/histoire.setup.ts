import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import '@fontsource-variable/ibm-plex-sans'
import '../src/tokens/tokens.css'
import { defineSetupVue3 } from '@histoire/plugin-vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { buildD2eVuetifyOptions } from '../src/tokens/theme'
import StoryThemeProvider from '../src/_story/StoryThemeProvider.vue'

export const setupVue3 = defineSetupVue3(({ app, addWrapper }) => {
  app.use(createVuetify({ components, directives, ...buildD2eVuetifyOptions() }))
  addWrapper(StoryThemeProvider)
})
