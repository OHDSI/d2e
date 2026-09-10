import React, { FC, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  MaterialReactTable,
  MRT_ColumnDef,
  MRT_Row,
  MRT_RowData,
  useMaterialReactTable,
} from "material-react-table";
import { Box, Button, Chip } from "@portal/components";
import { IconButton, Tooltip } from "@mui/material";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import BackspaceOutlinedIcon from "@mui/icons-material/BackspaceOutlined";
import TungstenOutlinedIcon from "@mui/icons-material/TungstenOutlined";
import FlagOutlinedIcon from "@mui/icons-material/FlagOutlined";
import FlagIcon from "@mui/icons-material/Flag";
import { useTranslation } from "../../hooks";
import { RowObject, MappingStatus } from "../../types";
import { ConceptMappingContext, ConceptMappingDispatchContext } from "../../Context/ConceptMappingContext";
import { DispatchType, ACTION_TYPES } from "../../Context/reducers";
import { i18nKeys } from "../../Context/state";
import { api } from "../../axios/api";
import { ConceptInput, NodeSuggestionsRow, SuggestionDto } from "../../axios/concept-mapping-suggestions";
import { deriveRowStatus } from "../../utils/deriveRowStatus";
import "./MappingTable.scss";

interface MappingTableProps {
  selectedDatasetId: string;
  autoPopulate?: boolean;
  datasetName?: string;
  // Scopes the backend suggestions this table loads/writes; absent when the node hasn't
  // been persisted yet, in which case the table falls back to purely client-side behavior.
  dataflowId?: string;
  nodeId?: string;
  // Bumped by a sibling (MappingDrawer, after it persists a new suggestion) to make this
  // table refetch even though its own dataflowId/nodeId props haven't changed.
  refreshSignal?: number;
  // Mirrors the freshly-loaded suggestions map up to an ancestor (e.g. StepFlow, which needs
  // it to decide whether the CSV download button should be enabled) without that ancestor
  // having to duplicate the fetch.
  onSuggestionsChange?: (suggestionsByRowId: Record<string, NodeSuggestionsRow>) => void;
}

// Fixed height of a single concept line, so the stacked concept columns and the stacked
// action column line up row-for-row.
const SUGGESTION_LINE_HEIGHT = 36;

// Shown in "Checked by" for a persisted suggestion whose acting user has no recorded name -
// i.e. one written before those names were stored.
const UNKNOWN_USER = "\u2014";

interface ConceptLine {
  key: string;
  // Present when this line is a persisted backend suggestion; absent for a client-only
  // Recommend concept that hasn't been suggested yet.
  suggestionId?: string;
  isApproved: boolean;
  conceptId: any;
  conceptName: any;
  conceptCode: any;
  domainId: any;
  vocabularyId: any;
  // Who last acted on this line: its approver once approved, otherwise whoever suggested it.
  // Empty for a client-only Recommend concept, which nobody has acted on yet.
  checkedBy: string;
}

// A source row can carry several competing suggestions. We render one line per suggestion
// stacked inside the row's concept columns (and its action column) so a multi-suggestion row
// is simply taller - matching the design's inline layout (no expand/detail panel). A row with
// no backend suggestion but a client-side Recommend concept shows that single concept; a row
// with neither shows no concept line.
function conceptLines(original: { [key: string]: any }): ConceptLine[] {
  const suggestions: SuggestionDto[] = original._suggestions ?? [];
  if (suggestions.length > 0) {
    return suggestions.map((s) => ({
      key: s.id,
      suggestionId: s.id,
      isApproved: !!s.isApproved,
      conceptId: s.conceptId,
      conceptName: s.conceptName,
      conceptCode: s.conceptCode,
      domainId: s.domainId,
      vocabularyId: s.vocabularyId,
      checkedBy: (s.isApproved ? s.approvedByName : s.suggestedByName) ?? UNKNOWN_USER,
    }));
  }
  if (original.conceptId) {
    return [
      {
        key: "client",
        isApproved: false,
        conceptId: original.conceptId,
        conceptName: original.conceptName,
        conceptCode: original.conceptCode,
        domainId: original.domainId,
        vocabularyId: original.vocabularyId,
        checkedBy: "",
      },
    ];
  }
  return [];
}

