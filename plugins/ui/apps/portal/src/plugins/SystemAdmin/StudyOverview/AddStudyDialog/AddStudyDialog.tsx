import Divider from "@mui/material/Divider";
import FormControl from "@mui/material/FormControl";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import { SxProps } from "@mui/system";
import { Autocomplete, Button, Checkbox, Dialog, TextField } from "@portal/components";
import React, { ChangeEvent, FC, SyntheticEvent, useCallback, useEffect, useMemo, useState } from "react";
import SimpleMDE from "react-simplemde-editor";
import { api } from "../../../../axios/api";
import { FEATURE_FHIR_SERVER } from "../../../../config";
import { DatasetMap } from "../../../../constant";
import { useTranslation } from "../../../../contexts";
import { useDbVocabSchemas, useEnabledFeatures, usePaConfigs, useTenant } from "../../../../hooks";
import FlowRunNotificationDialog from "../FlowRunNotificationDialog/FlowRunNotificationDialog";
import {
  CacheDatasetType,
  CloseDialogType,
  Feedback,
  IDatabase,
  NewStudyInput,
  SourceDatasetType,
  StandaloneDatasetType,
  Study,
} from "../../../../types";
import { parseDatamodelOption, resolveSourceDatasetType } from "./datasetType";
import "./AddStudyDialog.scss";

interface AddStudyDialogProps {
  open: boolean;
  onClose?: (type: CloseDialogType) => void;
  loading: boolean;
  setLoading: React.Dispatch<React.SetStateAction<boolean>>;
  studies: Study[];
  databases: IDatabase[];
}

const mdeOptions = {
  hideIcons: ["side-by-side", "fullscreen"] as readonly ("side-by-side" | "fullscreen")[],
  maxHeight: "150px",
};

const customDataModelOption: Datamodel = {
  flowName: "custom-flow",
  datamodel: "custom",
  flowId: "",
};

const cacheDatasetTypeOptions: { title: string; type: CacheDatasetType }[] = [
  { title: "OMOP", type: CacheDatasetType.OMOP },
  { title: "Other datamodel", type: CacheDatasetType.NON_OMOP },
];

type ManagementMode = "webapi" | "source";

interface FormData {
  type: string;
  tokenStudyCode: string;
  schemaOption: string;
  cdmSchemaValue: string;
  isSameCdmSchemaForVocab: boolean;
  vocabSchemaValue: string;
  resultsSchemaValue: string;
  autoGenerateResultsSchema: boolean;
  name: string;
  summary: string;
  showRequestAccess: boolean;
  description: string;
  dataModel: string;
  dataModelCustom: string;
  plugin: string;
  databaseCode: string;
  dialect: string;
  paConfigId: string;
  visibilityStatus: string;
  managementMode: ManagementMode;

  cacheDatasetName: string;
  cacheDatasetType: CacheDatasetType;
}

interface FormError {
  tenantId: {
    required: boolean;
  };
  schemaOption: {
    required: boolean;
  };
  cdmSchemaValue: {
    required: boolean;
  };
  vocabSchemaValue: {
    required: boolean;
  };
  resultsSchemaValue: {
    required: boolean;
  };
  tokenStudyCode: {
    required: boolean;
    valid: boolean;
  };
  dataModel: {
    required: boolean;
  };
  dataModelCustom: {
    required: boolean;
  };
  databaseCode: {
    required: boolean;
  };
  paConfigId: {
    required: boolean;
  };
  name: {
    required: boolean;
  };
  type: {
    required: boolean;
  };

  cacheDatasetName: {
    required: boolean;
  };
  cacheDatasetType: {
    required: boolean;
  };
}

const EMPTY_FORM_ERROR: FormError = {
  tenantId: { required: false },
  tokenStudyCode: { required: false, valid: false },
  schemaOption: { required: false },
  cdmSchemaValue: { required: false },
  vocabSchemaValue: { required: false },
  resultsSchemaValue: { required: false },
  dataModel: { required: false },
  dataModelCustom: { required: false },
  databaseCode: { required: false },
  paConfigId: { required: false },
  name: { required: false },
  type: { required: false },
  cacheDatasetName: { required: false },
  cacheDatasetType: { required: false },
};

const EMPTY_FORM_DATA: FormData = {
  type: SourceDatasetType.SOURCE,
  tokenStudyCode: "",
  schemaOption: "",
  cdmSchemaValue: "", //Optional
  isSameCdmSchemaForVocab: true,
  vocabSchemaValue: "", //Optional
  resultsSchemaValue: "",
  autoGenerateResultsSchema: false,
  name: "",
  summary: "",
  showRequestAccess: false,
  description: "",
  dataModel: "", //Optional
  dataModelCustom: "", //Optional
  plugin: "",
  databaseCode: "", //Optional
  dialect: "",
  paConfigId: "",
  visibilityStatus: "HIDDEN",
  managementMode: "webapi",

  cacheDatasetName: "",
  cacheDatasetType: CacheDatasetType.OMOP,
};

/**
 * Schema Options Values
 */
interface dropdownOption {
  title: string;
  type: string;
}

interface Datamodel {
  flowName: string;
  datamodel: string;
  flowId: string;
}

