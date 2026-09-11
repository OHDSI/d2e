import type {
  WizardDefinition,
  WizardConfig,
  FieldDefinition,
  WizardStepConfig,
  WizardSurface,
  WizardFormSection,
} from "../types/wizard";
import { fetchCdwConfig, getAttributeByPath } from "./cdwConfig";
import type { CdwConfig } from "./cdwConfig";
import client from "../axios/request";

const isDev = import.meta.env.DEV;

export const DEFAULT_WIZARD_FORM_NOTE =
  "Note: this is a very rough approximation that is just a starting point for a more comprehensive analysis.";

export function resolveWizardFormNote(formNote: string | null | undefined): string | null {
  if (formNote === undefined) return DEFAULT_WIZARD_FORM_NOTE;
  const trimmedNote = formNote?.trim();
  return trimmedNote || null;
}

/**
 * Default steps used by all wizards.
 * Hardcoded here since all wizards use the same flow.
 */
const DEFAULT_STEPS: WizardStepConfig[] = [
  {
    id: "form",
    type: "form",
    title: "Form",
    config: { submitLabel: "Generate", submitAction: "deep-link" },
  },
];

export function isWizardVisibleOnSurface(wizard: Pick<WizardConfig, "surfaces">, surface: WizardSurface): boolean {
  return !wizard.surfaces || wizard.surfaces.includes(surface);
}

/**
 * Enrich a field definition using CDW config data looked up via configPath.
 */
export function enrichWizardField(field: FieldDefinition, cdwConfig: CdwConfig): FieldDefinition {
  if (!field.configPath) return field;

  const attr = getAttributeByPath(cdwConfig, field.configPath);
  if (!attr) return field;

  return {
    ...field,
    type: attr.type,
    label: field.label || attr.name,
  };
}

/**
 * Convert a WizardConfig to WizardDefinition by adding hardcoded steps
 * and enriching fields with CDW config data.
 */
function toWizardDefinition(config: WizardConfig, cdwConfig: CdwConfig): WizardDefinition {
  return {
    ...config,
    fields: config.fields.map((field) => enrichWizardField(field, cdwConfig)),
    steps: DEFAULT_STEPS,
  };
}

/**
 * Dev-only mock definitions used when running locally without the portal backend.
 */