export const MappingTable: FC<MappingTableProps> = ({
  selectedDatasetId,
  autoPopulate,
  datasetName,
  dataflowId,
  nodeId,
  refreshSignal,
  onSuggestionsChange,
}) => {
  const { getText } = useTranslation();
  const conceptMappingState = useContext(ConceptMappingContext);
  const dispatch: React.Dispatch<DispatchType> = useContext(ConceptMappingDispatchContext);
  const { sourceCode, sourceName, sourceFrequency, description, domainId } = conceptMappingState.columnMapping;
  const csvData = conceptMappingState.csvData.data;
  const [isLoading, setIsLoading] = useState(false);

  // Multi-user suggestions loaded from the backend, keyed by sourceRowId. This - not the
  // local reducer's `status`/`flagged` fields - is now the source of truth for the Status
  // chip and Flag icon (see deriveRowStatus below); the reducer fields still exist on
  // mappingData but are effectively stale once a dataflowId/nodeId are wired up.
  const [suggestionsByRowId, setSuggestionsByRowId] = useState<Record<string, NodeSuggestionsRow>>({});

  const loadSuggestions = useCallback(async () => {
    if (!dataflowId || !nodeId) {
      return;
    }
    const rows = await api.conceptMappingSuggestions.getSuggestions(dataflowId, nodeId);
    const map: Record<string, NodeSuggestionsRow> = {};
    rows.forEach((row) => {
      map[row.sourceRowId] = row;
    });
    setSuggestionsByRowId(map);
  }, [dataflowId, nodeId]);

  useEffect(() => {
    loadSuggestions();
    // refreshSignal is a pure trigger (its value is never read) - bumping it is how a
    // sibling component asks this table to refetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadSuggestions, refreshSignal]);

  useEffect(() => {
    onSuggestionsChange?.(suggestionsByRowId);
  }, [suggestionsByRowId, onSuggestionsChange]);

  // Rows as rendered/acted on: csvData merged with the backend suggestions for that row's
  // sourceRowId. Concept columns (conceptId/conceptName/...) still come from csvData
  // (Recommend fills them client-side) - only status/flagged/suggestion-id resolution come
  // from the backend merge.
  const mergedData = useMemo(
    () =>
      csvData.map((row) => {
        const backendRow = row.sourceRowId ? suggestionsByRowId[row.sourceRowId] : undefined;
        const suggestions = backendRow?.suggestions ?? [];
        const derived = deriveRowStatus({ flagged: backendRow?.flagged, suggestions });
        // Concept columns: show the row's backend suggestion (the approved one, else the
        // first) so a Suggest/Approve surfaces its concept here. Fall back to the client-side
        // concept that Recommend filled into csvData when there's no backend suggestion yet.
        const chosen = suggestions.find((s) => s.isApproved) ?? suggestions[0];
        return {
          ...row,
          ...(chosen
            ? {
                conceptId: chosen.conceptId,
                conceptName: chosen.conceptName,
                conceptCode: chosen.conceptCode,
                domainId: chosen.domainId,
                vocabularyId: chosen.vocabularyId,
              }
            : {}),
          status: derived.status,
          flagged: derived.flagged,
          _suggestions: suggestions,
        };
      }),
    [csvData, suggestionsByRowId]
  );

  // Per-row action "cores" perform a single backend write and DON'T refetch, so the bulk
  // handlers can batch many rows and refetch once at the end. The single-row handlers below
  // wrap a core with a refetch.
  const approveRowCore = useCallback(
    async (row: { [key: string]: any }) => {
      if (!dataflowId || !nodeId || !row.sourceRowId) {
        return;
      }
      let suggestionId: string | undefined = row._suggestions?.[0]?.id;
      if (!suggestionId) {
        // No backend suggestion yet - this is a Recommend-filled, client-only concept.
        // Persist it first, then approve the suggestion just created. Nothing to approve if
        // the row has neither a suggestion nor a client concept.
        if (!row.conceptId) {
          return;
        }
        const concept: ConceptInput = {
          conceptId: row.conceptId,
          conceptName: row.conceptName,
          conceptCode: row.conceptCode,
          domainId: row.domainId,
          vocabularyId: row.vocabularyId,
        };
        const dto = await api.conceptMappingSuggestions.addSuggestion(dataflowId, nodeId, row.sourceRowId, concept);
        suggestionId = dto.id;
      }
      await api.conceptMappingSuggestions.approve(suggestionId);
    },
    [dataflowId, nodeId]
  );

  const unapproveRowCore = useCallback(async (row: { [key: string]: any }) => {
    const suggestionId: string | undefined = row._suggestions?.find((s: SuggestionDto) => s.isApproved)?.id;
    if (!suggestionId) {
      return;
    }
    await api.conceptMappingSuggestions.unapprove(suggestionId);
  }, []);

  const flagRowCore = useCallback(
    async (row: { [key: string]: any }, flagged: boolean) => {
      if (!dataflowId || !nodeId || !row.sourceRowId) {
        return;
      }
      await api.conceptMappingSuggestions.setRowFlag(dataflowId, nodeId, row.sourceRowId, flagged);
    },
    [dataflowId, nodeId]
  );

  const handleApprove = useCallback(
    async (row: { [key: string]: any }) => {
      await approveRowCore(row);
      await loadSuggestions();
    },
    [approveRowCore, loadSuggestions]
  );

  const handleUncheck = useCallback(
    async (row: { [key: string]: any }) => {
      await unapproveRowCore(row);
      await loadSuggestions();
    },
    [unapproveRowCore, loadSuggestions]
  );

  const handleFlag = useCallback(
    async (row: { [key: string]: any }) => {
      await flagRowCore(row, !row.flagged);
      await loadSuggestions();
    },
    [flagRowCore, loadSuggestions]
  );

  // Approve a specific suggestion from the expanded sub-table (approving deletes the row's
  // competing suggestions, per the backend rule).
  const handleApproveSuggestion = useCallback(
    async (suggestionId: string) => {
      await api.conceptMappingSuggestions.approve(suggestionId);
      await loadSuggestions();
    },
    [loadSuggestions]
  );

  const handleUnapproveSuggestion = useCallback(
    async (suggestionId: string) => {
      await api.conceptMappingSuggestions.unapprove(suggestionId);
      await loadSuggestions();
    },
    [loadSuggestions]
  );

  // Bulk actions: batch the cores over the selected rows, refetch once, then clear selection.
  // A row with competing suggestions needs a human decision about WHICH concept wins, so it is
  // skipped here - left at its current status for the user to resolve individually - rather
  // than blocking the whole batch. Every other selected row is approved as normal.
  const bulkApprove = useCallback(
    async (rows: MRT_Row<{ [key: string]: any }>[]) => {
      const unambiguous = rows.filter((r) => (r.original._suggestions?.length ?? 0) <= 1);
      await Promise.all(unambiguous.map((r) => approveRowCore(r.original)));
      await loadSuggestions();
    },
    [approveRowCore, loadSuggestions]
  );

  const bulkUncheck = useCallback(
    async (rows: MRT_Row<{ [key: string]: any }>[]) => {
      await Promise.all(rows.map((r) => unapproveRowCore(r.original)));
      await loadSuggestions();
    },
    [unapproveRowCore, loadSuggestions]
  );

  const bulkFlag = useCallback(
    async (rows: MRT_Row<{ [key: string]: any }>[]) => {
      await Promise.all(rows.map((r) => flagRowCore(r.original, true)));
      await loadSuggestions();
    },
    [flagRowCore, loadSuggestions]
  );

  // Status is displayed as a chip (unchecked/suggested/approved) plus an optional flag
  // indicator. Colors/icons are intentionally simple - no external design tokens exist for
  // this yet in the plugin.
  const statusChipConfig: Record<MappingStatus, { label: string; color: "default" | "info" | "success" }> = {
    unchecked: { label: getText(i18nKeys.STATUS__UNCHECKED), color: "default" },
    suggested: { label: getText(i18nKeys.STATUS__SUGGESTED), color: "info" },
    approved: { label: getText(i18nKeys.STATUS__APPROVED), color: "success" },
  };

  const renderStatusCell = useCallback(
    (original: { [key: string]: any }) => {
      const status: MappingStatus = original.status ?? "unchecked";
      const config = statusChipConfig[status] ?? statusChipConfig.unchecked;
      const count = original._suggestions?.length ?? 0;

      // "Suggested (N)": lavender chip with navy text; N = number of competing suggestions,
      // each shown on its own line in the concept columns.
      if (status === "suggested") {
        return (
          <Chip size="small" label={`${config.label} (${count})`} sx={{ backgroundColor: "#E5E6F2", color: "#000080" }} />
        );
      }
      // Approved: mint chip with a check icon.
      if (status === "approved") {
        return (
          <Chip
            size="small"
            label={config.label}
            icon={<TaskAltIcon fontSize="small" />}
            sx={{ backgroundColor: "#E1FFF6", color: "#00875A", "& .MuiChip-icon": { color: "#00875A" } }}
          />
        );
      }
      return <Chip size="small" label={config.label} color="default" />;
    },
    [statusChipConfig]
  );

  // Concept columns render one line per suggestion (stacked), so a multi-suggestion row grows
  // taller with each suggestion's value on its own line, aligned with the action column.
  const renderConceptCell = useCallback((original: { [key: string]: any }, field: keyof ConceptLine) => {
    const lines = conceptLines(original);
    if (lines.length === 0) {
      return null;
    }
    return (
      <Box sx={{ display: "flex", flexDirection: "column" }}>
        {lines.map((line) => (
          <Box
            key={line.key}
            sx={{ height: `${SUGGESTION_LINE_HEIGHT}px`, display: "flex", alignItems: "center" }}
          >
            {line[field] as React.ReactNode}
          </Box>
        ))}
      </Box>
    );
  }, []);

  const renderActionsCell = useCallback(
    (original: { [key: string]: any }) => {
      const lines = conceptLines(original);

      // Suggest (open the terminology search to add another concept) and Flag (toggle the row
      // flag) are per-row actions, repeated on each line to match the design.
      const suggestButton = (
        <Tooltip title={getText(i18nKeys.ACTION__SUGGEST)}>
          <IconButton
            size="small"
            sx={{ color: "#000080" }}
            aria-label={getText(i18nKeys.ACTION__SUGGEST)}
            onClick={() => dispatch({ type: ACTION_TYPES.SET_SELECTED_DATA, payload: original })}
          >
            <TungstenOutlinedIcon fontSize="small" />
          </IconButton>
        </Tooltip>
      );
      const flagButton = (
        <Tooltip title={getText(i18nKeys.ACTION__FLAG)}>
          <IconButton
            size="small"
            sx={{ color: original.flagged ? "#CD6000" : "#000080" }}
            aria-label={getText(i18nKeys.ACTION__FLAG)}
            onClick={() => handleFlag(original)}
          >
            {original.flagged ? <FlagIcon fontSize="small" /> : <FlagOutlinedIcon fontSize="small" />}
          </IconButton>
        </Tooltip>
      );

      // No concept yet: a single line with a disabled Approve plus Suggest/Flag.
      if (lines.length === 0) {
        return (
          <Box sx={{ height: `${SUGGESTION_LINE_HEIGHT}px`, display: "flex", alignItems: "center", gap: "2px" }}>
            <Tooltip title={getText(i18nKeys.ACTION__APPROVE)}>
              <span>
                <IconButton size="small" sx={{ color: "#000080" }} aria-label={getText(i18nKeys.ACTION__APPROVE)} disabled>
                  <TaskAltIcon fontSize="small" />
                </IconButton>
              </span>
            </Tooltip>
            {suggestButton}
            {flagButton}
          </Box>
        );
      }

      return (
        <Box sx={{ display: "flex", flexDirection: "column" }}>
          {lines.map((line) => (
            <Box
              key={line.key}
              sx={{ height: `${SUGGESTION_LINE_HEIGHT}px`, display: "flex", alignItems: "center", gap: "2px" }}
            >
              {line.isApproved ? (
                <Tooltip title={getText(i18nKeys.ACTION__UNCHECK)}>
                  <IconButton
                    size="small"
                    sx={{ color: "#000080" }}
                    aria-label={getText(i18nKeys.ACTION__UNCHECK)}
                    onClick={() =>
                      line.suggestionId ? handleUnapproveSuggestion(line.suggestionId) : handleUncheck(original)
                    }
                  >
                    <BackspaceOutlinedIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              ) : (
                <Tooltip title={getText(i18nKeys.ACTION__APPROVE)}>
                  <IconButton
                    size="small"
                    sx={{ color: "#000080" }}
                    aria-label={getText(i18nKeys.ACTION__APPROVE)}
                    onClick={() =>
                      line.suggestionId ? handleApproveSuggestion(line.suggestionId) : handleApprove(original)
                    }
                  >
                    <TaskAltIcon fontSize="small" />
                  </IconButton>
                </Tooltip>
              )}
              {suggestButton}
              {flagButton}
            </Box>
          ))}
        </Box>
      );
    },
    [dispatch, getText, handleApprove, handleUncheck, handleFlag, handleApproveSuggestion, handleUnapproveSuggestion]
  );

  const columns = useMemo<MRT_ColumnDef<{ [key: string]: any }>[]>(
    () => [
      {
        id: "0",
        accessorKey: "status",
        header: getText(i18nKeys.MAPPING_TABLE__STATUS),
        size: 150,
        Cell: ({ row }) => renderStatusCell(row.original),
      },
      {
        id: "1",
        accessorKey: sourceCode,
        header: getText(i18nKeys.MAPPING_TABLE__SOURCE),
        size: 150,
      },
      {
        id: "2",
        accessorKey: sourceName,
        header: getText(i18nKeys.MAPPING_TABLE__NAME), // source name
        size: 150,
      },
      {
        id: "3",
        accessorKey: sourceFrequency,
        header: getText(i18nKeys.MAPPING_TABLE__FREQUENCY),
        size: 150,
      },
      {
        id: "4",
        accessorKey: description,
        header: getText(i18nKeys.MAPPING_TABLE__DESCRIPTION),
        size: 150,
      },
      {
        id: "5",
        accessorKey: "conceptId",
        header: getText(i18nKeys.MAPPING_TABLE__CONCEPT_ID),
        size: 150,
        Cell: ({ row }) => renderConceptCell(row.original, "conceptId"),
      },
      {
        id: "6",
        accessorKey: "conceptName",
        header: getText(i18nKeys.MAPPING_TABLE__CONCEPT_NAME),
        size: 150,
        Cell: ({ row }) => renderConceptCell(row.original, "conceptName"),
      },
      {
        id: "7",
        accessorKey: "conceptCode",
        header: getText(i18nKeys.MAPPING_TABLE__CONCEPT_CODE),
        size: 150,
        Cell: ({ row }) => renderConceptCell(row.original, "conceptCode"),
      },
      {
        id: "8",
        accessorKey: "domainId",
        header: getText(i18nKeys.MAPPING_TABLE__DOMAIN_ID),
        size: 150,
        Cell: ({ row }) => renderConceptCell(row.original, "domainId"),
      },
      {
        id: "9",
        accessorKey: "vocabularyId",
        header: getText(i18nKeys.MAPPING_TABLE__VOCABULARY),
        size: 150,
        Cell: ({ row }) => renderConceptCell(row.original, "vocabularyId"),
      },
      {
        id: "10",
        header: getText(i18nKeys.MAPPING_TABLE__CHECKED_BY),
        size: 150,
        // Unlike the other columns, this one has no single value on the row - a branched row
        // carries one name per suggestion line - so there's nothing for MRT to sort or filter
        // on. Turning both off avoids offering an affordance that would quietly do nothing.
        enableSorting: false,
        enableColumnFilter: false,
        Cell: ({ row }) => renderConceptCell(row.original, "checkedBy"),
      },
      {
        id: "actions",
        header: "",
        size: 130,
        enableResizing: false,
        enableColumnActions: false,
        enableSorting: false,
        Cell: ({ row }) => renderActionsCell(row.original),
      },
    ],
    [sourceCode, sourceName, sourceFrequency, description, getText, renderStatusCell, renderActionsCell, renderConceptCell]
  );

  // Clicking anywhere in a row opens the concept list popup for that row - the same thing the
  // "Suggest" action icon does (which stays, as the visible affordance). Clicks that land on a
  // control inside the row (the selection checkbox, the Approve/Uncheck/Suggest/Flag icons)
  // belong to that control, so they're skipped here: every one of them is a MUI ButtonBase,
  // which also covers clicks on the icon/ripple *inside* the control rather than the control
  // element itself.
  const handleRowClick = useCallback(
    (event: React.MouseEvent<HTMLTableRowElement>, original: { [key: string]: any }) => {
      if ((event.target as HTMLElement).closest(".MuiButtonBase-root")) {
        return;
      }
      dispatch({ type: ACTION_TYPES.SET_SELECTED_DATA, payload: original });
    },
    [dispatch]
  );

  const TableBodyRowProps = ({ row }: { row: MRT_Row<{ [key: string]: any }> }) => {
    const selected = row.getIsSelected();
    return {
      onClick: (event: React.MouseEvent<HTMLTableRowElement>) => handleRowClick(event, row.original),
      sx: {
        cursor: "pointer",
        backgroundColor: selected ? "#E5E6F2" : row.index % 2 === 0 ? "#f5f5f5" : "#ffffff",
        // Override MRT's default (darker) row-selection highlight with our lighter tint.
        "&.Mui-selected, &.Mui-selected:hover": {
          backgroundColor: "#E5E6F2 !important",
        },
        "&.MuiTableRow-root:hover": {
          backgroundColor: selected ? "#E5E6F2" : "#ebf1f8",
        },
        // Distinct client "selected for terminology search" highlight (not row selection).
        boxShadow: row.original == conceptMappingState.selectedData ? "inset 0px 0px 0px 2px #3b438c" : "none",
      },
    };
  };

  const tableInstance = useMaterialReactTable({
    initialState: { density: "compact", columnPinning: { right: ["actions"] } },
    enableDensityToggle: false,
    columns,
    data: mergedData,
    // Keep the user on their current page when the data reference changes. Suggest (refetch)
    // and Recommend (fills concept columns) both rebuild `mergedData`, and TanStack Table's
    // default `autoResetPageIndex: true` would otherwise snap the table back to page 1.
    autoResetPageIndex: false,
    // MRT-native selected-row colour (the default is darker); this is what actually drives
    // the checkbox-selection highlight, so set it here rather than fighting .Mui-selected.
    mrtTheme: { selectedRowBackgroundColor: "#E5E6F2" },
    enableRowSelection: true,
    // We render our own "N selected" bulk toolbar in renderTopToolbarCustomActions, so suppress
    // MRT's default selection alert banner to avoid a duplicate.
    positionToolbarAlertBanner: "none",
    // Stable per-row id (the source row's UUID) so selection survives the post-action refetch.
    getRowId: (originalRow: { [key: string]: any }, index: number) => originalRow.sourceRowId ?? String(index),
    enableColumnResizing: true,
    layoutMode: "grid",
    muiTableHeadCellProps: ({ column }) => ({
      style: {
        fontWeight: "bold",
        fontSize: "16px",
      },
      // Kill MRT's right-pinned-column separator shadow on the actions column.
      ...(column.id === "actions" ? { sx: { boxShadow: "none !important" } } : {}),
    }),
    muiTableBodyCellProps: ({ row, column }) => {
      const selected = row.getIsSelected();
      const rowBg = selected ? "#E5E6F2" : row.index % 2 === 0 ? "#f5f5f5" : "#ffffff";
      const isActions = column.id === "actions";
      return {
        // Top-align so a single-value cell (status/source/…) lines up with the first stacked
        // concept line in a multi-suggestion row. `!important` on the actions column defeats
        // MRT's pinned-column separator shadow (applied with high specificity).
        sx: { alignItems: "flex-start", ...(isActions ? { boxShadow: "none !important" } : {}) },
        style: {
          fontSize: "14px",
          color: "#000080",
          // Non-pinned cells stay transparent so the row's (selection/alternating) background
          // shows through. The right-pinned actions column needs an opaque background matching
          // the row - and no pinning shadow, which layered wrongly over a selected row.
          ...(isActions ? { backgroundColor: rowBg } : { backgroundColor: "transparent" }),
        },
      };
    },
    muiTableBodyRowProps: TableBodyRowProps,
    muiTableHeadRowProps: {
      style: {
        backgroundColor: "#ebf1f8",
      },
    },
    muiTopToolbarProps: {
      style: {
        backgroundColor: "#fbfbfd",
      },
    },
    renderTopToolbarCustomActions: ({ table }) => {
      const selectedRows = table.getSelectedRowModel().rows;
      if (selectedRows.length > 0) {
        // An unchecked row has nothing to approve at all, so rather than silently skip it the
        // button refuses the whole selection - that's a sign the user picked the wrong rows.
        // Beyond that, Approve is offered whenever at least one selected row would actually
        // change: exactly the rows bulkApprove acts on (one suggestion, not yet approved).
        // Rows that are already approved, or that carry competing suggestions, simply don't
        // count towards that - so a selection made up only of those leaves Approve disabled
        // instead of becoming a click that does nothing.
        const selectedOriginals = selectedRows.map((r) => r.original);
        const hasUnchecked = selectedOriginals.some((r) => r.status === "unchecked");
        const willChange = selectedOriginals.some(
          (r) => r.status === "suggested" && (r._suggestions?.length ?? 0) === 1
        );
        const approveDisabled = hasUnchecked || !willChange;
        const uncheckDisabled = !selectedRows.some((r) => r.original.status === "approved");
        return (
          <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%", p: "4px" }}>
            <Box sx={{ fontWeight: 500 }}>
              {selectedRows.length} {getText(i18nKeys.MAPPING_TABLE__SELECTED)}
            </Box>
            <Tooltip title={getText(i18nKeys.ACTION__FLAG)}>
              <IconButton
                size="small"
                sx={{ color: "#000080" }}
                aria-label={getText(i18nKeys.ACTION__FLAG)}
                onClick={() => bulkFlag(selectedRows).then(() => table.resetRowSelection())}
              >
                <FlagOutlinedIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button
              sx={{ width: "120px", fontSize: "16px" }}
              onClick={() => bulkApprove(selectedRows).then(() => table.resetRowSelection())}
              text={getText(i18nKeys.ACTION__APPROVE)}
              disabled={approveDisabled}
            />
            <Button
              variant="outlined"
              sx={{ width: "120px", fontSize: "16px" }}
              onClick={() => bulkUncheck(selectedRows).then(() => table.resetRowSelection())}
              text={getText(i18nKeys.ACTION__UNCHECK)}
              disabled={uncheckDisabled}
            />
          </Box>
        );
      }
      return (
        <Box sx={{ display: "flex", alignItems: "center", gap: "1rem", width: "100%", p: "4px" }}>
          <Box sx={{ fontWeight: 500 }}>
            {getText(i18nKeys.MAPPING_TABLE__DATASET_REFERENCE)}
            {datasetName ? `: ${datasetName}` : ""}
          </Box>
          <Button
            variant="outlined"
            onClick={() => recommendConcepts()}
            text={getText(i18nKeys.MAPPING_TABLE__RECOMMEND_CONCEPT)}
            loading={isLoading}
            disabled={getAvailableRows().length === 0}
          />
        </Box>
      );
    },
  });

  // Recommend targets rows that don't have a concept assigned yet - unlike the old
  // "checked" flag, status alone no longer tells us whether a row needs a concept
  // (e.g. an unchecked row that already got a concept from a previous Recommend run
  // shouldn't be re-fetched).
  const getAvailableRows = useCallback(() => {
    return tableInstance.getCenterRows().filter((row: MRT_RowData) => !row.original.conceptId);
  }, [tableInstance]);

  const recommendConcepts = useCallback(async () => {
    const formattedRows = getAvailableRows()
      .map((row: MRT_RowData) => {
        const formattedRow: RowObject = { index: row.index, searchText: row.original[sourceName] };
        if (domainId) {
          formattedRow["domainId"] = row.original[domainId];
        }
        return formattedRow;
      })
      // Skip rows with no source-name text: the terminology endpoint 400s the whole batch on a
      // blank searchText, and an empty row (e.g. a trailing newline in the CSV) has nothing to map.
      .filter((row) => typeof row.searchText === "string" && row.searchText.trim() !== "");

    if (formattedRows.length === 0) return;

    setIsLoading(true);
    try {
      const result = await api.terminology.getStandardConcepts(formattedRows, selectedDatasetId!);
      dispatch({ type: ACTION_TYPES.SET_MULTIPLE_MAPPING, payload: result });
    } catch (e) {
      // Always clear loading on failure (e.g. an expired token after the drawer sat open a
      // while) - otherwise isLoading stays true and the Recommend button is stuck disabled
      // with a spinner on reopen.
      // eslint-disable-next-line no-console
      console.error("Recommend concepts failed", e);
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, domainId, getAvailableRows, selectedDatasetId, sourceName]);

  const didAutoPopulate = React.useRef(false);
  useEffect(() => {
    if (autoPopulate && !didAutoPopulate.current && getAvailableRows().length > 0) {
      didAutoPopulate.current = true;
      recommendConcepts();
    }
  }, [autoPopulate, getAvailableRows, recommendConcepts]);

  return <MaterialReactTable table={tableInstance} />;
};
