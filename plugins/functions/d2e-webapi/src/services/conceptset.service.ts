import { TerminologySvcAPI } from "../api/TerminologySvcAPI.ts";
import {
  IWebApiConcept,
  IWebApiConceptSetHeader,
  IWebApiConceptSetItem,
  IWebApiConceptSetItemWrite,
  WebApiConceptSetAPI,
} from "../api/WebApiConceptSetAPI.ts";
import {
  IConceptSetCreateDto,
  IConceptSetItemListDto,
  IConceptSetItemsResponseDto,
  IConceptSetListResponseDto,
  IConceptSetResponseDto,
} from "../dto/conceptset.ts";
import {
  ITerminologyConceptSet,
  ITerminologyCreateConceptSet,
} from "../api/types.ts";
import { _getInvalidReasonFromCaption } from "./vocabulary.service.ts";
import { PortalServerAPI } from "../api/PortalServerAPI.ts";
import { BookmarksAPI } from "../api/BookmarksAPI.ts";
import {
  ConceptSetExpressionError,
  ConceptSetInUseError,
  ConceptSetValidationError,
} from "../errors/ConceptSetErrors.ts";
import { getConceptsFromIdentifiers } from "./vocabulary.service.ts";
import {
  CONCEPT_SET_LEGACY_OFFSET_BOUNDARY,
  ConceptSetRef,
  formatConceptSetRef,
  parseConceptSetRef,
} from "../utils/conceptSetRef.ts";
import { IIncludedConcept } from "../dto/conceptset.ts";

const buildConceptSetIdValues = (
  ref: ConceptSetRef,
): Set<string | number> => {
  const values = new Set<string | number>();
  values.add(formatConceptSetRef(ref));
  if (ref.source === "legacy") {
    values.add(ref.externalId);
    values.add(String(ref.externalId));
  } else {
    const offsetId = ref.externalId + CONCEPT_SET_LEGACY_OFFSET_BOUNDARY;
    values.add(offsetId);
    values.add(String(offsetId));
  }
  return values;
};

const bookmarkUsesConceptSet = (
  bookmark: unknown,
  matchingValues: Set<string | number>,
): boolean => {
  if (typeof bookmark !== "object" || bookmark === null) {
    return false;
  }

  if (Array.isArray(bookmark)) {
    return bookmark.some((item) =>
      bookmarkUsesConceptSet(item, matchingValues)
    );
  }

  for (const [key, value] of Object.entries(bookmark)) {
    if (key === "value" && matchingValues.has(value)) {
      return true;
    }
    if (typeof value === "object" && value !== null) {
      if (bookmarkUsesConceptSet(value, matchingValues)) {
        return true;
      }
    }
  }

  return false;
};

const mapItemsToTerminologyConcepts = (
  conceptSetItemList: IConceptSetItemListDto,
): ITerminologyCreateConceptSet["concepts"] => {
  return conceptSetItemList.map((conceptSetItem) => ({
    id: conceptSetItem.conceptId,
    useMapped: conceptSetItem.includeMapped,
    useDescendants: conceptSetItem.includeDescendants,
    isExcluded: conceptSetItem.isExcluded,
  }));
};

export const getConceptSet = async (
  token: string,
  datasetId: string,
  conceptSetId: string | number,
): Promise<IConceptSetResponseDto> => {
  const ref = parseConceptSetRef(conceptSetId);
  const currentUserId = getCurrentUserId(token);

  if (ref.source === "webapi") {
    const webApiConceptSetApi = new WebApiConceptSetAPI(token);
    const webApiConceptSet = await webApiConceptSetApi.getConceptSet(
      ref.externalId,
    );
    return mapWebApiConceptSetToFacadeConceptSet(webApiConceptSet);
  }

  const terminologySvcApi = new TerminologySvcAPI(token);
  const terminologyConceptSet = await terminologySvcApi.getConceptSet(
    ref.externalId,
    datasetId,
  );

  return mapLegacyConceptSetToWebApiConceptSet(
    terminologyConceptSet,
    currentUserId,
  );
};

