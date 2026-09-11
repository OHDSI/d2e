// Values from design-system/status-chip.md (Chip set 2129:3329 + dataset
// status 2032:2333). "Possitive" is the Figma spelling; code uses `positive`.
export const STATUS_CHIP_VARIANT_MAP = {
  positive: {
    background: "var(--d2e-color-success-light)",
    color: "var(--d2e-color-success)",
  },
  warning: {
    background: "var(--d2e-color-warning-light)",
    color: "var(--d2e-color-warning-text)",
  },
  negative: {
    background: "var(--d2e-color-alarm-light)",
    color: "var(--d2e-color-alarm)",
  },
  neutral: {
    background: "var(--d2e-color-neutral-lightest)",
    color: "var(--d2e-color-neutral)",
  },
  multiselect: {
    background: "var(--d2e-color-support-blue-light)",
    color: "var(--d2e-color-primary)",
  },
  "have-access": {
    background: "var(--d2e-color-success-light)",
    color: "var(--d2e-color-success)",
  },
  "pending-access": {
    background: "var(--d2e-color-warning-light)",
    color: "var(--d2e-color-warning-text)",
  },
  locked: {
    background: "var(--d2e-color-alarm-light)",
    color: "var(--d2e-color-alarm)",
  },
} as const;

export type D2eStatusChipVariant = keyof typeof STATUS_CHIP_VARIANT_MAP;
