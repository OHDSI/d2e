import { describe, expect, it } from "vitest";
import { buildD2eVuetifyOptions } from "../tokens/theme";

// Snapshot of the `d2e` colors map. It started as an exact copy of the
// hand-written map in apps/vue-mri-ui-lib/src/plugins/vuetify.ts; the four
// `mri-*` keys became `brand*` on 2026-09-02, then folded into `primary` once
// Bootstrap left the portal scope and stopped colliding on that name. The
// shared library
// carries no application-specific naming. Values are unchanged.
//
// Keep in sync when the theme changes deliberately; the assertions below
// guard against silent drops and accidental value drift.
const EXPECTED_COLORS = {
  primary: "#000080",
  "primary-darken-1": "#000066",
  "primary-lighten-1": "#333399",
  secondary: "#ff5e59",
  "secondary-darken-1": "#e75248",
  "secondary-lighten-1": "#ffa19d",
  tertiary: "#ffd2c3",
  success: "#28a745",
  info: "#17a2b8",
  warning: "#ffc107",
  error: "#dc3545",
  "feedback-success": "#00855f",
  "feedback-warning": "#f89c0e",
  "feedback-error": "#a3293d",
  "feedback-alarm": "#d53939",
  background: "#ffffff",
  surface: "#f9f9f9",
  "surface-variant": "#e5e5e5",
  "on-primary": "#ffffff",
  "on-secondary": "#ffffff",
  "on-background": "#000080",
  "on-surface": "#000080",
  "primary-hover": "#007eba",
  "primary-info": "#007cc0",
  "border-color": "#dee2e6",
  "border-light": "#dddddd",
  "border-medium": "#cccccc",
} as const;

function normalizeHex(color: string): string {
  const hex = color.toLowerCase().replace(/^#/, "");
  if (hex.length === 3 || hex.length === 4) {
    return `#${hex
      .split("")
      .map((ch) => ch + ch)
      .join("")}`;
  }
  return `#${hex}`;
}

function isCssHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value);
}

describe("buildD2eVuetifyOptions", () => {
  const options = buildD2eVuetifyOptions();
  const colors = options.theme.themes.d2e.colors;

  it("defaults to the d2e theme", () => {
    expect(options.theme.defaultTheme).toBe("d2e");
  });

  it("exposes exactly the expected color keys", () => {
    expect(Object.keys(colors).sort()).toEqual(
      Object.keys(EXPECTED_COLORS).sort(),
    );
  });

  it("keeps every color value identical to the snapshot", () => {
    for (const key of Object.keys(EXPECTED_COLORS)) {
      expect(normalizeHex(colors[key])).toBe(
        normalizeHex(EXPECTED_COLORS[key]),
      );
    }
  });

  it("emits only valid CSS colors", () => {
    for (const value of Object.values(colors)) {
      expect(isCssHexColor(value)).toBe(true);
    }
  });
});
