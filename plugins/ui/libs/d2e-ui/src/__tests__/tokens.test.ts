import { describe, expect, it } from "vitest";
import { generateTokensCss } from "../../scripts/build-tokens";

describe("tokens.css generator", () => {
  it("emits the generated banner as the first line", () => {
    const css = generateTokensCss();
    expect(
      css.startsWith(
        "/* GENERATED — DO NOT EDIT.\n * Source: src/tokens/tokens.ts.",
      ),
    ).toBe(true);
  });

  it("is deterministic across two runs", () => {
    expect(generateTokensCss()).toBe(generateTokensCss());
  });

  it("kebab-cases camelCase token keys", () => {
    const css = generateTokensCss();
    expect(css).toContain("--d2e-color-primary-xtra-lightest: #E5E6F2;");
    expect(css).toContain("--d2e-font-heading4-letter-spacing: -0.02em;");
  });

  it("appends px to numeric spacing and radius values", () => {
    const css = generateTokensCss();
    expect(css).toContain("--d2e-spacing-xs: 8px;");
    expect(css).toContain("--d2e-radius-md: 8px;");
  });

  it("emits color, family and elevation tokens", () => {
    const css = generateTokensCss();
    expect(css).toContain("--d2e-color-danger: #A3293D;");
    expect(css).toContain("--d2e-font-family:");
    expect(css).toContain("--d2e-elevation-e16:");
  });
});

describe("unitless CSS properties", () => {
  const css = generateTokensCss();

  it("gives font weights no unit", () => {
    const withUnit = css.match(/--d2e-[\w-]*weight: [\d.]+px;/g) ?? [];
    expect(withUnit).toEqual([]);
  });

  it("gives ratio line heights no unit", () => {
    // `button` is the one line height defined as an explicit length.
    const ratios = css.match(/--d2e-[\w-]*line-height: [\d.]+px;/g) ?? [];
    expect(ratios).toEqual(["  --d2e-font-button-line-height: 16px;".trim()]);
  });
});

describe("heading letter spacing", () => {
  const css = generateTokensCss();

  it("keeps heading tracking relative, not pixel", () => {
    // Figma's -2 on Heading 1-4 is a percentage. The Heading 4 spec renders as
    // tracking -0.48px at 24px, i.e. -2%. Emitting "-2px" was ~4x too tight.
    for (const h of ["heading1", "heading2", "heading3", "heading4"]) {
      expect(css).toContain(`--d2e-font-${h}-letter-spacing: -0.02em;`);
    }
    expect(css).not.toMatch(/--d2e-font-heading[1-4]-letter-spacing: -?\d+px;/);
  });
});
