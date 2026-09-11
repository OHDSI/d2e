export type NumericExpressionValidationStatus = "valid" | "invalid-format" | "negative-not-allowed";

export interface NumericExpressionValidationOptions {
  allowNegative?: boolean;
}

const NUMBER_PATTERN = "-?\\d+(?:\\.\\d+)?";
const INTERVAL_PATTERN = new RegExp(`^(?:\\[|\\])\\s*(${NUMBER_PATTERN})\\s*-\\s*(${NUMBER_PATTERN})\\s*(?:\\[|\\])$`);
const COMPARISON_PATTERN = new RegExp(`^(?:>=|<=|>|<|=|!=)\\s*(${NUMBER_PATTERN})$`);
const SCALAR_PATTERN = new RegExp(`^(${NUMBER_PATTERN})$`);

function parseOperands(expression: string): string[] | null {
  const intervalMatch = expression.match(INTERVAL_PATTERN);
  if (intervalMatch) return [intervalMatch[1], intervalMatch[2]];

  const comparisonMatch = expression.match(COMPARISON_PATTERN);
  if (comparisonMatch) return [comparisonMatch[1]];

  const scalarMatch = expression.match(SCALAR_PATTERN);
  if (scalarMatch) return [scalarMatch[1]];

  return null;
}

/**
 * Validate the expression syntax accepted by Wizard numeric fields and apply
 * the field-level signed-value policy. An empty value is valid here because
 * required-field handling remains owned by the form.
 */
export function validateNumericExpression(
  value: unknown,
  options: NumericExpressionValidationOptions = {},
): NumericExpressionValidationStatus {
  if (value === null || value === undefined) return "valid";

  const expression = String(value).trim();
  if (!expression) return "valid";

  const operands = parseOperands(expression);
  if (!operands) return "invalid-format";

  if (options.allowNegative !== true && operands.some((operand) => operand.startsWith("-"))) {
    return "negative-not-allowed";
  }

  return "valid";
}
