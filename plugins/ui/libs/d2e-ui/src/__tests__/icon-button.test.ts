import { describe, expect, it } from "vitest";
import { ICON_BUTTON_SIZE_MAP } from "../components/iconButtonSizes";

describe("D2eIconButton size map", () => {
  it("maps sizes to container and icon dimensions", () => {
    expect(ICON_BUTTON_SIZE_MAP.sm).toEqual({
      container: 32,
      icon: 16,
      padding: 5,
    });
    expect(ICON_BUTTON_SIZE_MAP.md).toEqual({
      container: 44,
      icon: 20,
      padding: 8,
    });
    expect(ICON_BUTTON_SIZE_MAP.lg).toEqual({
      container: 48,
      icon: 24,
      padding: 12,
    });
  });
});
