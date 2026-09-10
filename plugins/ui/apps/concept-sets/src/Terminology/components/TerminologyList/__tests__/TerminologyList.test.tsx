import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  act,
  waitFor,
  screen,
  fireEvent,
} from "@testing-library/react";
import React from "react";
import type {
  FilterOptions,
  FhirValueSetExpansionContainsWithExt,
} from "../../../utils/types";

// --- Hoisted mocks (available inside vi.mock factories) ---

const {
  mockSetFeedback,
  mockGetText,
  mockGetTerminologies,
  mockGetConceptsCount,
  mockGetFilterOptions,
  mockGetConceptRecordCounts,
  mockGetRecommendedConcepts,
} = vi.hoisted(() => ({
  mockSetFeedback: vi.fn(),
  mockGetText: vi.fn((key: string) => key),
  mockGetTerminologies: vi.fn(),
  mockGetConceptsCount: vi.fn(),
  mockGetFilterOptions: vi.fn(),
  mockGetConceptRecordCounts: vi.fn(),
  mockGetRecommendedConcepts: vi.fn(),
}));

vi.mock("../../../../hooks", () => ({
  useFeedback: () => ({
    setFeedback: mockSetFeedback,
    clearFeedback: vi.fn(),
    getFeedback: vi.fn(),
    setGenericErrorFeedback: vi.fn(),
  }),
  useTranslation: () => ({
    getText: mockGetText,
    changeLocale: vi.fn(),
    locale: "default",
  }),
}));

vi.mock("../../../../utils/PortalUtils", () => ({
  getPortalAPI: () => null,
}));

vi.mock("../../../../components/SearchBar/SearchBar", () => ({
  default: ({ keyword, onEnter }: any) => (
    <input
      data-testid="search-bar"
      defaultValue={keyword}
      onChange={(e) => onEnter(e.target.value)}
    />
  ),
}));

vi.mock("../../../../components/icons/AddIcon", () => ({
  default: () => <span data-testid="add-icon">+</span>,
}));

vi.mock("../../../../components/icons/RemoveIcon", () => ({
  default: () => <span data-testid="remove-icon">-</span>,
}));

vi.mock("@portal/components", () => ({
  TablePaginationActions: () => null,
}));

vi.mock("../TerminologyList.scss", () => ({}));

vi.mock("../../../../axios/terminology", () => ({
  Terminology: class {
    getFilterOptions = mockGetFilterOptions;
    getRecommendedConcepts = mockGetRecommendedConcepts;
  },
}));

vi.mock("../../../../axios/api", () => ({
  api: {
    terminology: {
      getConceptsCount: mockGetConceptsCount,
    },
    d2eWebapi: {
      getTerminologies: mockGetTerminologies,
      getConceptRecordCounts: mockGetConceptRecordCounts,
    },
    publicWebapiProxyAPI: {},
  },
}));

// --- Test imports (after mocks) ---

import TerminologyList from "../TerminologyList";

// --- Helpers ---

const sampleFilterOptions: FilterOptions = {
  conceptClassId: { "Clinical Finding": 100, Procedure: 50 },
  domainId: { Condition: 200, Drug: 150, Observation: 80 },
  standardConcept: { S: 300, "": 100 },
  vocabularyId: { SNOMED: 250, RxNorm: 100 },
  concept: { Standard: 300, "Non-standard": 100 },
  validity: { Valid: 350, Invalid: 50 },
};

const sampleConcepts = [
  {
    CONCEPT_ID: 1,
    CONCEPT_NAME: "Test Concept",
    DOMAIN_ID: "Condition",
    VOCABULARY_ID: "SNOMED",
    CONCEPT_CLASS_ID: "Clinical Finding",
    STANDARD_CONCEPT: "S",
    STANDARD_CONCEPT_CAPTION: "Standard",
    CONCEPT_CODE: "123",
    INVALID_REASON: null,
    INVALID_REASON_CAPTION: "Valid",
    VALID_START_DATE: "2020-01-01",
    VALID_END_DATE: "2099-12-31",
  },
];

