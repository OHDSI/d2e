export const VARIANT_MAP = {
  // `brand`, not the `primary` theme key: inside the portal scope
  // (.mri-app-vue-container) Bootstrap 4's scoped `.bg-primary`/`.text-primary`
  // utilities win over Vuetify's same-named utilities and render invalid
  // (transparent/blue), because Bootstrap 4 defines no `--bs-primary-rgb`.
  // Bootstrap's $theme-colors has no `brand` entry, so this key cannot
  // collide. Rename to `primary` once Bootstrap leaves the portal scope.
  // Same mechanism as `danger` -> `feedback-error`.
  primary: { variant: "flat", color: "brand" },
  secondary: { variant: "outlined", color: "brand" },
  // The design red is the existing feedback-error token (#A3293D), not the
  // Bootstrap red on the theme's `error` key.
  danger: { variant: "flat", color: "feedback-error" },
  ghost: { variant: "text", color: "brand" },
} as const;

export const SIZE_MAP = { sm: "small", md: undefined, lg: "large" } as const;

export type D2eButtonVariant = keyof typeof VARIANT_MAP;
export type D2eButtonSize = keyof typeof SIZE_MAP;
