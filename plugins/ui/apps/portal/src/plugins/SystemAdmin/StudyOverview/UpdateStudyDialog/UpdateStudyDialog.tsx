import React, { FC, useCallback, useEffect, useState, ChangeEvent, SetStateAction } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormControl from "@mui/material/FormControl";
import FormLabel from "@mui/material/FormLabel";
import FormHelperText from "@mui/material/FormHelperText";
import InputLabel from "@mui/material/InputLabel";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import Select, { SelectChangeEvent } from "@mui/material/Select";
import TextField from "@mui/material/TextField";
import { SxProps } from "@mui/system";
import SimpleMdeReact from "react-simplemde-editor";
import { Button, Checkbox, Dialog, Feedback } from "@portal/components";
import { api } from "../../../../axios/api";
import {
  NewStudyMetadataInput,
  CloseDialogType,
  UpdateStudyMetadataInput,
  Study,
  SourceDatasetType,
} from "../../../../types";
import { usePaConfigs, useDatasetTagConfigs, useDatasetAttributeConfigs } from "../../../../hooks";
import "./UpdateStudyDialog.scss";
import { useTranslation } from "../../../../contexts";

const DATASET_SOURCE_TYPES = new Set<string>(Object.values(SourceDatasetType));

interface UpdateStudyDialogProps {
  dataset: Study;
  open: boolean;
  onClose?: (type: CloseDialogType) => void;
}

const mdeOptions = {
  hideIcons: ["side-by-side", "fullscreen"] as readonly ("side-by-side" | "fullscreen")[],
  maxHeight: "150px",
};

interface FormData {
  id: string;
  tokenStudyCode: string;
  type: string;
  name: string;
  summary: string;
  showRequestAccess: boolean;
  description: string;
  paConfigId: string;
  visibilityStatus: string;
  vocabSchemaName: string;
  resultsSchemaName: string;
}

interface FormError {
  tokenStudyCode: {
    required: boolean;
    valid: boolean;
  };
  paConfigId: {
    required: boolean;
  };
  name: {
    required: boolean;
  };
  vocabSchemaName: {
    required: boolean;
  };
  resultsSchemaName: {
    required: boolean;
  };
}

const EMPTY_FORM_ERROR: FormError = {
  tokenStudyCode: { required: false, valid: false },
  paConfigId: { required: false },
  name: { required: false },
  vocabSchemaName: { required: false },
  resultsSchemaName: { required: false },
};

const EMPTY_FORM_DATA: FormData = {
  id: "",
  type: "",
  tokenStudyCode: "",
  name: "",
  summary: "",
  showRequestAccess: false,
  description: "",
  paConfigId: "",
  visibilityStatus: "DEFAULT",
  vocabSchemaName: "",
  resultsSchemaName: "",
};

const styles: SxProps = {
  ".MuiInputLabel-root": {
    color: "var(--color-primary)",
    "&.MuiInputLabel-shrink, &.Mui-focused": {
      color: "var(--color-neutral)",
    },
  },
  ".MuiInput-input:focus": {
    backgroundColor: "transparent",
    color: "var(--color-primary)",
  },
  ".MuiInput-root": {
    color: "var(--color-primary)",
    "&::after, &:hover:not(.Mui-disabled)::before": {
      borderBottom: "2px solid var(--color-primary)",
    },
  },
};

const EMPTY_STUDY_METADATA: NewStudyMetadataInput = { attributeId: "", value: "" };

