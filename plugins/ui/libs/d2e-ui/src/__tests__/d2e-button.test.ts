import { describe, expect, it } from "vitest";
import { SIZE_MAP, VARIANT_MAP } from "../components/buttonVariants";

describe("D2eButton lookup tables", () => {
  it("maps every variant to the Vuetify variant/color pair", () => {
    expect(VARIANT_MAP.primary).toEqual({ variant: "flat", color: "primary" });
    expect(VARIANT_MAP.secondary).toEqual({
      variant: "outlined",
      color: "primary",
    });
    expect(VARIANT_MAP.danger).toEqual({
      variant: "flat",
      color: "feedback-error",
    });
    expect(VARIANT_MAP.ghost).toEqual({ variant: "text", color: "primary" });
  });

  it("maps every size to the Vuetify size value", () => {
    expect(SIZE_MAP.sm).toBe("small");
    expect(SIZE_MAP.md).toBeUndefined();
    expect(SIZE_MAP.lg).toBe("large");
  });
});