export const getConceptSets = async (
  token: string,
  datasetId: string,
): Promise<IConceptSetListResponseDto> => {
  const terminologySvcApi = new TerminologySvcAPI(token);
  const webApiConceptSetApi = new WebApiConceptSetAPI(token);
  const currentUserId = getCurrentUserId(token);

  const [terminologyConceptSets, webApiConceptSets] = await Promise.all([
    terminologySvcApi.getConceptSets(datasetId),
    webApiConceptSetApi.getConceptSets(),
  ]);

  const merged = [
    ...terminologyConceptSets.map((conceptSet) =>
      mapLegacyConceptSetToWebApiConceptSet(conceptSet, currentUserId),
    ),
    ...webApiConceptSets.map(mapWebApiConceptSetToFacadeConceptSet),
  ];

  return merged;
};

export const createConceptSet = async (
  token: string,
  _datasetId: string,
  conceptSetDto: IConceptSetCreateDto,
): Promise<IConceptSetResponseDto> => {
  const webApiConceptSetApi = new WebApiConceptSetAPI(token);
  const webApiConceptSet = await webApiConceptSetApi.createConceptSet({
    name: conceptSetDto.name,
    description: conceptSetDto.description,
  });

  return mapWebApiConceptSetToFacadeConceptSet(webApiConceptSet);
};

export const updateConceptSet = async (
  token: string,
  datasetId: string,
  conceptSetId: string | number,
  conceptSetDto: IConceptSetCreateDto,
): Promise<boolean> => {
  const ref = parseConceptSetRef(conceptSetId);

  if (ref.source === "legacy") {
    const terminologySvcApi = new TerminologySvcAPI(token);
    const terminologyConceptSet = await terminologySvcApi.getConceptSetById(
      datasetId,
      ref.externalId,
    );

    await terminologySvcApi.updateConceptSet(datasetId, ref.externalId, {
      concepts: terminologyConceptSet.concepts.map((concept) => ({
        id: concept.id,
        useMapped: concept.useMapped,
        useDescendants: concept.useDescendants,
        isExcluded: concept.isExcluded,
      })),
      name: conceptSetDto.name,
      shared: conceptSetDto.shared ?? false,
      userName: terminologyConceptSet.userName,
    });

    return true;
  }

  const webApiConceptSetApi = new WebApiConceptSetAPI(token);
  await webApiConceptSetApi.updateConceptSet(ref.externalId, {
    id: ref.externalId,
    name: conceptSetDto.name,
    description: conceptSetDto.description,
  });

  return true;
};

export const deleteConceptSet = async (
  token: string,
  datasetId: string,
  conceptSetId: string | number,
): Promise<void> => {
  const ref = parseConceptSetRef(conceptSetId);

  // Check if concept set is in use
  // Note: There is a potential race condition between this check and the deletion.
  // If another user adds a reference to the concept set between this check and the
  // actual deletion, the reference could become broken. This is an acceptable risk
  // for this feature, as the window is small and the impact is limited.
  // Pass the original unparsed conceptSetId so getConceptSetUsage performs its
  // own single parse. Forwarding ref.externalId here would re-enter the parser
  // and could mis-classify a webapi externalId < 1_000_000_000 as legacy.
  const usage = await getConceptSetUsage(token, datasetId, conceptSetId);

  if (usage.inUse) {
    throw new ConceptSetInUseError(usage.cohortDefinitions, usage.bookmarks);
  }

  // Proceed with deletion if not in use
  if (ref.source === "legacy") {
    const terminologySvcApi = new TerminologySvcAPI(token);
    await terminologySvcApi.deleteConceptSet(datasetId, ref.externalId);
    return;
  }

  const webApiConceptSetApi = new WebApiConceptSetAPI(token);
  await webApiConceptSetApi.deleteConceptSet(ref.externalId);
};