const UpdateStudyDialog: FC<UpdateStudyDialogProps> = ({ dataset, open, onClose }) => {
  const { getText, i18nKeys } = useTranslation();
  const datasetId = dataset.id;
  const [formData, setFormData] = useState<FormData>(EMPTY_FORM_DATA);
  const [formError, setFormError] = useState<FormError>(EMPTY_FORM_ERROR);
  const [paConfigs] = usePaConfigs();
  const [tagConfigs] = useDatasetTagConfigs();
  const [attributeConfigs] = useDatasetAttributeConfigs();
  const [studyMetadata, setStudyMetadata] = useState<NewStudyMetadataInput[]>([EMPTY_STUDY_METADATA]);
  const [studyTagsData, setStudyTagsData] = useState<Array<string>>([]);
  const [updating, setUpdating] = useState(false);

  const [feedback, setFeedback] = useState<Feedback>({});
  const [formMetadataErrorIndex, setFormMetadataErrorIndex] = useState<Array<Number>>([]);

  useEffect(() => {
    setFormMetadataErrorIndex([]);

    if (dataset) {
      setFormData({
        id: dataset.id,
        tokenStudyCode: dataset.tokenStudyCode,
        type: dataset.type,
        paConfigId: dataset.paConfigId,
        name: dataset.studyDetail?.name || "",
        summary: dataset.studyDetail?.summary || "",
        showRequestAccess: dataset.studyDetail?.showRequestAccess || false,
        description: dataset.studyDetail?.description || "",
        visibilityStatus: dataset.visibilityStatus,
        vocabSchemaName: dataset.vocabSchemaName || "",
        resultsSchemaName: dataset.resultsSchemaName || "",
      });
    } else {
      setFormData(EMPTY_FORM_DATA);
    }
    dataset?.tags && setStudyTagsData(dataset?.tags?.map((tag) => tag.name));
    if (dataset?.attributes && dataset?.attributes?.length > 0) {
      setStudyMetadata(
        dataset?.attributes?.map((attribute) => ({
          attributeId: attribute.attributeId,
          value: attribute.value,
        }))
      );
    } else {
      setStudyMetadata([EMPTY_STUDY_METADATA]);
    }
  }, [dataset, open]);

  const handleClose = useCallback(
    (type: CloseDialogType) => {
      setFeedback({});
      setFormData(EMPTY_FORM_DATA);
      setFormError(EMPTY_FORM_ERROR);
      setStudyMetadata([]);

      typeof onClose === "function" && onClose(type);
    },
    [onClose, setFeedback]
  );

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
    const { tokenStudyCode, paConfigId, name, vocabSchemaName, resultsSchemaName } = formData;

    let formError: FormError | {} = {};
    if (!tokenStudyCode) {
      formError = { ...formError, tokenStudyCode: { required: true } };
    }

    if (tokenStudyCode && !tokenIsValid(tokenStudyCode)) {
      formError = { ...formError, tokenStudyCode: { valid: true } };
    }

    if (!paConfigId) {
      formError = { ...formError, paConfigId: { required: true } };
    }

    if (!name) {
      formError = { ...formError, name: { required: true } };
    }

    if (!vocabSchemaName) {
      formError = { ...formError, vocabSchemaName: { required: true } };
    }

    if (!DATASET_SOURCE_TYPES.has(dataset.type)) {
      if (!resultsSchemaName) {
        formError = { ...formError, resultsSchemaName: { required: true } };
      }
    }

    if (Object.keys(formError).length > 0) {
      setFormError({ ...EMPTY_FORM_ERROR, ...(formError as FormError) });
      return true;
    }
    return false;
  }, [formData, tokenIsValid, dataset]);

  const isFormMetadataError = useCallback(() => {
    const indexError: Number[] = [];
    studyMetadata.forEach((metadata, index) => {
      if (!metadata.value && metadata.attributeId) {
        indexError.push(index);
      }
    });

    setFormMetadataErrorIndex(indexError);
    return indexError.length > 0;
  }, [studyMetadata]);

  const handleSubmit = useCallback(async () => {
    if (isFormError() || isFormMetadataError()) {
      return;
    }

    setFeedback({});
    setFormError(EMPTY_FORM_ERROR);

    const {
      type,
      tokenStudyCode,
      name,
      summary,
      showRequestAccess,
      description,
      paConfigId,
      visibilityStatus,
      vocabSchemaName,
      resultsSchemaName,
    } = formData;

    try {
      const data: UpdateStudyMetadataInput = {
        id: datasetId,
        detail: {
          name,
          summary,
          description,
          showRequestAccess,
        },
        type,
        tokenDatasetCode: tokenStudyCode,
        vocabSchemaName,
        resultsSchemaName,
        paConfigId,
        visibilityStatus,
        attributes: studyMetadata.filter((info) => info.attributeId !== ""),
        tags: studyTagsData?.map((tagName) => tagName),
        dashboards: [],
      };
      setUpdating(true);
      await api.systemPortal.updateDataset(data);
      handleClose("success");
    } catch (err: any) {
      setFeedback({
        type: "error",
        message: err.data?.message || err.data,
      });
      console.error("err", err.data);
    } finally {
      setUpdating(false);
    }
  }, [formData, datasetId, studyTagsData, studyMetadata, isFormMetadataError, isFormError, handleClose]);

  const handleTagChange = useCallback((event: any, value: string[]) => {
    setStudyTagsData(value);
  }, []);

  return (
    <Dialog
      className="update-study-dialog"
      title={getText(i18nKeys.UPDATE_STUDY_DIALOG__UPDATE_DATASET)}
      closable
      fullWidth
      maxWidth="md"
      open={open}
      onClose={() => handleClose("cancelled")}
      feedback={feedback}
    >
      <Divider />
      <div className="update-study-dialog__content">
        {!DATASET_SOURCE_TYPES.has(dataset.type) && (
          <>
            <div style={{ marginTop: "32px", fontWeight: "bold" }}>
              {getText(i18nKeys.UPDATE_STUDY_DIALOG__DATASET_INFO_CONFIG)}
            </div>
            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__DATASET_NAME)}
                value={formData.name}
                onChange={(event) => handleFormDataChange({ name: event.target.value })}
                error={formError.name.required}
              />
              {formError.name.required && (
                <FormHelperText error={true}>{getText(i18nKeys.UPDATE_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </div>
            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                multiline
                rows={8}
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__DATASET_SUMMARY)}
                value={formData.summary}
                onChange={(event) => handleFormDataChange({ summary: event.target.value })}
              />
            </div>
            <div>
              <Checkbox
                checked={formData.showRequestAccess}
                checkbox-id="request-access"
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__REQUEST)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => {
                  handleFormDataChange({ showRequestAccess: event.target.checked });
                }}
              />
            </div>
            <div>{getText(i18nKeys.UPDATE_STUDY_DIALOG__DESCRIPTION)}</div>
            <SimpleMdeReact
              value={formData.description}
              onChange={(value) => handleFormDataChange({ description: value })}
              options={mdeOptions}
              style={{ marginTop: "11px" }}
            />

            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__TYPE)}
                value={formData.type}
                onChange={(event) => handleFormDataChange({ type: event.target.value })}
                disabled
              />
            </div>

            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__TOKEN_CODE)}
                value={formData.tokenStudyCode}
                onChange={(event) => handleFormDataChange({ tokenStudyCode: event.target.value })}
                error={formError.tokenStudyCode.required || formError.tokenStudyCode.valid}
                disabled
              />
              {formError.tokenStudyCode.required && (
                <FormHelperText error={true}>{getText(i18nKeys.UPDATE_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
              {formError.tokenStudyCode.valid && (
                <FormHelperText error={true}>{getText(i18nKeys.UPDATE_STUDY_DIALOG__VALID_TOKEN_CODE)}</FormHelperText>
              )}
              <FormHelperText>{getText(i18nKeys.UPDATE_STUDY_DIALOG__CODE_REQUIREMENT)}</FormHelperText>
            </div>

            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__VOCAB_SCHEMA_NAME)}
                value={formData.vocabSchemaName}
                onChange={(event) => handleFormDataChange({ vocabSchemaName: event.target.value })}
                error={formError.vocabSchemaName.required}
              />
              {formError.vocabSchemaName.required && (
                <FormHelperText error={true}>{getText(i18nKeys.UPDATE_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </div>

            <div style={{ marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__RESULT_SCHEMA_NAME)}
                value={formData.resultsSchemaName}
                onChange={(event) => handleFormDataChange({ resultsSchemaName: event.target.value })}
                error={formError.resultsSchemaName.required}
              />
              {formError.resultsSchemaName.required && (
                <FormHelperText error={true}>{getText(i18nKeys.UPDATE_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </div>

            <div style={{ marginBottom: "32px" }}>
              <FormControl
                sx={styles}
                className="select"
                variant="standard"
                fullWidth
                {...(formError.paConfigId.required ? { error: true } : {})}
              >
                <InputLabel htmlFor="pa-config-option">{getText(i18nKeys.UPDATE_STUDY_DIALOG__PA_CONFIG)}</InputLabel>
                <Select
                  sx={styles}
                  value={formData.paConfigId}
                  onChange={(event: SelectChangeEvent<string>) =>
                    handleFormDataChange({ paConfigId: event.target.value })
                  }
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
                  <FormHelperText>{getText(i18nKeys.UPDATE_STUDY_DIALOG__REQUIRED)}</FormHelperText>
                )}
              </FormControl>
            </div>
          </>
        )}

        {DATASET_SOURCE_TYPES.has(dataset.type) && (
          <>
            <div style={{ marginTop: "32px", marginBottom: "32px" }}>
              <TextField
                fullWidth
                variant="standard"
                label={getText(i18nKeys.UPDATE_STUDY_DIALOG__VOCAB_SCHEMA_NAME)}
                value={formData.vocabSchemaName}
                onChange={(event) => handleFormDataChange({ vocabSchemaName: event.target.value })}
                error={formError.vocabSchemaName.required}
              />
              {formError.vocabSchemaName.required && (
                <FormHelperText error={true}>{getText(i18nKeys.UPDATE_STUDY_DIALOG__REQUIRED)}</FormHelperText>
              )}
            </div>
          </>
        )}

        {!DATASET_SOURCE_TYPES.has(dataset.type) && (
          <>
            <div style={{ marginTop: "32px", fontWeight: "bold" }}>{getText(i18nKeys.UPDATE_STUDY_DIALOG__TAGS)}</div>
            <div style={{ marginBottom: "32px" }}>
              <Autocomplete
                multiple
                sx={styles}
                id="autocomplete-tags"
                options={tagConfigs}
                renderTags={(value: string[], getTagProps) =>
                  value.map((option: string, index: number) => (
                    <Chip variant="outlined" label={option} {...getTagProps({ index })} key={option} />
                  ))
                }
                renderInput={(params) => <TextField {...params} label={getText(i18nKeys.UPDATE_STUDY_DIALOG__TAGS)} variant="standard" />}
                value={studyTagsData}
                onChange={handleTagChange}
              />
            </div>

            <div style={{ marginBottom: "32px" }}>
              <FormControl component="fieldset">
                <FormLabel component="legend">{getText(i18nKeys.UPDATE_STUDY_DIALOG__DATASET_VISIBILITY)}</FormLabel>
                <RadioGroup
                  name="visibilityStatusGroup"
                  value={formData.visibilityStatus}
                  onChange={(event: ChangeEvent<HTMLInputElement>) => {
                    handleFormDataChange({ visibilityStatus: event.target.value });
                  }}
                >
                  <FormControlLabel
                    value="PUBLIC"
                    control={<Radio />}
                    label={getText(i18nKeys.UPDATE_STUDY_DIALOG__PUBLIC)}
                  />
                  <FormControlLabel
                    value="DEFAULT"
                    control={<Radio />}
                    label={getText(i18nKeys.UPDATE_STUDY_DIALOG__PRIVATE)}
                  />
                  <FormControlLabel
                    value="HIDDEN"
                    control={<Radio />}
                    label={getText(i18nKeys.UPDATE_STUDY_DIALOG__HIDDEN)}
                  />
                </RadioGroup>
              </FormControl>
            </div>
          </>
        )}
      </div>

      <Divider />
      <div className="button-group-actions">
        <Button
          text={getText(i18nKeys.UPDATE_STUDY_DIALOG__CANCEL)}
          onClick={() => handleClose("cancelled")}
          variant="outlined"
          block
          disabled={updating}
        />
        <Button text={getText(i18nKeys.UPDATE_STUDY_DIALOG__SAVE)} onClick={handleSubmit} block loading={updating} />
      </div>
    </Dialog>
  );
};

export default UpdateStudyDialog;
