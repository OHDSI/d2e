import React, { FC, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  CircularProgress,
  FormControl,
  IconButton,
  MenuItem,
  Select,
  SelectChangeEvent,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import UploadFileOutlinedIcon from "@mui/icons-material/UploadFileOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import InsertDriveFileOutlinedIcon from "@mui/icons-material/InsertDriveFileOutlined";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Checkbox } from "@portal/components";
import { ConceptMappingContext, ConceptMappingDispatchContext } from "../Context/ConceptMappingContext";
import { DispatchType, ACTION_TYPES } from "../Context/reducers";
import { useTranslation } from "../hooks";
import { i18nKeys } from "../Context/state";
import { CsvFileInfo, CsvReader } from "../components/CsvReader/CsvReader";
import { buildCsvSourceData, buildNodeSourceData, extractColumns, sourceDataToCsvData } from "../source/source-adapter";
import { SourceData, SourceNodeDTO } from "../types/source";
import { Study, csvData } from "../types";
import "./Step1Source.scss";

// A CSV upload goes through 3 states in the UI: "uploading" (file picked, FileReader parse in
// flight), "success" (parsed - a source has been set) and "failed" (unsupported type / parse
// error - no source is set, so Step 1 stays gated). Kept local to this component: it's purely
// presentational card state, not something downstream steps or a reopened drawer need beyond
// what's already rehydrated from wizard.sourceData below.
interface CsvUploadState {
  name: string;
  size: number;
  status: "uploading" | "success" | "failed";
  error?: string;
}

function formatFileSize(bytes: number): string {
  return `${Math.round(bytes / 1024)}kb`;
}

interface Step1SourceProps {
  sourceNode?: SourceNodeDTO;
  datasets: Study[];
  onResetDownstream: () => void;
  // Removes the incoming canvas edge from the connected upstream node (wired up by the flow
  // app's ConceptMappingDrawer). Undefined in hosts that don't support it (e.g. this app's
  // own local dev harness) - the unlink icon then renders but does nothing, same as before.
  onDisconnectSource?: () => void;
}

// Structural equality for the subset of SourceData that a connected node can produce
// (columns + nodeMeta). Used to detect a genuine source change vs. a no-op remount
// (e.g. reopening the drawer for a node that was already connected last session).
function isSameNodeSourceData(current: SourceData | null, intended: SourceData): boolean {
  if (!current || current.type !== intended.type) return false;
  if (current.columns.length !== intended.columns.length) return false;
  if (current.columns.some((c, i) => c !== intended.columns[i])) return false;
  const a = current.nodeMeta;
  const b = intended.nodeMeta;
  if (!a || !b) return a === b;
  return a.name === b.name && a.type === b.type && a.description === b.description;
}

// Same connected node, by identity (name + type) - used to tell whether persisted
// SourceData in context belongs to the currently-connected node (a reopen) vs. a
// different one (a genuine reconnect).
function isSameConnectedNode(nodeMeta: SourceData["nodeMeta"], sourceNode: SourceNodeDTO): boolean {
  return !!nodeMeta && nodeMeta.name === sourceNode.name && nodeMeta.type === sourceNode.type;
}

// Whether the SourceData already in context was produced by the given (currently
// connected) node - i.e. this is a reopen/remount of the same node, not a fresh
// connection or a reconnect to a different one.
function matchesPersistedNode(sourceNode: SourceNodeDTO | undefined, sourceData: SourceData | null): boolean {
  return !!sourceNode && sourceData?.type === "node" && isSameConnectedNode(sourceData.nodeMeta, sourceNode);
}

// Friendly display names for the raw reactflow node types a source can be connected to.
// Anything not listed here (future node types) falls back to the raw type string.
const NODE_TYPE_LABELS: Record<string, string> = {
  sql_node: "Database query node",
  py2table_node: "Python to table node",
};

function friendlyNodeType(type: string): string {
  return NODE_TYPE_LABELS[type] ?? type;
}

export const Step1Source: FC<Step1SourceProps> = ({
  sourceNode,
  datasets,
  onResetDownstream,
  onDisconnectSource,
}) => {
  const { getText } = useTranslation();
  const state = useContext(ConceptMappingContext);
  const dispatch = useContext<React.Dispatch<DispatchType>>(ConceptMappingDispatchContext);
  const nodeColumns = useMemo(() => (sourceNode ? extractColumns(sourceNode) : null), [sourceNode]);
  // The dataset endpoint returns datasets in creation order; the dropdown lists them A-Z so a
  // user can find one by name. Datasets without a name sort last rather than throwing.
  const sortedDatasets = useMemo(
    () =>
      [...datasets].sort((a, b) =>
        (a.studyDetail?.name ?? "").localeCompare(b.studyDetail?.name ?? "", undefined, { sensitivity: "base" })
      ),
    [datasets]
  );

  // Set the wizard source AND bridge its rows into csvData so Step 3's MappingTable,
  // auto-populate and Save (which all read conceptMappingState.csvData.data) have real
  // rows. Callers MUST have already run onResetDownstream() (which clears csvData) so this
  // population is not immediately wiped. Only CSV sources carry rows client-side; node
  // sources have columns only (their output rows require backend execution, out of scope),
  // so for a node source csvData.data stays empty and Step 3 shows no rows - a known,
  // accepted limitation, not something to fabricate.
  const applySource = (source: SourceData) => {
    dispatch({ type: ACTION_TYPES.SET_SOURCE_DATA, payload: source });
    if (source.rows && source.rows.length > 0) {
      dispatch({ type: ACTION_TYPES.SET_INITAL_DATA, payload: sourceDataToCsvData(source) });
    }
  };
  // On first mount, if context already holds SourceData for this exact connected node (a
  // reopen of the drawer, not a fresh connection), rehydrate the manual-columns text from
  // it instead of starting blank - otherwise the effect below would see `columns: []` and
  // wrongly treat an unchanged manual-columns node as a genuine change (fix for task-7
  // review finding 1, manual-columns residual). Read via the initializer form so this only
  // runs once, against the context value present at mount.
  const [manualColumns, setManualColumns] = useState<string>(() =>
    matchesPersistedNode(sourceNode, state.wizard.sourceData) && state.wizard.sourceData?.type === "node"
      ? state.wizard.sourceData.columns.join(", ")
      : ""
  );
  // Tracks the previously-seen connected node's identity (across renders, not across
  // remounts) so a genuine reconnect - to a *different* node - can be told apart from
  // this same node re-rendering, and so stale manually-typed columns from a prior node
  // are never carried over onto a new one (fix for task-7 review finding 2). Seeded to the
  // current node's key (rather than null) when context already matches it on mount, so the
  // very first effect pass below doesn't mistake this reopen for a new connection and clobber
  // the manualColumns just rehydrated above.
  const prevNodeKeyRef = useRef<string | null>(
    matchesPersistedNode(sourceNode, state.wizard.sourceData) && sourceNode
      ? `${sourceNode.type}::${sourceNode.name}`
      : null
  );

  // Node source: (re)build SourceData only when the connected node's derived SourceData
  // actually differs from what's already in context. Guarding on "did the intended value
  // change" - rather than firing unconditionally on every mount/re-render while a node is
  // connected - is what stops re-opening the drawer for an already-connected node from
  // wiping out downstream column-mapping/concept work (fix for task-7 review finding 1).
  // NOTE: state.wizard.sourceData / dispatch / onResetDownstream are deliberately excluded
  // from the dependency array below (see task-7 report) to avoid re-running this effect -
  // and re-clearing downstream state - on every render triggered by the dispatch itself.
  useEffect(() => {
    if (!sourceNode) {
      prevNodeKeyRef.current = null;
      // Consistency fix: the source node can disappear out from under us - the unlink icon
      // below, or the user deleting the canvas edge while this drawer is open - leaving
      // wizard.sourceData pointed at a node that's no longer connected (Next would stay
      // wrongly enabled). Clear it once on that transition. Reading state.wizard.sourceType
      // here (rather than adding it as a dependency) is deliberate: this effect only re-runs
      // when sourceNode/nodeColumns/manualColumns change, so clearing sourceType to null
      // doesn't retrigger it - no loop.
      if (state.wizard.sourceType === "node") {
        onResetDownstream();
        dispatch({ type: ACTION_TYPES.SET_SOURCE_DATA, payload: null });
      }
      return;
    }

    const nodeKey = `${sourceNode.type}::${sourceNode.name}`;
    const isNewNode = prevNodeKeyRef.current !== nodeKey;
    prevNodeKeyRef.current = nodeKey;

    // Manually-typed columns belong to whichever node was connected when they were typed;
    // never reuse them for a different node's SourceData computation.
    const effectiveManualColumns = isNewNode ? "" : manualColumns;
    if (isNewNode && manualColumns !== "") {
      setManualColumns("");
    }

    const intended: SourceData =
      nodeColumns && nodeColumns.length > 0
        ? buildNodeSourceData(sourceNode)
        : {
            type: "node",
            columns: effectiveManualColumns
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean),
            nodeMeta: { name: sourceNode.name, type: sourceNode.type, description: sourceNode.description },
          };

    if (isSameNodeSourceData(state.wizard.sourceData, intended)) {
      return;
    }

    onResetDownstream();
    applySource(intended);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceNode, nodeColumns, manualColumns]);

  // Rehydrate the CSV upload card for an already-uploaded CSV source so it doesn't fall back
  // to the empty dropzone. The lazy init covers a back-nav remount (sourceData already present,
  // no flash); the effect below covers a fresh drawer open, where Step 1 mounts BEFORE the
  // parent's rehydrate populates wizard.sourceData - without it, the card only appeared after
  // navigating away and back. `name`/`size` come from the persisted SourceData.
  const [csvUpload, setCsvUpload] = useState<CsvUploadState | null>(() =>
    state.wizard.sourceData?.type === "csv"
      ? {
          name: state.wizard.sourceData.name ?? "",
          size: state.wizard.sourceData.size ?? 0,
          status: "success",
        }
      : null
  );

  useEffect(() => {
    const sd = state.wizard.sourceData;
    if (sd?.type === "csv") {
      // Functional update + `prev ??` so a rehydrate never clobbers an in-flight
      // uploading/failed card or a just-uploaded one.
      setCsvUpload((prev) => prev ?? { name: sd.name ?? "", size: sd.size ?? 0, status: "success" });
    }
  }, [state.wizard.sourceData]);

  const handleCsvFileSelected = (fileInfo: CsvFileInfo) => {
    setCsvUpload({ name: fileInfo.name, size: fileInfo.size, status: "uploading" });
  };

  const handleCsvLoaded = (loaded: csvData) => {
    onResetDownstream();
    const columns = loaded.data.meta.fields ?? [];
    applySource(buildCsvSourceData(loaded.name, columns, loaded.data.data, loaded.size));
    setCsvUpload({ name: loaded.name, size: loaded.size ?? 0, status: "success" });
  };

  const handleCsvError = (error: Error, fileInfo?: CsvFileInfo) => {
    // A failed upload must never leave a stale source behind (e.g. re-uploading a bad file
    // after a prior successful one) - canProceedStep1 has to see sourceData go back to null.
    onResetDownstream();
    dispatch({ type: ACTION_TYPES.SET_SOURCE_DATA, payload: null });
    const isUnsupportedType = error.message === getText(i18nKeys.CSV_READER__UNSUPPORTED_FILE_TYPE);
    setCsvUpload({
      name: fileInfo?.name ?? "",
      size: fileInfo?.size ?? 0,
      status: "failed",
      error: isUnsupportedType ? getText(i18nKeys.CSV_CARD__UNSUPPORTED_FORMAT) : error.message,
    });
  };

  const handleDeleteCsvUpload = () => {
    setCsvUpload(null);
    onResetDownstream();
    dispatch({ type: ACTION_TYPES.SET_SOURCE_DATA, payload: null });
  };

  const handleDataset = (e: SelectChangeEvent) => {
    dispatch({ type: ACTION_TYPES.SET_DATASET_ID, payload: e.target.value });
  };

  return (
    <div className="concept-mapping__step1">
      <div className="concept-mapping__step1-columns">
        <div className="concept-mapping__step1-panel">
          <Typography variant="subtitle1" className="concept-mapping__step1-panel-title">
            {getText(i18nKeys.STEP1__DATA_SOURCE_TITLE)}
          </Typography>
          <div className="concept-mapping__step1-panel-body">
            {sourceNode ? (
              <>
                <Box className="concept-mapping__step1-card concept-mapping__step1-card--connected">
                  <div className="concept-mapping__step1-card-header">
                    <AccountTreeOutlinedIcon className="concept-mapping__step1-card-icon" />
                    {/* Removes the incoming canvas edge (wired up by the host flow app). */}
                    <Tooltip title={getText(i18nKeys.STEP1__REMOVE_CONNECTION_LABEL)}>
                      <IconButton
                        size="small"
                        aria-label={getText(i18nKeys.STEP1__REMOVE_CONNECTION_LABEL)}
                        className="concept-mapping__step1-card-unlink"
                        onClick={() => onDisconnectSource?.()}
                      >
                        <LinkOffOutlinedIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </div>
                  <Typography className="concept-mapping__step1-card-title">{sourceNode.name}</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getText(i18nKeys.STEP1__NODE_TYPE_LABEL)} {friendlyNodeType(sourceNode.type)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getText(i18nKeys.STEP1__NODE_DESCRIPTION_LABEL)} {sourceNode.description}
                  </Typography>
                </Box>

                {(!nodeColumns || nodeColumns.length === 0) && (
                  <TextField
                    // `variant="standard"` avoids MUI's outlined-variant behavior of rendering the
                    // label a second time inside a <legend> (for the notched-border effect), which
                    // would otherwise make this label text match twice.
                    variant="standard"
                    fullWidth
                    size="small"
                    sx={{ mt: 1 }}
                    label={getText(i18nKeys.STEP1__MANUAL_COLUMNS_LABEL)}
                    value={manualColumns}
                    onChange={(e) => setManualColumns(e.target.value)}
                  />
                )}

                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {getText(i18nKeys.STEP1__CONNECTED_NODE_HINT)}
                </Typography>
              </>
            ) : (
              <>
                <Typography sx={{ mb: 2 }}>{getText(i18nKeys.STEP1__IMPORT_TWO_WAYS)}</Typography>

                {/* Connecting an upstream SQL/Python node is disabled for now: the node's
                    input handle is removed (see ConceptMappingNode), so this option is greyed
                    out and non-interactive. CSV upload is the only supported source. */}
                <Box
                  className="concept-mapping__step1-card"
                  sx={{ opacity: 0.5, pointerEvents: "none", cursor: "not-allowed" }}
                  aria-disabled
                >
                  <AccountTreeOutlinedIcon className="concept-mapping__step1-card-icon" />
                  <Typography className="concept-mapping__step1-card-title">
                    {getText(i18nKeys.STEP1__CONNECT_NODE_OPTION)}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {getText(i18nKeys.STEP1__CONNECT_NODE_DESC)}
                  </Typography>
                </Box>

                <div className="concept-mapping__step1-divider">
                  <span>{getText(i18nKeys.STEP1__OR)}</span>
                </div>

                {csvUpload ? (
                  <>
                    <Box
                      className={`concept-mapping__step1-card concept-mapping__step1-file-card${
                        csvUpload.status === "failed" ? " concept-mapping__step1-file-card--failed" : ""
                      }`}
                    >
                      <div className="concept-mapping__step1-file-card-row">
                        <InsertDriveFileOutlinedIcon className="concept-mapping__step1-file-card-icon" />
                        <div className="concept-mapping__step1-file-card-info">
                          <Typography className="concept-mapping__step1-file-card-name">
                            {csvUpload.status === "failed" ? getText(i18nKeys.CSV_CARD__UPLOAD_FAILED) : csvUpload.name}
                          </Typography>
                          <Typography variant="body2" className="concept-mapping__step1-file-card-sub">
                            {csvUpload.status === "failed"
                              ? `${csvUpload.error} · ${getText(i18nKeys.CSV_CARD__FAILED)}`
                              : csvUpload.status === "uploading"
                              ? `${formatFileSize(csvUpload.size)} · ${getText(i18nKeys.CSV_CARD__UPLOADING)}`
                              : formatFileSize(csvUpload.size)}
                          </Typography>
                        </div>
                        <div className="concept-mapping__step1-file-card-actions">
                          {csvUpload.status === "uploading" && <CircularProgress size={20} />}
                          {csvUpload.status === "success" && (
                            <CheckCircleIcon className="concept-mapping__step1-file-card-success-icon" />
                          )}
                          <IconButton size="small" aria-label="Remove uploaded file" onClick={handleDeleteCsvUpload}>
                            <DeleteOutlineIcon fontSize="small" />
                          </IconButton>
                        </div>
                      </div>
                    </Box>

                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                      {getText(i18nKeys.CSV_CARD__HELPER)}
                    </Typography>
                  </>
                ) : (
                  <Box className="concept-mapping__step1-card">
                    <UploadFileOutlinedIcon className="concept-mapping__step1-card-icon" />
                    <Typography className="concept-mapping__step1-card-title">
                      {getText(i18nKeys.STEP1__UPLOAD_CSV_OPTION)}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                      {getText(i18nKeys.STEP1__UPLOAD_CSV_DESC)}
                    </Typography>
                    <CsvReader
                      onFileSelected={handleCsvFileSelected}
                      onFileLoaded={handleCsvLoaded}
                      onError={handleCsvError}
                      parseOptions={{ header: true, skipEmptyLines: true }}
                    />
                  </Box>
                )}
              </>
            )}
          </div>
        </div>

        <div className="concept-mapping__step1-panel">
          <Typography variant="subtitle1" className="concept-mapping__step1-panel-title">
            {getText(i18nKeys.STEP1__SELECT_DATASET_TITLE)}
          </Typography>
          <div className="concept-mapping__step1-panel-body">
            <FormControl fullWidth sx={{ mb: 2 }}>
              <Typography sx={{ mb: 0.5 }}>{getText(i18nKeys.STEP1__DATASET_LABEL)}</Typography>
              <Select
                value={state.wizard.datasetId ?? ""}
                onChange={handleDataset}
                disabled={state.wizard.mappingStarted}
              >
                {sortedDatasets.map((d) => (
                  <MenuItem value={d.id} key={d.id}>
                    {d.studyDetail?.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box className="concept-mapping__step1-info-callout">
              <InfoOutlinedIcon fontSize="small" />
              <Typography variant="body2">{getText(i18nKeys.STEP1__DATASET_LOCK_INFO)}</Typography>
            </Box>

            <Checkbox
              checked={state.wizard.loadRecommendationByDefault}
              label={getText(i18nKeys.STEP1__LOAD_RECOMMENDATION)}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                dispatch({ type: ACTION_TYPES.SET_LOAD_RECOMMENDATION, payload: e.target.checked })
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
};