export const getConceptSetUsage = async (
  token: string,
  datasetId: string,
  conceptSetId: string | number,
): Promise<{
  inUse: boolean;
  cohortDefinitions: Array<{ id: number; name: string }>;
  bookmarks: Array<{ id: string; name: string }>;
}> => {
  // Parse the input via the shared parser; accept compound or bare numeric.
  let ref: ConceptSetRef;
  try {
    ref = parseConceptSetRef(conceptSetId);
  } catch (error) {
    // The parser's own message already embeds the raw input via JSON.stringify,
    // so we rethrow it as-is rather than prefixing a second copy of the input.
    throw new ConceptSetValidationError(
      error instanceof Error ? error.message : String(error),
    );
  }

  // Defence against conceptSetId 0 false-positives in the matchers below.
  // (parseConceptSetRef already enforces non-negative integer; this rejects the legitimate
  //  parsed-but-unusable id 0 specifically.)
  if (ref.externalId <= 0) {
    throw new ConceptSetValidationError(
      `Invalid concept set ID: ${
        String(conceptSetId)
      }. Concept set ID 0 is reserved.`,
    );
  }

  const matchingValues = buildConceptSetIdValues(ref);

  const portalServerApi = new PortalServerAPI(token);
  const bookmarksApi = new BookmarksAPI(token);

  // Fetches all cohorts/bookmarks and filters in-memory; may need optimized APIs for large datasets.
  const [cohortDefinitions, bookmarksData] = await Promise.all([
    portalServerApi.getAtlasCohortDefinitionList().catch((_error) => {
      // Wrap external API errors to avoid leaking internal implementation details
      throw new Error(
        "Failed to check cohort definitions for concept set usage",
      );
    }),
    bookmarksApi.getAllBookmarks(datasetId).catch((_error) => {
      // Wrap external API errors to avoid leaking internal implementation details
      throw new Error("Failed to check bookmarks for concept set usage");
    }),
  ]);

  const usingCohorts = cohortDefinitions.filter((cohort) => {
    const conceptSets = (cohort.expression as Record<string, unknown>)
      ?.ConceptSets;
    if (!Array.isArray(conceptSets)) {
      return false;
    }
    return conceptSets.some((conceptSet) => {
      const id = (conceptSet as Record<string, unknown>)?.conceptSetId;
      return matchingValues.has(id as string | number) ||
        matchingValues.has(String(id));
    });
  });

  // Check Bookmarks (D2E filters) using exact value comparison
  const bookmarks = bookmarksData.bookmarks || [];

  const usingBookmarks = bookmarks.filter((bookmark) => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(bookmark.bookmark);
    } catch {
      return false;
    }
    return bookmarkUsesConceptSet(parsed, matchingValues);
  });

  return {
    inUse: usingCohorts.length > 0 || usingBookmarks.length > 0,
    cohortDefinitions: usingCohorts.map((c) => ({ id: c.id, name: c.name })),
    bookmarks: usingBookmarks.map((b) => ({
      id: b.bmkId,
      name: b.bookmarkname,
    })),
  };
};

export const updateConceptSetItems = async (
  token: string,
  datasetId: string,
  conceptSetId: string | number,
  conceptSetItemList: IConceptSetItemListDto,
): Promise<boolean> => {
  const ref = parseConceptSetRef(conceptSetId);

  if (ref.source === "legacy") {
    const terminologySvcApi = new TerminologySvcAPI(token);
    const terminologyConceptSet = await terminologySvcApi.getConceptSetById(
      datasetId,
      ref.externalId,
    );

    await terminologySvcApi.updateConceptSet(datasetId, ref.externalId, {
      concepts: mapItemsToTerminologyConcepts(conceptSetItemList),
      name: terminologyConceptSet.name,
      shared: terminologyConceptSet.shared,
      userName: terminologyConceptSet.userName,
    });

    return true;
  }

  const webApiConceptSetApi = new WebApiConceptSetAPI(token);
  const items: IWebApiConceptSetItemWrite[] = conceptSetItemList.map(
    (conceptSetItem) => ({
      conceptId: conceptSetItem.conceptId,
      includeMapped: conceptSetItem.includeMapped,
      includeDescendants: conceptSetItem.includeDescendants,
      isExcluded: conceptSetItem.isExcluded,
    }),
  );

  await webApiConceptSetApi.updateConceptSetItems(ref.externalId, items);

  return true;
};

