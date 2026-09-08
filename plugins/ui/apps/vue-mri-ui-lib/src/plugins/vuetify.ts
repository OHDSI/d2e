import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import 'vuetify/styles'
import '@mdi/font/css/materialdesignicons.css'
import { buildD2eVuetifyOptions } from '@d2e/ui'
import '@d2e/ui/tokens.css'

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
  ...buildD2eVuetifyOptions(),

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
