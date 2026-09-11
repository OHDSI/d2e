export type FieldType = "text" | "num" | "datetime" | "time" | "yearRange";
export type WizardSurface = "wizardApp" | "cohortBuilder";
export type WizardFlow = "required-fields" | "table1-config";

export interface WizardFieldGroupValidation {
  /** Minimum number of fields in the group that must contain a value. */
  minAnswered?: number;
  /** Maximum number of fields in the group that may contain a value. */
  maxAnswered?: number;
  /** Optional requirement guidance shown from the group information icon. */
  message?: string;
  /** Optional message shown when fewer than minAnswered fields contain values. */
  minMessage?: string;
  /** Optional message shown when more than maxAnswered fields contain values. */
  maxMessage?: string;
}

export interface WizardFieldGroup {
  id: string;
  /** Optional subgroup label, for example "Body measurement". */
  label?: string;
  /** Existing wizard field IDs rendered in this group. */
  fieldIds: string[];
  /** Preferred desktop column count. */
  columns?: 1 | 2 | 3;
  validation?: WizardFieldGroupValidation;
}

export interface WizardFormSection {
  id: string;
  title: string;
  groups: WizardFieldGroup[];
}

export interface FieldDefinition {
  id: string;
  type: FieldType;
  label: string;
  required: boolean;
  configPath?: string;
  placeholder?: string;
  /** For compound fields: override the filter card path (e.g. "patient.interactions.measurement") */
  filterCardPath?: string;
  /** For compound fields: fixed attributes added to the same filter card */
  fixedAttributes?: Array<{
    configPath: string;
    operator: string;
    value: string | number;
  }>;
  /** If true, this field is stored in the wizards query param only, not in the MRI bookmark */
  isWizardField?: boolean;
  /** If true, text fields accept free text input without requiring dropdown selection */
  allowFreeText?: boolean;
  /** If true, condition fields exclude descendant concepts by default */
  excludeDescendantsByDefault?: boolean;
  /** If true, numeric expressions may contain negative operands. Missing defaults to false. */
  allowNegative?: boolean;
}

/**
 * Step types supported by the wizard system.
 * - selection: Wizard selection grid
 * - form: Form input step
 * - results: Results display step
 * - intro: Introduction/overview step
 */
export type StepType = "selection" | "form" | "results" | "intro";

/**
 * Configuration for a form step.
 */
export interface FormStepConfig {
  /** Label for the submit button */
  submitLabel: string;
  /** Action to perform on submit */
  submitAction: "deep-link" | "next-step";
}

/**
 * Configuration for an intro step.
 */
export interface IntroStepConfig {
  /** List of input concepts for this scenario */
  inputs: string[];
  /** List of output concepts for this scenario */
  outputs: string[];
}

/**
 * Union type for step-specific configurations.
 */
export type StepTypeConfig = FormStepConfig | IntroStepConfig | Record<string, any>;

/**
 * Configuration for a single step in a wizard's flow.
 */
export interface WizardStepConfig {
  /** Unique identifier for this step */
  id: string;
  /** Type of step determines which component renders it */
  type: StepType;
  /** Optional title override (defaults to wizard name) */
  title?: string;
  /** Optional subtitle text */
  subtitle?: string;
  /** Optional note text displayed in the step */
  note?: string;
  /** Step-type-specific configuration */
  config?: StepTypeConfig;
}

/**
 * External wizard configuration (from backend/config).
 * Simplified to only contain the variable parts - fields and metadata.
 */
export interface WizardConfig {
  id: string;
  name: string;
  description: string;
  /** Optional form note. Missing preserves the legacy default; null or empty hides it. */
  formNote?: string | null;
  /** Optional UI surfaces. Missing means visible in all wizard-aware surfaces. */
  surfaces?: WizardSurface[];
  /** Optional flow override. Missing means use the default required-fields flow. */
  flow?: WizardFlow;
  /** Optional layout for this wizard. Missing or empty renders the legacy flat field list. */
  sections?: WizardFormSection[];
  /** All fields — MRI bookmark fields and wizard-only fields (isWizardField: true) */
  fields: FieldDefinition[];
}

/**
 * Internal wizard definition with hardcoded steps.
 * Extended from WizardConfig with runtime-added properties.
 */
export interface WizardDefinition extends WizardConfig {
  /** Step configuration - hardcoded in the app */
  steps: WizardStepConfig[];
}

/**
 * Wizard state tracking current position and selections.
 * currentStepIndex values:
 * - -1: Selection page (choosing a wizard)
 * - 0+: Index into the wizard's steps array
 */
export interface WizardState {
  currentStepIndex: number;
  selectedWizardId: string | null;
  selectedWizard: WizardDefinition | null;
  formData: Record<string, any>;
}
