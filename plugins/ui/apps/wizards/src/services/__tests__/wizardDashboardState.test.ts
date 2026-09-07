import { describe, expect, it } from "vitest";
import { initialWizardDashboardState, wizardDashboardReducer } from "../wizardDashboardState";

describe("wizard dashboard state", () => {
  it("opens immediately in the filter-application stage", () => {
    const state = wizardDashboardReducer(initialWizardDashboardState, {
      type: "start",
      operationId: 1,
      datasetId: "dataset-1",
    });

    expect(state).toMatchObject({ isOpen: true, status: "applying-filters", operationId: 1 });
  });

  it("ignores late events from a superseded operation", () => {
    const state = wizardDashboardReducer(
      wizardDashboardReducer(initialWizardDashboardState, {
        type: "start",
        operationId: 2,
        datasetId: "dataset-1",
      }),
      { type: "fail", operationId: 1, message: "late failure", stage: "applying-filters" },
    );

    expect(state.status).toBe("applying-filters");
    expect(state.error).toBeNull();
  });

  it("retains the generated bookmark name after a recoverable error", () => {
    let state = wizardDashboardReducer(initialWizardDashboardState, {
      type: "start",
      operationId: 1,
      datasetId: "dataset-1",
    });
    state = wizardDashboardReducer(state, {
      type: "bookmark-name",
      operationId: 1,
      bookmarkName: "wizards-1783670400000",
    });
    state = wizardDashboardReducer(state, {
      type: "fail",
      operationId: 1,
      message: "request failed",
      stage: "applying-filters",
    });

    expect(state).toMatchObject({
      status: "error",
      pendingBookmarkName: "wizards-1783670400000",
      error: "request failed",
      errorStage: "applying-filters",
    });
  });

  it("invalidates the flow when the dataset changes", () => {
    const openState = wizardDashboardReducer(initialWizardDashboardState, {
      type: "start",
      operationId: 4,
      datasetId: "dataset-1",
    });

    expect(wizardDashboardReducer(openState, { type: "dataset-changed", datasetId: "dataset-2" })).toEqual({
      ...initialWizardDashboardState,
      operationId: 5,
    });
  });
});