// Todo: remove
// hardcoded values for FHIR dataset creation
const FHIR_DB_CODE = "d2e_fhir";
const FHIR_SCHEMA_NAME = "fhir";
const FHIR_DIALECT = "postgres";

export const SchemaTypes = {
  CreateCDM: "create_cdm",
  NoCDM: "no_cdm",
  FHIR: "fhir",
  CustomCDM: "custom_cdm",
  ExistingCDM: "existing_cdm",
};

const styles: SxProps = {
  color: "#000080",
  "&::after, &:hover:not(.Mui-disabled)::before": {
    borderBottom: "2px solid #000080",
  },
  ".MuiInputLabel-root": {
    color: "#000080",
    "&.MuiInputLabel-shrink, &.Mui-focused": {
      color: "var(--color-neutral)",
    },
  },
  ".MuiInput-input:focus": {
    backgroundColor: "transparent",
  },
  "&.MuiMenuItem-root:hover": {
    backgroundColor: "#ebf2fa",
  },
};

/**
 * Dialog shown when user is adding a study in admin portal
 * @param param0 AddStudyDialogProps
 * @returns The dialog object
 */
const AddStudyDialog: FC<AddStudyDialogProps> = ({ open, onClose, loading, setLoading, studies, databases }) => {
  const { getText, i18nKeys } = useTranslation();
  const [tenant] = useTenant();
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);
  const [formError, setFormError] = useState<FormError>(EMPTY_FORM_ERROR);
  const [dataModelOptions, setDataModelOptions] = useState<string[]>([]);
  const [schemas, setSchemas] = useState<string[]>([]);
  const [paConfigs] = usePaConfigs();
  const [vocabSchemas] = useDbVocabSchemas(formData.databaseCode);

  const [feedback, setFeedback] = useState<Feedback>({});
  const [featureFlags] = useEnabledFeatures();
  const [flowRunId, setFlowRunId] = useState<string | null>(null);
  const [createdDatasetName, setCreatedDatasetName] = useState<string>("");

  const SchemaOptions: dropdownOption[] = useMemo(() => {
    const result: dropdownOption[] = [
      {
        title: getText(i18nKeys.ADD_STUDY_DIALOG__CREATE_NEW_SCHEMA),
        type: SchemaTypes.CreateCDM,
      },
      {
        title: getText(i18nKeys.ADD_STUDY_DIALOG__EXISTING_SCHEMA),
        type: SchemaTypes.ExistingCDM,
      },
    ];

    if (featureFlags.includes(FEATURE_FHIR_SERVER)) {
      result.push({
        title: getText(i18nKeys.ADD_STUDY_DIALOG__CREATE_FHIR),
        type: SchemaTypes.FHIR,
      });
    }

    return result;
  }, [featureFlags]);

  const displayDatabases = useMemo(
    () => [SchemaTypes.CreateCDM, SchemaTypes.CustomCDM, SchemaTypes.ExistingCDM].includes(formData.schemaOption),
    [formData.schemaOption]
  );

  const displayDataModels = useMemo(
    () => formData.databaseCode && ![SchemaTypes.NoCDM, SchemaTypes.FHIR].includes(formData.schemaOption),
    [formData.schemaOption, formData.databaseCode]
  );

  const displayCustomDataModelInput = useMemo(
    () => formData.dataModel.split(" ")[0] === customDataModelOption.datamodel,
    [formData.dataModel]
  );

  const displaySameCdmVocabSchemaCheckbox = useMemo(
    () => [SchemaTypes.CreateCDM, SchemaTypes.CustomCDM, SchemaTypes.ExistingCDM].includes(formData.schemaOption),
    [formData.schemaOption]
  );

  const displayVocabSchemaDropdown = useMemo(
    () =>
      formData.databaseCode &&
      !formData.isSameCdmSchemaForVocab &&
      [SchemaTypes.CreateCDM, SchemaTypes.CustomCDM].includes(formData.schemaOption),
    [formData.databaseCode, formData.isSameCdmSchemaForVocab, formData.schemaOption]
  );

  const displayVocabSchemaInput = useMemo(
    () => formData.schemaOption === SchemaTypes.ExistingCDM && !formData.isSameCdmSchemaForVocab,
    [formData.schemaOption, formData.isSameCdmSchemaForVocab]
  );

  const displaySchemaNameInput = useMemo(
    () => formData.schemaOption === SchemaTypes.CustomCDM || formData.schemaOption === SchemaTypes.ExistingCDM,
    [formData.schemaOption]
  );

  const displayResultsSchemaInput = useMemo(() => formData.schemaOption !== SchemaTypes.FHIR, [formData.schemaOption]);

  const handleClose = useCallback(
    (type: CloseDialogType) => {
      setFeedback({});
      setFormData(EMPTY_FORM_DATA);
      setFormError(EMPTY_FORM_ERROR);
      setFlowRunId(null);
      setCreatedDatasetName("");
      typeof onClose === "function" && onClose(type);
    },
    [onClose]
  );

  const displayCacheConfiguration = useMemo(() => {
    return (
      formData.dialect !== "hana" &&
      formData.managementMode === "source" &&
      formData.type !== SourceDatasetType.FHIR &&
      formData.type !== StandaloneDatasetType.I2B2
    );
  }, [formData.dialect, formData.managementMode, formData.type]);

  const displayManagementMode = useMemo(() => {
    return formData.dialect !== "hana" && formData.type !== StandaloneDatasetType.I2B2;
  }, [formData.dialect, formData.type]);

  const isOmopDataModel = useCallback((dataModelOption: string) => {
    return dataModelOption.toLowerCase().startsWith("omop");
  }, []);

  const filteredDataModelOptions = useMemo(() => {
    if (formData.managementMode === "webapi") {
      return dataModelOptions.filter(isOmopDataModel);
    }
    return dataModelOptions;
  }, [dataModelOptions, formData.managementMode, isOmopDataModel]);

  const getDataModels = useCallback(async () => {
    try {
      const dataModelResult: Datamodel[] = await api.dataflow.getDatamodels();

      if (formData.schemaOption === SchemaTypes.ExistingCDM) {
        dataModelResult.push(customDataModelOption);
      }

      const dataModelOptions = dataModelResult.map((dataModel: Datamodel) => {
        return `${dataModel.datamodel} [${dataModel.flowName}]`;
      });

      setDataModelOptions(dataModelOptions);
    } catch (error) {
      console.error(error);
    }
  }, [formData.schemaOption]);

  useEffect(() => {
    if (![SchemaTypes.NoCDM, SchemaTypes.FHIR].includes(formData.schemaOption) && formData.databaseCode) {
      const db = databases.find((db) => db.code === formData.databaseCode);
      if (db) {
        getDataModels();
      }
    }
  }, [databases, formData.databaseCode, formData.schemaOption, getDataModels]);

  useEffect(() => {
    const getSchemas = () => {
      const filterByDb = (isCurrentDb: boolean) => {
        return studies
          .filter((study) => {
            if (study.schemaName)
              return isCurrentDb
                ? study.databaseCode === formData.databaseCode
                : study.databaseCode !== formData.databaseCode;
          })
          .map((study) => study.schemaName.toUpperCase());
      };

      const filteredSchemas = filterByDb(false).filter((schema) => filterByDb(true).indexOf(schema) === -1);
      setSchemas(filteredSchemas);
    };
    getSchemas();
  }, [formData.databaseCode, studies]);

  const handleFormDataChange = useCallback((changes: { [field: string]: any }) => {
    setFormData((formData) => ({ ...formData, ...changes }));
  }, []);

  const tokenIsValid = useCallback((token: string) => {
    const tokenFormat = /^[a-zA-Z0-9_]{1,80}$/;
    if (token.match(tokenFormat)) {
      return true;
    }
  }, []);

  const isFormError = useCallback(() => {
    const {
      type,
      tokenStudyCode,
      schemaOption,
      cdmSchemaValue,
      isSameCdmSchemaForVocab,
      vocabSchemaValue,
      resultsSchemaValue,
      dataModel,
      dataModelCustom,
      databaseCode,
      paConfigId,
      name,
      dialect,

      cacheDatasetName,
      cacheDatasetType,
    } = formData;

    let formError: FormError | {} = {};
    if (!tokenStudyCode) {
      formError = { ...formError, tokenStudyCode: { required: true } };
    }

    if (tokenStudyCode && !tokenIsValid(tokenStudyCode)) {
      formError = { ...formError, tokenStudyCode: { valid: true } };
    }

    if (![SchemaTypes.NoCDM, SchemaTypes.FHIR].includes(formData.schemaOption) && !databaseCode) {
      formError = { ...formError, databaseCode: { required: true } };
    }

    if (!schemaOption) {
      formError = { ...formError, schemaOption: { required: true } };
    }

    if (schemaOption == SchemaTypes.CustomCDM && cdmSchemaValue == "" && !schemas.includes(formData.cdmSchemaValue)) {
      formError = { ...formError, cdmSchemaValue: { required: true } };
    }

    if ([SchemaTypes.ExistingCDM].includes(schemaOption) && cdmSchemaValue == "") {
      formError = { ...formError, cdmSchemaValue: { required: true } };
    }

    if (![SchemaTypes.NoCDM, SchemaTypes.FHIR].includes(formData.schemaOption) && dataModel == "") {
      formError = { ...formError, dataModel: { required: true } };
    }

    if (schemaOption === SchemaTypes.ExistingCDM && dataModel === customDataModelOption.datamodel && !dataModelCustom) {
      formError = { ...formError, dataModelCustom: { required: true } };
    }

    if (
      [SchemaTypes.CreateCDM, SchemaTypes.CustomCDM, SchemaTypes.ExistingCDM].includes(schemaOption) &&
      !isSameCdmSchemaForVocab &&
      !vocabSchemaValue
    ) {
      formError = { ...formError, vocabSchemaValue: { required: true } };
    }

    // Result schema is only required if:
    // 1. Not FHIR
    // 2. Either not CreateCDM, OR CreateCDM but use default result schema is unchecked
    if (
      !resultsSchemaValue &&
      schemaOption !== SchemaTypes.FHIR &&
      !(schemaOption === SchemaTypes.CreateCDM && formData.autoGenerateResultsSchema)
    ) {
      formError = { ...formError, resultsSchemaValue: { required: true } };
    }

    if (!paConfigId) {
      formError = { ...formError, paConfigId: { required: true } };
    }

    if (!name.trim()) {
      formError = { ...formError, name: { required: true } };
    }

    // Type selection is required for HANA databases
    if (dialect === "hana" && !type) {
      formError = { ...formError, type: { required: true } };
    }

    if (
      !cacheDatasetName &&
      dialect !== "hana" &&
      formData.managementMode === "source" &&
      type !== SourceDatasetType.FHIR &&
      type !== StandaloneDatasetType.I2B2
    ) {
      formError = { ...formError, cacheDatasetName: { required: true } };
    }

    if (
      !cacheDatasetType &&
      dialect !== "hana" &&
      formData.managementMode === "source" &&
      type !== SourceDatasetType.FHIR &&
      type !== StandaloneDatasetType.I2B2
    ) {
      formError = { ...formError, cacheDatasetType: { required: true } };
    }

    if (Object.keys(formError).length > 0) {
      console.error("Validation errors:", formError);
      setFormError({ ...EMPTY_FORM_ERROR, ...(formError as FormError) });
      return true;
    }
    return false;
  }, [formData, schemas, tokenIsValid]);

  const handleSubmit = useCallback(async () => {
    console.log("Submitting form data:", formData);
    const hasError = isFormError();
    if (hasError) {
      console.error("Form has errors. Current formData:", formData);
      return;
    }

    setFeedback({});
    setFormError(EMPTY_FORM_ERROR);

    const {
      type,
      tokenStudyCode,
      schemaOption,
      cdmSchemaValue,
      vocabSchemaValue,
      resultsSchemaValue,
      name,
      summary,
      showRequestAccess,
      description,
      dataModel,
      dataModelCustom,
      databaseCode,
      dialect,
      paConfigId,
      visibilityStatus,

      cacheDatasetName,
      cacheDatasetType,
    } = formData;
    const dataModelDetails = parseDatamodelOption(dataModel);
    const parsedDataModel =
      dataModelDetails.dataModel === customDataModelOption.datamodel ? dataModelCustom : dataModelDetails.dataModel;

    const parsedDatasetType = dialect === "hana" ? `hana__${type}` : type;

    const input: NewStudyInput = {
      tenantId: tenant?.id || "",
      detail: {
        name: name.trim(),
        summary,
        description,
        showRequestAccess,
      },
      type: parsedDatasetType,
      tokenStudyCode,
      schemaOption,
      cdmSchemaValue,
      vocabSchemaValue,
      resultsSchemaValue,
      dataModel: parsedDataModel,
      plugin: dataModelDetails.plugin,
      databaseCode,
      dialect,
      paConfigId,
      visibilityStatus: dialect === "hana" ? "DEFAULT" : visibilityStatus,
      attributes: [],
      tags: [],
      dashboards: [],
      cacheDatasetName,
      cacheDatasetType,
      webApiManaged: formData.managementMode === "webapi",
    };

    try {
      setLoading(true);
      const result = await api.gateway.createDataset(input);

      setCreatedDatasetName(name.trim());
      setFlowRunId((result as any)?.flowRunId ?? null);
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.data?.message || err.data,
      });
      console.error("err", err.data);
    } finally {
      setLoading(false);
    }
  }, [formData, tenant, isFormError, setLoading, handleClose]);

  if (createdDatasetName) {
    return (
      <FlowRunNotificationDialog
        title={getText(i18nKeys.ADD_STUDY_DIALOG__DATASET_CREATED_TITLE)}
        open={open}
        onClose={() => handleClose("success")}
        description={getText(i18nKeys.ADD_STUDY_DIALOG__DATASET_CREATED_DESCRIPTION, [createdDatasetName])}
        flowRunId={flowRunId}
      />
    );
  }

  return (
    <Dialog
      className="add-study-dialog"
      title={getText(i18nKeys.ADD_STUDY_DIALOG__ADD_DATASET)}
      closable
      fullWidth
      maxWidth="md"
      open={open}
      onClose={() => handleClose("cancelled")}
      feedback={feedback}
    >
      <Divider />
      <div className="add-study-dialog__content">
        <div style={{ marginTop: "32px", fontWeight: "bold" }}>{getText(i18nKeys.ADD_STUDY_DIALOG__INFO_CONFIG)}</div>
        <div style={{ marginBottom: "32px" }}>
          <TextField
            fullWidth
            variant="standard"
            label={getText(i18nKeys.ADD_STUDY_DIALOG__DATASET_NAME)}
            value={formData.name}
            onChange={(event) => handleFormDataChange({ name: event.target.value })}
            error={formError.name.required}
          />
          {formError.name.required && (
            <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
          )}
        </div>
        <div style={{ marginBottom: "32px" }}>
          <TextField
            fullWidth
            variant="standard"
            multiline
            rows={4}
            label={getText(i18nKeys.ADD_STUDY_DIALOG__DATASET_SUMMARY)}
            value={formData.summary}
            onChange={(event) => handleFormDataChange({ summary: event.target.value })}
          />
        </div>
        <div>{getText(i18nKeys.ADD_STUDY_DIALOG__DESCRIPTION)}</div>
        <SimpleMDE
          data-testid="add-study-mde"
          value={formData.description}
          onChange={(value) => handleFormDataChange({ description: value })}
          options={mdeOptions}
          style={{ marginTop: "11px" }}
        />
        {/* Schema Options */}
        <div style={{ marginBottom: "32px" }}>
          <FormControl
            sx={styles}
            className="select"
            variant="standard"
            fullWidth
            {...(formError.schemaOption.required ? { error: true } : {})}
          >
            <InputLabel htmlFor="schema-option">{getText(i18nKeys.ADD_STUDY_DIALOG__CDM_SCHEMA_OPTION)}</InputLabel>
            <Select
              sx={styles}
              value={formData.schemaOption}
              onChange={(event: SelectChangeEvent<string>) => {
                const schemaOption = event.target.value;
                const newType = schemaOption === SchemaTypes.FHIR ? SourceDatasetType.FHIR : SourceDatasetType.SOURCE;
                handleFormDataChange({
                  schemaOption,
                  cdmSchemaValue: "",
                  isSameCdmSchemaForVocab: true,
                  vocabSchemaValue: "",
                  resultsSchemaValue: "",
                  autoGenerateResultsSchema: false,
                  databaseCode: "",
                  dialect: "",
                  type: newType,
                  cacheDatasetType: DatasetMap[newType][0],
                  // webapi requires OMOP — FHIR is non-OMOP, so force source mode.
                  ...(schemaOption === SchemaTypes.FHIR ? { managementMode: "source" as ManagementMode } : {}),
                });
              }}
              inputProps={{
                name: "schemaOption",
                id: "schema-option",
              }}
            >
              <MenuItem sx={styles} value="">
                &nbsp;
              </MenuItem>
              {SchemaOptions?.map((option) => (
                <MenuItem sx={styles} key={option.type} value={option.type}>
                  {option.title}
                </MenuItem>
              ))}
            </Select>
            {formError.schemaOption.required && (
              <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
            )}
          </FormControl>
        </div>
        {/* Management mode (webapi vs source). webapi is OMOP-only and disabled for FHIR. */}
        {displayManagementMode && (
          <div style={{ marginBottom: "32px" }}>
            <FormControl sx={styles} className="select" variant="standard" fullWidth>
              <InputLabel htmlFor="management-mode-option">
                {getText(i18nKeys.ADD_STUDY_DIALOG__MANAGEMENT_MODE)}
              </InputLabel>
              <Select
                sx={styles}
                value={formData.managementMode}
                onChange={(event: SelectChangeEvent<string>) => {
                  const managementMode = event.target.value as ManagementMode;
                  const changes: Partial<FormData> = { managementMode };
                  if (managementMode === "webapi" && formData.dataModel && !isOmopDataModel(formData.dataModel)) {
                    changes.dataModel = "";
                    changes.dataModelCustom = "";
                  }
                  handleFormDataChange(changes);
                }}
                inputProps={{
                  name: "managementMode",
                  id: "management-mode-option",
                }}
              >
                <MenuItem sx={styles} value="webapi" disabled={formData.schemaOption === SchemaTypes.FHIR}>
                  {getText(i18nKeys.ADD_STUDY_DIALOG__MANAGEMENT_MODE_WEBAPI)}
                </MenuItem>
                <MenuItem sx={styles} value="source">
                  {getText(i18nKeys.ADD_STUDY_DIALOG__MANAGEMENT_MODE_SOURCE)}
                </MenuItem>
              </Select>
            </FormControl>
          </div>
        )}
        {/* DB Input */}
        {displayDatabases && (
          <div style={{ marginBottom: "32px" }}>
            <FormControl
              sx={styles}
              className="select"
              variant="standard"
              fullWidth
              {...(formError.databaseCode.required ? { error: true } : {})}
            >
              <InputLabel htmlFor="data-model-option">{getText(i18nKeys.ADD_STUDY_DIALOG__DATABASES)}</InputLabel>
              <Select
                sx={styles}
                value={formData.databaseCode}
                onChange={(event: SelectChangeEvent<string>) => {
                  const db = databases.find((db) => db.code === event.target.value);
                  const isHana = db?.dialect === "hana";

                  handleFormDataChange({
                    databaseCode: db?.code || "",
                    dialect: db?.dialect || "",
                    cdmSchemaValue: "",
                    vocabSchemaValue: "",
                    // Set type to empty for HANA where user need to manually select the type
                    type: isHana ? "" : SourceDatasetType.SOURCE,
                    // HANA hides the management-mode toggle and uses its own dataset types,
                    // so force source mode to avoid submitting webApiManaged=true by default.
                    ...(isHana ? { managementMode: "source" as ManagementMode } : {}),
                  });
                }}
                inputProps={{
                  name: "databaseOption",
                  id: "data-base-option",
                }}
              >
                <MenuItem sx={styles} value="">
                  &nbsp;
                </MenuItem>
                {databases?.map((db) => (
                  <MenuItem sx={styles} key={db.code} value={db.code}>
                    {db.code}-{db.dialect}
                  </MenuItem>
                ))}
              </Select>
              {formError.databaseCode.required && (
                <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </FormControl>
          </div>
        )}

        {/*source dataset type */}
        {formData.dialect !== "hana" ? (
          <div style={{ marginBottom: "32px" }}>
            <TextField
              disabled
              fullWidth
              variant="standard"
              label={getText(i18nKeys.ADD_STUDY_DIALOG__TYPE)}
              value={formData.type}
            />
          </div>
        ) : (
          <div style={{ marginBottom: "32px" }}>
            <FormControl
              sx={styles}
              className="select"
              variant="standard"
              disabled={formData.dialect !== "hana"}
              fullWidth
              {...(formError.type?.required ? { error: true } : {})}
            >
              <InputLabel htmlFor="type-option">{getText(i18nKeys.ADD_STUDY_DIALOG__HANA_TYPE)}</InputLabel>
              <Select
                sx={styles}
                value={formData.type}
                onChange={(event: SelectChangeEvent<string>) =>
                  handleFormDataChange({ type: event.target.value as CacheDatasetType })
                }
                inputProps={{
                  name: "type",
                  id: "type-option",
                }}
              >
                <MenuItem sx={styles} value="">
                  &nbsp;
                </MenuItem>
                {cacheDatasetTypeOptions.map((option) => (
                  <MenuItem sx={styles} key={option.type} value={option.type}>
                    {option.title}
                  </MenuItem>
                ))}
              </Select>
              {formError.type?.required && (
                <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </FormControl>
          </div>
        )}

        {/* Custom Schema Input */}
        {displaySchemaNameInput &&
          (formData.schemaOption === SchemaTypes.ExistingCDM ? (
            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.ADD_STUDY_DIALOG__SCHEMA_NAME)}
                value={formData.cdmSchemaValue}
                onChange={(event) => {
                  const cdmSchemaValue = event.target.value;
                  const changes: any = { cdmSchemaValue };
                  // Use default result schema if checkbox is checked
                  if (formData.autoGenerateResultsSchema) {
                    changes.resultsSchemaValue = cdmSchemaValue ? `${cdmSchemaValue}_results` : "";
                  }
                  handleFormDataChange(changes);
                }}
                error={formError.cdmSchemaValue.required}
              />
              {formError.cdmSchemaValue.required && (
                <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </div>
          ) : formData.schemaOption === SchemaTypes.CustomCDM ? (
            <div style={{ marginBottom: "32px" }}>
              <Autocomplete
                freeSolo
                sx={styles}
                id="autocomplete-schemas"
                options={schemas}
                renderInput={(params) => (
                  <TextField {...params} label={getText(i18nKeys.ADD_STUDY_DIALOG__SCHEMA_NAME)} variant="standard" />
                )}
                value={formData?.cdmSchemaValue}
                onChange={(_: SyntheticEvent<Element, Event>, cdmSchemaValue: string | string[] | null) => {
                  const changes: any = { cdmSchemaValue };
                  // Use default result schema if checkbox is checked
                  if (formData.autoGenerateResultsSchema && cdmSchemaValue) {
                    changes.resultsSchemaValue = `${cdmSchemaValue}_results`;
                  }
                  handleFormDataChange(changes);
                }}
                disabled={schemas.length === 0}
              />
              {schemas.length === 0 && (
                <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__NO_AVAILABLE_SCHEMA)}</FormHelperText>
              )}
              {formError.cdmSchemaValue.required && (
                <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__INVALID_SCHEMA_NAME)}</FormHelperText>
              )}
            </div>
          ) : (
            formData.schemaOption === SchemaTypes.FHIR && (
              <div style={{ marginBottom: "32px" }}>
                <FormControl
                  sx={styles}
                  className="select"
                  variant="standard"
                  fullWidth
                  {...(formError.cdmSchemaValue.required ? { error: true } : {})}
                >
                  <InputLabel htmlFor="cdm-schema-option">{getText(i18nKeys.ADD_STUDY_DIALOG__SCHEMA_NAME)}</InputLabel>
                  <Select
                    sx={styles}
                    value={formData.cdmSchemaValue}
                    onChange={(event: SelectChangeEvent<string>) =>
                      handleFormDataChange({ cdmSchemaValue: event.target.value })
                    }
                    inputProps={{
                      name: "cdmSchemaOption",
                      id: "cdm-schema-option",
                    }}
                  >
                    <MenuItem sx={styles} value="">
                      &nbsp;
                    </MenuItem>
                    {/* Use vocab schemas defined in the database as the schema options  */}
                    {vocabSchemas[formData.databaseCode]?.map((vocabSchema) => (
                      <MenuItem sx={styles} key={vocabSchema} value={vocabSchema}>
                        {vocabSchema}
                      </MenuItem>
                    ))}
                  </Select>
                  {formError.cdmSchemaValue.required && (
                    <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
                  )}
                </FormControl>
              </div>
            )
          ))}
        {displaySameCdmVocabSchemaCheckbox && (
          <div style={{ marginBottom: "32px" }}>
            <Checkbox
              checked={formData.isSameCdmSchemaForVocab}
              checkbox-id="is-same-cdm-schema-for-vocab-checkbox"
              label={getText(i18nKeys.ADD_STUDY_DIALOG__USE_SAME_SCHEMA)}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const isSameCdmSchemaForVocab = event.target.checked;
                handleFormDataChange(
                  isSameCdmSchemaForVocab
                    ? { vocabSchemaValue: "", isSameCdmSchemaForVocab }
                    : { isSameCdmSchemaForVocab }
                );
              }}
            />
          </div>
        )}
        {/* Vocab Schema Dropdown */}
        {displayVocabSchemaDropdown ? (
          <div style={{ marginBottom: "32px" }}>
            <FormControl
              sx={styles}
              className="select"
              variant="standard"
              fullWidth
              {...(formError.vocabSchemaValue.required ? { error: true } : {})}
            >
              <InputLabel htmlFor="vocab-schema-option">
                {getText(i18nKeys.ADD_STUDY_DIALOG__VOCAB_SCHEMA_NAME)}
              </InputLabel>
              <Select
                sx={styles}
                value={formData.vocabSchemaValue}
                onChange={(event: SelectChangeEvent<string>) =>
                  handleFormDataChange({ vocabSchemaValue: event.target.value })
                }
                inputProps={{
                  name: "vocabSchemaOption",
                  id: "vocab-schema-option",
                }}
              >
                <MenuItem sx={styles} value="">
                  &nbsp;
                </MenuItem>
                {vocabSchemas[formData.databaseCode]?.map((vocabSchema) => (
                  <MenuItem sx={styles} key={vocabSchema} value={vocabSchema}>
                    {vocabSchema}
                  </MenuItem>
                ))}
              </Select>
              {formError.vocabSchemaValue.required && (
                <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </FormControl>
          </div>
        ) : (
          // Custom Vocab Schema Input
          displayVocabSchemaInput && (
            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.ADD_STUDY_DIALOG__VOCAB_SCHEMA_NAME)}
                value={formData.vocabSchemaValue}
                onChange={(event) => handleFormDataChange({ vocabSchemaValue: event.target.value })}
                error={formError.vocabSchemaValue.required}
              />
              {formError.vocabSchemaValue.required && (
                <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </div>
          )
        )}
        {displayResultsSchemaInput && (
          <>
            <div style={{ marginBottom: "32px" }}>
              <Checkbox
                checked={formData.autoGenerateResultsSchema}
                checkbox-id="auto-generate-result-schema-checkbox"
                label={getText(i18nKeys.ADD_STUDY_DIALOG__AUTO_GENERATE_RESULT_SCHEMA)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  const autoGenerateResultsSchema = event.target.checked;
                  const changes: any = { autoGenerateResultsSchema };
                  // If checked, use default result schema name
                  if (autoGenerateResultsSchema) {
                    if (formData.schemaOption === SchemaTypes.CreateCDM) {
                      // For CreateCDM, the value will be generated in the backend
                      changes.resultsSchemaValue = "";
                    } else if (formData.cdmSchemaValue) {
                      // For other types, generate it based on cdm schema value
                      changes.resultsSchemaValue = `${formData.cdmSchemaValue}_results`;
                    }
                  }
                  handleFormDataChange(changes);
                }}
              />
            </div>
            {/* Hide textbox for CreateCDM when checkbox is checked */}
            {!(formData.schemaOption === SchemaTypes.CreateCDM && formData.autoGenerateResultsSchema) && (
              <div style={{ marginBottom: "32px" }}>
                <TextField
                  fullWidth
                  variant="standard"
                  label={getText(i18nKeys.ADD_STUDY_DIALOG__RESULT_SCHEMA_NAME)}
                  value={formData.resultsSchemaValue}
                  onChange={(event) => handleFormDataChange({ resultsSchemaValue: event.target.value })}
                  error={formError.resultsSchemaValue.required}
                  disabled={formData.autoGenerateResultsSchema}
                />
                {formError.resultsSchemaValue.required && (
                  <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
                )}
              </div>
            )}
          </>
        )}
        {/* Data Model Options */}
        {displayDataModels && (
          <div style={{ marginBottom: "32px" }}>
            <FormControl
              sx={styles}
              className="select"
              variant="standard"
              fullWidth
              {...(formError.dataModel.required ? { error: true } : {})}
            >
              <InputLabel htmlFor="data-model-option">
                {getText(i18nKeys.ADD_STUDY_DIALOG__DATA_MODEL_OPTION)}
              </InputLabel>
              <Select
                sx={styles}
                value={formData.dataModel}
                onChange={(event: SelectChangeEvent<string>) => {
                  const dataModel = event.target.value;
                  // HANA uses its own type dropdown — don't derive type from the data model.
                  if (formData.dialect === "hana") {
                    handleFormDataChange({ dataModel });
                    return;
                  }
                  const type = resolveSourceDatasetType(dataModel);
                  const changes: Partial<FormData> = { dataModel, type };
                  // i2b2 is standalone: always source-managed with no cache. Clear any cache
                  if (type === StandaloneDatasetType.I2B2) {
                    changes.managementMode = "source";
                    changes.cacheDatasetName = "";
                    changes.cacheDatasetType = CacheDatasetType.OMOP;
                  }
                  handleFormDataChange(changes);
                }}
                inputProps={{
                  name: "dataModelOption",
                  id: "data-model-option",
                }}
              >
                <MenuItem sx={styles} value="">
                  &nbsp;
                </MenuItem>
                {filteredDataModelOptions?.map((model) => (
                  <MenuItem sx={styles} key={model} value={model}>
                    {model}
                  </MenuItem>
                ))}
              </Select>

              {formError.dataModel.required && (
                <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </FormControl>
          </div>
        )}
        {/* Custom Data Model Options */}
        {displayCustomDataModelInput && (
          <div style={{ marginBottom: "32px" }}>
            <TextField
              fullWidth
              variant="standard"
              label={getText(i18nKeys.ADD_STUDY_DIALOG__CUSTOM_DATA_MODEL_OPTION)}
              value={formData.dataModelCustom}
              onChange={(event) => handleFormDataChange({ dataModelCustom: event.target.value })}
              error={formError.dataModelCustom.required}
            />

            {formError.dataModelCustom.required && (
              <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
            )}
          </div>
        )}
        <div style={{ marginBottom: "32px" }}>
          <FormControl
            sx={styles}
            className="select"
            variant="standard"
            fullWidth
            {...(formError.paConfigId.required ? { error: true } : {})}
          >
            <InputLabel htmlFor="pa-config-option">{getText(i18nKeys.ADD_STUDY_DIALOG__PA_CONFIG)}</InputLabel>
            <Select
              sx={styles}
              value={formData.paConfigId}
              onChange={(event: SelectChangeEvent<string>) => handleFormDataChange({ paConfigId: event.target.value })}
              inputProps={{
                name: "paConfigOption",
                id: "pa-config-option",
              }}
            >
              <MenuItem sx={styles} value="">
                &nbsp;
              </MenuItem>
              {paConfigs?.map((config) => (
                <MenuItem sx={styles} key={config.configId} value={config.configId}>
                  {config.configName}
                </MenuItem>
              ))}
            </Select>
            {formError.paConfigId.required && (
              <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
            )}
          </FormControl>
        </div>
        <div style={{ marginBottom: "32px" }}>
          <TextField
            fullWidth
            variant="standard"
            label={getText(i18nKeys.ADD_STUDY_DIALOG__TOKEN_DATASET_CODE)}
            value={formData.tokenStudyCode}
            onChange={(event) => handleFormDataChange({ tokenStudyCode: event.target.value })}
            inputProps={{ maxLength: 48 }}
            error={formError.tokenStudyCode.required || formError.tokenStudyCode.valid}
          />
          {formError.tokenStudyCode.required && (
            <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
          )}
          {formError.tokenStudyCode.valid && (
            <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__ENTER_VALID_DATASET_CODE)}</FormHelperText>
          )}
          <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__DATASET_CODE_ALLOWED_VALUES)}</FormHelperText>
        </div>
        {displayCacheConfiguration && (
          <>
            <div style={{ marginBottom: "32px", fontWeight: "bold" }}>
              {getText(i18nKeys.ADD_STUDY_DIALOG__CACHE_DATASET_CONFIGURATION)}
            </div>

            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.ADD_STUDY_DIALOG__CACHE_DATASET_NAME)}
                value={formData.cacheDatasetName}
                onChange={(event) => handleFormDataChange({ cacheDatasetName: event.target.value })}
                error={formError.cacheDatasetName.required}
              />
              {formError.cacheDatasetName.required && (
                <FormHelperText error={true}>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </div>
            <div style={{ marginBottom: "32px" }}>
              <FormControl
                sx={styles}
                className="select"
                variant="standard"
                fullWidth
                {...(formError.vocabSchemaValue.required ? { error: true } : {})}
              >
                <InputLabel htmlFor="cache-dataset-option">
                  {getText(i18nKeys.ADD_STUDY_DIALOG__CACHE_DATASET_TYPE)}
                </InputLabel>
                <Select
                  sx={styles}
                  value={formData.cacheDatasetType}
                  onChange={(event: SelectChangeEvent<string>) =>
                    handleFormDataChange({ cacheDatasetType: event.target.value as CacheDatasetType })
                  }
                  inputProps={{
                    name: "cacheDatasetType",
                    id: "cache-dataset-option",
                  }}
                >
                  {cacheDatasetTypeOptions.map((option) => (
                    <MenuItem sx={styles} key={option.type} value={option.type}>
                      {option.title}
                    </MenuItem>
                  ))}
                </Select>
                {formError.cacheDatasetType.required && (
                  <FormHelperText>{getText(i18nKeys.ADD_STUDY_DIALOG__REQUIRED)}</FormHelperText>
                )}
              </FormControl>
            </div>
          </>
        )}
      </div>
      <Divider />
      <div className="button-group-actions">
        <Button
          text={getText(i18nKeys.ADD_STUDY_DIALOG__CANCEL)}
          onClick={() => handleClose("cancelled")}
          variant="outlined"
          block
          disabled={loading}
        />
        <Button text={getText(i18nKeys.ADD_STUDY_DIALOG__ADD)} onClick={handleSubmit} block loading={loading} />
      </div>
    </Dialog>
  );
};

export default AddStudyDialog;
