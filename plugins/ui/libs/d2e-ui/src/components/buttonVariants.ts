export const VARIANT_MAP = {
  primary: { variant: "flat", color: "primary" },
  secondary: { variant: "outlined", color: "primary" },
  // The design red is the existing feedback-error token (#A3293D), not the
  // Bootstrap red on the theme's `error` key.
  danger: { variant: "flat", color: "feedback-error" },
  ghost: { variant: "text", color: "primary" },
} as const;

export const SIZE_MAP = { sm: "small", md: undefined, lg: "large" } as const;

export type D2eButtonVariant = keyof typeof VARIANT_MAP;
export type D2eButtonSize = keyof typeof SIZE_MAP;
