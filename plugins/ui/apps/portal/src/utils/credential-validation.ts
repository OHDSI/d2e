// The checklist mirrors the password policy seeded into Logto's sign-in
// experience (services/alp-logto/post-init/src/main.ts): length 8-256 and at
// least 3 of the 4 character categories. Logto counts categories rather than
// requiring a symbol, so requiring one here would reject passwords the server
// accepts.
export const PASSWORD_MIN_LENGTH = 8; // D1: mirrors the Logto policy length.min
export const PASSWORD_MAX_LENGTH = 256; // D1: mirrors the Logto policy length.max
export const PASSWORD_CHARACTER_TYPES_MIN = 3; // mirrors the policy characterTypes.min

// Mirrors PasswordPolicyChecker.symbols in Logto's core-kit (password-policy.ts).
// Note the trailing space: Logto counts a space as a symbol.
const SYMBOLS = "!\"#$%&'()*+,-./:;<=>?@[\\]^_`{|}~ ";

// Counts the distinct character categories Logto recognises. Returns null when
// the password contains a character outside all four categories, which Logto
// rejects outright (checkCharTypes returns 'unsupported').
export const countCharacterTypes = (password: string): number | null => {
  const types = new Set<string>();
  for (const char of password) {
    if (char >= "a" && char <= "z") types.add("lowercase");
    else if (char >= "A" && char <= "Z") types.add("uppercase");
    else if (char >= "0" && char <= "9") types.add("digits");
    else if (SYMBOLS.includes(char)) types.add("symbols");
    else return null;
  }
  return types.size;
};

export const hasEnoughCharacterTypes = (password: string): boolean => {
  const count = countCharacterTypes(password);
  return count !== null && count >= PASSWORD_CHARACTER_TYPES_MIN;
};

export interface PasswordRule {
  id: "length" | "characterTypes";
  i18nKey: "PASSWORD_RULES__LENGTH" | "PASSWORD_RULES__CHARACTER_TYPES";
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: PasswordRule[] = [
  {
    id: "length",
    i18nKey: "PASSWORD_RULES__LENGTH",
    test: (p) => p.length >= PASSWORD_MIN_LENGTH && p.length <= PASSWORD_MAX_LENGTH,
  },
  { id: "characterTypes", i18nKey: "PASSWORD_RULES__CHARACTER_TYPES", test: hasEnoughCharacterTypes },
];

export const isPasswordValid = (password: string): boolean => PASSWORD_RULES.every((rule) => rule.test(password));

export type UsernameError = "required" | "tooShort" | "tooLong" | "invalidChars" | "noLetterOrNumber";

// Validates the trimmed username. Callers must also submit the trimmed value.
// The leading-digit rejection mirrors Logto's own username constraint (today it
// surfaces as an opaque ERR_BAD_REQUEST after submit — see MemberRouter's catch block).
export const validateUsername = (raw: string): UsernameError | null => {
  const username = raw.trim();
  if (!username) return "required";
  if (username.length < 3) return "tooShort";
  if (username.length > 32) return "tooLong";
  if (!/^\w+$/.test(username) || /^[0-9]/.test(username)) return "invalidChars";
  if (!/[A-Za-z0-9]/.test(username)) return "noLetterOrNumber";
  return null;
};