const WIZARD_FIELDS: FieldDefinition[] = [
  {
    id: "age",
    type: "num",
    allowNegative: false,
    label: "Age Range",
    required: false,
    configPath: "patient.attributes.Age",
  },
  {
    id: "gender",
    type: "text",
    label: "Gender",
    required: false,
    configPath: "patient.attributes.Gender_concept_name",
  },
  {
    id: "ethnicity",
    type: "text",
    label: "Ethnicity",
    required: false,
    configPath: "patient.attributes.ethnicityName",
  },
  {
    id: "race",
    type: "text",
    label: "Race",
    required: false,
    configPath: "patient.attributes.raceName",
  },
  // Commenting to provide example of having conditions as a filter
  // {
  //   id: "condition",
  //   type: "text",
  //   label: "Condition",
  //   required: false,
  //   configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
  // },
  // {
  //   id: "condition2",
  //   type: "text",
  //   label: "Condition2",
  //   required: false,
  //   configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
  // },
  {
    id: "height",
    type: "num",
    allowNegative: false,
    label: "Height",
    required: false,
    configPath: "patient.interactions.measurement.attributes.numval",
    filterCardPath: "patient.interactions.measurement",
    fixedAttributes: [
      {
        configPath: "patient.interactions.measurement.attributes.meas_concept_name",
        operator: "=",
        value: "Body Height",
      },
    ],
  },
  {
    id: "weight",
    type: "num",
    allowNegative: false,
    label: "Weight",
    required: false,
    configPath: "patient.interactions.measurement.attributes.numval",
    filterCardPath: "patient.interactions.measurement",
    fixedAttributes: [
      {
        configPath: "patient.interactions.measurement.attributes.meas_concept_name",
        operator: "=",
        value: "Body Weight",
      },
    ],
  },
  {
    id: "bmi",
    type: "num",
    allowNegative: false,
    label: "BMI",
    required: false,
    configPath: "patient.interactions.measurement.attributes.numval",
    filterCardPath: "patient.interactions.measurement",
    fixedAttributes: [
      {
        configPath: "patient.interactions.measurement.attributes.meas_concept_name",
        operator: "=",
        value: "Body mass index",
      },
    ],
  },
  {
    id: "respRate",
    type: "num",
    allowNegative: false,
    label: "Resp Rate",
    required: false,
    configPath: "patient.interactions.measurement.attributes.numval",
    filterCardPath: "patient.interactions.measurement",
    fixedAttributes: [
      {
        configPath: "patient.interactions.measurement.attributes.meas_concept_name",
        operator: "=",
        value: "Respiratory rate",
      },
    ],
  },
  {
    id: "pulseRate",
    type: "num",
    allowNegative: false,
    label: "Pulse Rate",
    required: false,
    configPath: "patient.interactions.measurement.attributes.numval",
    filterCardPath: "patient.interactions.measurement",
    fixedAttributes: [
      {
        configPath: "patient.interactions.measurement.attributes.meas_concept_name",
        operator: "=",
        value: "Pulse rate",
      },
    ],
  },
  {
    id: "systolicBp",
    type: "num",
    allowNegative: false,
    label: "Systolic Blood Pressure",
    required: false,
    configPath: "patient.interactions.measurement.attributes.numval",
    filterCardPath: "patient.interactions.measurement",
    fixedAttributes: [
      {
        configPath: "patient.interactions.measurement.attributes.meas_concept_name",
        operator: "=",
        value: "Systolic blood pressure",
      },
    ],
  },
  {
    id: "diastolicBp",
    type: "num",
    allowNegative: false,
    label: "Diastolic Blood Pressure",
    required: false,
    configPath: "patient.interactions.measurement.attributes.numval",
    filterCardPath: "patient.interactions.measurement",
    fixedAttributes: [
      {
        configPath: "patient.interactions.measurement.attributes.meas_concept_name",
        operator: "=",
        value: "Diastolic blood pressure",
      },
    ],
  },
  {
    id: "year",
    type: "yearRange",
    label: "Years",
    required: false,
    isWizardField: true,
  },
  {
    id: "condition1",
    type: "text",
    label: "Condition 1",
    required: false,
    configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
    isWizardField: true,
  },
  {
    id: "condition2",
    type: "text",
    label: "Condition 2",
    required: false,
    configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
    isWizardField: true,
  },
  {
    id: "condition3",
    type: "text",
    label: "Condition 3",
    required: false,
    configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
    isWizardField: true,
  },
  {
    id: "condition4",
    type: "text",
    label: "Condition 4",
    required: false,
    configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
    isWizardField: true,
  },
  {
    id: "condition5",
    type: "text",
    label: "Condition 5",
    required: false,
    configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
    isWizardField: true,
  },
  {
    id: "condition6",
    type: "text",
    label: "Condition 6",
    required: false,
    configPath: "patient.interactions.conditionoccurrence.attributes.condition_occ_concept_name",
    isWizardField: true,
  },
];

/**
 * Layout for the Loss to Follow-up (LTFU) wizard's form.
 */
const LOSS_TO_FOLLOW_UP_SECTIONS: WizardFormSection[] = [
  {
    id: "person",
    title: "Person",
    groups: [{ id: "person-details", fieldIds: ["age", "gender", "ethnicity", "race"], columns: 2 }],
  },
  {
    id: "measurement",
    title: "Measurement",
    groups: [
      {
        id: "body-measurement",
        label: "Body measurement",
        fieldIds: ["height", "weight", "bmi"],
        columns: 3,
        validation: {
          minAnswered: 1,
          maxAnswered: 2,
          message: "Enter 1 or 2 of Height, Weight, and BMI.",
        },
      },
      {
        id: "vitals",
        label: "Vitals",
        fieldIds: ["systolicBp", "diastolicBp", "pulseRate", "respRate"],
        columns: 2,
      },
    ],
  },
  {
    id: "observation",
    title: "Observation window",
    groups: [{ id: "observation-details", fieldIds: ["year"], columns: 1 }],
  },
];