export const getConceptSetExpression = async (
  token: string,
  datasetId: string,
  conceptSetId: string | number,
): Promise<IConceptSetItemsResponseDto> => {
  const ref = parseConceptSetRef(conceptSetId);

  if (ref.source === "webapi") {
    const webApiConceptSetApi = new WebApiConceptSetAPI(token);

    let items: IWebApiConceptSetItem[];
    try {
      items = await webApiConceptSetApi.getConceptSetItems(ref.externalId);
    } catch (error) {
      console.error(
        "[ConceptSetExpression] Failed to fetch items for WebAPI concept set %s",
        ref.externalId,
        error,
      );
      throw new ConceptSetExpressionError(
        `Failed to fetch items for WebAPI concept set ${ref.externalId}`,
      );
    }

    const conceptDetails = items.length > 0
      ? await getConceptsFromIdentifiers(
        token,
        datasetId,
        items.map((item) => item.conceptId),
      )
      : [];

    return {
      items: items.map((item) => {
        const detail = conceptDetails.find(
          (concept) => concept.CONCEPT_ID === item.conceptId,
        );
        return {
          concept: detail ?? buildPlaceholderConcept(item.conceptId),
          isExcluded: item.isExcluded === 1,
          includeDescendants: item.includeDescendants === 1,
          includeMapped: item.includeMapped === 1,
        };
      }),
    };
  }

  const terminologySvcApi = new TerminologySvcAPI(token);

  const terminologyConceptSet = await terminologySvcApi.getConceptSetById(
    datasetId,
    ref.externalId,
  );

  // Map results to webapi format
  const webapiConceptSetItems: IConceptSetItemsResponseDto = {
    items: terminologyConceptSet.concepts.map((terminologyConcept) => {
      return {
        concept: {
          CONCEPT_ID: terminologyConcept.conceptId,
          CONCEPT_NAME: terminologyConcept.display,
          STANDARD_CONCEPT: terminologyConcept.standardConcept,
          STANDARD_CONCEPT_CAPTION: terminologyConcept.concept,
          INVALID_REASON: _getInvalidReasonFromCaption(
            terminologyConcept.validity,
          ),
          INVALID_REASON_CAPTION: terminologyConcept.validity,
          CONCEPT_CODE: terminologyConcept.code,
          DOMAIN_ID: terminologyConcept.domainId,
          VOCABULARY_ID: terminologyConcept.vocabularyId,
          CONCEPT_CLASS_ID: terminologyConcept.conceptClassId,
          VALID_START_DATE: terminologyConcept.validStartDate,
          VALID_END_DATE: terminologyConcept.validEndDate,
        },
        includeDescendants: terminologyConcept.useDescendants,
        includeMapped: terminologyConcept.useMapped,
        isExcluded: terminologyConcept.isExcluded,
      };
    }),
  };
  return webapiConceptSetItems;
};

export const checkIfConceptSetExists = async (
  token: string,
  datasetId: string,
  conceptSetId: string | number,
  conceptSetName: string,
): Promise<number> => {
  const ref = parseConceptSetRef(conceptSetId);
  const terminologySvcApi = new TerminologySvcAPI(token);

  // Only the legacy store is probed here. The WebAPI store enforces name
  // uniqueness with the `uq_cs_name` constraint and reports a duplicate as
  // HTTP 409 on create and on update, which the routes map to a typed error.
  //
  // Asking WebAPI the same question needs `read:conceptset` or
  // `write:conceptset`. The `concept set creator` role holds neither, so a
  // researcher-only user was denied here and could never save a concept set,
  // even though the create itself was permitted. Atlas3 does not ask this
  // question at all.
  const terminologyConceptSets = await terminologySvcApi.getConceptSets(
    datasetId,
  );

  // For legacy refs we must exclude the same legacy row by id; for webapi
  // refs the legacy table is a disjoint namespace, so no row should match
  // the externalId (matching here would be a separate legacy row that
  // happens to share the name and is still a duplicate to surface).
  const result = terminologyConceptSets.find((terminologyConceptSet) =>
    ref.source === "legacy"
      ? terminologyConceptSet.id !== ref.externalId &&
        terminologyConceptSet.name === conceptSetName
      : terminologyConceptSet.name === conceptSetName
  );

  return result === undefined ? 0 : 1;
};

