import Box from "@mui/material/Box";
import Checkbox from "@mui/material/Checkbox";
import Drawer from "@mui/material/Drawer";
import FormControlLabel from "@mui/material/FormControlLabel";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { Button, Chip } from "@portal/components";
import TaskAltIcon from "@mui/icons-material/TaskAlt";
import CloseIcon from "@mui/icons-material/Close";
import React, {
  ChangeEvent,
  FC,
  useCallback,
  useEffect,
  useState,
} from "react";
import { api } from "../axios/api";
import { usePortal, useTranslation } from "../hooks";
import TerminologyDetail from "./components/TerminologyDetail/TerminologyDetail";
import TerminologyList from "./components/TerminologyList/TerminologyList";
import { tabNames } from "./utils/constants";
import {
  mapd2eWebapiConcept,
  mapd2eWebapiConceptSet,
} from "./utils/d2eWebapiMappers";
import {
  ConceptSet,
  ConceptSetConcept,
  ConceptSetWithConceptDetails,
  FhirValueSetExpansionContainsWithExt,
  OnCloseReturnValues,
  TabName,
  TerminologyResult,
} from "./utils/types";

import { i18nKeys } from "../context/state";
import "./Terminology.scss";

const FEATURE_ADMIN_ONLY_SHARING = "adminOnlySharing";
const FEATURE_CONCEPT_RECORD_COUNTS = "conceptRecordCounts";

export interface TerminologyProps {
  onConceptIdSelect?: (
    conceptData: FhirValueSetExpansionContainsWithExt,
  ) => void;
  initialInput?: string;
  userId?: string;
  open?: boolean;
  onClose?: (values: OnCloseReturnValues) => void;
  selectedConceptSetId?: string;
  selectedConceptSetCanWrite?: boolean;
  mode?:
    | "CONCEPT_MAPPING"
    | "CONCEPT_SET"
    | "CONCEPT_SEARCH"
    | "CONCEPT_MULTI_SELECT";
  selectedDatasetId?: string;
  defaultFilters?: {
    id: string;
    value: string[];
  }[];
  initialSelectedConcepts?: FhirValueSetExpansionContainsWithExt[];
  isAtlas: boolean;
  // Only populated for mode === "CONCEPT_MAPPING": the source row being mapped,
  // shown in the drawer header so the user knows what they're suggesting a concept for.
  sourceRow?: {
    code?: string;
    name?: string;
    frequency?: string;
    description?: string;
    status?: string;
  };
  // CONCEPT_MAPPING only: the row's existing suggestions, shown as a "Suggested concepts"
  // section above the search results.
  suggestedConcepts?: {
    conceptId: number;
    conceptName: string;
    conceptCode: string;
    domainId: string;
    vocabularyId: string;
  }[];
  // CONCEPT_MAPPING only: approve the picked concept for the row.
  onApprove?: (conceptData: FhirValueSetExpansionContainsWithExt) => void;
}

const WithDrawer = ({
  onClose,
  children,
  open,
  isDrawer,
  mode,
}: {
  onClose?: (values: OnCloseReturnValues) => void;
  children: JSX.Element;
  open?: boolean;
  isDrawer: boolean;
  mode?: TerminologyProps["mode"];
}) => {
  const isConceptMapping = mode === "CONCEPT_MAPPING";
  return isDrawer ? (
    <Drawer
      variant="temporary"
      open={open}
      onClose={onClose}
      anchor="right"
      sx={{ zIndex: 11000 }}
      PaperProps={{
        // CONCEPT_MAPPING gets its width from the `.terminology-concept-mapping-drawer`
        // class (see Terminology.scss) so it matches the mapping node drawer. All other
        // modes keep the existing inline 85% width.
        className: isConceptMapping
          ? "terminology-concept-mapping-drawer"
          : undefined,
        sx: {
          ...(!isConceptMapping && { width: "85%" }),
          overflowY: "hidden",
          zIndex: 11001,
        },
      }}
    >
      {children}
    </Drawer>
  ) : (
    children
  );
};

