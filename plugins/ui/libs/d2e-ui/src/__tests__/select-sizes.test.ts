import { describe, expect, it } from "vitest";
import { SELECT_SIZE_MAP } from "../components/selectSizes";

describe("D2eSelect size map", () => {
  it("maps sizes to the Figma box heights", () => {
    expect(SELECT_SIZE_MAP.sm).toEqual({ height: 40 });
    expect(SELECT_SIZE_MAP.md).toEqual({ height: 48 });
  });
});
