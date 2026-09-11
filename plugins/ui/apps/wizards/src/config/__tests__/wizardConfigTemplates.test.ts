import { describe, expect, it } from "vitest";
import standardConfig from "../../../wizards-config.json";
import hanaLeanConfig from "../../../wizards-config-hana-lean.json";

interface TemplateField {
  id: string;
  type: string;
  allowNegative?: boolean;
}

interface TemplateWizard {
  id: string;
  fields: TemplateField[];
}

interface TemplateConfig {
  wizards: TemplateWizard[];
}

function getNumericPolicies(config: TemplateConfig): Map<string, boolean | undefined> {
  return new Map(
    config.wizards.flatMap((wizard) =>
      wizard.fields
        .filter((field) => field.type === "num")
        .map((field) => [`${wizard.id}:${field.id}`, field.allowNegative] as const),
    ),
  );
}

describe("Wizard config templates", () => {
  it.each([
    ["standard", standardConfig],
    ["HANA Lean", hanaLeanConfig],
  ])("marks every current %s numeric field as non-negative", (_name, config) => {
    const policies = [...getNumericPolicies(config).values()];

    expect(policies.length).toBeGreaterThan(0);
    expect(policies.every((allowNegative) => allowNegative === false)).toBe(true);
  });

  it("keeps equivalent fields aligned across templates", () => {
    const standardPolicies = getNumericPolicies(standardConfig);
    const hanaLeanPolicies = getNumericPolicies(hanaLeanConfig);

    standardPolicies.forEach((allowNegative, fieldKey) => {
      expect(hanaLeanPolicies.get(fieldKey), fieldKey).toBe(allowNegative);
    });
  });
});
