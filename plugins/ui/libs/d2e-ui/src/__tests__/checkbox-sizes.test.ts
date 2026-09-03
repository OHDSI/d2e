import { describe, expect, it } from "vitest";
import { CHECKBOX_SIZE_MAP } from "../components/checkboxSizes";

describe("D2eCheckbox size map", () => {
  it("maps sizes to box, padding and ripple dimensions", () => {
    expect(CHECKBOX_SIZE_MAP.sm).toEqual({ box: 20, padding: 9, ripple: 34 });
    expect(CHECKBOX_SIZE_MAP.md).toEqual({ box: 24, padding: 9, ripple: 38 });
  });
});
