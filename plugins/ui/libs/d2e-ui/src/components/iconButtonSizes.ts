// Values from design-system/icon-button.md (set 2006:843).
export const ICON_BUTTON_SIZE_MAP = {
  sm: { container: 32, icon: 16, padding: 5 },
  md: { container: 44, icon: 20, padding: 8 },
  lg: { container: 48, icon: 24, padding: 12 },
} as const;

export type D2eIconButtonSize = keyof typeof ICON_BUTTON_SIZE_MAP;
export type D2eIconButtonCategory = "primary" | "secondary" | "no-stroke";
