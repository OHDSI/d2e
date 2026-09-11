import { describe, expect, it } from "vitest";
import { validateNumericExpression } from "../numericExpression";

describe("validateNumericExpression", () => {
  it.each([
    "",
    "   ",
    "0",
    "60",
    "80.5",
    ">60",
    ">=60",
    "<80.5",
    "<=80.5",
    "=60",
    "!=60",
    "[50-80]",
    "]50-80[",
    "[ 50 - 80 ]",
  ])("accepts non-negative expression %j by default", (expression) => {
    expect(validateNumericExpression(expression)).toBe("valid");
  });

  it.each(["-5", "-0", "-5.25", ">=-5", "<-5.25", "[-5-10]", "[5--1]", "[-10--1]"])(
    "rejects negative operand expression %j by default",
    (expression) => {
      expect(validateNumericExpression(expression)).toBe("negative-not-allowed");
    },
  );

  it.each(["-5", "-0", "-5.25", ">=-5", "<-5.25", "[-5-10]", "[5--1]", "[-10--1]"])(
    "accepts negative operand expression %j when configured",
    (expression) => {
      expect(validateNumericExpression(expression, { allowNegative: true })).toBe("valid");
    },
  );

  it.each(["value", "+5", ".5", "5.", "5-10", "[5,10]", "(5-10)", "[5-]", "[--5-10]", ">>​5"])(
    "rejects malformed expression %j",
    (expression) => {
      expect(validateNumericExpression(expression)).toBe("invalid-format");
      expect(validateNumericExpression(expression, { allowNegative: true })).toBe("invalid-format");
    },
  );
});
