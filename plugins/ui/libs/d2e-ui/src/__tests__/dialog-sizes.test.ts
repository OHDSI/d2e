import { describe, expect, it } from "vitest";
import { DIALOG_SIZE_MAP } from "../components/dialogSizes";
import { tokens } from "../tokens/tokens";

// Figma variables in the design-system file lpbqxd8B0OkRKH9kJoCCEa:
//   Modal/S = 540, Modal/L = 900, Modal/XL = 1200
// An earlier extraction recorded a Modal/M of 600 that does not exist, and
// D2eDialog defaulted to it. Lock the real scale.

describe("modal size scale", () => {
  it("matches the Figma Modal variables", () => {
    expect(tokens.modal).toEqual({ s: 540, l: 900, xl: 1200 });
  });

  it("has no 600 anywhere — that size was invented", () => {
    expect(Object.values(tokens.modal)).not.toContain(600);
  });

  it("exposes the same scale to D2eDialog", () => {
    expect(DIALOG_SIZE_MAP).toEqual(tokens.modal);
  });
});
