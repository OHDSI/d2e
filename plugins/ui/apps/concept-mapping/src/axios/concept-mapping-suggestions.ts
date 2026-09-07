import { request } from "./request";

const CONCEPT_MAPPING_SUGGESTIONS_URL = "jobplugins/concept-mapping-suggestions";

export interface ConceptInput {
  conceptId: number;
  conceptName: string;
  conceptCode: string;
  domainId: string;
  vocabularyId: string;
}

export interface SuggestionDto {
  id: string;
  conceptId: number;
  conceptName: string;
  conceptCode: string;
  domainId: string;
  vocabularyId: string;
  suggestedBy: string;
  // Display names behind the table's "Checked by" column: who suggested this concept, and -
  // once approved - who approved it. Null on suggestions written before these were recorded.
  suggestedByName: string | null;
  approvedByName: string | null;
  createdAt: string;
  isApproved: boolean;
}

export interface NodeSuggestionsRow {
  sourceRowId: string;
  flagged: boolean;
  suggestions: SuggestionDto[];
}

export class ConceptMappingSuggestions {
  public getSuggestions = (dataflowId: string, nodeId: string): Promise<NodeSuggestionsRow[]> => {
    return request({
      baseURL: CONCEPT_MAPPING_SUGGESTIONS_URL,
      method: "GET",
      params: { dataflowId, nodeId },
    });
  };

  public addSuggestion = (
    dataflowId: string,
    nodeId: string,
    sourceRowId: string,
    concept: ConceptInput
  ): Promise<SuggestionDto> => {
    return request({
      baseURL: CONCEPT_MAPPING_SUGGESTIONS_URL,
      method: "POST",
      data: { dataflowId, nodeId, sourceRowId, concept },
    });
  };

  public approve = (id: string): Promise<void> => {
    return request({
      baseURL: CONCEPT_MAPPING_SUGGESTIONS_URL,
      url: `/${id}/approve`,
      method: "POST",
    });
  };

  public unapprove = (id: string): Promise<void> => {
    return request({
      baseURL: CONCEPT_MAPPING_SUGGESTIONS_URL,
      url: `/${id}/unapprove`,
      method: "POST",
    });
  };

  public setRowFlag = (
    dataflowId: string,
    nodeId: string,
    sourceRowId: string,
    flagged: boolean
  ): Promise<void> => {
    return request({
      baseURL: CONCEPT_MAPPING_SUGGESTIONS_URL,
      url: "/row-flag",
      method: "PUT",
      data: { dataflowId, nodeId, sourceRowId, flagged },
    });
  };

  public clearSuggestions = (dataflowId: string, nodeId: string): Promise<void> => {
    return request({
      baseURL: CONCEPT_MAPPING_SUGGESTIONS_URL,
      method: "DELETE",
      params: { dataflowId, nodeId },
    });
  };
}
