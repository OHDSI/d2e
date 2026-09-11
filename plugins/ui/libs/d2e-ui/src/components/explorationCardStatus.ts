// Figma: Exploration card component set 1810:239213 (ready / Not run / Stale).
export const EXPLORATION_STATUS_MAP = {
  ready: {
    variant: "positive",
    label: "Ready",
    icon: "mdi-check-circle-outline",
  },
  "not-run": {
    variant: "neutral",
    label: "Not run yet",
    icon: undefined,
  },
  stale: {
    variant: "warning",
    label: "Stale",
    icon: "mdi-alert-outline",
  },
} as const;

export type D2eExplorationCardStatus = keyof typeof EXPLORATION_STATUS_MAP;

export interface D2eExplorationCardRow {
  label: string;
  value: string | number;
}
