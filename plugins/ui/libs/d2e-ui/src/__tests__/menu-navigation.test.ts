import { describe, expect, it } from "vitest";
import {
  firstEnabledIndex,
  lastEnabledIndex,
  nextEnabledIndex,
} from "../components/menuNavigation";

const items = [{}, { disabled: true }, {}, {}] as readonly {
  disabled?: boolean;
}[];

describe("nextEnabledIndex", () => {
  it("skips a disabled item", () => {
    expect(nextEnabledIndex(items, 0, 1)).toBe(2);
    expect(nextEnabledIndex(items, 2, -1)).toBe(0);
  });

  it("wraps past the last item to the first", () => {
    expect(nextEnabledIndex(items, 3, 1)).toBe(0);
  });

  it("wraps past the first item to the last", () => {
    expect(nextEnabledIndex(items, 0, -1)).toBe(3);
  });

  it("returns `from` unchanged when every item is disabled", () => {
    const allDisabled = [{ disabled: true }, { disabled: true }];
    expect(nextEnabledIndex(allDisabled, 1, 1)).toBe(1);
    expect(nextEnabledIndex(allDisabled, 0, -1)).toBe(0);
  });

  it("returns -1 for an empty list", () => {
    expect(nextEnabledIndex([], 0, 1)).toBe(-1);
    expect(nextEnabledIndex([], -1, -1)).toBe(-1);
  });
});

describe("firstEnabledIndex and lastEnabledIndex", () => {
  it("find the outer enabled items", () => {
    expect(firstEnabledIndex(items)).toBe(0);
    expect(lastEnabledIndex(items)).toBe(3);
  });

  it("skip disabled items at the ends", () => {
    const edged = [{ disabled: true }, {}, { disabled: true }];
    expect(firstEnabledIndex(edged)).toBe(1);
    expect(lastEnabledIndex(edged)).toBe(1);
  });

  it("return -1 when there is no enabled item", () => {
    expect(firstEnabledIndex([])).toBe(-1);
    expect(lastEnabledIndex([])).toBe(-1);
    expect(firstEnabledIndex([{ disabled: true }])).toBe(-1);
    expect(lastEnabledIndex([{ disabled: true }])).toBe(-1);
  });
});