const mockWizardConfigs: WizardConfig[] = [
  {
    id: "calculate-incidence",
    name: "Calculate Incidence",
    description:
      "This wizard will calculate the incidence for a particular clinical condition. This calculation is done in SQL, and this works by finding the first instance of the condition (the diagnostic code) and determining if it occurs between a particular set of dates that you specify.",
    fields: WIZARD_FIELDS,
  },
  {
    id: "calculate-prevalence",
    name: "Calculate Prevalence",
    description:
      "This wizard will calculate the prevalence for a particular clinical condition. This calculation is done in SQL, and this works by finding the first instance of a condition.",
    fields: WIZARD_FIELDS,
  },
  {
    id: "calculate-mortality",
    name: "Calculate Mortality",
    description:
      "This wizard will calculate the mortality rate for a particular clinical condition, and works by death dates that co-occur with a condition between a particular set of dates that you specify.",
    fields: WIZARD_FIELDS,
  },
  {
    id: "30-day-readmission",
    name: "30-Day Readmission",
    description:
      "This wizard will calculate the 30-day readmission rate for a particular clinical condition. This calculation is done in SQL, and this works by finding an inpatient discharge associated with the condition and determining if the patient has a subsequent inpatient admission within 30 days of that discharge.",
    fields: WIZARD_FIELDS,
  },
  {
    id: "length-of-stay",
    name: "Length of Stay",
    description:
      "This wizard will calculate the average length of hospital stay for a particular clinical condition. This calculation is done in SQL, and this works by finding inpatient visits associated with the condition and computing the number of days between the visit start and visit end dates.",
    fields: WIZARD_FIELDS,
  },
  {
    id: "cross-sectional-demographics",
    name: "Cross sectional Demographics",
    description: "Assessment of hypertension and cholesterol levels in post-operative patients.",
    fields: WIZARD_FIELDS,
  },
  {
    id: "table1",
    name: "Table 1",
    description: "Generate a Table 1 summary using selected covariate concept sets.",
    surfaces: ["cohortBuilder"],
    flow: "table1-config",
    fields: [],
  },
  {
    id: "loss-to-follow-up",
    name: "Loss to Follow-up (LTFU)",
    description:
      "This wizard will calculate the loss to follow-up rate for a particular clinical event, frequently used in clinical trial investigations and quality improvement research. This calculation works by finding patients who did not return for an expected visit within a time window you specify.",
    sections: LOSS_TO_FOLLOW_UP_SECTIONS,
    fields: WIZARD_FIELDS,
  },
];

/**
 * Fetch wizard configs from the portal backend API.
 * Falls back to mock configs in dev mode.
 */
async function fetchWizardConfigs(datasetId?: string): Promise<WizardConfig[]> {
  if (isDev) {
    return mockWizardConfigs;
  }

  const response = await client.get("/d2e/pa-config-svc/wizards/config", {
    params: { datasetId },
  });

  // Validate response is an object
  if (!response.data || typeof response.data !== "object") {
    console.warn("[Wizards] Invalid config response:", response.data);
    return [];
  }

  const wizards = response.data.wizards;

  // Validate that wizards is an array
  if (!Array.isArray(wizards)) {
    console.warn("[Wizards] Invalid config: wizards is not an array", wizards);
    return [];
  }

  // Filter out invalid wizard entries
  return wizards.filter((wizard) => {
    if (!wizard || typeof wizard !== "object") {
      console.warn("[Wizards] Skipping invalid wizard entry:", wizard);
      return false;
    }
    if (!wizard.id || typeof wizard.id !== "string") {
      console.warn("[Wizards] Skipping wizard without valid id:", wizard);
      return false;
    }
    if (!Array.isArray(wizard.fields)) {
      console.warn("[Wizards] Skipping wizard without fields array:", wizard.id);
      return false;
    }
    return true;
  });
}

/**
 * Get all available wizard definitions, enriched with CDW config data.
 */
export async function getWizardDefinitions(datasetId?: string): Promise<WizardDefinition[]> {
  const [configs, { config: cdwConfig }] = await Promise.all([
    fetchWizardConfigs(datasetId),
    fetchCdwConfig(datasetId),
  ]);
  return configs.map((config) => toWizardDefinition(config, cdwConfig));
}

/**
 * Get a specific wizard definition by ID, enriched with CDW config data.
 */
export async function getWizardById(id: string, datasetId?: string): Promise<WizardDefinition | undefined> {
  const configs = await fetchWizardConfigs(datasetId);
  const config = configs.find((w) => w.id === id);
  if (!config) return undefined;

  const { config: cdwConfig } = await fetchCdwConfig(datasetId);
  return toWizardDefinition(config, cdwConfig);
}
