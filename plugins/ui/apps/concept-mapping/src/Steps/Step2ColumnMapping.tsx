import React, { ChangeEvent, FC, useCallback, useContext, useEffect, useState } from "react";
import {
  FormControl,
  MenuItem,
  Paper,
  Select,
  SelectChangeEvent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TablePagination,
  TableRow,
  Typography,
} from "@mui/material";
import { Checkbox, TablePaginationActions } from "@portal/components";
import { ConceptMappingContext, ConceptMappingDispatchContext } from "../Context/ConceptMappingContext";
import { DispatchType, ACTION_TYPES } from "../Context/reducers";
import { useTranslation } from "../hooks";
import { i18nKeys } from "../Context/state";
import { NOT_APPLICABLE } from "../source/source-adapter";
import { api } from "../axios/api";
import { columnMappingType } from "../types";
import "./Step2ColumnMapping.scss";

interface Step2ColumnMappingProps {
  selectedDatasetId?: string;
}

type LabelKey = keyof typeof i18nKeys;

interface MappingTarget {
  key: keyof columnMappingType;
  labelKey: LabelKey;
  // Optional targets keep the "Not applicable" option; required targets (sourceCode,
  // sourceName) only ever list real source columns.
  optional: boolean;
}

// Grid targets in row-major DOM order (2 columns, filled row by row):
//   Row 1: sourceCode        | sourceFrequency
//   Row 2: sourceName        | description
//   Row 3: [domain checkbox] | [domain select, only when checked]
const GRID_TARGETS: MappingTarget[] = [
  { key: "sourceCode", labelKey: i18nKeys.IMPORT_DIALOG__SOURCE_CODE_COLUMN, optional: false },
  { key: "sourceFrequency", labelKey: i18nKeys.IMPORT_DIALOG__SOURCE_FREQUENCY_COLUMN, optional: true },
  { key: "sourceName", labelKey: i18nKeys.IMPORT_DIALOG__SOURCE_CODE_NAME, optional: false },
  { key: "description", labelKey: i18nKeys.IMPORT_DIALOG__ADDITIONAL_INFO_COLUMN, optional: true },
];