const parseDateValue = (value: string | number): number => {
  if (typeof value === "number") {
    return value;
  }
  return Date.parse(value);
};

// Used when a stored WebAPI concept set item no longer exists in the
// dataset's vocabulary, so the item stays visible instead of disappearing.
const buildPlaceholderConcept = (conceptId: number): IWebApiConcept => ({
  CONCEPT_ID: conceptId,
  CONCEPT_NAME: "",
  STANDARD_CONCEPT: null,
  STANDARD_CONCEPT_CAPTION: "",
  INVALID_REASON: null,
  INVALID_REASON_CAPTION: "",
  CONCEPT_CODE: "",
  DOMAIN_ID: "",
  VOCABULARY_ID: "",
  CONCEPT_CLASS_ID: "",
  VALID_START_DATE: 0,
  VALID_END_DATE: 0,
});

const mapWebApiConceptToIncludedConcept = (
  concept: IWebApiConcept,
  flags: { useMapped: boolean; useDescendants: boolean },
): IIncludedConcept => ({
  CONCEPT_ID: concept.CONCEPT_ID,
  CONCEPT_NAME: concept.CONCEPT_NAME,
  DOMAIN_ID: concept.DOMAIN_ID,
  VOCABULARY_ID: concept.VOCABULARY_ID,
  CONCEPT_CLASS_ID: concept.CONCEPT_CLASS_ID,
  STANDARD_CONCEPT: concept.STANDARD_CONCEPT,
  CONCEPT_CODE: concept.CONCEPT_CODE,
  VALID_START_DATE: parseDateValue(concept.VALID_START_DATE),
  VALID_END_DATE: parseDateValue(concept.VALID_END_DATE),
  INVALID_REASON: concept.INVALID_REASON,
  USEMAPPED: flags.useMapped,
  USEDESCENDANTS: flags.useDescendants,
});

const mapLegacyConceptToIncludedConcept = (
  concept: {
    conceptId: number;
    display: string;
    domainId: string;
    system: string;
    conceptClassId: string;
    standardConcept: string;
    code: string;
    validStartDate: string;
    validEndDate: string;
    validity: string;
    useMapped: boolean;
    useDescendants: boolean;
  },
): IIncludedConcept => ({
  CONCEPT_ID: concept.conceptId,
  CONCEPT_NAME: concept.display,
  DOMAIN_ID: concept.domainId,
  VOCABULARY_ID: concept.system,
  CONCEPT_CLASS_ID: concept.conceptClassId,
  STANDARD_CONCEPT: concept.standardConcept,
  CONCEPT_CODE: concept.code,
  VALID_START_DATE: Date.parse(concept.validStartDate),
  VALID_END_DATE: Date.parse(concept.validEndDate),
  INVALID_REASON: concept.validity,
  USEMAPPED: concept.useMapped,
  USEDESCENDANTS: concept.useDescendants,
});

