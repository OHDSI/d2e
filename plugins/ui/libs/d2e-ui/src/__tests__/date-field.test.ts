import { describe, expect, it } from "vitest";
import { fromIsoDate, toIsoDate } from "../components/dateFieldFormat";

describe("toIsoDate", () => {
  it("builds the string from local-date parts, not toISOString()", () => {
    expect(toIsoDate(new Date(2026, 0, 31))).toBe("2026-01-31");
  });

  it("zero-pads the month and day", () => {
    expect(toIsoDate(new Date(2026, 8, 3))).toBe("2026-09-03");
  });

  it("returns null for null and undefined", () => {
    expect(toIsoDate(null)).toBeNull();
    expect(toIsoDate(undefined)).toBeNull();
  });

  it("returns null for an invalid Date", () => {
    expect(toIsoDate(new Date(NaN))).toBeNull();
  });
});

describe("fromIsoDate", () => {
  it("parses an ISO date to a Date with matching local parts", () => {
    const date = fromIsoDate("2026-01-31");
    expect(date).not.toBeNull();
    expect(date?.getFullYear()).toBe(2026);
    expect(date?.getMonth()).toBe(0);
    expect(date?.getDate()).toBe(31);
  });

  it("returns null for null, empty, and malformed input", () => {
    expect(fromIsoDate(null)).toBeNull();
    expect(fromIsoDate(undefined)).toBeNull();
    expect(fromIsoDate("")).toBeNull();
    expect(fromIsoDate("not a date")).toBeNull();
    expect(fromIsoDate("31-01-2026")).toBeNull();
  });

  it("returns null for a syntactically valid but non-existent date", () => {
    expect(fromIsoDate("2026-02-31")).toBeNull();
  });
});

describe("round trip", () => {
  const dates = [
    "2026-01-01",
    "2026-12-31",
    "2026-01-31",
    "2024-02-29", // leap day
    "2026-09-03",
  ];

  for (const iso of dates) {
    it(`toIsoDate(fromIsoDate("${iso}")) === "${iso}"`, () => {
      expect(toIsoDate(fromIsoDate(iso))).toBe(iso);
    });
  }
});
