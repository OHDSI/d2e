/**
 * this file should have all the types in this repo
 */
import { Connection } from "@alp/alp-base-utils";
import ConnectionInterface = Connection.ConnectionInterface;
import { Request } from "express";

export { ICDWRequest };
declare global {
  interface PholderTableMapType {
    ["@COND"]: string;
    ["@COND.PATIENT_ID"]: string;
    ["@COND.INTERACTION_ID"]: string;
    ["@COND.CONDITION_ID"]: string;
    ["@COND.PARENT_INTERACT_ID"]: string;
    ["@COND.START"]: string;
    ["@COND.END"]: string;
    ["@COND.INTERACTION_TYPE"]: string;
    ["@VISIT"]: string;
    ["@VISIT.PATIENT_ID"]: string;
    ["@VISIT.INTERACTION_ID"]: string;
    ["@VISIT.CONDITION_ID"]: string;
    ["@VISIT.PARENT_INTERACT_ID"]: string;
    ["@VISIT.START"]: string;
    ["@VISIT.END"]: string;
    ["@VISIT.INTERACTION_TYPE"]: string;
    ["@CONDERA"]: string;
    ["@CONDERA.PATIENT_ID"]: string;
    ["@CONDERA.INTERACTION_ID"]: string;
    ["@CONDERA.CONDITION_ID"]: string;
    ["@CONDERA.PARENT_INTERACT_ID"]: string;
    ["@CONDERA.START"]: string;
    ["@CONDERA.END"]: string;
    ["@CONDERA.INTERACTION_TYPE"]: string;
    ["@DEATH"]: string;
    ["@DEATH.PATIENT_ID"]: string;
    ["@DEATH.INTERACTION_ID"]: string;
    ["@DEATH.CONDITION_ID"]: string;
    ["@DEATH.PARENT_INTERACT_ID"]: string;
    ["@DEATH.START"]: string;
    ["@DEATH.END"]: string;
    ["@DEATH.INTERACTION_TYPE"]: string;
    ["@DEVEXP"]: string;
    ["@DEVEXP.PATIENT_ID"]: string;
    ["@DEVEXP.INTERACTION_ID"]: string;
    ["@DEVEXP.CONDITION_ID"]: string;
    ["@DEVEXP.PARENT_INTERACT_ID"]: string;
    ["@DEVEXP.START"]: string;
    ["@DEVEXP.END"]: string;
    ["@DEVEXP.INTERACTION_TYPE"]: string;
    ["@DOSEERA"]: string;
    ["@DOSEERA.PATIENT_ID"]: string;
    ["@DOSEERA.INTERACTION_ID"]: string;
    ["@DOSEERA.CONDITION_ID"]: string;
    ["@DOSEERA.PARENT_INTERACT_ID"]: string;
    ["@DOSEERA.START"]: string;
    ["@DOSEERA.END"]: string;
    ["@DOSEERA.INTERACTION_TYPE"]: string;
    ["@DRUGERA"]: string;
    ["@DRUGERA.PATIENT_ID"]: string;
    ["@DRUGERA.INTERACTION_ID"]: string;
    ["@DRUGERA.CONDITION_ID"]: string;
    ["@DRUGERA.PARENT_INTERACT_ID"]: string;
    ["@DRUGERA.START"]: string;
    ["@DRUGERA.END"]: string;
    ["@DRUGERA.INTERACTION_TYPE"]: string;
    ["@DRUGEXP"]: string;
    ["@DRUGEXP.PATIENT_ID"]: string;
    ["@DRUGEXP.INTERACTION_ID"]: string;
    ["@DRUGEXP.CONDITION_ID"]: string;
    ["@DRUGEXP.PARENT_INTERACT_ID"]: string;
    ["@DRUGEXP.START"]: string;
    ["@DRUGEXP.END"]: string;
    ["@DRUGEXP.INTERACTION_TYPE"]: string;
    ["@EPISODE"]: string;
    ["@EPISODE.PATIENT_ID"]: string;
    ["@EPISODE.INTERACTION_ID"]: string;
    ["@EPISODE.CONDITION_ID"]: string;
    ["@EPISODE.PARENT_INTERACT_ID"]: string;
    ["@EPISODE.START"]: string;
    ["@EPISODE.END"]: string;
    ["@EPISODE.INTERACTION_TYPE"]: string;
    ["@EPISODE_EVENT"]: string;
    ["@EPISODE_EVENT.PATIENT_ID"]: string;
    ["@EPISODE_EVENT.INTERACTION_ID"]: string;
    ["@EPISODE_EVENT.CONDITION_ID"]: string;
    ["@EPISODE_EVENT.PARENT_INTERACT_ID"]: string;
    ["@EPISODE_EVENT.START"]: string;
    ["@EPISODE_EVENT.END"]: string;
    ["@EPISODE_EVENT.INTERACTION_TYPE"]: string;
    ["@OBS"]: string;
    ["@OBS.PATIENT_ID"]: string;
    ["@OBS.INTERACTION_ID"]: string;
    ["@OBS.CONDITION_ID"]: string;
    ["@OBS.PARENT_INTERACT_ID"]: string;
    ["@OBS.START"]: string;
    ["@OBS.END"]: string;
    ["@OBS.INTERACTION_TYPE"]: string;
    ["@OBSPER"]: string;
    ["@OBSPER.PATIENT_ID"]: string;
    ["@OBSPER.INTERACTION_ID"]: string;
    ["@OBSPER.CONDITION_ID"]: string;
    ["@OBSPER.PARENT_INTERACT_ID"]: string;
    ["@OBSPER.START"]: string;
    ["@OBSPER.END"]: string;
    ["@OBSPER.INTERACTION_TYPE"]: string;
    ["@PPPER"]: string;
    ["@PPPER.PATIENT_ID"]: string;
    ["@PPPER.INTERACTION_ID"]: string;
    ["@PPPER.CONDITION_ID"]: string;
    ["@PPPER.PARENT_INTERACT_ID"]: string;
    ["@PPPER.START"]: string;
    ["@PPPER.END"]: string;
    ["@PPPER.INTERACTION_TYPE"]: string;
    ["@SPEC"]: string;
    ["@SPEC.PATIENT_ID"]: string;
    ["@SPEC.INTERACTION_ID"]: string;
    ["@SPEC.CONDITION_ID"]: string;
    ["@SPEC.PARENT_INTERACT_ID"]: string;
    ["@SPEC.START"]: string;
    ["@SPEC.END"]: string;
    ["@SPEC.INTERACTION_TYPE"]: string;
    ["@MEAS"]: string;
    ["@MEAS.PATIENT_ID"]: string;
    ["@MEAS.INTERACTION_ID"]: string;
    ["@MEAS.CONDITION_ID"]: string;
    ["@MEAS.PARENT_INTERACT_ID"]: string;
    ["@MEAS.START"]: string;
    ["@MEAS.END"]: string;
    ["@MEAS.INTERACTION_TYPE"]: string;
    ["@PROC"]: string;
    ["@PROC.PATIENT_ID"]: string;
    ["@PROC.INTERACTION_ID"]: string;
    ["@PROC.CONDITION_ID"]: string;
    ["@PROC.PARENT_INTERACT_ID"]: string;
    ["@PROC.START"]: string;
    ["@PROC.END"]: string;
    ["@PROC.INTERACTION_TYPE"]: string;
    ["@CONSENT"]: string;
    ["@CONSENT.PATIENT_ID"]: string;
    ["@CONSENT.INTERACTION_ID"]: string;
    ["@CONSENT.CONDITION_ID"]: string;
    ["@CONSENT.PARENT_INTERACT_ID"]: string;
    ["@CONSENT.START"]: string;
    ["@CONSENT.END"]: string;
    ["@CONSENT.INTERACTION_TYPE"]: string;
    ["@RESPONSE"]: string;
    ["@RESPONSE.PATIENT_ID"]: string;
    ["@RESPONSE.INTERACTION_ID"]: string;
    ["@RESPONSE.CONDITION_ID"]: string;
    ["@RESPONSE.PARENT_INTERACT_ID"]: string;
    ["@RESPONSE.START"]: string;
    ["@RESPONSE.END"]: string;
    ["@RESPONSE.INTERACTION_TYPE"]: string;
    ["@PATIENT"]: string;
    ["@PATIENT.PATIENT_ID"]: string;
    ["@PATIENT.DOD"]: string;
    ["@PATIENT.DOB"]: string;
    ["@REF"]: string;
    ["@REF.VOCABULARY_ID"]: string;
    ["@REF.CODE"]: string;
    ["@REF.TEXT"]: string;
    ["@TEXT"]: string;
    ["@TEXT.INTERACTION_ID"]: string;
    ["@TEXT.INTERACTION_TEXT_ID"]: string;
    ["@TEXT.VALUE"]: string;
    ["@COHORT"]: string;
    ["@COHORT.PATIENT_ID"]: string;
    ["@COHORT.INTERACTION_TYPE"]: string;
    ["@CDM_COHORT_DEF"]: string;
    ["@RESULT_COHORT_DEF"]: string;
  }

  type PlaceholderMapType = {
    placeholder: string;
    hierarchy?: boolean;
    time?: boolean;
    oneToN?: boolean;
    condition?: boolean;
    attributeTables?: PlaceholderMapType[];
  };

  export interface TableTypePlaceholderMapType {
    factTable: PlaceholderMapType;
    dimTables: PlaceholderMapType[];
  }

  export type PlaceholderSettingsType = {
    tableTypePlaceholderMap: TableTypePlaceholderMapType;
    placeholderTableMap: PholderTableMapType;
  };

  export interface AdvancedSettingsType {
    tableTypePlaceholderMap: TableTypePlaceholderMapType;
    tableMapping: PholderTableMapType;
    guardedTableMapping: PholderTableMapType;
    language: string[];
    settings: GlobalSettingsType;
    shared: any;
    others: any;
    schemaVersion: string;
  }

  export interface ValidationMessageType {
    source: string;
    message: string;
  }

  export interface GlobalSettingsType {
    fuzziness: number;
    maxResultSize: number;
    // flags controlling the information which is returned from backend
    // Note: all flags should be set to false for productive systems
    errorDetailsReturnOn: boolean;
    errorStackTraceReturnOn: boolean;
    enableFreeText: boolean;
    vbEnabled: boolean;
    dateFormat: string;
    timeFormat: string;
    otsTableMap: {
      ["@CODE"]: string;
    };
    datasetId: string;
  }

  export interface SMap<T> {
    [key: string]: T;
  }

  // export type Partial<T> = {
  //     [P in keyof T]?: T[P];
  // };

  export interface PlaceholderType {
    patient: string;
    interaction: string;
    code: string;
    intMeasure: string;
    related: string;
    observation: string;
    refCodes: string;
    patientdata: string;
    text: string;
  }

  export interface ConfigMetaType {
    configId: string;
    configVersion: string;
    configStatus: string;
    configName: string;
    dependentConfig: {
      configId: string;
      configVersion: string;
    };
    creator: string;
    created: string;
    modifier: string;
    modified: string;
  }

  export interface ConfigErrorType {
    config: any;
    definition: string;
    path: string;
  }

  export interface CDMConfigType {
    censor?: any;
    patient: CDMConfigPatientType;
    advancedSettings: AdvancedSettingsType;
  }

  export interface CDMConfigPatientType {
    attributes?: SMap<CDMConfigAttributeType>;
    conditions?: SMap<{
      name: string;
      interactions: SMap<CDMConfigInteractionType>;
    }>;
    interactions?: SMap<CDMConfigInteractionType>;
  }

  export interface CDMConfigAttributeType {
    name:
      | Array<{
          lang: string;
          value: string;
        }>
      | string;
    type: "text" | "num" | "time" | "datetime";
    defaultFilter?: string;
    expression?: string;
    measureExpression?: string;
    order?: number;
    from?: Partial<PholderTableMapType>;
    annotations?: string[];
    isFreeText?: boolean;
    referenceFilter?: string;
    referenceExpression?: string;
    fuzziness?: number;
    eavExpressionKey?: string;
    relationExpressionKey?: string;
    disabledLangName?: string[];
    isDefault?: boolean;
  }

  export interface CDMConfigInteractionType {
    name:
      | Array<{
          lang: string;
          value: string;
        }>
      | string;
    defaultFilter: string;
    order: number;
    parentInteraction?: string[];
    parentInteractionLabel?: string;
    parentInteractionsMapping?: [];
    from?: Partial<PholderTableMapType>;
    attributes: SMap<CDMConfigAttributeType>;
  }

  export interface CDMConfigMetaType {
    meta: ConfigMetaType;
    config: CDMConfigType;
    template: any[];
  }

  export interface CDMEndpointRequestType {
    config: CDMConfigType;
    attributePath: string;
  }

  export type AttributeInfoRequestType = CDMEndpointRequestType & {
    exprToUse: string;
    validationRequest?: any;
  };

  export type DomainValuesServiceRequestType = CDMEndpointRequestType & {
    exprToUse: string;
    useRefText: boolean;
    suggestionLimit?: number;
  };

  export interface TableSuggestionRequestType {
    table: string;
    expression: string;
    mapping: PholderTableMapType;
  }

  export interface ColumnSuggestionRequestType {
    table: string;
    mapping: PholderTableMapType;
  }

  export interface ConfigDefaultsType {
    INTERACTION_TYPE: string;
    ATTRIBUTE: string;
    ORIGIN: string;
    DATATYPE: string;
  }

  export interface AssignedConfigType {
    assignmentId: string;
    assignmentName: string;
    configId: string;
    configVersion: string;
    configStatus: string;
    configName: string;
    dependentConfig: {
      configId: string;
      configVersion: string;
    };
    config: SMap<string>;
  }

  export interface AttributeInfoResponseType {
    data: Array<{
      count: number;
      max: string;
      min: string;
      permission: boolean;
    }>;
    exception?: string;
  }

  export type ConfigValidationResultType = {
    cdmConfigValidationResult: {
      errors: ConfigErrorType[];
      warnings: ConfigErrorType[];
      valid: boolean;
    };
    advancedConfigValidationResult: {
      valid: boolean;
      messages: ConfigErrorType[];
      result: ConfigErrorType[];
    };
  };

  export interface ICDWRequest extends Request {
    dbConnections: {
      configConnection: ConnectionInterface;
    };
    dbCredentials: {
      analyticsCredentials: any;
      studyAnalyticsCredential: any;
    };
    assignment: any;
    query: {
      action: string;
    };
  }
}

export interface IDBCredentialsType {
  database: string;
  schema?: string;
  dialect: string;
  host: string;
  port: number;
  user: string;
  password: string;
  max?: number | undefined;
  min?: number | undefined;
  idleTimeoutMillis?: number | undefined;
}