const getLegacyIncludedConcepts = async (
  token: string,
  datasetId: string,
  externalIds: number[],
): Promise<IIncludedConcept[]> => {
  if (externalIds.length === 0) {
    return [];
  }

  const terminologySvcApi = new TerminologySvcAPI(token);
  const conceptSets = await Promise.all(
    externalIds.map((id) => terminologySvcApi.getConceptSetById(datasetId, id)),
  );

  const resolvedIds = await Promise.all(
    conceptSets.map((conceptSet) =>
      terminologySvcApi.resolveConceptSetExpression(
        datasetId,
        conceptSet.concepts.map((concept) => ({
          id: concept.id,
          useMapped: concept.useMapped,
          useDescendants: concept.useDescendants,
          isExcluded: concept.isExcluded,
        })),
      )
    ),
  );

  const allResolvedIds = Array.from(new Set(resolvedIds.flat()));
  const conceptDetails = allResolvedIds.length > 0
    ? await getConceptsFromIdentifiers(token, datasetId, allResolvedIds)
    : [];

  const result: IIncludedConcept[] = [];
  const seen = new Set<number>();

  for (const conceptSet of conceptSets) {
    const conceptFlagMap = new Map(
      conceptSet.concepts.map((concept) => [
        concept.id,
        {
          useMapped: concept.useMapped,
          useDescendants: concept.useDescendants,
        },
      ]),
    );

    for (const resolvedId of resolvedIds[conceptSets.indexOf(conceptSet)]) {
      if (seen.has(resolvedId)) {
        continue;
      }
      seen.add(resolvedId);

      const directConcept = conceptSet.concepts.find((c) =>
        c.id === resolvedId
      );
      if (directConcept) {
        result.push(mapLegacyConceptToIncludedConcept(directConcept));
        continue;
      }

      const detail = conceptDetails.find((c) => c.CONCEPT_ID === resolvedId);
      if (detail) {
        result.push({
          ...detail,
          VALID_START_DATE: parseDateValue(detail.VALID_START_DATE),
          VALID_END_DATE: parseDateValue(detail.VALID_END_DATE),
          USEMAPPED: false,
          USEDESCENDANTS: false,
        });
      }
    }
  }

  return result;
};

const getWebApiIncludedConcepts = async (
  token: string,
  datasetId: string,
  externalIds: number[],
): Promise<IIncludedConcept[]> => {
  if (externalIds.length === 0) {
    return [];
  }

  const webApiConceptSetApi = new WebApiConceptSetAPI(token);

  let conceptSetItems: IWebApiConceptSetItem[][];
  try {
    conceptSetItems = await Promise.all(
      externalIds.map((id) => webApiConceptSetApi.getConceptSetItems(id)),
    );
  } catch (error) {
    console.error(
      "[getIncludedConcepts] Failed to fetch items for WebAPI concept sets %s",
      externalIds,
      error,
    );
    throw new ConceptSetExpressionError(
      `Failed to fetch items for WebAPI concept sets ${externalIds}`,
    );
  }

  // Resolve through terminology-svc, same engine as the legacy path
  const terminologySvcApi = new TerminologySvcAPI(token);
  const resolvedIds = await Promise.all(
    conceptSetItems.map((items) =>
      items.length === 0
        ? Promise.resolve([])
        : terminologySvcApi.resolveConceptSetExpression(
          datasetId,
          items.map((item) => ({
            id: item.conceptId,
            useMapped: item.includeMapped === 1,
            useDescendants: item.includeDescendants === 1,
            isExcluded: item.isExcluded === 1,
          })),
        )
    ),
  );

  const allResolvedIds = Array.from(new Set(resolvedIds.flat()));
  const conceptDetails = (allResolvedIds.length > 0
    ? await getConceptsFromIdentifiers(token, datasetId, allResolvedIds)
    : []) as IWebApiConcept[];

  const result: IIncludedConcept[] = [];
  const seen = new Set<number>();

  for (const items of conceptSetItems) {
    const expressionFlagMap = new Map(
      items.map((item) => [
        item.conceptId,
        {
          useMapped: item.includeMapped === 1,
          useDescendants: item.includeDescendants === 1,
        },
      ]),
    );

    for (const resolvedId of resolvedIds[conceptSetItems.indexOf(items)]) {
      if (seen.has(resolvedId)) {
        continue;
      }
      seen.add(resolvedId);

      const detail = conceptDetails.find((c) => c.CONCEPT_ID === resolvedId);
      if (detail) {
        result.push(
          mapWebApiConceptToIncludedConcept(
            detail,
            expressionFlagMap.get(resolvedId) ?? {
              useMapped: false,
              useDescendants: false,
            },
          ),
        );
      }
    }
  }

  return result;
};

