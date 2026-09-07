import { FC, useCallback, useEffect, useMemo, useState } from "react";
import SearchBar from "../components/SearchBar/SearchBar";
import {
  MaterialReactTable,
  MRT_ColumnDef,
  MRT_SortingState,
  useMaterialReactTable,
} from "material-react-table";
import {
  Button,
  EditIcon,
  IconButton,
  VisibilityOnIcon,
} from "@portal/components";
import DeleteIcon from "@mui/icons-material/Delete";
import { ConceptSet } from "../Terminology/utils/types";
import { useTranslation } from "../hooks";
import { i18nKeys } from "../context/state/translation-state";
import "./ConceptSets.scss";

interface ConceptSetsTableProps {
  data: ConceptSet[];
  isLoading: boolean;
  onAddEdit: (conceptSetId?: string, canWrite?: boolean) => void;
  onDelete: (conceptSet: ConceptSet) => void;
  userName?: string;
}

export const ConceptSetsTable: FC<ConceptSetsTableProps> = ({
  data,
  isLoading,
  onAddEdit,
  onDelete,
  userName,
}) => {
  const { getText } = useTranslation();
  const [searchText, setSearchText] = useState<string>("");
  const [sorting, setSorting] = useState<MRT_SortingState>([]);

  const filteredData = useMemo(
    () =>
      data.filter((row) =>
        row.name.toLowerCase().includes(searchText.toLowerCase())
      ),
    [data, searchText]
  );

  const columns = useMemo<MRT_ColumnDef<ConceptSet>[]>(
    () => [
      {
        accessorKey: "externalId",
        header: getText(i18nKeys.CONCEPT_SETS__ID),
        size: 80,
        sortDescFirst: false,
      },
      {
        accessorKey: "source",
        header: getText(i18nKeys.CONCEPT_SETS__SOURCE),
        size: 100,
        Cell: ({ row }) => {
          const source = row.original.source;
          return source === "legacy"
            ? getText(i18nKeys.CONCEPT_SETS__LEGACY)
            : getText(i18nKeys.CONCEPT_SETS__WEBAPI);
        },
      },
      {
        accessorKey: "name",
        header: getText(i18nKeys.CONCEPT_SETS__Name),
        size: 260,
        Cell: ({ row }) => (
          <>
            {row.original.name}
            {row.original.shared
              ? ` (${getText(i18nKeys.CONCEPT_SETS__SHARED)})`
              : ""}
          </>
        ),
      },
      {
        accessorKey: "createdDate",
        header: getText(i18nKeys.CONCEPT_SETS__CREATED),
        size: 130,
        Cell: ({ row }) => {
          const d = row.original.createdDate;
          if (!d) return "";
          const [y, m, day] = d.split("-").map(Number);
          return new Date(y, m - 1, day).toLocaleDateString();
        },
      },
      {
        accessorKey: "modifiedDate",
        header: getText(i18nKeys.CONCEPT_SETS__UPDATED),
        size: 130,
        Cell: ({ row }) => {
          const d = row.original.modifiedDate;
          if (!d) return "";
          const [y, m, day] = d.split("-").map(Number);
          return new Date(y, m - 1, day).toLocaleDateString();
        },
      },
      {
        accessorKey: "userName",
        header: getText(i18nKeys.CONCEPT_SETS__AUTHOR),
        size: 160,
      },
      {
        accessorKey: "" as keyof ConceptSet,
        id: "actions",
        header: "",
        size: 90,
        enableSorting: false,
        Cell: ({ row }) => {
          const isWritable =
            row.original.hasWriteAccess ||
            row.original.createdBy === userName;
          return (
            <>
              <IconButton
                startIcon={
                  isWritable ? (
                    <EditIcon />
                  ) : (
                    <VisibilityOnIcon />
                  )
                }
                onClick={() => onAddEdit(row.original.id, isWritable)}
              />
              {isWritable && (
                <IconButton
                  startIcon={<DeleteIcon />}
                  onClick={() => onDelete(row.original)}
                />
              )}
            </>
          );
        },
      },
    ],
    [getText, onAddEdit, onDelete, userName]
  );

  const table = useMaterialReactTable({
    layoutMode: "grid",
    columns,
    data: filteredData,
    localization: {
      noRecordsToDisplay: getText(i18nKeys.CONCEPT_SETS__NO_CONCEPT_SETS),
    },
    initialState: { density: "compact" },
    defaultColumn: {
      enableGlobalFilter: false,
      enableHiding: false,
      enableSorting: true,
      enableColumnFilter: false,
      enableColumnActions: false,
    },
    enableStickyHeader: true,
    enablePagination: true,
    manualSorting: false,
    onSortingChange: setSorting,
    state: { sorting, isLoading },
    muiTableBodyCellProps: {
      sx: {
        whiteSpace: "normal",
        wordWrap: "break-word",
        color: "#000080",
        border: "none",
      },
    },
    muiTableHeadCellProps: {
      sx: {
        backgroundColor: "#edf2f7",
        padding: "6px",
      },
    },
    muiTableContainerProps: { sx: { overflowY: "auto" } },
    muiCircularProgressProps: {
      sx: { color: "var(--color-primary, #000080)" },
    },
    enableTopToolbar: false,
  });

  const updateSearchResult = useCallback(
    (keyword: string) => {
      if (keyword === searchText) return;
      setSearchText(keyword);
    },
    [searchText]
  );

  useEffect(() => {
    table.resetPagination();
  }, [searchText]);

  return (
    <div className="concept-sets__container">
      <div className="concept-sets__header">
        <div className="concept-sets__search">
          <SearchBar
            keyword={searchText}
            onEnter={updateSearchResult}
            width={"480px"}
          />
        </div>
        <Button
          variant="contained"
          onClick={() => onAddEdit()}
          text={getText(i18nKeys.CONCEPT_SETS__ADD_CONCEPT_SET)}
        />
      </div>
      <div className="concept-sets__table">
        <MaterialReactTable table={table} />
      </div>
    </div>
  );
};
