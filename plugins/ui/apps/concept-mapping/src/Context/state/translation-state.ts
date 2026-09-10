export const i18nDefault = {
  default: {
    CSV_READER__CLICK_MESSAGE: "Click here to choose a file, or drop a file",
    CSV_READER__SUPPORTED_FILE_TYPES: "Supported file types: CSV",
    CSV_READER__UNSUPPORTED_FILE_TYPE: "Unsupported file type",
    EXPORT_MAPPING_DIALOG__TITLE: "Export mappings to database",
    EXPORT_MAPPING_DIALOG__FORM_TITLE: "Concept mapping configuration",
    EXPORT_MAPPING_DIALOG__SOURCE_VOCABULARY_ID: "SOURCE VOCABULARY ID",
    EXPORT_MAPPING_DIALOG__HELPER_TEXT:
      "id should be more than 100 so that it can be easily identified as a non-OMOP vocabulary",
    EXPORT_MAPPING_DIALOG__REQUIRED: "This is required",
    EXPORT_MAPPING_DIALOG__NO_DATA: "No data available",
    IMPORT_DIALOG__ADDITIONAL_INFO_COLUMN: "Additional info column",
    IMPORT_DIALOG__CANCEL: "Cancel",
    IMPORT_DIALOG__COLUMN_MAPPING: "Column mapping",
    IMPORT_DIALOG__IMPORT: "Import",
    IMPORT_DIALOG__SOURCE_CODE_COLUMN: "Source code column",
    IMPORT_DIALOG__SOURCE_CODE_NAME: "Source name column",
    IMPORT_DIALOG__SOURCE_FREQUENCY_COLUMN: "Source frequency column",
    IMPORT_DIALOG__SHOW_SOURCE_DOMAIN_COLUMN: "Show source domain column selection",
    IMPORT_DIALOG__SOURCE_DOMAIN_COLUMN: "Source domain column",
    MAPPING_TABLE__CONCEPT_ID: "Concept ID",
    MAPPING_TABLE__CONCEPT_NAME: "Concept name",
    MAPPING_TABLE__CONCEPT_CODE: "Concept code",
    MAPPING_TABLE__DESCRIPTION: "Description",
    MAPPING_TABLE__DOMAIN_ID: "Domain",
    MAPPING_TABLE__FREQUENCY: "Frequency",
    MAPPING_TABLE__VOCABULARY: "Vocabulary",
    MAPPING_TABLE__NAME: "Name",
    MAPPING_TABLE__POPULATE_CONCEPTS: "Populate concepts",
    MAPPING_TABLE__RECOMMEND_CONCEPT: "Recommend concept",
    MAPPING_TABLE__DATASET_REFERENCE: "Dataset for concept reference",
    MAPPING_TABLE__SOURCE: "Source",
    MAPPING_TABLE__STATUS: "Status",
    MAPPING_TABLE__CHECKED_BY: "Checked by",
    STATUS__UNCHECKED: "Unchecked",
    STATUS__SUGGESTED: "Suggested",
    STATUS__APPROVED: "Approved",
    MAPPING_TABLE__SELECTED: "selected",
    ACTION__APPROVE: "Approve",
    ACTION__UNCHECK: "Uncheck",
    ACTION__SUGGEST: "Suggest",
    ACTION__FLAG: "Flag",
    OVERVIEW__CLEAR_AND_IMPORT: "Clear and import another file",
    OVERVIEW__CONCEPT_ID: "Concept ID",
    OVERVIEW__CONCEPT_MAPPING: "Concept mapping",
    OVERVIEW__CONCEPT_NAME: "Concept name",
    OVERVIEW__DESCRIPTION: "Description",
    OVERVIEW__DOMAIN: "Domain",
    OVERVIEW__DOWNLOAD_CSV: "Download CSV",
    OVERVIEW__FREQUENCY: "Frequency",
    OVERVIEW__NAME: "Name",
    OVERVIEW__NO_DATASET: "No dataset available",
    OVERVIEW__REFERENCE_CONCEPTS: "Reference concepts from dataset",
    OVERVIEW__SOURCE: "Source",
    OVERVIEW__MAPPING_TAB: "Mapping",
    OVERVIEW__SAVED_MAPPINGS_TAB: "Saved Mappings",
    OVERVIEW__SAVE_TO_DATABASE: "Save to database",
    SOURCE_TO_CONCEPT_MAP_TABLE__SOURCE_CODE: "Source code",
    SOURCE_TO_CONCEPT_MAP_TABLE__SOURCE_CONCEPT_ID: "Source concept ID",
    SOURCE_TO_CONCEPT_MAP_TABLE__SOURCE_VOCABULARY_ID: "Source vocabulary ID",
    SOURCE_TO_CONCEPT_MAP_TABLE__SOURCE_CODE_DESCRIPTION: "Source code description",
    SOURCE_TO_CONCEPT_MAP_TABLE__TARGET_CONCEPT_ID: "Target concept ID",
    SOURCE_TO_CONCEPT_MAP_TABLE__TARGET_VOCABULARY_ID: "Target vocabulary ID",
    SOURCE_TO_CONCEPT_MAP_TABLE__VALID_START_DATE: "Start date",
    SOURCE_TO_CONCEPT_MAP_TABLE__VALID_END_DATE: "End date",
    SOURCE_TO_CONCEPT_MAP_TABLE__INVALID_REASON: "Invalid reason",
    STEPS__STEP1_TITLE: "Source & dataset",
    STEPS__STEP2_TITLE: "Column mapping",
    STEPS__STEP3_TITLE: "Concept mapping",
    STEPS__NEXT: "Next",
    STEPS__BACK: "Back",
    STEPS__SAVE: "Save",
    STEPS__DOWNLOAD_CSV: "Download as CSV",
    STEPS__CONFIGURATION_TAB: "Configuration",
    STEPS__RESET_CONFIRM_MESSAGE: "Column mapping and concepts were cleared because the data source changed.",
    STEP1__DATA_SOURCE_TITLE: "1. Data source",
    STEP1__SELECT_DATASET_TITLE: "2. Select a dataset",
    STEP1__IMPORT_TWO_WAYS: "You can import your source data in 2 ways:",
    STEP1__CONNECT_NODE_OPTION: "Connect an SQL or Python output node",
    STEP1__CONNECT_NODE_DESC: "You can manually connect 'Database query' or 'Python to table' node to this node.",
    STEP1__OR: "or",
    STEP1__UPLOAD_CSV_OPTION: "Upload CSV file",
    STEP1__UPLOAD_CSV_DESC: "Browse file or drag and drop.",
    STEP1__DATASET_LABEL: "Dataset for concept reference",
    STEP1__DATASET_LOCK_INFO:
      "Choose the correct dataset — it can't be changed once you start mapping; otherwise you'll need to redo the process.",
    STEP1__NODE_TYPE_LABEL: "Node type:",
    STEP1__NODE_DESCRIPTION_LABEL: "Description:",
    STEP1__REMOVE_CONNECTION_LABEL: "Remove the connection on the canvas",
    STEP1__CONNECTED_NODE_HINT: "Please remove connection if you would like to upload a CSV file as your source data.",
    STEP1__UPLOAD_FAILED: "Upload failed. Please check the file and try again.",
    STEP1__MANUAL_COLUMNS_LABEL: "Enter source columns (comma-separated)",
    STEP1__LOAD_RECOMMENDATION: "Load concept recommendation by default",
    COLUMN_MAPPING__NOT_APPLICABLE: "Not applicable",
    COLUMN_MAPPING__TITLE: "3. Column mapping",
    COLUMN_MAPPING__PLEASE_SELECT: "Please select",
    COLUMN_MAPPING__ROWS_PER_PAGE_LABEL: "Row per page:",
    CSV_CARD__UPLOADING: "Uploading...",
    CSV_CARD__UPLOAD_FAILED: "Upload failed",
    CSV_CARD__FAILED: "Failed",
    CSV_CARD__UNSUPPORTED_FORMAT: "Not supported format",
    CSV_CARD__HELPER: "You uploaded a CSV file as your source data.",
  },
};

function getKeyMap<T extends object>(obj: T) {
  const result = {} as Record<keyof T, keyof T>;
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      result[key as keyof T] = key as keyof T;
    }
  }
  return result as { [K in keyof T]: K };
}

// Exposing the default key map so that getText('MRI_PA_FILTERCARD_SELECTION_NONE')
// can be getText(i18nKeys.MRI_PA_FILTERCARD_SELECTION_NONE)
// to prevent typos with the values
export const i18nKeys = getKeyMap(i18nDefault.default);

export interface TranslationState {
  locale: string;
  translations: { [key: string]: typeof i18nDefault.default };
}