export const getIncludedConcepts = async (
  token: string,
  datasetId: string,
  conceptSetIds: string[],
): Promise<IIncludedConcept[]> => {
  const refs = conceptSetIds.map((id) => parseConceptSetRef(id));
  const legacyRefs = refs.filter((r) => r.source === "legacy");
  const webapiRefs = refs.filter((r) => r.source === "webapi");

  const [legacyConcepts, webapiConcepts] = await Promise.all([
    legacyRefs.length > 0
      ? getLegacyIncludedConcepts(
        token,
        datasetId,
        legacyRefs.map((r) => r.externalId),
      )
      : Promise.resolve([]),
    webapiRefs.length > 0
      ? getWebApiIncludedConcepts(
        token,
        datasetId,
        webapiRefs.map((r) => r.externalId),
      )
      : Promise.resolve([]),
  ]);

  const seen = new Set<number>();
  const result: IIncludedConcept[] = [];
  for (const concept of [...legacyConcepts, ...webapiConcepts]) {
    if (!seen.has(concept.CONCEPT_ID)) {
      seen.add(concept.CONCEPT_ID);
      result.push(concept);
    }
  }
  return result;
};

export const mapLegacyConceptSetToWebApiConceptSet = (
  conceptSet: ITerminologyConceptSet,
  currentUserId?: string,
): IConceptSetResponseDto => {
  return {
    createdDate: Date.parse(conceptSet.createdDate),
    createdBy: {
      name: conceptSet.userName,
    },
    modifiedDate: Date.parse(conceptSet.modifiedDate),
    modifiedBy: {
      name: conceptSet.userName,
    },
    tags: [],
    // A legacy set is writable only by its owner. A shared set owned by another
    // user reports no write access, so the UI does not offer an active Update
    // button. When the caller passes no user (for example in unit tests), keep
    // the historical writable default so behaviour is unchanged.
    hasWriteAccess: currentUserId
      ? conceptSet.createdBy === currentUserId
      : true,
    hasReadAccess: true,
    id: formatConceptSetRef({ source: "legacy", externalId: conceptSet.id }),
    externalId: conceptSet.id,
    name: conceptSet.name,
    shared: conceptSet.shared,
    source: "legacy",
  };
};

const getCurrentUserId = (token: string): string | undefined => {
  try {
    const encoded = token.replace(/^bearer\s+/i, "").split(".")[1];
    if (!encoded) {
      return undefined;
    }
    const base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
    const payload = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof payload.sub === "string" ? payload.sub : undefined;
  } catch {
    return undefined;
  }
};

export const mapWebApiConceptSetToFacadeConceptSet = (
  conceptSet: IWebApiConceptSetHeader,
): IConceptSetResponseDto => {
  return {
    createdDate: conceptSet.createdDate ?? Date.now(),
    createdBy: {
      name: conceptSet.createdBy?.name ?? "unknown",
      id: conceptSet.createdBy?.id,
      login: conceptSet.createdBy?.login,
    },
    modifiedDate: conceptSet.modifiedDate ?? Date.now(),
    modifiedBy: {
      name: conceptSet.modifiedBy?.name ?? "unknown",
      id: conceptSet.modifiedBy?.id,
      login: conceptSet.modifiedBy?.login,
    },
    tags: conceptSet.tags ?? [],
    hasWriteAccess: conceptSet.writeAccess ?? true,
    hasReadAccess: conceptSet.readAccess ?? true,
    id: formatConceptSetRef({ source: "webapi", externalId: conceptSet.id }),
    externalId: conceptSet.id,
    name: conceptSet.name,
    shared: false,
    description: conceptSet.description ?? undefined,
    source: "webapi",
  };
};