const sampleMappedConcept: FhirValueSetExpansionContainsWithExt = {
  conceptId: 1,
  display: "Test Concept",
  conceptName: "Test Concept",
  domainId: "Condition",
  system: "SNOMED",
  vocabularyId: "SNOMED",
  conceptClassId: "Clinical Finding",
  standardConcept: "S",
  concept: "Standard",
  code: "123",
  conceptCode: "123",
  validStartDate: "1/1/2020",
  validEndDate: "12/31/2099",
  validity: "Valid",
};

const sampleMappedConceptWithCounts: FhirValueSetExpansionContainsWithExt = {
  ...sampleMappedConcept,
  recordCount: "10",
  descendantRecordCount: "20",
  personCount: "5",
  descendantPersonCount: "8",
};

function setupDefaultMocks() {
  mockGetTerminologies.mockResolvedValue(sampleConcepts);
  mockGetConceptsCount.mockResolvedValue(1);
  mockGetConceptRecordCounts.mockResolvedValue([{ "1": [10, 20, 5, 8] }]);
  mockGetFilterOptions.mockResolvedValue(sampleFilterOptions);
  mockGetRecommendedConcepts.mockResolvedValue([]);
}

/** Wait for all pending promises and effects to settle */
async function flushEffects(ms = 200) {
  await act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });
}

/** Extract filter args from a mock call by index */
function getDomainIdFilter(call: any[]): string[] {
  return call[5];
}
function getVocabularyIdFilter(call: any[]): string[] {
  return call[6];
}
function getStandardConceptFilter(call: any[]): string[] {
  return call[7];
}
function getSearchText(call: any[]): string {
  return call[3];
}

// --- Prop presets for different real-world use cases ---

const baseProps = {
  userId: "user-1",
  onConceptClick: vi.fn(),
  selectedConceptId: null,
  initialInput: "",
  selectedConcepts: [] as FhirValueSetExpansionContainsWithExt[],
  tab: "SEARCH" as const,
  showAddIcon: false,
  conceptsResult: null,
  setConceptsResult: vi.fn(),
  datasetId: "dataset-1",
  isDrawer: false,
  isAtlas: false,
};

/** Concepts page — no filters, no drawer, not Atlas */
const conceptsPageProps = {
  ...baseProps,
  mode: "CONCEPT_SEARCH" as const,
  showAddIcon: true,
};

/** PA-Atlas CONCEPT_MULTI_SELECT — isAtlas, drawer, domain filter */
const paAtlasMultiSelectProps = {
  ...baseProps,
  isAtlas: true,
  isDrawer: true,
  mode: "CONCEPT_MULTI_SELECT" as const,
  showAddIcon: true,
  defaultFilters: [{ id: "domainId", value: ["Condition"] }],
};

/** PA-Atlas CONCEPT_SET — isAtlas, drawer, domain filter */
const paAtlasConceptSetProps = {
  ...baseProps,
  isAtlas: true,
  isDrawer: true,
  mode: "CONCEPT_SET" as const,
  showAddIcon: true,
  defaultFilters: [{ id: "domainId", value: ["Condition"] }],
};

/** Concept Mapping — drawer, domain + standard concept filters, initialInput */
const conceptMappingProps = {
  ...baseProps,
  isDrawer: true,
  mode: "CONCEPT_MAPPING" as const,
  showAddIcon: true,
  defaultFilters: [
    { id: "concept", value: ["Standard"] },
    { id: "domainId", value: ["Condition"] },
  ],
  initialInput: "diabetes",
};

/**
 * Concept Mapping without defaultFilters — used for radio-rendering assertions.
 * (conceptMappingProps' domain/standard defaultFilters get re-applied client-side
 * by MRT's own column filtering on top of the already-filtered mock data, which
 * would hide the row and is irrelevant to what these tests are checking.)
 */
