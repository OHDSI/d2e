export type WizardDashboardStatus =
  | "idle"
  | "applying-filters"
  | "materializing"
  | "opening-dashboard"
  | "ready"
  | "error";

export interface WizardDashboardResult {
  bookmarkId: string;
  bookmarkName: string;
  cohortId: number;
  wizardConfig: Record<string, unknown>;
  mriquery: string;
  cacheOutcome: "hit-ready" | "hit-unmaterialized" | "miss";
}

export interface WizardDashboardState {
  isOpen: boolean;
  status: WizardDashboardStatus;
  operationId: number;
  datasetId: string | null;
  pendingBookmarkName: string | null;
  result: WizardDashboardResult | null;
  error: string | null;
  errorStage: Exclude<WizardDashboardStatus, "idle" | "ready" | "error"> | null;
}

export type WizardDashboardEvent =
  | { type: "start"; operationId: number; datasetId: string; pendingBookmarkName?: string | null }
  | { type: "stage"; operationId: number; status: Exclude<WizardDashboardStatus, "idle" | "ready" | "error"> }
  | { type: "bookmark-name"; operationId: number; bookmarkName: string }
  | { type: "ready"; operationId: number; result: WizardDashboardResult }
  | {
      type: "fail";
      operationId: number;
      message: string;
      stage: Exclude<WizardDashboardStatus, "idle" | "ready" | "error">;
    }
  | { type: "close" }
  | { type: "dataset-changed"; datasetId?: string };

export const initialWizardDashboardState: WizardDashboardState = {
  isOpen: false,
  status: "idle",
  operationId: 0,
  datasetId: null,
  pendingBookmarkName: null,
  result: null,
  error: null,
  errorStage: null,
};

export function wizardDashboardReducer(state: WizardDashboardState, event: WizardDashboardEvent): WizardDashboardState {
  if ("operationId" in event && event.operationId !== state.operationId && event.type !== "start") {
    return state;
  }

  switch (event.type) {
    case "start":
      return {
        isOpen: true,
        status: "applying-filters",
        operationId: event.operationId,
        datasetId: event.datasetId,
        pendingBookmarkName: event.pendingBookmarkName ?? null,
        result: null,
        error: null,
        errorStage: null,
      };
    case "stage":
      return { ...state, status: event.status, error: null, errorStage: null };
    case "bookmark-name":
      return { ...state, pendingBookmarkName: event.bookmarkName };
    case "ready":
      return {
        ...state,
        status: "ready",
        pendingBookmarkName: event.result.bookmarkName,
        result: event.result,
        error: null,
        errorStage: null,
      };
    case "fail":
      return { ...state, status: "error", error: event.message, errorStage: event.stage, result: null };
    case "close":
      return { ...state, isOpen: false };
    case "dataset-changed":
      if (event.datasetId === state.datasetId) return state;
      return { ...initialWizardDashboardState, operationId: state.operationId + 1 };
  }
}
