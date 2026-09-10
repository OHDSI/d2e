import { describe, expect, test, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "../test/render";

// `Checkbox` wraps the `d4l-checkbox` Stencil custom element (scoped, not shadow-DOM).
// It only hydrates real light-DOM content (input + visible label) once the host shell
// registers the element via `registerWebComponents` (see apps/portal/src/index.tsx) -
// something this app's unit tests never bootstrap. Without that, jsdom renders it as an
// inert, childless custom element, so its `label` text is unqueryable. Mirroring the
// existing convention in this monorepo (see apps/portal UserOverview.test.tsx and
// apps/concept-sets TerminologyList.test.tsx), stub it with a plain, real DOM control.
vi.mock("@portal/components", () => ({
  Checkbox: (props: any) => (
    <label>
      <input type="checkbox" checked={props.checked} onChange={props.onChange} />
      {props.label}
    </label>
  ),
}));

// Stub CsvReader and capture its latest props so a test can drive `onFileSelected` /
// `onFileLoaded` / `onError` directly, deterministically, without wiring up a real
// File/FileReader. Captured (rather than invoked via a rendered button) because selecting a
// file makes Step1Source swap CsvReader out for the upload card - unmounting it - exactly
// like production, where the real FileReader keeps running (and still calls back) after the
// component that kicked it off has been swapped out of the tree.
let latestCsvReaderProps: any = {};
vi.mock("../components/CsvReader/CsvReader", () => ({
  CsvReader: (props: any) => {
    latestCsvReaderProps = props;
    return <div data-testid="mock-csv-reader" />;
  },
}));

import { Step1Source } from "./Step1Source";
import { ConceptMappingContext, ConceptMappingDispatchContext, initialState } from "../Context/ConceptMappingContext";
import { ACTION_TYPES } from "../Context/reducers";

const datasets = [{ id: "ds-1", studyDetail: { name: "Demo" }, databaseCode: "db", schemaName: "s" } as any];

describe("Step1Source", () => {
  test("default state shows both source option cards, the dataset panel and the info callout", () => {
    renderWithProviders(<Step1Source datasets={datasets} onResetDownstream={vi.fn()} />);
    expect(screen.getByText(/Upload CSV file/i)).toBeInTheDocument();
    expect(screen.getByText(/Connect an SQL or Python output node/i)).toBeInTheDocument();
    expect(screen.getByText("1. Data source")).toBeInTheDocument();
    expect(screen.getByText("2. Select a dataset")).toBeInTheDocument();
    expect(screen.getByText(/can't be changed once you start mapping/i)).toBeInTheDocument();
  });

  test("dataset options are listed alphabetically, whatever order the API returned", () => {
    const unsorted = [
      { id: "ds-3", studyDetail: { name: "Zurich cohort" } },
      { id: "ds-1", studyDetail: { name: "alpha cohort" } },
      { id: "ds-2", studyDetail: { name: "Munich cohort" } },
    ] as any[];
    renderWithProviders(<Step1Source datasets={unsorted} onResetDownstream={vi.fn()} />);

    fireEvent.mouseDown(screen.getByRole("combobox"));

    expect(screen.getAllByRole("option").map((option) => option.textContent)).toEqual([
      "alpha cohort",
      "Munich cohort",
      "Zurich cohort",
    ]);
  });

  test("dataset Select is disabled once mapping has started", () => {
    const state = {
      ...initialState,
      wizard: { ...initialState.wizard, mappingStarted: true },
    };
    renderWithProviders(<Step1Source datasets={datasets} onResetDownstream={vi.fn()} />, { state });
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-disabled", "true");
  });

  test("loading a CSV bridges rows into csvData with status 'unchecked' so Step 3 is non-empty", () => {
    const { dispatch } = renderWithProviders(<Step1Source datasets={datasets} onResetDownstream={vi.fn()} />);
    act(() =>
      latestCsvReaderProps.onFileLoaded({
        name: "codes.csv",
        size: 2048,
        data: { meta: { fields: ["code", "name"] }, data: [{ code: "A1", name: "Aspirin" }] },
      })
    );

    const actions = dispatch.mock.calls.map((c: any[]) => c[0]);

    // Source data is stored on the wizard slice (with the file name threaded through)...
    expect(actions).toContainEqual({
      type: ACTION_TYPES.SET_SOURCE_DATA,
      payload: { type: "csv", name: "codes.csv", size: 2048, columns: ["code", "name"], rows: [{ code: "A1", name: "Aspirin" }] },
    });
    // ...and the rows are bridged into csvData (what Step 3's MappingTable/Save read),
    // each tagged status: "unchecked" and given a stable sourceRowId (task 7). The id is
    // freshly generated here, so assert its shape separately rather than baking the exact
    // UUID into a brittle full-object match.
    const initialDataAction = actions.find((a: any) => a.type === ACTION_TYPES.SET_INITAL_DATA);
    expect(initialDataAction).toEqual({
      type: ACTION_TYPES.SET_INITAL_DATA,
      payload: {
        name: "codes.csv",
        columns: ["code", "name"],
        data: [
          {
            code: "A1",
            name: "Aspirin",
            status: "unchecked",
            sourceRowId: initialDataAction.payload.data[0].sourceRowId,
          },
        ],
      },
    });
    expect(initialDataAction.payload.data[0].sourceRowId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
    );
  });

  test("selecting a file shows the uploading card (filename + size + 'Uploading...') before it resolves", () => {
    renderWithProviders(<Step1Source datasets={datasets} onResetDownstream={vi.fn()} />);
    act(() => latestCsvReaderProps.onFileSelected({ name: "codes.csv", size: 2048 }));

    expect(screen.getByText("codes.csv")).toBeInTheDocument();
    expect(screen.getByText(/2kb\s*·\s*Uploading\.\.\./i)).toBeInTheDocument();
  });

  test("a successful parse replaces the uploading card with a success card (green check) and sets the CSV source", () => {
    const { dispatch } = renderWithProviders(<Step1Source datasets={datasets} onResetDownstream={vi.fn()} />);
    act(() => latestCsvReaderProps.onFileSelected({ name: "codes.csv", size: 2048 }));
    act(() =>
      latestCsvReaderProps.onFileLoaded({
        name: "codes.csv",
        size: 2048,
        data: { meta: { fields: ["code", "name"] }, data: [{ code: "A1", name: "Aspirin" }] },
      })
    );

    expect(screen.getByText("codes.csv")).toBeInTheDocument();
    expect(screen.getByText("2kb")).toBeInTheDocument();
    expect(screen.getByTestId("CheckCircleIcon")).toBeInTheDocument();
    expect(dispatch.mock.calls.some((call: any[]) => call[0]?.type === ACTION_TYPES.SET_SOURCE_DATA)).toBe(true);
  });

  test("an unsupported file shows the 'Upload failed' card and does not set a source", () => {
    const { dispatch } = renderWithProviders(<Step1Source datasets={datasets} onResetDownstream={vi.fn()} />);
    act(() => latestCsvReaderProps.onFileSelected({ name: "bad.exe", size: 512 }));
    act(() => latestCsvReaderProps.onError(new Error("Unsupported file type"), { name: "bad.exe", size: 512 }));

    expect(screen.getByText("Upload failed")).toBeInTheDocument();
    expect(screen.getByText(/Not supported format\s*·\s*Failed/i)).toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: ACTION_TYPES.SET_SOURCE_DATA, payload: null });
  });

  test("the delete icon clears the CSV upload and any source, back to the empty dropzone", () => {
    const onResetDownstream = vi.fn();
    const { dispatch } = renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} />
    );
    act(() =>
      latestCsvReaderProps.onFileLoaded({
        name: "codes.csv",
        size: 2048,
        data: { meta: { fields: ["code", "name"] }, data: [{ code: "A1", name: "Aspirin" }] },
      })
    );
    expect(screen.getByText("codes.csv")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Remove uploaded file/i }));

    expect(screen.queryByText("codes.csv")).not.toBeInTheDocument();
    expect(screen.getByText(/Upload CSV file/i)).toBeInTheDocument();
    expect(dispatch).toHaveBeenCalledWith({ type: ACTION_TYPES.SET_SOURCE_DATA, payload: null });
    expect(onResetDownstream).toHaveBeenCalled();
  });

  test("clicking the unlink icon on the connected-node card calls onDisconnectSource", () => {
    const sourceNode = { name: "My Py2Table", type: "py2table_node", description: "produces rows", map: { a: [] } };
    const onDisconnectSource = vi.fn();
    renderWithProviders(
      <Step1Source
        datasets={datasets}
        onResetDownstream={vi.fn()}
        sourceNode={sourceNode}
        onDisconnectSource={onDisconnectSource}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove the connection on the canvas/i }));

    expect(onDisconnectSource).toHaveBeenCalledTimes(1);
  });

  test("when the connected node disappears (disconnected) while a node source was set, it clears sourceData and resets downstream", () => {
    const sourceNode = { name: "My Py2Table", type: "py2table_node", description: "produces rows", map: { a: [] } };
    // Pre-seeded exactly as this node's derived SourceData would already look, mirroring the
    // "reopening with an unchanged connected node" fixture above.
    const state = {
      ...initialState,
      wizard: {
        ...initialState.wizard,
        sourceType: "node" as const,
        sourceData: {
          type: "node" as const,
          columns: ["a"],
          nodeMeta: { name: "My Py2Table", type: "py2table_node", description: "produces rows" },
        },
      },
    };
    const onResetDownstream = vi.fn();
    const { dispatch, rerender } = renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} sourceNode={sourceNode} />,
      { state }
    );
    expect(onResetDownstream).not.toHaveBeenCalled();

    // The node disappears - either via the unlink button (flow removes the edge) or the user
    // deleting the canvas edge directly while this drawer is open. Either way, `sourceNode`
    // (derived from the canvas) goes to undefined while stale node sourceData remains.
    rerender(
      <ConceptMappingContext.Provider value={state}>
        <ConceptMappingDispatchContext.Provider value={dispatch}>
          <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} sourceNode={undefined} />
        </ConceptMappingDispatchContext.Provider>
      </ConceptMappingContext.Provider>
    );

    expect(onResetDownstream).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({ type: ACTION_TYPES.SET_SOURCE_DATA, payload: null });
  });

  test("connected py2table node shows name, friendly node type, description and the removal hint", () => {
    const sourceNode = { name: "My Py2Table", type: "py2table_node", description: "produces rows", map: { a: [] } };
    renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={vi.fn()} sourceNode={sourceNode} />
    );
    expect(screen.getByText("My Py2Table")).toBeInTheDocument();
    expect(screen.getByText(/Node type:\s*Python to table node/i)).toBeInTheDocument();
    expect(screen.getByText(/Description:\s*produces rows/i)).toBeInTheDocument();
    expect(screen.getByText(/Please remove connection if you would like to upload a CSV file/i)).toBeInTheDocument();
  });

  test("connected sql node shows the friendly 'Database query node' type and manual column entry", () => {
    const sourceNode = { name: "SQL", type: "sql_node", description: "" }; // no result → null columns
    renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={vi.fn()} sourceNode={sourceNode} />
    );
    expect(screen.getByText(/Node type:\s*Database query node/i)).toBeInTheDocument();
    expect(screen.getByText(/Enter source columns/i)).toBeInTheDocument();
  });

  test("shows the load-recommendation checkbox", () => {
    renderWithProviders(<Step1Source datasets={datasets} onResetDownstream={vi.fn()} />);
    expect(screen.getByText(/Load concept recommendation by default/i)).toBeInTheDocument();
  });

  test("reopening with an unchanged connected node does not reset downstream or re-dispatch source data", () => {
    const sourceNode = { name: "My Py2Table", type: "py2table_node", description: "produces rows", map: { a: [] } };
    // Pre-seeded exactly as this node's derived SourceData would already look - simulating
    // a drawer reopen for a node connected (and mapped) in a prior session.
    const state = {
      ...initialState,
      wizard: {
        ...initialState.wizard,
        sourceData: {
          type: "node" as const,
          columns: ["a"],
          nodeMeta: { name: "My Py2Table", type: "py2table_node", description: "produces rows" },
        },
      },
    };
    const onResetDownstream = vi.fn();
    const { dispatch } = renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} sourceNode={sourceNode} />,
      { state }
    );

    expect(onResetDownstream).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some((call: any[]) => call[0]?.type === ACTION_TYPES.SET_SOURCE_DATA)).toBe(false);
  });

  test("connecting a genuinely different node resets downstream and dispatches new source data", () => {
    const sourceNode = { name: "New Node", type: "py2table_node", description: "new", map: { x: [] } };
    // Pre-seeded with a different node's SourceData, so this connection is a real change.
    const state = {
      ...initialState,
      wizard: {
        ...initialState.wizard,
        sourceData: {
          type: "node" as const,
          columns: ["old"],
          nodeMeta: { name: "Old Node", type: "py2table_node", description: "old" },
        },
      },
    };
    const onResetDownstream = vi.fn();
    const { dispatch } = renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} sourceNode={sourceNode} />,
      { state }
    );

    expect(onResetDownstream).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith({
      type: ACTION_TYPES.SET_SOURCE_DATA,
      payload: {
        type: "node",
        columns: ["x"],
        nodeMeta: { name: "New Node", type: "py2table_node", description: "new" },
      },
    });
  });

  test("swapping to a different no-columns node does not reuse the previous node's manually-typed columns", () => {
    const nodeA = { name: "SQL A", type: "sql_node", description: "" };
    const nodeB = { name: "SQL B", type: "sql_node", description: "" };
    const onResetDownstream = vi.fn();
    const { dispatch, rerender } = renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} sourceNode={nodeA} />
    );

    // Type manual columns for node A.
    fireEvent.change(screen.getByLabelText(/Enter source columns/i), { target: { value: "col1,col2" } });

    // Swap to a different node while the component stays mounted (same Provider tree, so
    // refs/local state persist across this update - unlike the unmount+remount case covered
    // by the "reopening" test above). `renderWithProviders` doesn't itself expose a
    // props-only rerender, so the same Provider wrapping is reconstructed here directly.
    rerender(
      <ConceptMappingContext.Provider value={initialState}>
        <ConceptMappingDispatchContext.Provider value={dispatch}>
          <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} sourceNode={nodeB} />
        </ConceptMappingDispatchContext.Provider>
      </ConceptMappingContext.Provider>
    );

    // The manual-columns input itself must reset to empty for the new node...
    expect(screen.getByLabelText(/Enter source columns/i)).toHaveValue("");

    // ...and the dispatch for node B must not carry node A's typed columns.
    const lastSourceDataCall = dispatch.mock.calls
      .filter((call: any[]) => call[0]?.type === ACTION_TYPES.SET_SOURCE_DATA)
      .pop();
    expect(lastSourceDataCall?.[0]?.payload).toEqual({
      type: "node",
      columns: [],
      nodeMeta: { name: "SQL B", type: "sql_node", description: "" },
    });
  });

  test("reopening a manual-columns node rehydrates its persisted columns instead of resetting them", () => {
    const sourceNode = { name: "SQL", type: "sql_node", description: "" }; // no result → null columns
    // Pre-seeded exactly as this node's derived SourceData would already look, with columns
    // the user had previously typed in by hand - simulating a drawer reopen.
    const state = {
      ...initialState,
      wizard: {
        ...initialState.wizard,
        sourceData: {
          type: "node" as const,
          columns: ["col1", "col2"],
          nodeMeta: { name: "SQL", type: "sql_node", description: "" },
        },
      },
    };
    const onResetDownstream = vi.fn();
    const { dispatch } = renderWithProviders(
      <Step1Source datasets={datasets} onResetDownstream={onResetDownstream} sourceNode={sourceNode} />,
      { state }
    );

    expect(onResetDownstream).not.toHaveBeenCalled();
    expect(dispatch.mock.calls.some((call: any[]) => call[0]?.type === ACTION_TYPES.SET_SOURCE_DATA)).toBe(false);
    expect(screen.getByLabelText(/Enter source columns/i)).toHaveValue("col1, col2");
  });
});