const conceptMappingRadioProps = {
  ...baseProps,
  isDrawer: true,
  mode: "CONCEPT_MAPPING" as const,
  showAddIcon: true,
  // Record-count merging isn't relevant to these radio-rendering assertions.
  showConceptRecordCounts: false,
};

// --- Tests ---

describe("TerminologyList", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaultMocks();
  });

  // ==========================================
  // Use case: Concepts page (no defaultFilters)
  // ==========================================
  describe("Concepts page (CONCEPT_SEARCH, no defaultFilters)", () => {
    it("renders without crashing", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptsPageProps} />);
      });
    });

    it("fetches data on mount with empty filters", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptsPageProps} />);
      });

      await waitFor(() => {
        expect(mockGetTerminologies).toHaveBeenCalled();
      });

      // All calls should have empty filters
      for (const call of mockGetTerminologies.mock.calls) {
        expect(getDomainIdFilter(call)).toEqual([]);
        expect(getVocabularyIdFilter(call)).toEqual([]);
        expect(getStandardConceptFilter(call)).toEqual([]);
      }
    });

    it("fetches concept record counts (non-Atlas)", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptsPageProps} />);
      });

      await waitFor(() => {
        expect(mockGetConceptRecordCounts).toHaveBeenCalled();
      });
    });

    it("fetches concept record counts when the flag is missing", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptsPageProps} />);
      });

      await waitFor(() => {
        expect(mockGetConceptRecordCounts).toHaveBeenCalled();
      });
    });

    it("does not fetch concept record counts when disabled", async () => {
      const setConceptsResult = vi.fn();

      await act(async () => {
        render(
          <TerminologyList
            {...conceptsPageProps}
            setConceptsResult={setConceptsResult}
            showConceptRecordCounts={false}
          />,
        );
      });

      await waitFor(() => {
        expect(setConceptsResult).toHaveBeenCalled();
      });

      expect(mockGetConceptRecordCounts).not.toHaveBeenCalled();
      const result = setConceptsResult.mock.calls[0][0];
      expect(result.data[0].recordCount).toBeUndefined();
      expect(result.data[0].descendantRecordCount).toBeUndefined();
      expect(result.data[0].personCount).toBeUndefined();
      expect(result.data[0].descendantPersonCount).toBeUndefined();
    });

    it("does not fetch concept record counts for an empty result", async () => {
      mockGetTerminologies.mockResolvedValue([]);
      mockGetConceptsCount.mockResolvedValue(0);

      await act(async () => {
        render(<TerminologyList {...conceptsPageProps} />);
      });

      await waitFor(() => {
        expect(mockGetTerminologies).toHaveBeenCalled();
      });
      await flushEffects();

      expect(mockGetConceptRecordCounts).not.toHaveBeenCalled();
    });

    it("does not fetch data when userId is missing", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptsPageProps} userId={undefined} />);
      });

      await flushEffects();
      expect(mockGetTerminologies).not.toHaveBeenCalled();
    });

    it("does not fetch data when datasetId is missing", async () => {
      await act(async () => {
        render(
          <TerminologyList {...conceptsPageProps} datasetId={undefined} />,
        );
      });

      await flushEffects();
      expect(mockGetTerminologies).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Use case: PA-Atlas with isAtlas=true, no defaultFilters
  // ==========================================
  describe("PA-Atlas CONCEPT_SEARCH (isAtlas=true, no defaultFilters)", () => {
    const paAtlasSearchProps = {
      ...baseProps,
      isAtlas: true,
      isDrawer: false,
      mode: "CONCEPT_SEARCH" as const,
      showAddIcon: true,
    };

    it("fetches data with empty filters", async () => {
      await act(async () => {
        render(<TerminologyList {...paAtlasSearchProps} />);
      });

      await waitFor(() => {
        expect(mockGetTerminologies).toHaveBeenCalled();
      });

      for (const call of mockGetTerminologies.mock.calls) {
        expect(getDomainIdFilter(call)).toEqual([]);
      }
    });

    it("does NOT fetch concept record counts (Atlas skips this)", async () => {
      await act(async () => {
        render(<TerminologyList {...paAtlasSearchProps} />);
      });

      await flushEffects(500);
      expect(mockGetConceptRecordCounts).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Use case: PA-Atlas CONCEPT_MULTI_SELECT with defaultFilters
  // (QueryFilterModern.vue dispatches with domainId filter)
  // ==========================================
  describe("PA-Atlas CONCEPT_MULTI_SELECT (isAtlas=true, defaultFilters)", () => {
    it("makes the initial fetch WITH defaultFilters applied", async () => {
      await act(async () => {
        render(<TerminologyList {...paAtlasMultiSelectProps} />);
      });

      await waitFor(() => {
        expect(mockGetTerminologies).toHaveBeenCalled();
      });

      const firstCall = mockGetTerminologies.mock.calls[0];
      expect(getDomainIdFilter(firstCall)).toEqual(["Condition"]);
    });

    it("does not re-fetch after filterOptions load when casing matches", async () => {
      await act(async () => {
        render(<TerminologyList {...paAtlasMultiSelectProps} />);
      });

      await flushEffects(500);

      // All calls should have the Condition filter — no wasted unfiltered fetch
      for (const call of mockGetTerminologies.mock.calls) {
        expect(getDomainIdFilter(call)).toEqual(["Condition"]);
      }
    });

    it("does NOT fetch concept record counts (Atlas mode)", async () => {
      await act(async () => {
        render(<TerminologyList {...paAtlasMultiSelectProps} />);
      });

      await flushEffects(500);
      expect(mockGetConceptRecordCounts).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Use case: PA-Atlas CONCEPT_SET with defaultFilters
  // (app-tag-input.vue dispatches with domainId filter)
  // ==========================================
  describe("PA-Atlas CONCEPT_SET (isAtlas=true, defaultFilters)", () => {
    it("makes the initial fetch WITH defaultFilters applied", async () => {
      await act(async () => {
        render(<TerminologyList {...paAtlasConceptSetProps} />);
      });

      await waitFor(() => {
        expect(mockGetTerminologies).toHaveBeenCalled();
      });

      const firstCall = mockGetTerminologies.mock.calls[0];
      expect(getDomainIdFilter(firstCall)).toEqual(["Condition"]);
    });

    it("does not re-fetch after filterOptions load when casing matches", async () => {
      await act(async () => {
        render(<TerminologyList {...paAtlasConceptSetProps} />);
      });

      await flushEffects(500);

      for (const call of mockGetTerminologies.mock.calls) {
        expect(getDomainIdFilter(call)).toEqual(["Condition"]);
      }
    });
  });

  // ==========================================
  // Use case: Concept Mapping drawer
  // (MappingDrawer.tsx dispatches with domain + standard concept filters + initialInput)
  // ==========================================
  describe("Concept Mapping (CONCEPT_MAPPING, defaultFilters + initialInput)", () => {
    it("uses initialInput as search text in the fetch", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptMappingProps} />);
      });

      await waitFor(() => {
        expect(mockGetTerminologies).toHaveBeenCalled();
      });

      const firstCall = mockGetTerminologies.mock.calls[0];
      expect(getSearchText(firstCall)).toBe("diabetes");
    });

    it("applies both domain and concept standard filters after validation", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptMappingProps} />);
      });

      await flushEffects(500);

      // Find calls with domain filter applied
      const callsWithFilter = mockGetTerminologies.mock.calls.filter(
        (call) => getDomainIdFilter(call).length > 0,
      );
      expect(callsWithFilter.length).toBeGreaterThanOrEqual(1);

      const filteredCall = callsWithFilter[callsWithFilter.length - 1];
      expect(getDomainIdFilter(filteredCall)).toEqual(["Condition"]);
      // "concept" filter maps to standardConceptFilters via: concept === "Standard" ? "S" : "Non-standard"
      expect(getStandardConceptFilter(filteredCall)).toEqual(["S"]);
    });

    it("fetches concept record counts (non-Atlas mode)", async () => {
      await act(async () => {
        render(<TerminologyList {...conceptMappingProps} />);
      });

      await waitFor(() => {
        expect(mockGetConceptRecordCounts).toHaveBeenCalled();
      });
    });

    // conceptsResult is normally lifted state owned by the parent Terminology
    // component and fed back in via setConceptsResult; here it's supplied
    // directly to simulate "a search has already completed" without depending
    // on the fetch->setConceptsResult round trip (setConceptsResult is a plain
    // spy in these unit tests, so calling it doesn't feed back into props).
    const loadedResult = { count: 1, data: [sampleMappedConcept] };

    it("renders a radio (not add/remove icons) for each result row", async () => {
      await act(async () => {
        render(
          <TerminologyList
            {...conceptMappingRadioProps}
            onSelectConceptId={vi.fn()}
            conceptsResult={loadedResult}
          />,
        );
      });

      expect(screen.getAllByRole("radio").length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByTestId("add-icon")).toBeNull();
      expect(screen.queryByTestId("remove-icon")).toBeNull();
    });

    it("checks the radio matching mappingSelectedConcept", async () => {
      await act(async () => {
        render(
          <TerminologyList
            {...conceptMappingRadioProps}
            onSelectConceptId={vi.fn()}
            conceptsResult={loadedResult}
            mappingSelectedConcept={sampleMappedConcept}
          />,
        );
      });

      const radio = screen.getAllByRole("radio")[0] as HTMLInputElement;
      expect(radio.checked).toBe(true);
    });

    it("does not check the radio when mappingSelectedConcept is a different concept", async () => {
      await act(async () => {
        render(
          <TerminologyList
            {...conceptMappingRadioProps}
            onSelectConceptId={vi.fn()}
            conceptsResult={loadedResult}
            mappingSelectedConcept={{ ...sampleMappedConcept, conceptId: 999 }}
          />,
        );
      });

      const radio = screen.getAllByRole("radio")[0] as HTMLInputElement;
      expect(radio.checked).toBe(false);
    });

    it("clicking the radio calls onSelectConceptId with the row concept", async () => {
      const onSelectConceptId = vi.fn();

      await act(async () => {
        render(
          <TerminologyList
            {...conceptMappingRadioProps}
            onSelectConceptId={onSelectConceptId}
            conceptsResult={loadedResult}
          />,
        );
      });

      const radio = screen.getAllByRole("radio")[0];
      fireEvent.click(radio);

      expect(onSelectConceptId).toHaveBeenCalledWith(
        expect.objectContaining({ conceptId: 1 }),
      );
    });

    it("clicking anywhere in the row selects that concept, like clicking its radio", async () => {
      const onSelectConceptId = vi.fn();

      await act(async () => {
        render(
          <TerminologyList
            {...conceptMappingRadioProps}
            onSelectConceptId={onSelectConceptId}
            conceptsResult={loadedResult}
          />,
        );
      });

      const row = screen.getByText("Test Concept").closest("tr") as HTMLElement;
      fireEvent.click(row);

      expect(onSelectConceptId).toHaveBeenCalledWith(
        expect.objectContaining({ conceptId: 1 }),
      );
    });

    it("a row click outside CONCEPT_MAPPING still does not select the concept", async () => {
      const onSelectConceptId = vi.fn();

      await act(async () => {
        render(
          <TerminologyList
            {...conceptMappingRadioProps}
            mode="CONCEPT_SEARCH"
            onSelectConceptId={onSelectConceptId}
            conceptsResult={loadedResult}
          />,
        );
      });

      const row = screen.getByText("Test Concept").closest("tr") as HTMLElement;
      fireEvent.click(row);

      expect(onSelectConceptId).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // defaultFilters validation logic
  // ==========================================
  describe("defaultFilters validation", () => {
    it("corrects casing via validation against filterOptions", async () => {
      const defaultFilters = [{ id: "domainId", value: ["condition"] }];

      await act(async () => {
        render(
          <TerminologyList {...baseProps} defaultFilters={defaultFilters} />,
        );
      });

      await flushEffects(500);

      // First fetch uses raw defaultFilters (lowercase "condition")
      const firstCall = mockGetTerminologies.mock.calls[0];
      expect(getDomainIdFilter(firstCall)).toEqual(["condition"]);

      // After validation, a second fetch uses the corrected casing
      const lastCall =
        mockGetTerminologies.mock.calls[
          mockGetTerminologies.mock.calls.length - 1
        ];
      expect(getDomainIdFilter(lastCall)).toEqual(["Condition"]);
    });

    it("removes invalid values after validation against filterOptions", async () => {
      const defaultFilters = [{ id: "domainId", value: ["NonExistentDomain"] }];

      await act(async () => {
        render(
          <TerminologyList {...baseProps} defaultFilters={defaultFilters} />,
        );
      });

      await flushEffects(500);

      // First fetch uses raw defaultFilters
      const firstCall = mockGetTerminologies.mock.calls[0];
      expect(getDomainIdFilter(firstCall)).toEqual(["NonExistentDomain"]);

      // After validation, invalid value is removed — last fetch has empty filter
      const lastCall =
        mockGetTerminologies.mock.calls[
          mockGetTerminologies.mock.calls.length - 1
        ];
      expect(getDomainIdFilter(lastCall)).toEqual([]);
    });

    it("keeps valid values and drops invalid ones after validation", async () => {
      const defaultFilters = [
        { id: "domainId", value: ["Condition", "FakeDomain"] },
      ];

      await act(async () => {
        render(
          <TerminologyList {...baseProps} defaultFilters={defaultFilters} />,
        );
      });

      await flushEffects(500);

      // First fetch uses raw defaultFilters (both values)
      const firstCall = mockGetTerminologies.mock.calls[0];
      expect(getDomainIdFilter(firstCall)).toEqual(["Condition", "FakeDomain"]);

      // After validation, only "Condition" remains
      const lastCall =
        mockGetTerminologies.mock.calls[
          mockGetTerminologies.mock.calls.length - 1
        ];
      expect(getDomainIdFilter(lastCall)).toEqual(["Condition"]);
    });

    it("does not re-fetch when defaultFilters match filterOptions exactly", async () => {
      const defaultFilters = [{ id: "domainId", value: ["Condition"] }];

      await act(async () => {
        render(
          <TerminologyList {...baseProps} defaultFilters={defaultFilters} />,
        );
      });

      await flushEffects(500);

      // Every fetch should include the Condition filter — no wasted unfiltered fetch
      for (const call of mockGetTerminologies.mock.calls) {
        expect(getDomainIdFilter(call)).toEqual(["Condition"]);
      }
    });
  });

  // ==========================================
  // Tab behavior
  // ==========================================
  describe("tab behavior", () => {
    it("does not fetch data for SELECTED tab", async () => {
      await act(async () => {
        render(<TerminologyList {...baseProps} tab="SELECTED" />);
      });

      await flushEffects();
      expect(mockGetTerminologies).not.toHaveBeenCalled();
    });

    it("fetches recommended concepts for RELATED tab", async () => {
      const selectedConcepts = [sampleMappedConcept];

      await act(async () => {
        render(
          <TerminologyList
            {...baseProps}
            tab="RELATED"
            selectedConcepts={selectedConcepts}
          />,
        );
      });

      await waitFor(() => {
        expect(mockGetRecommendedConcepts).toHaveBeenCalled();
      });

      expect(mockGetRecommendedConcepts).toHaveBeenCalledWith(
        [1], // conceptIds from selectedConcepts
        "dataset-1",
        expect.any(AbortSignal),
      );
      // RELATED tab should NOT call getTerminologies
      expect(mockGetTerminologies).not.toHaveBeenCalled();
    });
  });

  // ==========================================
  // Common behavior
  // ==========================================
  describe("common behavior", () => {
    it("fetches filter options on data load", async () => {
      await act(async () => {
        render(<TerminologyList {...baseProps} />);
      });

      await waitFor(() => {
        expect(mockGetFilterOptions).toHaveBeenCalled();
      });
    });

    it("passes an AbortSignal to the API call", async () => {
      await act(async () => {
        render(<TerminologyList {...baseProps} />);
      });

      await waitFor(() => {
        expect(mockGetTerminologies).toHaveBeenCalled();
      });

      const firstSignal = mockGetTerminologies.mock.calls[0][9];
      expect(firstSignal).toBeInstanceOf(AbortSignal);
    });

    it("calls setConceptsResult with fetched data", async () => {
      const setConceptsResult = vi.fn();

      await act(async () => {
        render(
          <TerminologyList
            {...baseProps}
            setConceptsResult={setConceptsResult}
          />,
        );
      });

      await waitFor(() => {
        expect(setConceptsResult).toHaveBeenCalled();
      });

      const result = setConceptsResult.mock.calls[0][0];
      expect(result).toHaveProperty("count");
      expect(result).toHaveProperty("data");
      expect(result.data).toHaveLength(1);
    });

    it("shows count columns when record counts are enabled", async () => {
      await act(async () => {
        render(
          <TerminologyList
            {...baseProps}
            tab="SELECTED"
            selectedConcepts={[sampleMappedConceptWithCounts]}
          />,
        );
      });

      expect(screen.queryByText("TERMINOLOGY_LIST__RECORD_COUNT")).toBeTruthy();
      expect(
        screen.queryByText("TERMINOLOGY_LIST__DESCENDANT_RECORD_COUNT"),
      ).toBeTruthy();
      expect(screen.queryByText("TERMINOLOGY_LIST__PERSON_COUNT")).toBeTruthy();
      expect(
        screen.queryByText("TERMINOLOGY_LIST__DESCENDANT_PERSON_COUNT"),
      ).toBeTruthy();
    });

    it("hides count columns when record counts are disabled", async () => {
      await act(async () => {
        render(
          <TerminologyList
            {...baseProps}
            tab="SELECTED"
            selectedConcepts={[sampleMappedConceptWithCounts]}
            showConceptRecordCounts={false}
          />,
        );
      });

      expect(screen.queryByText("TERMINOLOGY_LIST__RECORD_COUNT")).toBeNull();
      expect(
        screen.queryByText("TERMINOLOGY_LIST__DESCENDANT_RECORD_COUNT"),
      ).toBeNull();
      expect(screen.queryByText("TERMINOLOGY_LIST__PERSON_COUNT")).toBeNull();
      expect(
        screen.queryByText("TERMINOLOGY_LIST__DESCENDANT_PERSON_COUNT"),
      ).toBeNull();
      expect(screen.queryByText("TERMINOLOGY_LIST__NAME")).toBeTruthy();
    });
  });

  // ==========================================
  // Error handling
  // ==========================================
  describe("error handling", () => {
    it("calls setFeedback with error when fetch fails", async () => {
      mockGetTerminologies.mockRejectedValue(new Error("Network error"));

      await act(async () => {
        render(<TerminologyList {...baseProps} />);
      });

      await waitFor(() => {
        expect(mockSetFeedback).toHaveBeenCalledWith(
          expect.objectContaining({ type: "error" }),
        );
      });
    });

    it("does not call setFeedback when request is canceled", async () => {
      mockGetTerminologies.mockRejectedValue({ message: "canceled" });

      await act(async () => {
        render(<TerminologyList {...baseProps} />);
      });

      await flushEffects();
      expect(mockSetFeedback).not.toHaveBeenCalled();
    });
  });
});
