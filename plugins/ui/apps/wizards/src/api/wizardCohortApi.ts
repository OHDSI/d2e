import type { AxiosError } from "axios";
import client from "../axios/request";
import type { MriMaterializationQuery } from "../utils/mriMaterializationQuery";
import type { MriBookmark } from "../utils/mriQuery";
import { compressBase64 } from "../utils/cohortUrlCodec";

export type WizardCohortApiOperation = "list-cohorts" | "create-bookmark" | "materialize-cohort";
export type WizardCohortApiErrorCode = "request-failed" | "invalid-input" | "invalid-response";

export class WizardCohortApiError extends Error {
  readonly operation: WizardCohortApiOperation;
  readonly code: WizardCohortApiErrorCode;
  readonly status?: number;

  constructor(message: string, operation: WizardCohortApiOperation, code: WizardCohortApiErrorCode, status?: number) {
    super(message);
    this.name = "WizardCohortApiError";
    this.operation = operation;
    this.code = code;
    this.status = status;
  }
}

export type PatientAnalyticsCohortListItem = Record<string, unknown>;

export interface CreateWizardBookmarkInput {
  datasetId: string;
  bookmarkname: string;
  bookmark: MriBookmark;
  paConfigId: string;
  cdmConfigId: string;
  cdmConfigVersion: string;
}

export interface CreateWizardBookmarkResult {
  status: "success";
  bmkId: string;
}

export interface MaterializeWizardBookmarkInput {
  datasetId: string;
  bookmarkId: string;
  bookmarkName: string;
  description?: string;
  mriQuery: MriMaterializationQuery;
}

export interface MaterializeWizardBookmarkResult {
  cohortDefinitionId: number;
}

const operationMessages: Record<WizardCohortApiOperation, string> = {
  "list-cohorts": "Unable to check previous Wizard analyses",
  "create-bookmark": "Unable to save the Wizard analysis",
  "materialize-cohort": "Unable to generate the Wizard cohort",
};

function getHttpStatus(error: unknown): number | undefined {
  const response = (error as Partial<AxiosError>)?.response;
  return typeof response?.status === "number" ? response.status : undefined;
}

function wrapApiError(error: unknown, operation: WizardCohortApiOperation): WizardCohortApiError {
  if (error instanceof WizardCohortApiError) {
    return error;
  }
  return new WizardCohortApiError(operationMessages[operation], operation, "request-failed", getHttpStatus(error));
}

function requireValue(value: string, fieldName: string, operation: WizardCohortApiOperation): string {
  if (value.length === 0) {
    throw new WizardCohortApiError(`${fieldName} is required`, operation, "invalid-input");
  }
  return value;
}

export async function listPatientAnalyticsCohorts(
  datasetId: string,
  signal?: AbortSignal,
): Promise<PatientAnalyticsCohortListItem[]> {
  const operation: WizardCohortApiOperation = "list-cohorts";
  requireValue(datasetId, "datasetId", operation);
  try {
    const response = await client.get("/d2e/d2e-webapi/cohortdefinition", {
      params: { source: "pa" },
      headers: { datasetid: datasetId },
      signal,
    });
    if (!Array.isArray(response.data)) {
      throw new WizardCohortApiError(operationMessages[operation], operation, "invalid-response");
    }
    return response.data as PatientAnalyticsCohortListItem[];
  } catch (error) {
    throw wrapApiError(error, operation);
  }
}

export async function createWizardBookmark(input: CreateWizardBookmarkInput): Promise<CreateWizardBookmarkResult> {
  const operation: WizardCohortApiOperation = "create-bookmark";
  requireValue(input.datasetId, "datasetId", operation);
  requireValue(input.bookmarkname, "bookmarkname", operation);
  requireValue(input.paConfigId, "paConfigId", operation);
  requireValue(input.cdmConfigId, "cdmConfigId", operation);
  requireValue(input.cdmConfigVersion, "cdmConfigVersion", operation);
  if (input.bookmark.datasetId !== input.datasetId) {
    throw new WizardCohortApiError("Bookmark dataset does not match the active dataset", operation, "invalid-input");
  }
  try {
    const response = await client.post(
      "/d2e/analytics-svc/api/services/bookmark",
      {
        cmd: "insert",
        bookmarkname: input.bookmarkname,
        bookmark: JSON.stringify(input.bookmark),
        shareBookmark: false,
        paConfigId: input.paConfigId,
        cdmConfigId: input.cdmConfigId,
        cdmConfigVersion: input.cdmConfigVersion,
        datasetId: input.datasetId,
      },
      { headers: { datasetid: input.datasetId } },
    );
    const result = response.data as Partial<CreateWizardBookmarkResult> | null;
    if (result?.status !== "success" || typeof result.bmkId !== "string" || result.bmkId.length === 0) {
      throw new WizardCohortApiError(operationMessages[operation], operation, "invalid-response");
    }
    return { status: "success", bmkId: result.bmkId };
  } catch (error) {
    throw wrapApiError(error, operation);
  }
}

export async function materializeWizardBookmark(
  input: MaterializeWizardBookmarkInput,
): Promise<MaterializeWizardBookmarkResult> {
  const operation: WizardCohortApiOperation = "materialize-cohort";
  requireValue(input.datasetId, "datasetId", operation);
  requireValue(input.bookmarkId, "bookmarkId", operation);
  requireValue(input.bookmarkName, "bookmarkName", operation);
  try {
    const response = await client.post(
      "/d2e/analytics-svc/api/services/cohort",
      {
        datasetId: input.datasetId,
        mriquery: compressBase64(input.mriQuery),
        name: input.bookmarkName,
        description: input.description ?? "Generated by Wizards",
        syntax: JSON.stringify({ datasetId: input.datasetId, bookmarkId: input.bookmarkId }),
      },
      { headers: { datasetid: input.datasetId } },
    );
    const result = response.data as Partial<MaterializeWizardBookmarkResult> | null;
    const cohortDefinitionId = Number(result?.cohortDefinitionId);
    if (!Number.isInteger(cohortDefinitionId) || cohortDefinitionId <= 0) {
      throw new WizardCohortApiError(operationMessages[operation], operation, "invalid-response");
    }
    return { cohortDefinitionId };
  } catch (error) {
    throw wrapApiError(error, operation);
  }
}
