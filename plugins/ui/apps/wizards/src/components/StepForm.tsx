import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useForm } from "react-hook-form";
import { useWizardContext } from "../context/WizardContext";
import type { FieldDefinition, FormStepConfig } from "../types/wizard";
import { buildWizardSubmitPayload, generateFormSubmitDeepLink } from "../utils/deepLinks";
import { fetchCdwConfig } from "../config/cdwConfig";
import type { ConfigMeta } from "../config/cdwConfig";
import { listAtlasSources, resolveAtlasSourceKey } from "../api/atlasSourceApi";
import { TypeaheadField } from "./TypeaheadField";
import { AnalyticsIcon } from "./icons/AnalyticsIcon";
import { WizardDashboardModal } from "./WizardDashboardModal";
import { useWizardDashboardFlow } from "../hooks/useWizardDashboardFlow";
import {
  getFieldGroupCompletionHint,
  getFieldGroupValidationMessage,
  isFieldDisabledByGroupLimit,
  resolveWizardFormLayout,
} from "../utils/wizardSections";
import type { ResolvedWizardFieldGroup } from "../utils/wizardSections";
import { resolveWizardFormNote } from "../config/wizardDefinitions";
import styles from "./StepForm.module.css";
import sourceStyles from "./StepSelection.module.css";

// Keep the legacy Cohort Builder action available for a one-line re-enable.
// Standalone Wizards currently exposes only the direct dashboard action.
const SHOW_COHORT_BUILDER_ACTION = false;

/**
 * Form step renderer with config-driven fields.
 */
