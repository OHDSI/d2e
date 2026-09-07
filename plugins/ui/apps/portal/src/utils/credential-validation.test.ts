import {
  PASSWORD_RULES,
  isPasswordValid,
  validateUsername,
  countCharacterTypes,
  PASSWORD_MAX_LENGTH,
} from "./credential-validation";
import { generateRandom } from "./utils";

describe("generateRandom (D5: must satisfy password rules)", () => {
  it("always produces a checklist-compliant password", () => {
    for (let i = 0; i < 50; i++) {
      expect(isPasswordValid(generateRandom(12))).toBe(true);
    }
  });

  it("clamps a below-minimum length instead of looping forever", () => {
    // length < min-length rule: without the clamp isPasswordValid can never
    // pass and the retry loop hangs. The result must still be valid.
    const result = generateRandom(4);
    expect(result.length).toBeGreaterThanOrEqual(8);
    expect(isPasswordValid(result)).toBe(true);
  });
});

describe("PASSWORD_RULES", () => {
  const byId = Object.fromEntries(PASSWORD_RULES.map((r) => [r.id, r]));

  it("defines exactly the two checklist rules mirroring the Logto policy", () => {
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["length", "characterTypes"]);
  });

  it("length enforces the 8-256 window", () => {
    expect(byId.length.test("Ab1efgh")).toBe(false);
    expect(byId.length.test("Ab1efghi")).toBe(true);
    expect(byId.length.test(`Ab1${"e".repeat(253)}`)).toBe(true);
    expect(byId.length.test(`Ab1${"e".repeat(254)}`)).toBe(false);
  });

  it("characterTypes requires 3 of the 4 categories, not a symbol", () => {
    expect(byId.characterTypes.test("abcdefgh")).toBe(false); // 1 category
    expect(byId.characterTypes.test("Abcdefgh")).toBe(false); // 2 categories
    expect(byId.characterTypes.test("Abcdefg1")).toBe(true); // lower+upper+digit
    expect(byId.characterTypes.test("abcdefg1!")).toBe(true); // lower+digit+symbol
  });
});

describe("countCharacterTypes", () => {
  it("counts the distinct Logto categories, treating space as a symbol", () => {
    expect(countCharacterTypes("abcdefgh")).toBe(1);
    expect(countCharacterTypes("Abcdefg1")).toBe(3);
    expect(countCharacterTypes("Abcdefg1!")).toBe(4);
    expect(countCharacterTypes("Abcdef 1")).toBe(4); // space counts as a symbol
  });

  it("returns null for characters Logto does not support", () => {
    expect(countCharacterTypes("Abcdefg1é")).toBeNull();
  });
});

describe("isPasswordValid", () => {
  it("rejects short and low-variety passwords", () => {
    expect(isPasswordValid("        ")).toBe(false); // 1 category
    expect(isPasswordValid("a1!")).toBe(false); // too short
    expect(isPasswordValid("abcdefgh")).toBe(false); // 1 category
  });

  it("accepts a compliant password", () => {
    expect(isPasswordValid("Passw0rd!")).toBe(true);
  });

  it("accepts symbol-free passwords that satisfy the Logto policy", () => {
    // The seeded admin password used across the e2e suite: lower+upper+digit.
    expect(isPasswordValid("Updatepassword12345")).toBe(true);
    expect(isPasswordValid("Updatepassword123456")).toBe(true);
  });

  it("rejects passwords containing unsupported characters", () => {
    expect(isPasswordValid("Updatepassword12345é")).toBe(false);
  });
});

describe("validateUsername", () => {
  it("trims before validating", () => {
    expect(validateUsername("  alice  ")).toBeNull();
    expect(validateUsername("   ")).toBe("required");
  });
  it("enforces length 3-32", () => {
    expect(validateUsername("ab")).toBe("tooShort");
    expect(validateUsername("a".repeat(33))).toBe("tooLong");
    expect(validateUsername("abc")).toBeNull();
    expect(validateUsername("a".repeat(32))).toBeNull();
  });
  it("rejects invalid characters and leading digits (Logto constraint)", () => {
    expect(validateUsername("ali ce")).toBe("invalidChars");
    expect(validateUsername("ali-ce")).toBe("invalidChars");
    expect(validateUsername("1alice")).toBe("invalidChars");
  });
  it("rejects underscore-only usernames", () => {
    expect(validateUsername("___")).toBe("noLetterOrNumber");
  });
});

describe("PASSWORD_MAX_LENGTH", () => {
  it("is 256 (D1)", () => {
    expect(PASSWORD_MAX_LENGTH).toBe(256);
  });
});