export const Step2ColumnMapping: FC<Step2ColumnMappingProps> = ({ selectedDatasetId }) => {
  const { getText } = useTranslation();
  const state = useContext(ConceptMappingContext);
  const dispatch = useContext<React.Dispatch<DispatchType>>(ConceptMappingDispatchContext);
  const columnMapping = state.columnMapping;

  // Source columns/rows normally live on the wizard slice (Step 1's connected node or CSV
  // upload); csvData is a fallback for the (currently CSV-only) bridged rows Step 3 reads.
  const sourceColumns = state.wizard.sourceData?.columns ?? state.csvData.columns ?? [];
  const sourceRows = state.wizard.sourceData?.rows ?? state.csvData.data ?? [];

  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [showDomainMapping, setShowDomainMapping] = useState(!!columnMapping.domainId);
  const [domainFilterOptions, setDomainFilterOptions] = useState<string[]>([]);

  const handleChange = (key: keyof columnMappingType, value: string) => {
    dispatch({ type: ACTION_TYPES.SET_COLUMN_MAPPING, payload: { ...columnMapping, [key]: value } });
  };

  const handleChangePage = useCallback((_event: React.MouseEvent<HTMLButtonElement> | null, newPage: number) => {
    setPage(newPage);
  }, []);

  const handleChangeRowsPerPage = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(Number(event.target.value) || 10);
    setPage(0);
  }, []);

  const getDomainFilterOptions = useCallback(async () => {
    if (!selectedDatasetId) return;
    try {
      const filterOptions = await api.terminology.getAllFilterOptions(selectedDatasetId);
      setDomainFilterOptions(Object.keys(filterOptions.filterOptions.domainId));
    } catch (error) {
      console.error(error);
    }
  }, [selectedDatasetId]);

  useEffect(() => {
    if (showDomainMapping) {
      getDomainFilterOptions();
    }
  }, [showDomainMapping, getDomainFilterOptions]);

  const handleToggleDomainMapping = (checked: boolean) => {
    setShowDomainMapping(checked);
    if (checked) {
      handleChange("domainId", columnMapping.domainId ?? "");
    } else {
      const { domainId, ...rest } = columnMapping;
      dispatch({ type: ACTION_TYPES.SET_COLUMN_MAPPING, payload: rest });
    }
  };

  const currentPageRows = sourceRows.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);

  const renderSelect = (target: MappingTarget) => (
    <FormControl fullWidth key={target.key}>
      <Typography sx={{ mb: 1, fontWeight: 500 }}>{getText(target.labelKey)}</Typography>
      <Select
        displayEmpty
        fullWidth
        value={(columnMapping[target.key] as string) ?? ""}
        onChange={(e: SelectChangeEvent) => handleChange(target.key, e.target.value)}
      >
        <MenuItem value="" disabled>
          {getText(i18nKeys.COLUMN_MAPPING__PLEASE_SELECT)}
        </MenuItem>
        {target.optional && (
          <MenuItem value={NOT_APPLICABLE}>{getText(i18nKeys.COLUMN_MAPPING__NOT_APPLICABLE)}</MenuItem>
        )}
        {sourceColumns.map((c) => (
          <MenuItem value={c} key={c}>
            {c}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );

  return (
    <div className="concept-mapping__step2">
      <div className="concept-mapping__step2-preview">
        <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 320, border: "1px solid #dad7d7" }}>
          <Table stickyHeader size="small">
            <TableHead>
              <TableRow>
                {sourceColumns.map((col) => (
                  <TableCell key={col}>{col}</TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {currentPageRows.map((row, index) => (
                <TableRow key={index}>
                  {sourceColumns.map((col) => (
                    <TableCell key={col}>{row[col]}</TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
        <TablePagination
          component="div"
          count={sourceRows.length}
          page={page}
          rowsPerPage={rowsPerPage}
          onPageChange={handleChangePage}
          onRowsPerPageChange={handleChangeRowsPerPage}
          ActionsComponent={TablePaginationActions}
          labelRowsPerPage={getText(i18nKeys.COLUMN_MAPPING__ROWS_PER_PAGE_LABEL)}
          sx={{ overflow: "visible" }}
        />
      </div>

      <div className="concept-mapping__step2-panel">
        <Typography variant="subtitle1" className="concept-mapping__step2-panel-title">
          {getText(i18nKeys.COLUMN_MAPPING__TITLE)}
        </Typography>
        <div className="concept-mapping__step2-panel-body">
          <div className="concept-mapping__step2-grid">
            {GRID_TARGETS.map(renderSelect)}

            <div className="concept-mapping__step2-grid-checkbox">
              <Checkbox
                checked={showDomainMapping}
                label={getText(i18nKeys.IMPORT_DIALOG__SHOW_SOURCE_DOMAIN_COLUMN)}
                onChange={(event: ChangeEvent<HTMLInputElement>) => handleToggleDomainMapping(event.target.checked)}
              />
            </div>

            {showDomainMapping && (
              <FormControl fullWidth>
                <Typography sx={{ mb: 1, fontWeight: 500 }}>
                  {getText(i18nKeys.IMPORT_DIALOG__SOURCE_DOMAIN_COLUMN)}
                </Typography>
                <Select
                  displayEmpty
                  fullWidth
                  value={columnMapping.domainId ?? ""}
                  onChange={(e: SelectChangeEvent) => handleChange("domainId", e.target.value)}
                >
                  <MenuItem value="" disabled>
                    {getText(i18nKeys.COLUMN_MAPPING__PLEASE_SELECT)}
                  </MenuItem>
                  <MenuItem value={NOT_APPLICABLE}>{getText(i18nKeys.COLUMN_MAPPING__NOT_APPLICABLE)}</MenuItem>
                  {domainFilterOptions.map((option) => (
                    <MenuItem value={option} key={option}>
                      {option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