export function StepForm() {
  const {
    selectedWizard,
    formData,
    updateFormData,
    goBack,
    resetWizard,
    goForward,
    getCurrentStepConfig,
    portalProps,
    ensureBookmarkCache,
    refreshBookmarkCache,
  } = useWizardContext();
  const stepConfig = getCurrentStepConfig();
  const [configMeta, setConfigMeta] = useState<ConfigMeta | null>(null);
  const [atlasSourceName, setAtlasSourceName] = useState("");
  const displayValuesRef = useRef<Record<string, string>>({});
  const defaultFormValues = { ...formData };
  const dashboardFlow = useWizardDashboardFlow({
    datasetId: portalProps.datasetId,
    username: portalProps.username,
    ensureCache: ensureBookmarkCache,
    refreshCache: refreshBookmarkCache,
  });

  selectedWizard?.fields.forEach((field) => {
    if (!field.id.startsWith("condition")) {
      return;
    }

    const excludeDescendantsKey = `${field.id}_excludeDescendants`;
    if (defaultFormValues[excludeDescendantsKey] === undefined) {
      defaultFormValues[excludeDescendantsKey] = field.excludeDescendantsByDefault === true;
    }
  });

  const handleDisplayValueChange = useCallback((fieldId: string, displayValue: string | null) => {
    if (displayValue) {
      displayValuesRef.current[fieldId] = displayValue;
    } else {
      delete displayValuesRef.current[fieldId];
    }
  }, []);

  useEffect(() => {
    fetchCdwConfig(portalProps.datasetId).then(({ meta }) => setConfigMeta(meta));
  }, [portalProps.datasetId]);

  useEffect(() => {
    if (portalProps.isAtlas !== true) return;

    let active = true;
    setAtlasSourceName("");
    listAtlasSources(portalProps.getToken)
      .then((sources) => {
        if (!active) return;
        const sourceKey = resolveAtlasSourceKey(sources, portalProps.datasetId);
        setAtlasSourceName(
          sources.find((source) => source.sourceKey === sourceKey)?.sourceName || "Data source unavailable",
        );
      })
      .catch(() => {
        if (active) setAtlasSourceName("Data source unavailable");
      });

    return () => {
      active = false;
    };
  }, [portalProps.datasetId, portalProps.getToken, portalProps.isAtlas]);

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isValid },
  } = useForm({
    mode: "onChange",
    defaultValues: defaultFormValues,
  });

  // Watch all form values to check if required fields are filled
  const formValues = watch();
  const formLayout = useMemo(
    () => resolveWizardFormLayout(selectedWizard?.fields || [], selectedWizard?.sections),
    [selectedWizard],
  );
  const groupValidationMessages = formLayout.sections.flatMap((section) =>
    section.groups.flatMap((group) => {
      const message = getFieldGroupValidationMessage(group, formValues);
      return message ? [message] : [];
    }),
  );
  const hasGroupValidationErrors = groupValidationMessages.length > 0;

  // Check if all required fields have values
  const allRequiredFieldsFilled = useCallback(() => {
    if (!selectedWizard) return false;
    if (hasGroupValidationErrors) return false;
    for (const field of selectedWizard.fields) {
      if (field.type === "yearRange") {
        const from = formValues[`${field.id}_from`];
        const to = formValues[`${field.id}_to`];
        // If required, both must be filled
        if (field.required && (!from || from === "" || !to || to === "")) return false;
        // If either is set, both must be set
        if ((from && !to) || (!from && to)) return false;
      } else if (field.required) {
        const value = formValues[field.id];
        if (!value || value === "") return false;
      }
    }
    return true;
  }, [selectedWizard, formValues, hasGroupValidationErrors]);

  const onSubmit = async (data: Record<string, any>) => {
    updateFormData(data);

    // Check stepConfig for submitAction
    const formStepConfig = stepConfig?.config as FormStepConfig | undefined;
    const submitAction = formStepConfig?.submitAction || "next-step";

    console.log("[Wizards StepForm] Submit action:", submitAction);

    if (submitAction === "deep-link") {
      try {
        // Generate deep link URL
        if (!selectedWizard) {
          console.error("[Wizards StepForm] Cannot generate deep link: No wizard selected");
          goForward();
          return;
        }

        // Combine existing formData with new data
        const combinedFormData = { ...formData, ...data };

        // Fetch config meta (cached from wizard load)
        const { config: cdwConfig, meta: configMeta } = await fetchCdwConfig(portalProps.datasetId);

        const mriFields = selectedWizard.fields.filter((f) => !f.isWizardField);
        const wizardOnlyFields = selectedWizard.fields.filter((f) => f.isWizardField);

        const deepLinkUrl = generateFormSubmitDeepLink(
          mriFields,
          combinedFormData,
          configMeta,
          portalProps.datasetId,
          cdwConfig.chartOptions,
          cdwConfig,
          wizardOnlyFields,
          selectedWizard.id,
          displayValuesRef.current,
        );

        console.log("[Wizards StepForm] Generated deep link:", deepLinkUrl);

        // Navigate to the deep link
        window.location.href = deepLinkUrl;
      } catch (error) {
        console.error("[Wizards StepForm] Failed to generate deep link:", error);
        // Fall back to goForward on error
        goForward();
      }
    } else {
      // Default behavior: next-step or undefined
      goForward();
    }
  };

  const onOpenDashboard = (data: Record<string, any>) => {
    updateFormData(data);
    dashboardFlow.openDashboard(async () => {
      if (!selectedWizard || !portalProps.datasetId) throw new Error("Missing Wizard context");
      const combinedFormData = { ...formData, ...data };
      const { config: cdwConfig, meta } = await fetchCdwConfig(portalProps.datasetId);
      const payload = buildWizardSubmitPayload(
        selectedWizard.fields.filter((field) => !field.isWizardField),
        combinedFormData,
        meta,
        portalProps.datasetId,
        cdwConfig.chartOptions,
        cdwConfig,
        selectedWizard.fields.filter((field) => field.isWizardField),
        selectedWizard.id,
        displayValuesRef.current,
      );
      return { ...payload, configMeta: meta };
    });
  };

  const renderField = (field: FieldDefinition, containingGroup?: ResolvedWizardFieldGroup) => {
    const fieldError = errors[field.id];
    const disabledByGroupLimit = containingGroup
      ? isFieldDisabledByGroupLimit(containingGroup, field.id, formValues)
      : false;
    const groupLimitTitle = disabledByGroupLimit
      ? `Only ${containingGroup?.validation?.maxAnswered} of the ${containingGroup?.fields.length === 3 ? "three" : containingGroup?.fields.length} fields`
      : null;
    const groupLimitBody = disabledByGroupLimit
      ? `(${containingGroup?.fields.map((groupField) => groupField.label).join(", ")}) can be filled in at the same time.`
      : null;

    // Text fields with configPath use typeahead search
    if (field.type === "text" && field.configPath && configMeta) {
      const isConditionField = field.id.startsWith("condition");
      const fieldValue = formValues[field.id];
      return (
        <div key={field.id} className={styles.fieldGroup}>
          <label htmlFor={field.id} className={styles.label}>
            {field.label}
            {field.required && <span className={styles.requiredAsterisk}> *</span>}:
          </label>
          <div className={styles.inputWithToggle}>
            <TypeaheadField
              fieldId={field.id}
              label={field.label}
              placeholder={field.placeholder}
              required={field.required}
              configPath={field.configPath}
              configMeta={configMeta}
              datasetId={portalProps.datasetId}
              control={control}
              setValue={setValue}
              defaultValue={formData[field.id] ?? ""}
              error={fieldError as { message?: string } | undefined}
              onDisplayValueChange={handleDisplayValueChange}
              allowFreeText={field.allowFreeText}
            />
            {isConditionField && fieldValue && (
              <div className={styles.wildcardToggle}>
                <input
                  type="checkbox"
                  id={`${field.id}_excludeDescendants`}
                  {...register(`${field.id}_excludeDescendants`)}
                />
                <label htmlFor={`${field.id}_excludeDescendants`}>Exclude descendants</label>
              </div>
            )}
          </div>
          {fieldError && (
            <span className={styles.errorMessage} role="alert">
              {fieldError.message as string}
            </span>
          )}
        </div>
      );
    }

    if (field.type === "yearRange") {
      const fromError = errors[`${field.id}_from`];
      const toError = errors[`${field.id}_to`];
      const currentYear = new Date().getFullYear();
      const startYear = 1900;
      const years = Array.from({ length: currentYear - startYear + 1 }, (_, i) => currentYear - i);
      const fromYearValue = watch(`${field.id}_from`);
      const toYearValue = formValues[`${field.id}_to`];
      const hasYearError = fromError || toError;

      return (
        <div key={field.id} className={styles.fieldGroup}>
          <label className={styles.label}>
            {field.label}
            {field.required && <span className={styles.requiredAsterisk}> *</span>}:
          </label>
          <div className={styles.groupInputs}>
            <select
              id={`${field.id}_from`}
              className={`${styles.input} ${fromError ? styles.inputError : ""}`}
              {...register(`${field.id}_from`, {
                required: field.required ? "From year is required" : false,
              })}
            >
              <option value="">From year</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
            <span className={styles.groupSeparator}>-</span>
            <select
              id={`${field.id}_to`}
              className={`${styles.input} ${toError ? styles.inputError : ""}`}
              {...register(`${field.id}_to`, {
                required: field.required ? "To year is required" : false,
                validate: (value) => {
                  if (!value) return true;
                  if (fromYearValue && Number(value) < Number(fromYearValue)) {
                    return "To year must be greater than or equal to from year";
                  }
                  return true;
                },
              })}
            >
              <option value="">To year</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>
          {(hasYearError || (fromYearValue && !toYearValue) || (!fromYearValue && toYearValue)) && (
            <span className={styles.errorMessage} role="alert">
              {hasYearError
                ? ((fromError?.message || toError?.message) as string)
                : fromYearValue && !toYearValue
                  ? "To year is required"
                  : "From year is required"}
            </span>
          )}
        </div>
      );
    }

    switch (field.type) {
      case "num":
        return (
          <div key={field.id} className={styles.fieldGroup}>
            <div className={styles.fieldLabelRow}>
              <label htmlFor={field.id} className={styles.label}>
                {field.label}
                {field.required && <span className={styles.requiredAsterisk}> *</span>}:
              </label>
              <span className={styles.infoTooltip}>
                <button
                  type="button"
                  className={styles.infoButton}
                  aria-label={`${field.label} valid formats`}
                  aria-describedby={`${field.id}-numeric-help`}
                >
                  i
                </button>
                <span id={`${field.id}-numeric-help`} role="tooltip" className={styles.infoTooltipContent}>
                  <span>Valid format:</span>
                  <ul>
                    <li>Enter a single value</li>
                    <li>&gt; or &lt; for greater/less than</li>
                    <li>&gt;= or &lt;= for greater than or equal to/less than or equal to</li>
                    <li>[x-y] or ]x-y[ for an interval including or excluding the endpoints</li>
                    <li>(-x) for negative values</li>
                  </ul>
                  <span>E.g: &gt;=60, [50-80]</span>
                </span>
              </span>
            </div>
            <div
              className={styles.numericInputAnchor}
              tabIndex={disabledByGroupLimit ? 0 : undefined}
              aria-describedby={disabledByGroupLimit ? `${field.id}-limit-help` : undefined}
            >
              <input
                id={field.id}
                type="text"
                placeholder={field.placeholder || "e.g. >=60, [50-80]"}
                className={`${styles.input} ${fieldError ? styles.inputError : ""}`}
                aria-invalid={!!fieldError}
                aria-describedby={disabledByGroupLimit ? `${field.id}-limit-help` : undefined}
                disabled={disabledByGroupLimit}
                {...register(field.id, {
                  required: field.required ? `${field.label} is required` : false,
                  validate: (v) => {
                    if (!v || v === "") return true;
                    const s = String(v).trim();
                    const isRange = /^[[\]]\s*-?\d+(\.\d+)?\s*-\s*-?\d+(\.\d+)?\s*[[\]]$/.test(s);
                    const isOp = /^(>=|<=|>|<|=|!=)\s*-?\d+(\.\d+)?$/.test(s);
                    const isNum = /^-?\d+(\.\d+)?$/.test(s);
                    if (!isRange && !isOp && !isNum) {
                      return `Invalid expression. Examples: >=60, >50, [50-80], 60`;
                    }
                    return true;
                  },
                })}
              />
              {disabledByGroupLimit && (
                <span
                  id={`${field.id}-limit-help`}
                  role="tooltip"
                  className={`${styles.infoTooltipContent} ${styles.limitTooltipContent}`}
                >
                  <strong>{groupLimitTitle}</strong>
                  <span>{groupLimitBody}</span>
                </span>
              )}
            </div>
            {fieldError && (
              <span className={styles.errorMessage} role="alert">
                {fieldError.message as string}
              </span>
            )}
          </div>
        );

      case "text":
        return (
          <div key={field.id} className={styles.fieldGroup}>
            <label htmlFor={field.id} className={styles.label}>
              {field.label}
              {field.required && <span className={styles.requiredAsterisk}> *</span>}:
            </label>
            <input
              id={field.id}
              type="text"
              placeholder={field.placeholder}
              className={`${styles.input} ${fieldError ? styles.inputError : ""}`}
              aria-invalid={!!fieldError}
              {...register(field.id, {
                required: field.required ? `${field.label} is required` : false,
              })}
            />
            {fieldError && (
              <span className={styles.errorMessage} role="alert">
                {fieldError.message as string}
              </span>
            )}
          </div>
        );

      case "datetime":
      case "time":
        return (
          <div key={field.id} className={styles.fieldGroup}>
            <label htmlFor={field.id} className={styles.label}>
              {field.label}
              {field.required && <span className={styles.requiredAsterisk}> *</span>}:
            </label>
            <input
              id={field.id}
              type="date"
              aria-label={field.placeholder || field.label}
              className={`${styles.input} ${fieldError ? styles.inputError : ""}`}
              aria-invalid={!!fieldError}
              {...register(field.id, {
                required: field.required ? `${field.label} is required` : false,
              })}
            />
            {fieldError && (
              <span className={styles.errorMessage} role="alert">
                {fieldError.message as string}
              </span>
            )}
          </div>
        );

      default:
        return (
          <div key={field.id} className={styles.fieldGroup}>
            <label className={styles.label}>
              {field.label}
              {field.required && <span className={styles.requiredAsterisk}> *</span>}:
            </label>
            <div className={styles.unsupported}>Unsupported field type: {field.type}</div>
          </div>
        );
    }
  };

  if (!selectedWizard) {
    return (
      <div className={styles.container}>
        <div className={styles.header}>
          <h2>Error</h2>
        </div>
        <p>Error: No wizard selected. Please return to wizard selection.</p>
      </div>
    );
  }

  const submitLabel = stepConfig ? (stepConfig.config as FormStepConfig)?.submitLabel || "Next" : "Next";
  const formNote = resolveWizardFormNote(selectedWizard.formNote);
  const handleBack = portalProps.isAtlas === true ? resetWizard : goBack;

  const renderFields = (fields: FieldDefinition[], containingGroup?: ResolvedWizardFieldGroup) => {
    return fields.map((field) => renderField(field, containingGroup));
  };

  const getColumnsClass = (columns: number = 2) => {
    if (columns === 1) return styles.oneColumn;
    if (columns === 3) return styles.threeColumns;
    return styles.twoColumns;
  };

  const renderFieldGroup = (group: ResolvedWizardFieldGroup) => {
    const completionHint = getFieldGroupCompletionHint(group);
    const isRequiredGroup = (group.validation?.minAnswered ?? 0) > 0;

    return (
      <div key={group.id} className={styles.sectionGroup}>
        {group.label && (
          <div className={styles.groupHeader}>
            <div className={styles.groupTitleRow}>
              <h3 aria-label={isRequiredGroup ? `${group.label}, required group` : undefined}>
                {group.label}
                {isRequiredGroup && (
                  <span className={styles.groupRequiredAsterisk} aria-hidden="true">
                    {" "}
                    *
                  </span>
                )}
              </h3>
              {completionHint && (
                <span className={styles.infoTooltip}>
                  <button
                    type="button"
                    className={styles.infoButton}
                    aria-label={`${group.label} requirements`}
                    aria-describedby={`${group.id}-requirements`}
                  >
                    i
                  </button>
                  <span id={`${group.id}-requirements`} role="tooltip" className={styles.infoTooltipContent}>
                    {completionHint}
                  </span>
                </span>
              )}
            </div>
          </div>
        )}
        <div className={`${styles.fieldGrid} ${getColumnsClass(group.columns)}`}>
          {renderFields(group.fields, group)}
        </div>
      </div>
    );
  };

  const renderConfiguredFields = () => {
    if (formLayout.sections.length === 0) {
      return <div className={styles.formFields}>{renderFields(formLayout.ungroupedFields)}</div>;
    }

    return (
      <div className={styles.sections}>
        {formLayout.sections.map((section, index) => (
          <section key={section.id} className={styles.section} aria-labelledby={`wizard-section-${section.id}`}>
            <h2 id={`wizard-section-${section.id}`} className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>{index + 1}</span>
              {section.title}
            </h2>
            <div className={styles.sectionContent}>{section.groups.map(renderFieldGroup)}</div>
          </section>
        ))}
        {formLayout.ungroupedFields.length > 0 && (
          <section className={styles.section} aria-labelledby="wizard-section-additional">
            <h2 id="wizard-section-additional" className={styles.sectionTitle}>
              <span className={styles.sectionNumber}>{formLayout.sections.length + 1}</span>
              Additional
            </h2>
            <div className={styles.sectionContent}>
              <div className={`${styles.fieldGrid} ${styles.twoColumns}`}>
                {renderFields(formLayout.ungroupedFields)}
              </div>
            </div>
          </section>
        )}
      </div>
    );
  };

  return (
    <div className={styles.container}>
      <div className={styles.titleBar}>
        <div className={styles.titleRow}>
          <button
            type="button"
            onClick={handleBack}
            className={styles.backIconButton}
            aria-label="Back to wizard selection"
            title="Back to wizard selection"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.42-1.41L7.83 13H20v-2Z" />
            </svg>
          </button>
          <h2>{selectedWizard.name}</h2>
        </div>
        {portalProps.isAtlas === true ? (
          <div
            className={`${sourceStyles.sourceSelector} ${sourceStyles.sourceSelectorReadOnly}`}
            aria-label="Data source"
          >
            <span className={sourceStyles.sourceLabel}>Data source</span>
            <svg className={sourceStyles.sourceIcon} viewBox="0 0 24 24" aria-hidden="true">
              <ellipse cx="12" cy="5" rx="8" ry="3" />
              <path d="M4 5v5c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
              <path d="M4 10v5c0 1.7 3.6 3 8 3s8-1.3 8-3v-5" />
              <path d="M4 15v4c0 1.7 3.6 3 8 3s8-1.3 8-3v-4" />
            </svg>
            <span className={sourceStyles.sourceValue}>{atlasSourceName || "Loading data source..."}</span>
          </div>
        ) : null}
      </div>

      {selectedWizard.description && <div className={styles.description}>{selectedWizard.description}</div>}

      {formNote && <div className={styles.note}>{formNote}</div>}

      <hr className={styles.divider} />

      <form
        onSubmit={handleSubmit(onSubmit)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.target as HTMLElement).tagName !== "BUTTON") {
            e.preventDefault();
          }
        }}
        className={styles.form}
        aria-label={selectedWizard.name + " form"}
      >
        {renderConfiguredFields()}

        <div className={styles.buttonRow}>
          <button type="button" onClick={handleBack} className={styles.button}>
            Back
          </button>
          <div className={styles.primaryActions}>
            {SHOW_COHORT_BUILDER_ACTION && (
              <button
                type="submit"
                disabled={!allRequiredFieldsFilled() || !isValid}
                className={`${styles.button} ${styles.buttonPrimary}`}
              >
                <AnalyticsIcon /> {submitLabel}
              </button>
            )}
            <button
              type="button"
              onClick={handleSubmit(onOpenDashboard)}
              disabled={!allRequiredFieldsFilled() || !isValid || dashboardFlow.state.isOpen}
              aria-busy={dashboardFlow.state.isOpen && dashboardFlow.state.status !== "ready"}
              className={`${styles.button} ${styles.buttonPrimary}`}
            >
              <AnalyticsIcon /> {submitLabel}
            </button>
          </div>
        </div>
      </form>
      <WizardDashboardModal
        state={dashboardFlow.state}
        onClose={dashboardFlow.close}
        onRetry={dashboardFlow.retry}
        datasetId={portalProps.datasetId}
        getToken={portalProps.getToken}
      />
    </div>
  );
}
