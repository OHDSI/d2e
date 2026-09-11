import { describe, it, expect, vi } from "vitest";
import {
  DEFAULT_WIZARD_FORM_NOTE,
  enrichWizardField,
  getWizardDefinitions,
  getWizardById,
  isWizardVisibleOnSurface,
  resolveWizardFormNote,
} from "../wizardDefinitions";
import { getAttributeByPath } from "../cdwConfig";

// Mock cdwConfig - tests run in dev mode so they use hardcoded definitions
vi.mock("../cdwConfig", () => ({
  fetchCdwConfig: vi.fn().mockResolvedValue({
    config: {},
    meta: { configId: "test", configVersion: "1" },
  }),
  getAttributeByPath: vi.fn(),
}));

describe("wizardDefinitions", () => {
  it("preserves Wizard negative-value policy during CDM enrichment", () => {
    vi.mocked(getAttributeByPath).mockReturnValueOnce({ name: "CDM numeric attribute", type: "num" });

    const enriched = enrichWizardField(
      {
        id: "signed-result",
        type: "text",
        label: "Signed result",
        required: false,
        configPath: "patient.attributes.signedResult",
        allowNegative: true,
      },
      { patient: { attributes: {} } },
    );

    expect(enriched).toMatchObject({
      id: "signed-result",
      type: "num",
      label: "Signed result",
      allowNegative: true,
    });
  });

  describe("resolveWizardFormNote", () => {
    it("preserves the legacy note when the config omits formNote", () => {
      expect(resolveWizardFormNote(undefined)).toBe(DEFAULT_WIZARD_FORM_NOTE);
    });

    it("supports custom and hidden form notes", () => {
      expect(resolveWizardFormNote("Custom note")).toBe("Custom note");
      expect(resolveWizardFormNote(null)).toBeNull();
      expect(resolveWizardFormNote("   ")).toBeNull();
    });
  });

  describe("getWizardDefinitions", () => {
    it("should return an array with exactly 8 wizards", async () => {
      const wizards = await getWizardDefinitions();
      expect(Array.isArray(wizards)).toBe(true);
      expect(wizards.length).toBe(8);
    });

    it("should return wizards with required fields", async () => {
      const wizards = await getWizardDefinitions();

      wizards.forEach((wizard) => {
        expect(wizard).toHaveProperty("id");
        expect(wizard).toHaveProperty("name");
        expect(wizard).toHaveProperty("description");
        expect(wizard).toHaveProperty("fields");
        expect(wizard).toHaveProperty("steps");

        expect(typeof wizard.id).toBe("string");
        expect(typeof wizard.name).toBe("string");
        expect(typeof wizard.description).toBe("string");
        expect(Array.isArray(wizard.fields)).toBe(true);
        expect(Array.isArray(wizard.steps)).toBe(true);
      });
    });

    it("should return wizards with valid field definitions", async () => {
      const wizards = await getWizardDefinitions();

      wizards.forEach((wizard) => {
        wizard.fields.forEach((field) => {
          expect(field).toHaveProperty("id");
          expect(field).toHaveProperty("type");
          expect(field).toHaveProperty("label");
          expect(field).toHaveProperty("required");

          expect(typeof field.id).toBe("string");
          expect(typeof field.type).toBe("string");
          expect(["text", "num", "datetime", "time", "yearRange"]).toContain(field.type);
          expect(typeof field.label).toBe("string");
          expect(typeof field.required).toBe("boolean");
        });
      });
    });

    it("marks every current development numeric field as non-negative", async () => {
      const wizards = await getWizardDefinitions();
      const numericFields = wizards.flatMap((wizard) => wizard.fields.filter((field) => field.type === "num"));

      expect(numericFields.length).toBeGreaterThan(0);
      expect(numericFields.every((field) => field.allowNegative === false)).toBe(true);
    });

    it("should return wizards with hardcoded steps", async () => {
      const wizards = await getWizardDefinitions();

      wizards.forEach((wizard) => {
        expect(wizard.steps).toHaveLength(1);
        expect(wizard.steps[0].type).toBe("form");
        expect(wizard.steps[0].config).toEqual({
          submitLabel: "Generate",
          submitAction: "deep-link",
        });
      });
    });

    it("does not synthesize sections for wizards without an explicit layout", async () => {
      const wizards = await getWizardDefinitions();
      const wizardsWithoutLayout = wizards.filter((wizard) => wizard.id !== "loss-to-follow-up");

      expect(wizardsWithoutLayout.every((wizard) => wizard.sections === undefined)).toBe(true);
    });

    it("passes through the configured section layout for the loss-to-follow-up wizard", async () => {
      const wizard = await getWizardById("loss-to-follow-up");

      expect(wizard?.sections).toHaveLength(3);
      expect(wizard?.sections?.map((section) => section.id)).toEqual(["person", "measurement", "observation"]);
    });
  });

  describe("getWizardById", () => {
    it("should return the wizard with id 'calculate-incidence'", async () => {
      const wizard = await getWizardById("calculate-incidence");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("calculate-incidence");
      expect(wizard?.name).toBe("Calculate Incidence");
      expect(wizard?.fields.length).toBeGreaterThan(0);
      expect(wizard?.steps).toHaveLength(1);
    });

    it("should return undefined for nonexistent wizard id", async () => {
      const wizard = await getWizardById("nonexistent");

      expect(wizard).toBeUndefined();
    });

    it("should return undefined for empty string", async () => {
      const wizard = await getWizardById("");

      expect(wizard).toBeUndefined();
    });

    it("should return the correct wizard when multiple wizards exist", async () => {
      const allWizards = await getWizardDefinitions();

      if (allWizards.length > 0) {
        const firstWizardId = allWizards[0].id;
        const wizard = await getWizardById(firstWizardId);

        expect(wizard).toBeDefined();
        expect(wizard?.id).toBe(firstWizardId);
      }
    });
  });

  describe("new wizard definitions", () => {
    it("should have calculate-incidence wizard with correct structure", async () => {
      const wizard = await getWizardById("calculate-incidence");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("calculate-incidence");
      expect(wizard?.name).toBe("Calculate Incidence");
      expect(wizard?.description).toBe(
        "This wizard will calculate the incidence for a particular clinical condition. This calculation is done in SQL, and this works by finding the first instance of the condition (the diagnostic code) and determining if it occurs between a particular set of dates that you specify.",
      );
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");
    });

    it("should have calculate-prevalence wizard with correct structure", async () => {
      const wizard = await getWizardById("calculate-prevalence");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("calculate-prevalence");
      expect(wizard?.name).toBe("Calculate Prevalence");
      expect(wizard?.description).toBe(
        "This wizard will calculate the prevalence for a particular clinical condition. This calculation is done in SQL, and this works by finding the first instance of a condition.",
      );
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");
    });

    it("should have calculate-mortality wizard with correct structure", async () => {
      const wizard = await getWizardById("calculate-mortality");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("calculate-mortality");
      expect(wizard?.name).toBe("Calculate Mortality");
      expect(wizard?.description).toBe(
        "This wizard will calculate the mortality rate for a particular clinical condition, and works by death dates that co-occur with a condition between a particular set of dates that you specify.",
      );
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");
    });

    it("should have 30-day-readmission wizard with correct structure", async () => {
      const wizard = await getWizardById("30-day-readmission");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("30-day-readmission");
      expect(wizard?.name).toBe("30-Day Readmission");
      expect(wizard?.description).toBe(
        "This wizard will calculate the 30-day readmission rate for a particular clinical condition. This calculation is done in SQL, and this works by finding an inpatient discharge associated with the condition and determining if the patient has a subsequent inpatient admission within 30 days of that discharge.",
      );
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");
    });

    it("should have length-of-stay wizard with correct structure", async () => {
      const wizard = await getWizardById("length-of-stay");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("length-of-stay");
      expect(wizard?.name).toBe("Length of Stay");
      expect(wizard?.description).toBe(
        "This wizard will calculate the average length of hospital stay for a particular clinical condition. This calculation is done in SQL, and this works by finding inpatient visits associated with the condition and computing the number of days between the visit start and visit end dates.",
      );
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");
    });

    it("should have cross-sectional-demographics wizard with correct structure", async () => {
      const wizard = await getWizardById("cross-sectional-demographics");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("cross-sectional-demographics");
      expect(wizard?.name).toBe("Cross sectional Demographics");
      expect(wizard?.description).toBe("Assessment of hypertension and cholesterol levels in post-operative patients.");
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");
    });

    it("should have table1 wizard with config-only structure", async () => {
      const wizard = await getWizardById("table1");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("table1");
      expect(wizard?.name).toBe("Table 1");
      expect(wizard?.description).toBe("Generate a Table 1 summary using selected covariate concept sets.");
      expect(wizard?.surfaces).toEqual(["cohortBuilder"]);
      expect(wizard?.flow).toBe("table1-config");
      expect(wizard?.fields).toEqual([]);
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");
    });

    it("should have loss-to-follow-up wizard with correct structure and section layout", async () => {
      const wizard = await getWizardById("loss-to-follow-up");

      expect(wizard).toBeDefined();
      expect(wizard?.id).toBe("loss-to-follow-up");
      expect(wizard?.name).toBe("Loss to Follow-up (LTFU)");
      expect(wizard?.description).toBe(
        "This wizard will calculate the loss to follow-up rate for a particular clinical event, frequently used in clinical trial investigations and quality improvement research. This calculation works by finding patients who did not return for an expected visit within a time window you specify.",
      );
      expect(wizard?.steps).toHaveLength(1);
      expect(wizard?.steps[0].type).toBe("form");

      const [personSection, measurementSection, observationSection] = wizard?.sections ?? [];
      expect(personSection.groups[0].fieldIds).toEqual(["age", "gender", "ethnicity", "race"]);
      expect(measurementSection.groups[0].fieldIds).toEqual(["height", "weight", "bmi"]);
      expect(measurementSection.groups[0].validation).toEqual({
        minAnswered: 1,
        maxAnswered: 2,
        message: "Enter 1 or 2 of Height, Weight, and BMI.",
      });
      expect(observationSection.groups[0].fieldIds).toEqual(["year"]);
    });

    it("should have all new wizards with age field mapped to config", async () => {
      const wizardIds = [
        "calculate-incidence",
        "calculate-prevalence",
        "calculate-mortality",
        "30-day-readmission",
        "length-of-stay",
        "cross-sectional-demographics",
        "loss-to-follow-up",
      ];

      for (const id of wizardIds) {
        const wizard = await getWizardById(id);

        expect(wizard?.fields).toHaveLength(18);

        const ageField = wizard?.fields.find((f) => f.id === "age");
        expect(ageField).toBeDefined();
        expect(ageField?.type).toBe("num");
        expect(ageField?.label).toBe("Age Range");
        expect(ageField?.required).toBe(false);
        expect(ageField?.configPath).toBe("patient.attributes.Age");
        expect(ageField?.isWizardField).toBeFalsy();

        const genderField = wizard?.fields.find((f) => f.id === "gender");
        expect(genderField).toBeDefined();
        expect(genderField?.type).toBe("text");
        expect(genderField?.label).toBe("Gender");
        expect(genderField?.configPath).toBe("patient.attributes.Gender_concept_name");

        // Wizard-only fields have isWizardField: true
        const condition1Field = wizard?.fields.find((f) => f.id === "condition1");
        expect(condition1Field).toBeDefined();
        expect(condition1Field?.isWizardField).toBe(true);

        const heightField = wizard?.fields.find((f) => f.id === "height");
        expect(heightField).toBeDefined();
        expect(heightField?.type).toBe("num");
        expect(heightField?.label).toBe("Height");
        expect(heightField?.configPath).toBe("patient.interactions.measurement.attributes.numval");
      }
    });
  });

  describe("surface visibility", () => {
    it("shows deployed configs without surfaces on all wizard-aware surfaces", () => {
      expect(isWizardVisibleOnSurface({}, "wizardApp")).toBe(true);
      expect(isWizardVisibleOnSurface({}, "cohortBuilder")).toBe(true);
    });

    it("hides cohort-builder-only configs from the standalone wizard app", () => {
      const table1Config = { surfaces: ["cohortBuilder" as const] };

      expect(isWizardVisibleOnSurface(table1Config, "wizardApp")).toBe(false);
      expect(isWizardVisibleOnSurface(table1Config, "cohortBuilder")).toBe(true);
    });
  });
});
