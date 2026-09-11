import type { VuetifyOptions } from "vuetify";
import { tokens } from "./tokens";

/**
 * Build the D2E Vuetify theme options without creating a Vuetify instance.
 *
 * The app owns the Vuetify instance (components, directives, defaults,
 * display). This function only contributes the `theme` block so the app and
 * Histoire render with the same palette. Values match the previous hand-written
 * `d2e` map in `apps/vue-mri-ui-lib/src/plugins/vuetify.ts` exactly; where a
 * value matches a design token it references `tokens`, otherwise the literal is
 * kept so no shipping screen changes colour.
 */
export function buildD2eVuetifyOptions(): Pick<VuetifyOptions, "theme"> {
  return {
    theme: {
      defaultTheme: "d2e",
      themes: {
        d2e: {
          dark: false,
          colors: {
            // Primary colors
            primary: tokens.color.primary,
            "primary-darken-1": "#000066", // no design token yet
            "primary-lighten-1": tokens.color.primaryLight,
            // Secondary colors
            secondary: tokens.color.secondary,
            "secondary-darken-1": "#e75248", // no design token yet
            "secondary-lighten-1": "#ffa19d", // no design token yet
            // Tertiary
            tertiary: "#ffd2c3", // no design token yet
            // Semantic colors matching Bootstrap variables (not design tokens)
            success: "#28a745",
            info: "#17a2b8",
            warning: "#ffc107",
            error: "#dc3545",
            // Feedback colors
            "feedback-success": tokens.color.success,
            "feedback-warning": tokens.color.warning,
            "feedback-error": tokens.color.danger,
            "feedback-alarm": "#d53939", // no design token yet
            // Neutral colors
            background: tokens.color.white,
            surface: "#f9f9f9", // no design token yet
            "surface-variant": "#e5e5e5", // no design token yet
            // Text colors
            "on-primary": tokens.color.white,
            "on-secondary": tokens.color.white,
            "on-background": tokens.color.primary,
            "on-surface": tokens.color.primary,
            // Additional custom colors
            brand: tokens.color.primary,
            "brand-hover": "#007eba", // no design token yet
            "brand-info": "#007cc0", // no design token yet
            "brand-contrast": tokens.color.primary,
            // Border colors (Bootstrap gray scale, not design tokens)
            "border-color": "#dee2e6",
            "border-light": "#dddddd",
            "border-medium": "#cccccc",
          },
        },
      },
    },
  };
}