const NameSection = ({
  conceptSetName,
  setConceptSetName,
  conceptSetShared,
  setConceptSetShared,
  isUserConceptSet,
  saveConceptSet,
  isLoading,
  conceptSetId,
  onClickClose,
  errorMsg,
  canShare,
}: {
  conceptSetName: string;
  setConceptSetName: React.Dispatch<React.SetStateAction<string>>;
  conceptSetShared: boolean;
  setConceptSetShared: React.Dispatch<React.SetStateAction<boolean>>;
  isUserConceptSet: boolean;
  saveConceptSet(): void;
  isLoading: boolean;
  conceptSetId: string | null;
  onClickClose(): void;
  errorMsg: string;
  canShare: boolean;
}) => {
  const { getText } = useTranslation();

  return (
    <Box
      sx={{
        borderBottom: "1px solid #d4d4d4",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      <Box
        sx={{
          height: "60px",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          width: "100%",
          "& .MuiTextField-root": { width: "50%" },
        }}
      >
        <Typography>{getText(i18nKeys.TERMINOLOGY__NAME)}:</Typography>
        <TextField
          placeholder={getText(i18nKeys.TERMINOLOGY__CONCEPT_SET_NAME)}
          sx={{ marginLeft: "5px", width: "100%" }}
          id="standard-basic"
          variant="standard"
          value={conceptSetName}
          onChange={(e) => setConceptSetName(e.target.value)}
          onBlur={(e) => setConceptSetName(e.target.value.trim())}
          disabled={isLoading || !isUserConceptSet}
        />
        <Box
          sx={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            height: "32px",
            "& .button.alp-button.sc-d4l-button": {
              width: `120px`,
            },
          }}
        >
          {canShare && (
            <div style={{ marginBottom: -15, marginLeft: 10 }}>
              <FormControlLabel
                control={
                  <Checkbox
                    checked={conceptSetShared}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => {
                      setConceptSetShared(event.target.checked);
                    }}
                    disabled={!isUserConceptSet}
                  />
                }
                label={getText(i18nKeys.TERMINOLOGY__SHARED)}
              />
            </div>
          )}
          <Button
            style={{ marginLeft: 10 }}
            text={
              conceptSetId
                ? getText(i18nKeys.TERMINOLOGY__UPDATE)
                : getText(i18nKeys.TERMINOLOGY__CREATE)
            }
            onClick={saveConceptSet}
            disabled={isLoading || !isUserConceptSet}
          />
          <Button
            variant="outlined"
            text={getText(i18nKeys.TERMINOLOGY__CLOSE)}
            style={{ marginLeft: 10 }}
            onClick={onClickClose}
          />
        </Box>
      </Box>
      {errorMsg ? (
        <div style={{ color: "red", textAlign: "center", maxWidth: "62ch" }}>
          {errorMsg}
        </div>
      ) : null}
    </Box>
  );
};
const TabSection = ({
  currentTabNo,
  changeTab,
  selectedConceptsCount,
  mode,
  isAtlas,
}: {
  currentTabNo: TabName;
  changeTab(tabName: TabName): void;
  selectedConceptsCount: number;
  mode?: string;
  isAtlas: boolean;
}) => {
  const { getText } = useTranslation();
  const tabWidthPx = 220;

  const getAvailableTabs = () => {
    if (mode === "CONCEPT_MULTI_SELECT") {
      return [
        { name: tabNames.SEARCH, label: getText(i18nKeys.TERMINOLOGY__SEARCH) },
        {
          name: tabNames.SELECTED,
          label: getText(i18nKeys.TERMINOLOGY__SELECTED_CONCEPTS),
        },
      ];
    }
    if (mode === "CONCEPT_SET") {
      if (isAtlas) {
        return [
          {
            name: tabNames.SEARCH,
            label: getText(i18nKeys.TERMINOLOGY__SEARCH),
          },
          {
            name: tabNames.SELECTED,
            label: getText(i18nKeys.TERMINOLOGY__SELECTED_CONCEPTS),
          },
        ];
      }
      return [
        {
          name: tabNames.SEARCH,
          label: getText(i18nKeys.TERMINOLOGY__SEARCH),
        },
        {
          name: tabNames.SELECTED,
          label: getText(i18nKeys.TERMINOLOGY__SELECTED_CONCEPTS),
        },
        {
          name: tabNames.RELATED,
          label: getText(i18nKeys.TERMINOLOGY__RELATED_CONCEPTS),
        },
      ];
    }
    // Default tabs for other modes
    return [
      { name: tabNames.SEARCH, label: getText(i18nKeys.TERMINOLOGY__SEARCH) },
      {
        name: tabNames.SELECTED,
        label: getText(i18nKeys.TERMINOLOGY__SELECTED_CONCEPTS),
      },
      {
        name: tabNames.RELATED,
        label: getText(i18nKeys.TERMINOLOGY__RELATED_CONCEPTS),
      },
    ];
  };

  const availableTabs = getAvailableTabs();

  return (
    <div style={{ height: "60px" }}>
      <Tabs
        value={currentTabNo}
        onChange={(_, value) => {
          changeTab(value);
        }}
        centered
        sx={{
          paddingBottom: 0,
          borderBottom: "1px solid #d4d4d4",
        }}
      >
        {availableTabs.map((tab) => (
          <Tab
            key={tab.name}
            sx={{ width: `${tabWidthPx}px` }}
            label={
              tab.name === tabNames.SELECTED ? (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  {selectedConceptsCount ? (
                    <div
                      style={{
                        backgroundColor: "var(--color-primary, #000080)",
                        color: "white",
                        minWidth: "20px",
                        height: "20px",
                        borderRadius: "10px",
                        display: "flex",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <div style={{ paddingLeft: "5px", paddingRight: "5px" }}>
                        {selectedConceptsCount}
                      </div>
                    </div>
                  ) : null}
                  <div style={{ marginLeft: "10px" }}>{tab.label}</div>
                </div>
              ) : (
                tab.label
              )
            }
            value={tab.name}
          />
        ))}
      </Tabs>
    </div>
  );
};

export const Terminology: FC<TerminologyProps> = ({
  onConceptIdSelect,
  initialInput = "",
  userId,
  open,
  onClose,
  selectedConceptSetId,
  selectedConceptSetCanWrite,
  mode = "CONCEPT_SEARCH",
  selectedDatasetId,
  defaultFilters,
  initialSelectedConcepts,
  isAtlas,
  sourceRow,
  suggestedConcepts,
  onApprove,
}: TerminologyProps) => {
  const { getText } = useTranslation();
  const [conceptId, setConceptId] = useState<null | number>(null);
  // CONCEPT_MAPPING only: the single concept currently picked via the radio,
  // pending confirmation via the "Suggest" button.
  const [mappingSelectedConcept, setMappingSelectedConcept] =
    useState<FhirValueSetExpansionContainsWithExt | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedConcepts, setSelectedConcepts] = useState<
    FhirValueSetExpansionContainsWithExt[]
  >(initialSelectedConcepts || []);
  const [tab, setTab] = useState<TabName>(tabNames.SEARCH);
  const [conceptSetName, setConceptSetName] = useState("");
  const [conceptSetId, setConceptSetId] = useState<string | null>(null);
  const [conceptSetShared, setConceptSetShared] = useState(false);
  const [isUserConceptSet, setIsUserConceptSet] = useState(false);
  const [isConceptSetLoading, setIsConceptSetLoading] = useState(false);
  const [currentConceptSet, setCurrentConceptSet] = useState<ConceptSet | null>(
    null,
  );
  const [conceptsResult, setConceptsResult] =
    useState<TerminologyResult | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const { datasetId, userName, features, featuresLoading } = usePortal();
  const activeDatasetId = selectedDatasetId || datasetId;
  const isConceptSet = mode === "CONCEPT_SET";
  const isConceptMapping = mode === "CONCEPT_MAPPING";

  // Check if user can share based on adminOnlySharing feature flag
  const adminOnlySharingEnabled =
    features?.find((f) => f.feature === FEATURE_ADMIN_ONLY_SHARING)
      ?.isEnabled ?? false;
  const canShare = featuresLoading ? false : !adminOnlySharingEnabled;
  const showConceptRecordCounts = featuresLoading
    ? true
    : features?.find((f) => f.feature === FEATURE_CONCEPT_RECORD_COUNTS)
        ?.isEnabled ?? true;
  const isConceptMultiSelect = mode === "CONCEPT_MULTI_SELECT";

  // Show simplified interface for multi-select mode
  const showConceptSetFeatures = isConceptSet;
  const showTabNavigation = isConceptSet || isConceptMultiSelect;

  // Get domain context from default filters for messaging
  const getDomainContextMessage = useCallback(() => {
    if (isConceptMultiSelect && defaultFilters) {
      const domainFilter = defaultFilters.find(
        (filter) => filter.id === "domainId",
      );
      if (domainFilter && domainFilter.value.length > 0) {
        const domainName = domainFilter.value[0];
        return `Showing concepts from ${domainName} domain. You can modify filters to explore other domains.`;
      }
    }
    return null;
  }, [isConceptMultiSelect, defaultFilters]);

  const resetState = useCallback(() => {
    setConceptId(null);
    setShowDetails(false);
    setSelectedConcepts([]);
    setTab(tabNames.SEARCH);
    setConceptSetName("");
    setConceptSetId(null);
    setIsConceptSetLoading(false);
    setCurrentConceptSet(null);
    setErrorMsg("");
    setConceptSetShared(false);
    setIsUserConceptSet(false);
    setConceptsResult(null);
    setMappingSelectedConcept(null);
  }, []);

  const changeTab = useCallback((tabName: TabName) => {
    setTab(tabName);
  }, []);

  const sortAndSetSelectedConcepts = useCallback(
    (selectedConceptsCopy: FhirValueSetExpansionContainsWithExt[]) => {
      selectedConceptsCopy.sort((concept1, concept2) => {
        return concept1.conceptId < concept2.conceptId ? -1 : 1;
      });
      setSelectedConcepts(selectedConceptsCopy);
    },
    [],
  );

  const checkIfConceptSetExists = async (
    conceptSetId: string,
    conceptSetName: string,
    datasetId: string,
  ): Promise<number> => {
    const result = await api.d2eWebapi.checkIfConceptSetExists(
      conceptSetId,
      conceptSetName,
      datasetId,
    );
    return Number(result);
  };

  type ConceptSetDraft = Pick<ConceptSet, "concepts" | "name" | "shared"> &
    Partial<Pick<ConceptSet, "userName">>;

  const createConceptSet = async (
    conceptSet: ConceptSetDraft,
    datasetId: string,
  ): Promise<string> => {
    const conceptSetId = await api.d2eWebapi.createConceptSet(
      conceptSet.name,
      datasetId,
      conceptSet.shared,
    );

    if (conceptSet.concepts.length !== 0) {
      await api.d2eWebapi.updateConceptSetItems(
        conceptSetId,
        conceptSet.concepts,
        datasetId,
      );
    }
    return conceptSetId;
  };

  const updateConceptSet = async (
    conceptSetId: string,
    conceptSet: Partial<ConceptSet>,
    datasetId: string,
  ): Promise<string> => {
    // Update concept set
    await api.d2eWebapi.updateConceptSet(conceptSetId, conceptSet, datasetId);
    // Update concept set items
    const conceptSetItems = conceptSet.concepts ? conceptSet.concepts : [];
    await api.d2eWebapi.updateConceptSetItems(
      conceptSetId,
      conceptSetItems,
      datasetId,
    );
    return conceptSetId;
  };

  const saveConceptSet = useCallback(async () => {
    if (!conceptSetName.trim().length) {
      setErrorMsg(getText(i18nKeys.TERMINOLOGY__CONCEPT_SET_NAME_EMPTY_ERROR));
      return;
    }

    const conceptSet = {
      concepts: selectedConcepts.map((concept) => {
        return {
          id: concept.conceptId,
          useDescendants: !!concept.useDescendants,
          useMapped: !!concept.useMapped,
          isExcluded: !!concept.isExcluded,
        };
      }),
      name: conceptSetName.trim(),
      shared: conceptSetShared,
      ...(!conceptSetId && { userName }),
    };
    setIsConceptSetLoading(true);
    try {
      // When creating a new concept set there is no id yet. Use "0" (a
      // never-existing id) as the exclusion sentinel: the backend route param
      // schema rejects an empty segment ("/conceptset//exists" -> 400).
      //
      // This check now covers the legacy store only. A duplicate in the WebAPI
      // store is rejected by its `uq_cs_name` constraint at save time and comes
      // back as a 409, handled in the catch below.
      const isNameUsed = await checkIfConceptSetExists(
        conceptSetId || "0",
        conceptSet.name,
        activeDatasetId,
      );

      if (isNameUsed) {
        setErrorMsg(
          getText(i18nKeys.TERMINOLOGY__CONCEPT_SET_NAME_USED_ERROR, [
            `"${conceptSet.name}"`,
          ]),
        );
        return;
      }

      const updatedConceptSetId = conceptSetId
        ? await updateConceptSet(conceptSetId, conceptSet, activeDatasetId)
        : await createConceptSet(conceptSet, activeDatasetId);
      setErrorMsg("");
      // Refetch the persisted concept set so currentConceptSet carries
      // server-controlled fields (externalId, source, access flags).
      const savedConceptSet = await getConceptSetWithConceptDetails(
        updatedConceptSetId,
        activeDatasetId,
      );
      setCurrentConceptSet(savedConceptSet);
      setConceptSetId(updatedConceptSetId);
      return;
    } catch (err: any) {
      // request() rejects with error.response directly, not the full axios
      // error, so the status and body sit at the top level.
      if (err?.status === 409 && err?.data?.error === "CONCEPT_SET_NAME_EXISTS") {
        setErrorMsg(
          getText(i18nKeys.TERMINOLOGY__CONCEPT_SET_NAME_USED_ERROR, [
            `"${conceptSet.name}"`,
          ]),
        );
        return;
      }
      setErrorMsg(
        getText(i18nKeys.TERMINOLOGY__ERROR, [
          conceptSetId
            ? getText(i18nKeys.TERMINOLOGY__UPDATING)
            : getText(i18nKeys.TERMINOLOGY__CREATING),
        ]),
      );
    } finally {
      setIsConceptSetLoading(false);
    }
  }, [
    selectedConcepts,
    conceptSetName,
    conceptSetId,
    conceptSetShared,
    activeDatasetId,
  ]);

  const getConceptSetWithConceptDetails = async (
    conceptSetId: string,
    activeDatasetId: string,
  ): Promise<ConceptSetWithConceptDetails> => {
    const [conceptSet, conceptSetExpression] = await Promise.all([
      api.d2eWebapi.getConceptSet(conceptSetId, activeDatasetId),
      api.d2eWebapi.getConceptSetExpression(conceptSetId, activeDatasetId),
    ]);

    const concepts = conceptSetExpression.items.map((conceptSet: any) => {
      return {
        ...mapd2eWebapiConcept(conceptSet.concept),
        id: conceptSet.concept.CONCEPT_ID,
        useMapped: conceptSet.includeMapped,
        isExcluded: conceptSet.isExcluded,
        useDescendants: conceptSet.includeDescendants,
      } as ConceptSetConcept & FhirValueSetExpansionContainsWithExt;
    });
    const conceptSetWithConceptDetails: ConceptSetWithConceptDetails = {
      ...mapd2eWebapiConceptSet(conceptSet),
      concepts,
    };

    return conceptSetWithConceptDetails;
  };

  const getConceptSet = useCallback(
    async (conceptSetId: string) => {
      if (!activeDatasetId) {
        return;
      }
      setIsConceptSetLoading(true);
      try {
        const conceptSet = await getConceptSetWithConceptDetails(
          conceptSetId,
          activeDatasetId,
        );
        setConceptSetName(conceptSet.name);
        sortAndSetSelectedConcepts(conceptSet.concepts);
        setCurrentConceptSet(conceptSet);
        setConceptSetShared(conceptSet.shared);
        setIsUserConceptSet(
          selectedConceptSetCanWrite !== undefined
            ? !!selectedConceptSetCanWrite
            : !!conceptSet.hasWriteAccess || conceptSet.createdBy === userName,
        );
        setErrorMsg("");
        return;
      } finally {
        setIsConceptSetLoading(false);
      }
    },
    [activeDatasetId, userName, selectedConceptSetCanWrite],
  );
  const isDrawer = !!onClose;

  // CONCEPT_MAPPING renders an extra source-info line under the title, so its
  // header is taller than the plain 40px header used by every other mode.
  const terminologyHeaderHeightPx = isConceptMapping ? 64 : 40;
  const portalHeaderHeightPx = 56;
  const conceptSetNameHeightPx = 60;
  const mainBodyPadding = 2 * 32;
  const mainContentPadding = 2 * 10;
  const conceptSearchAndSetsTabs = 48;
  const datasetSelectorHeightPx = 38;
  // CONCEPT_MAPPING adds a bottom "Suggest" footer; reserve its height so the search/table
  // region doesn't push it below the viewport (the drawer paper is overflowY:hidden).
  const suggestFooterHeightPx = 80;
  const searchAndDetailsHeightOffsetPx =
    (isDrawer
      ? terminologyHeaderHeightPx
      : portalHeaderHeightPx +
        mainBodyPadding +
        conceptSearchAndSetsTabs +
        mainContentPadding) +
    (isConceptSet ? conceptSetNameHeightPx : 0) +
    (isConceptMapping ? suggestFooterHeightPx : 0) +
    (!activeDatasetId ? datasetSelectorHeightPx : 0);

  const onSelectConceptId = useCallback(
    (concept: FhirValueSetExpansionContainsWithExt) => {
      if (isConceptSet && !isUserConceptSet) {
        return;
      }

      if (isConceptSet || isConceptMultiSelect) {
        const selectedConceptsCopy = JSON.parse(
          JSON.stringify(selectedConcepts),
        ) as FhirValueSetExpansionContainsWithExt[];
        const conceptIndex = selectedConcepts.findIndex(
          (selectedConcept) => selectedConcept.conceptId === concept.conceptId,
        );
        if (conceptIndex > -1) {
          selectedConceptsCopy.splice(conceptIndex, 1);
        } else {
          const conceptToSelect: FhirValueSetExpansionContainsWithExt = {
            ...concept,
            // Only add advanced options for concept set mode
            ...(isConceptSet && {
              useDescendants: false,
              useMapped: false,
              isExcluded: false,
            }),
          };
          selectedConceptsCopy.push(conceptToSelect);
        }
        sortAndSetSelectedConcepts(selectedConceptsCopy);
        return;
      }
      if (onConceptIdSelect) {
        // CONCEPT_MAPPING: don't fire/close on pick — just record the radio
        // selection. The user confirms via the "Suggest" footer button.
        if (mode === "CONCEPT_MAPPING") {
          setMappingSelectedConcept(concept);
          return;
        }
        onConceptIdSelect(concept);
        resetState();
        return;
      }
    },
    [
      isConceptSet,
      isConceptMultiSelect,
      isUserConceptSet,
      mode,
      onConceptIdSelect,
      resetState,
      selectedConcepts,
      sortAndSetSelectedConcepts,
    ],
  );

  const toggleDescendantsAndMapped = useCallback(
    (conceptId: number, type: "DESCENDANTS" | "MAPPED" | "EXCLUDE") => {
      if (!isUserConceptSet) {
        return;
      }

      const selectedConceptsCopy = JSON.parse(
        JSON.stringify(selectedConcepts),
      ) as FhirValueSetExpansionContainsWithExt[];
      selectedConceptsCopy.map((concept) => {
        if (concept.conceptId === conceptId) {
          if (type === "DESCENDANTS") {
            concept.useDescendants = !concept.useDescendants;
          } else if (type === "MAPPED") {
            concept.useMapped = !concept.useMapped;
          } else if (type === "EXCLUDE") {
            concept.isExcluded = !concept.isExcluded;
          }
        }
      });
      sortAndSetSelectedConcepts(selectedConceptsCopy);
    },
    [isUserConceptSet, selectedConcepts, sortAndSetSelectedConcepts],
  );

  const showAddIcon = !!(
    onConceptIdSelect ||
    (isConceptSet && isUserConceptSet) ||
    isConceptMultiSelect
  );

  useEffect(() => {
    // If new concept set
    if (!conceptSetId) {
      setIsUserConceptSet(true);
    }
  }, [conceptSetId]);

  useEffect(() => {
    if (mode === "CONCEPT_MAPPING" || !conceptsResult?.data) {
      return;
    }
    if (conceptId === null) {
      setShowDetails(false);
    } else {
      setShowDetails(true);
    }
  }, [conceptId, conceptsResult, mode]);

  useEffect(() => {
    if (selectedConceptSetId) {
      setIsUserConceptSet(selectedConceptSetCanWrite ?? true);
      setConceptSetId(selectedConceptSetId);
      getConceptSet(selectedConceptSetId);
    }
  }, [getConceptSet, selectedConceptSetId, selectedConceptSetCanWrite]);

  const onClickClose = useCallback(() => {
    if (!onClose) {
      return;
    }

    if (isConceptMultiSelect) {
      // Return selected concepts for multi-select mode
      onClose({
        currentConceptSet: null,
        selectedConcepts: selectedConcepts,
      });
    } else if (isConceptSet) {
      // Return concept set for concept set mode
      const onCloseReturnValues: OnCloseReturnValues = {
        currentConceptSet: currentConceptSet,
      };
      onClose(onCloseReturnValues);
    } else {
      // Other modes - just close without sending anything special
      onClose({ currentConceptSet: null });
    }

    resetState();
  }, [
    currentConceptSet,
    onClose,
    resetState,
    selectedConcepts,
    isConceptMultiSelect,
    isConceptSet,
  ]);

  if (!activeDatasetId) {
    return null;
  }
  return (
    <WithDrawer
      onClose={onClickClose}
      isDrawer={isDrawer}
      open={open}
      mode={mode}
    >
      <div
        className="terminology__container"
        data-testid="terminology-container"
      >
        {isDrawer && (
          <div
            style={{
              minHeight: isConceptMapping ? "64px" : "40px",
              width: "100%",
              backgroundColor: isConceptMapping ? "#ffffff" : "var(--color-table-row-bg, #edf2f7)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: isConceptMapping ? "8px 0" : undefined,
            }}
          >
            <div
              style={{
                marginLeft: 24,
                display: "flex",
                flexDirection: "column",
                gap: isConceptMapping ? 4 : 0,
              }}
            >
              <div
                style={{
                  color: "var(--color-primary, #000080)",
                  fontWeight: 500,
                  fontSize: 18,
                }}
              >
                {isConceptMapping
                  ? getText(i18nKeys.TERMINOLOGY__CONCEPTS)
                  : isConceptSet
                  ? getText(i18nKeys.TERMINOLOGY__CONCEPT_SETS)
                  : isConceptMultiSelect
                  ? getText(i18nKeys.TERMINOLOGY__SELECT_CONCEPTS)
                  : getText(i18nKeys.TERMINOLOGY__CONCEPTS)}
              </div>
              {isConceptMapping && sourceRow ? (
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 14,
                    // The app self-hosts the *variable* family ("IBM Plex Sans Variable" via
                    // @fontsource-variable/ibm-plex-sans); plain "IBM Plex Sans" isn't loaded,
                    // so name the variable family first to actually get IBM Plex.
                    fontFamily: '"IBM Plex Sans Variable", "IBM Plex Sans", sans-serif',
                    fontWeight: 600,
                    lineHeight: 1.5,
                    color: "#000000",
                  }}
                >
                  <span>
                    {getText(i18nKeys.TERMINOLOGY__SOURCE)}:{" "}
                    {sourceRow.code ?? ""} |{" "}
                    {getText(i18nKeys.TERMINOLOGY__NAME)}:{" "}
                    {sourceRow.name ?? ""} |{" "}
                    {getText(i18nKeys.TERMINOLOGY__FREQUENCY)}:{" "}
                    {sourceRow.frequency ?? ""} |{" "}
                    {getText(i18nKeys.TERMINOLOGY__DESCRIPTION)}:{" "}
                    {sourceRow.description ?? ""}
                  </span>
                  {sourceRow.status ? (
                    sourceRow.status === "approved" ? (
                      // Match the mapping-row Approved chip (mint bg + green text/check icon).
                      <Chip
                        label="Approved"
                        size="small"
                        icon={<TaskAltIcon fontSize="small" />}
                        sx={{
                          backgroundColor: "#E1FFF6",
                          color: "#00875A",
                          "& .MuiChip-icon": { color: "#00875A" },
                        }}
                      />
                    ) : sourceRow.status === "suggested" ? (
                      // Match the mapping-row Suggested chip, incl. the "(N)" suggestion count.
                      <Chip
                        label={`Suggested (${suggestedConcepts?.length ?? 0})`}
                        size="small"
                        sx={{ backgroundColor: "#E5E6F2", color: "#000080" }}
                      />
                    ) : (
                      <Chip
                        label={sourceRow.status.charAt(0).toUpperCase() + sourceRow.status.slice(1)}
                        size="small"
                      />
                    )
                  ) : null}
                </div>
              ) : null}
            </div>

            <div
              style={{
                marginRight: 24,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
              }}
              onClick={onClickClose}
            >
              <CloseIcon sx={{ width: 24, height: 24, color: "var(--color-primary, #000080)" }} />
            </div>
          </div>
        )}

        {showConceptSetFeatures ? (
          <NameSection
            conceptSetName={conceptSetName}
            setConceptSetName={setConceptSetName}
            conceptSetShared={conceptSetShared}
            setConceptSetShared={setConceptSetShared}
            isUserConceptSet={isUserConceptSet}
            saveConceptSet={saveConceptSet}
            isLoading={isConceptSetLoading}
            conceptSetId={conceptSetId}
            onClickClose={onClickClose}
            errorMsg={errorMsg}
            canShare={canShare}
          />
        ) : null}
        <div
          style={{
            height: `calc(100vh - ${searchAndDetailsHeightOffsetPx}px)`,
            paddingLeft: "20px",
            paddingRight: "20px",
            display: "flex",
            flexDirection: "column",
          }}
        >
          {showTabNavigation ? (
            <TabSection
              currentTabNo={tab}
              changeTab={changeTab}
              selectedConceptsCount={selectedConcepts.length}
              mode={mode}
              isAtlas={isAtlas}
            />
          ) : null}
          {getDomainContextMessage() && (
            <div
              className="domain-context-message"
              style={{ padding: "10px 0" }}
            >
              <Typography variant="caption" color="textSecondary">
                {getDomainContextMessage()}
              </Typography>
            </div>
          )}
          <div style={{ display: "flex", overflow: "auto", height: "100%" }}>
            <div
              className="terminology__search"
              style={{
                width: showDetails ? "65%" : "100%",
                display: "flex",
                flexDirection: "column",
                height: "100%",
              }}
            >
              {!userId && (
                <div>{getText(i18nKeys.TERMINOLOGY__MISSING_USER_ID)}</div>
              )}
              {userId && (
                <TerminologyList
                  userId={userId}
                  onConceptClick={setConceptId}
                  selectedConceptId={conceptId}
                  onSelectConceptId={onSelectConceptId}
                  initialInput={initialInput}
                  selectedConcepts={selectedConcepts}
                  tab={tab}
                  toggleDescendantsAndMapped={toggleDescendantsAndMapped}
                  showAddIcon={showAddIcon}
                  conceptsResult={conceptsResult}
                  setConceptsResult={setConceptsResult}
                  datasetId={activeDatasetId}
                  isDrawer={isDrawer}
                  defaultFilters={defaultFilters}
                  mode={mode}
                  isAtlas={isAtlas}
                  showConceptRecordCounts={showConceptRecordCounts}
                  mappingSelectedConcept={mappingSelectedConcept}
                  suggestedConcepts={suggestedConcepts}
                />
              )}
            </div>
            <div
              className="terminology__details"
              style={{ width: showDetails ? "100%" : "0%" }}
            >
              {showDetails && conceptId !== null ? (
                <TerminologyDetail
                  setShowDetails={setShowDetails}
                  conceptId={conceptId}
                  setConceptId={setConceptId}
                  userId={userId}
                  datasetId={activeDatasetId}
                />
              ) : null}
            </div>
          </div>
        </div>
        {isConceptMapping && (
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              alignItems: "center",
              gap: "10px",
              padding: "10px 20px 24px",
              borderTop: "1px solid #d4d4d4",
            }}
          >
            <Button
              variant="outlined"
              text={getText(i18nKeys.TERMINOLOGY__SUGGEST)}
              // Disable Suggest for a concept that's already one of the row's suggestions
              // (adding it again is a duplicate) - the user should Approve it instead.
              disabled={
                !mappingSelectedConcept ||
                !!suggestedConcepts?.some(
                  (s) => s.conceptId === mappingSelectedConcept?.conceptId,
                )
              }
              onClick={() => {
                if (mappingSelectedConcept) {
                  onConceptIdSelect?.(mappingSelectedConcept);
                }
              }}
            />
            <Button
              text={getText(i18nKeys.TERMINOLOGY__APPROVE)}
              disabled={!mappingSelectedConcept}
              onClick={() => {
                if (mappingSelectedConcept) {
                  onApprove?.(mappingSelectedConcept);
                }
              }}
            />
          </div>
        )}
      </div>
    </WithDrawer>
  );
};

export default Terminology;
