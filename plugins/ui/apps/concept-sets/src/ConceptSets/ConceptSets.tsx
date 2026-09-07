import React, { FC, useCallback, useEffect, useState } from "react";
import Tabs from "@mui/material/Tabs";
import Tab from "@mui/material/Tab";
import { Loader } from "@portal/components";
import { api } from "../axios/api";
import Terminology from "../Terminology/Terminology";
import { ConceptSet } from "../Terminology/utils/types";
import { TerminologyProps } from "../Terminology/Terminology";
import { useFeedback, usePortal, useTranslation } from "../hooks";
import { mapd2eWebapiConceptSet } from "../Terminology/utils/d2eWebapiMappers";
import { i18nKeys } from "../context/state/translation-state";
import "./ConceptSets.scss";
import ConceptSetDeleteDialog from "./ConceptSetDeleteDialog";
import { ConceptSetsTable } from "./ConceptSetsTable";

enum ConceptSetTab {
  ConceptSearch = "ConceptSearch",
  ConceptSets = "ConceptSets",
}

interface ConceptSetsProps {
  isAtlas: boolean;
}

export const ConceptSets: FC<ConceptSetsProps> = ({ isAtlas }) => {
  const { getText } = useTranslation();
  const { datasetId, userId, userName } = usePortal();
  const [isLoading, setIsLoading] = useState(false);
  const { setFeedback } = useFeedback();
  const [data, setData] = useState<ConceptSet[]>([]);
  const [tabValue, setTabValue] = useState(ConceptSetTab.ConceptSearch);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [conceptSetToDelete, setConceptSetToDelete] = useState<
    { id: string; name: string } | undefined
  >(undefined);

  const handleTabSelectionChange = async (
    _event: React.SyntheticEvent,
    value: ConceptSetTab,
  ) => {
    setTabValue(value);
  };

  const fetchData = useCallback(async () => {
    if (!datasetId) return;

    try {
      setIsLoading(true);

      const response = (await api.d2eWebapi.getConceptSets(datasetId)).map(
        mapd2eWebapiConceptSet,
      );
      const sortFn = (a: ConceptSet, b: ConceptSet) => {
        const aIsOwn = a.createdBy === userName;
        const bIsOwn = b.createdBy === userName;
        if (aIsOwn && !bIsOwn) return -1;
        if (!aIsOwn && bIsOwn) return 1;
        if (a.name < b.name) return -1;
        if (a.name > b.name) return 1;
        return 0;
      };
      setData([...response].sort(sortFn));
    } catch (e) {
      console.error(e);
      setFeedback({
        type: "error",
        message: getText(i18nKeys.CONCEPT_SETS__ERROR),
        description: getText(i18nKeys.CONCEPT_SETS__ERROR_DESCRIPTION),
      });
    } finally {
      setIsLoading(false);
    }
  }, [getText, setFeedback, datasetId, userName]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleAddAndEditConceptSet = useCallback(
    (conceptSetId?: string, canWrite?: boolean) => {
      if (!datasetId) return;
      const event = new CustomEvent<{ props: TerminologyProps }>(
        "alp-terminology-open",
        {
          detail: {
            props: {
              selectedConceptSetId: conceptSetId,
              selectedConceptSetCanWrite: canWrite ?? true,
              onClose: () => fetchData(),
              mode: "CONCEPT_SET",
              selectedDatasetId: datasetId,
              isAtlas,
            },
          },
        },
      );
      window.dispatchEvent(event);
    },
    [fetchData, datasetId],
  );

  const handleDeleteClick = useCallback((conceptSet: ConceptSet) => {
    setConceptSetToDelete({ id: conceptSet.id, name: conceptSet.name });
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteDialogClose = useCallback(() => {
    setDeleteDialogOpen(false);
    setConceptSetToDelete(undefined);
  }, []);

  const handleConceptSetDeleted = useCallback(() => {
    fetchData();
  }, [fetchData]);

  if (!datasetId) return <Loader />;

  if (!userId) return null;

  return (
    <>
      <div className="concept-sets">
        <div className="concept-sets__content">
          <div className="concept-sets__tabs">
            <Tabs value={tabValue} onChange={handleTabSelectionChange}>
              <Tab
                disableRipple
                label={getText(i18nKeys.CONCEPT_SETS__SEARCH)}
                value={ConceptSetTab.ConceptSearch}
              />
              <Tab
                disableRipple
                label={getText(i18nKeys.TERMINOLOGY__CONCEPT_SETS)}
                value={ConceptSetTab.ConceptSets}
              />
            </Tabs>
          </div>

          <div className="concept-sets__break"></div>

          {tabValue == ConceptSetTab.ConceptSearch && (
            <Terminology userId={userId} isAtlas={isAtlas} />
          )}

          {tabValue == ConceptSetTab.ConceptSets && (
            <ConceptSetsTable
              data={data}
              isLoading={isLoading}
              onAddEdit={handleAddAndEditConceptSet}
              onDelete={handleDeleteClick}
              userName={userName}
            />
          )}
        </div>
      </div>
      <ConceptSetDeleteDialog
        conceptSet={conceptSetToDelete}
        open={deleteDialogOpen}
        datasetId={datasetId}
        setMainFeedback={setFeedback}
        onClose={handleDeleteDialogClose}
        onDeleted={handleConceptSetDeleted}
      />
    </>
  );
};
