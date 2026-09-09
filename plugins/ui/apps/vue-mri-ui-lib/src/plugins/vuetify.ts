import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { buildD2eVuetifyOptions } from '@d2e/ui'
import '@d2e/ui/tokens.css'

/**
 * True only in the native Atlas3 plugin build, which sets it in its own
 * `define` block. Every other build leaves it undefined.
 */
const isAtlasNative = import.meta.env.VITE_ATLAS_NATIVE === 'true'

/**
 * Keep this Vuetify instance's theme off the host page.
 *
 * Only relevant to the native Atlas mount, where the app shares a document
 * with Atlas3's own Vuetify. Two problems, both measured on 2026-09-09 —
 * mounting the plugin repainted the Atlas shell's navigation, headings and
 * buttons from D2E navy to Vuetify's default blue, and it stayed that way
 * after unmount:
 *
 * - `stylesheetId` defaults to `vuetify-theme-stylesheet` for everyone, and
 *   Vuetify *upserts by id*. The second instance to start therefore overwrites
 *   the first instance's stylesheet element wholesale, so our theme replaced
 *   the host's branded one.
 * - Even with a separate element, the generated `:root` and `.v-theme--light`
 *   blocks are global, and ours are injected later, so they win on cascade
 *   order. `scope` rewrites `:root` to `:where(<scope>)` and prefixes every
 *   other selector, through `:where()` so specificity does not change.
 *
 * `.mri-app-vue-container` is `App.vue`'s own root, which also carries
 * `id="app"` — the target every dialog in this app teleports to. Scoping there
 * therefore covers the teleported overlays as well as the page.
 *
 * The portal build must NOT scope: there the app owns the document, and
 * scoping would strip the theme from anything Vuetify renders outside that
 * root.
 */
const themeIsolation = isAtlasNative
  ? { stylesheetId: 'vuetify-theme-stylesheet-vue-mri', scope: '.mri-app-vue-container' }
  : {}

const d2eOptions = buildD2eVuetifyOptions()

/**
 * Vuetify Plugin Configuration
 * - Color palette aligned with CSS custom properties in src/styles/themes/_main.scss
 * - Typography matching the app font variables in src/styles/_app-variables.scss
 * - Component defaults matching existing component styles
 */
export default createVuetify({
  components,
  directives,

  // Theme colors come from the @d2e/ui design tokens. defaults and display
  // stay here so the app remains the sole owner of component behavior.
  ...d2eOptions,
  theme: { ...d2eOptions.theme, ...themeIsolation },

  // Typography defaults matching Bootstrap variables
  defaults: {
    global: {
      ripple: true,
    },

    // Button defaults matching existing button styles
    VBtn: {
      variant: 'flat',
      color: 'primary',
      rounded: '6px', // Matches $border-radius: 0.25rem
      elevation: 0, // Matches $enable-shadows: false
      style: {},
    },

    // Card defaults matching existing dialog/card styles
    VCard: {
      elevation: 2,
      rounded: 'sm', // Matches $border-radius: 0.25rem
      variant: 'elevated',
    },

    VCardTitle: {
      style: {
        fontSize: '1rem',
        fontWeight: 500, // Matches $headings-font-weight
        padding: '16px 24px',
      },
    },

    VCardText: {
      style: {
        padding: '16px 24px',
        fontSize: '0.875rem', // Matches $font-size-base
      },
    },

    // Dialog defaults matching existing modal styles
    VDialog: {
      maxWidth: 600,
      rounded: 'sm',
      noClickAnimation: true, // no bouncing animation when clicking outside of persistent dialog
    },

    // Data table defaults
    VDataTable: {
      density: 'default',
      itemsPerPage: 10,
      style: {
        fontSize: '0.875rem',
      },
    },

    // Text field defaults matching form styles
    VTextField: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
      style: {
        fontSize: '0.875rem',
      },
    },

    // Select defaults
    VSelect: {
      variant: 'outlined',
      density: 'comfortable',
      color: 'primary',
    },

    // Checkbox defaults
    VCheckbox: {
      color: 'primary',
      density: 'comfortable',
    },

    // Tooltip defaults
    VTooltip: {
      location: 'top',
    },
  },

  // Display configuration
  display: {
    mobileBreakpoint: 'sm',
    thresholds: {
      xs: 0,
      sm: 576, // Matches Bootstrap $grid-breakpoints
      md: 768,
      lg: 992,
      xl: 1200,
    },
  },
})
