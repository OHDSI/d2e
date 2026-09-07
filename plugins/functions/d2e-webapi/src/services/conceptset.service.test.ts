import { assertEquals, assertRejects } from "@std/assert";

// Stub the Trex global and SERVICE_ROUTES env BEFORE importing any module
// that constructs an API class or reads env at load time. Static imports
// are hoisted, so we use dynamic imports for the modules-under-test.
// deno-lint-ignore no-explicit-any
(globalThis as any).Trex = (globalThis as any).Trex ?? {
  tokioChannel: () => ({
    get: () => Promise.resolve({ data: undefined }),
    post: () => Promise.resolve({ data: undefined }),
    put: () => Promise.resolve({ data: undefined }),
    delete: () => Promise.resolve({ data: undefined }),
  }),
};

if (!Deno.env.get("SERVICE_ROUTES")) {
  Deno.env.set(
    "SERVICE_ROUTES",
    JSON.stringify({
      terminology: "http://localhost:0",
      portalServer: "http://localhost:0",
      bookmark: "http://localhost:0",
    }),
  );
}

const {
  getConceptSet,
  getConceptSetExpression,
  getConceptSetUsage,
  getIncludedConcepts,
  getConceptSets,
  checkIfConceptSetExists,
  mapLegacyConceptSetToWebApiConceptSet,
  mapWebApiConceptSetToFacadeConceptSet,
} = await import("./conceptset.service.ts");

const { ConceptSetExpressionError, ConceptSetNameConflictError } = await import(
  "../errors/ConceptSetErrors.ts"
);
const { WebApiConceptSetAPI } = await import("../api/WebApiConceptSetAPI.ts");
const { PortalServerAPI } = await import("../api/PortalServerAPI.ts");
const { BookmarksAPI } = await import("../api/BookmarksAPI.ts");
const { TerminologySvcAPI } = await import("../api/TerminologySvcAPI.ts");
const { TrexDAO } = await import("../dao/trex.dao.ts");

type IBookmarks = import("../api/types.ts").IBookmarks;
type ITerminologyConceptSet = import("../api/types.ts").ITerminologyConceptSet;
type IUserArtifactAtlasCohortDefinitionDto = import(
  "../dto/cohortdefinition.ts"
).IUserArtifactAtlasCohortDefinitionDto;
type IWebApiConcept = import("../api/WebApiConceptSetAPI.ts").IWebApiConcept;

Deno.test("legacy concept sets remain writable in facade responses", () => {
  const conceptSet = mapLegacyConceptSetToWebApiConceptSet({
    id: 15,
    name: "Legacy set",
    shared: true,
    concepts: [],
    userName: "legacy-owner",
    createdBy: "legacy-owner",
    modifiedBy: "legacy-owner",
    createdDate: "2026-05-01T00:00:00.000Z",
    modifiedDate: "2026-05-02T00:00:00.000Z",
  });

  assertEquals(conceptSet.id, "legacy:15");
  assertEquals(conceptSet.externalId, 15);
  assertEquals(conceptSet.hasReadAccess, true);
  assertEquals(conceptSet.hasWriteAccess, true);
  assertEquals(conceptSet.createdBy.name, "legacy-owner");
  assertEquals(conceptSet.shared, true);
  assertEquals(conceptSet.source, "legacy");
});

Deno.test("legacy concept sets are writable only for their owner", () => {
  const owned = mapLegacyConceptSetToWebApiConceptSet(
    {
      id: 21,
      name: "Owned legacy set",
      shared: false,
      concepts: [],
      userName: "owner-1",
      createdBy: "owner-1",
      modifiedBy: "owner-1",
      createdDate: "2026-05-01T00:00:00.000Z",
      modifiedDate: "2026-05-02T00:00:00.000Z",
    },
    "owner-1",
  );
  assertEquals(owned.hasWriteAccess, true);

  const sharedFromSomeoneElse = mapLegacyConceptSetToWebApiConceptSet(
    {
      id: 22,
      name: "Shared legacy set",
      shared: true,
      concepts: [],
      userName: "owner-1",
      createdBy: "owner-1",
      modifiedBy: "owner-1",
      createdDate: "2026-05-01T00:00:00.000Z",
      modifiedDate: "2026-05-02T00:00:00.000Z",
    },
    "current-user",
  );
  assertEquals(sharedFromSomeoneElse.hasWriteAccess, false);

  // Without a caller-provided user the historical writable default applies.
  const noUser = mapLegacyConceptSetToWebApiConceptSet({
    id: 23,
    name: "No user legacy set",
    shared: true,
    concepts: [],
    userName: "owner-1",
    createdBy: "owner-1",
    modifiedBy: "owner-1",
    createdDate: "2026-05-01T00:00:00.000Z",
    modifiedDate: "2026-05-02T00:00:00.000Z",
  });
  assertEquals(noUser.hasWriteAccess, true);
});

Deno.test("native WebAPI concept sets are exposed with compound facade ids", () => {
  const conceptSet = mapWebApiConceptSetToFacadeConceptSet({
    id: 42,
    name: "Native set",
    description: "Stored in OHDSI WebAPI",
    createdBy: {
      id: 9,
      login: "webapi-user",
      name: "WebAPI User",
    },
    modifiedBy: {
      id: 9,
      login: "webapi-user",
      name: "WebAPI User",
    },
    createdDate: 1714521600000,
    modifiedDate: 1714608000000,
    readAccess: true,
    writeAccess: true,
    tags: [],
  });

  assertEquals(conceptSet.id, "webapi:42");
  assertEquals(conceptSet.externalId, 42);
  assertEquals(conceptSet.source, "webapi");
  assertEquals(conceptSet.hasWriteAccess, true);
  assertEquals(conceptSet.createdBy.name, "WebAPI User");
  assertEquals(conceptSet.createdBy.login, "webapi-user");
  assertEquals(conceptSet.description, "Stored in OHDSI WebAPI");
  assertEquals(conceptSet.shared, false);
});

Deno.test("getConceptSet routes compound legacy id to terminology-svc", async () => {
  const originalGetConceptSet = TerminologySvcAPI.prototype.getConceptSet;
  let seenId: number | undefined;

  try {
    TerminologySvcAPI.prototype.getConceptSet = (
      id: number,
      _datasetId: string,
    ) => {
      seenId = id;
      return Promise.resolve({
        id,
        name: "Legacy via compound",
        shared: false,
        concepts: [],
        userName: "owner",
        createdBy: "owner",
        modifiedBy: "owner",
        createdDate: "2026-05-01T00:00:00.000Z",
        modifiedDate: "2026-05-02T00:00:00.000Z",
      } as any);
    };

    const result = await getConceptSet("token", "dataset-1", "legacy:869");

    assertEquals(seenId, 869);
    assertEquals(result.id, "legacy:869");
    assertEquals(result.externalId, 869);
    assertEquals(result.source, "legacy");
  } finally {
    TerminologySvcAPI.prototype.getConceptSet = originalGetConceptSet;
  }
});

Deno.test("getConceptSet routes compound webapi id to WebAPI", async () => {
  const originalGetConceptSet = WebApiConceptSetAPI.prototype.getConceptSet;
  let seenId: number | undefined;

  try {
    WebApiConceptSetAPI.prototype.getConceptSet = (id: number) => {
      seenId = id;
      return Promise.resolve({
        id,
        name: "WebAPI via compound",
        description: null,
        createdBy: { id: 1, login: "u", name: "U" },
        modifiedBy: { id: 1, login: "u", name: "U" },
        createdDate: 1,
        modifiedDate: 2,
        readAccess: true,
        writeAccess: true,
        tags: [],
      } as any);
    };

    const result = await getConceptSet("token", "dataset-1", "webapi:7");

    assertEquals(seenId, 7);
    assertEquals(result.id, "webapi:7");
    assertEquals(result.externalId, 7);
    assertEquals(result.source, "webapi");
  } finally {
    WebApiConceptSetAPI.prototype.getConceptSet = originalGetConceptSet;
  }
});

Deno.test("getConceptSet back-compat: bare numeric id routes to terminology-svc", async () => {
  const originalGetConceptSet = TerminologySvcAPI.prototype.getConceptSet;
  let seenId: number | undefined;

  try {
    TerminologySvcAPI.prototype.getConceptSet = (
      id: number,
      _datasetId: string,
    ) => {
      seenId = id;
      return Promise.resolve({
        id,
        name: "Legacy bare",
        shared: false,
        concepts: [],
        userName: "owner",
        createdBy: "owner",
        modifiedBy: "owner",
        createdDate: "2026-05-01T00:00:00.000Z",
        modifiedDate: "2026-05-02T00:00:00.000Z",
      } as any);
    };

    const result = await getConceptSet("token", "dataset-1", 869);

    assertEquals(seenId, 869);
    assertEquals(result.id, "legacy:869");
    assertEquals(result.source, "legacy");
  } finally {
    TerminologySvcAPI.prototype.getConceptSet = originalGetConceptSet;
  }
});

Deno.test("getConceptSet back-compat: offset-encoded numeric id routes to WebAPI", async () => {
  const originalGetConceptSet = WebApiConceptSetAPI.prototype.getConceptSet;
  let seenId: number | undefined;

  try {
    WebApiConceptSetAPI.prototype.getConceptSet = (id: number) => {
      seenId = id;
      return Promise.resolve({
        id,
        name: "WebAPI offset",
        description: null,
        createdBy: { id: 1, login: "u", name: "U" },
        modifiedBy: { id: 1, login: "u", name: "U" },
        createdDate: 1,
        modifiedDate: 2,
        readAccess: true,
        writeAccess: true,
        tags: [],
      } as any);
    };

    const result = await getConceptSet("token", "dataset-1", 1_000_000_007);

    assertEquals(seenId, 7);
    assertEquals(result.id, "webapi:7");
    assertEquals(result.externalId, 7);
    assertEquals(result.source, "webapi");
  } finally {
    WebApiConceptSetAPI.prototype.getConceptSet = originalGetConceptSet;
  }
});

Deno.test("WebAPI concept set expression fetches items and enriches concept details", async () => {
  const originalGetConceptSetItems =
    WebApiConceptSetAPI.prototype.getConceptSetItems;
  const originalGetTrexDao = TrexDAO.getTrexDao;

  try {
    WebApiConceptSetAPI.prototype.getConceptSetItems = (id: number) => {
      assertEquals(id, 1);
      return Promise.resolve([
        {
          conceptId: 1,
          isExcluded: 0,
          includeDescendants: 1,
          includeMapped: 0,
        },
      ]);
    };

    TrexDAO.getTrexDao = async (_token: string, _datasetId: string) => {
      return {
        getConceptsFromIdentifiers: (conceptIds: number[]) => {
          assertEquals(conceptIds, [1]);
          return Promise.resolve([
            {
              CONCEPT_ID: 1,
              CONCEPT_NAME: "Test Concept",
              STANDARD_CONCEPT: null,
              STANDARD_CONCEPT_CAPTION: "",
              INVALID_REASON: null,
              INVALID_REASON_CAPTION: "",
              CONCEPT_CODE: "123",
              DOMAIN_ID: "Condition",
              VOCABULARY_ID: "SNOMED",
              CONCEPT_CLASS_ID: "Clinical Finding",
              VALID_START_DATE: "2020-01-01",
              VALID_END_DATE: "2099-12-31",
            },
          ]);
        },
      } as any;
    };

    const result = await getConceptSetExpression(
      "token",
      "dataset-1",
      "webapi:1",
    );

    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].concept.CONCEPT_NAME, "Test Concept");
    assertEquals(result.items[0].includeDescendants, true);
    assertEquals(result.items[0].includeMapped, false);
    assertEquals(result.items[0].isExcluded, false);
  } finally {
    WebApiConceptSetAPI.prototype.getConceptSetItems =
      originalGetConceptSetItems;
    TrexDAO.getTrexDao = originalGetTrexDao;
  }
});

Deno.test("WebAPI concept set expression keeps items missing from vocabulary as placeholders", async () => {
  const originalGetConceptSetItems =
    WebApiConceptSetAPI.prototype.getConceptSetItems;
  const originalGetTrexDao = TrexDAO.getTrexDao;

  try {
    WebApiConceptSetAPI.prototype.getConceptSetItems = () =>
      Promise.resolve([
        {
          conceptId: 999,
          isExcluded: 1,
          includeDescendants: 0,
          includeMapped: 1,
        },
      ]);

    TrexDAO.getTrexDao = async (_token: string, _datasetId: string) => {
      return {
        getConceptsFromIdentifiers: (_conceptIds: number[]) =>
          Promise.resolve([]),
      } as any;
    };

    const result = await getConceptSetExpression(
      "token",
      "dataset-1",
      "webapi:1",
    );

    assertEquals(result.items.length, 1);
    assertEquals(result.items[0].concept.CONCEPT_ID, 999);
    assertEquals(result.items[0].concept.CONCEPT_NAME, "");
    assertEquals(result.items[0].isExcluded, true);
    assertEquals(result.items[0].includeMapped, true);
  } finally {
    WebApiConceptSetAPI.prototype.getConceptSetItems =
      originalGetConceptSetItems;
    TrexDAO.getTrexDao = originalGetTrexDao;
  }
});

Deno.test("WebAPI concept set expression wraps item fetch failures", async () => {
  const originalGetConceptSetItems =
    WebApiConceptSetAPI.prototype.getConceptSetItems;

  try {
    WebApiConceptSetAPI.prototype.getConceptSetItems = () =>
      Promise.reject(new Error("Failed to fetch WebAPI concept set items 1: 500"));

    const error = await assertRejects(
      () => getConceptSetExpression("token", "dataset-1", "webapi:1"),
      ConceptSetExpressionError,
    );
    assertEquals(
      error.message,
      "Failed to fetch items for WebAPI concept set 1",
    );
  } finally {
    WebApiConceptSetAPI.prototype.getConceptSetItems =
      originalGetConceptSetItems;
  }
});

Deno.test("getIncludedConcepts returns empty array for empty input", async () => {
  const result = await getIncludedConcepts("token", "dataset-1", []);
  assertEquals(result, []);
});

Deno.test("getIncludedConcepts resolves legacy concept sets through terminology-svc", async () => {
  const originalGetConceptSetById = TerminologySvcAPI.prototype.getConceptSetById;
  const originalResolveConceptSetExpression =
    TerminologySvcAPI.prototype.resolveConceptSetExpression;
  const originalGetTrexDao = TrexDAO.getTrexDao;

  try {
    TerminologySvcAPI.prototype.getConceptSetById = (_datasetId: string, id: number) => {
      return Promise.resolve({
        id,
        name: "Legacy set",
        shared: false,
        userName: "owner",
        createdBy: "owner",
        modifiedBy: "owner",
        createdDate: "2026-05-01T00:00:00.000Z",
        modifiedDate: "2026-05-02T00:00:00.000Z",
        concepts: [
          {
            id: 101,
            useMapped: true,
            useDescendants: true,
            isExcluded: false,
            conceptId: 101,
            display: "Legacy Concept",
            domainId: "Condition",
            system: "SNOMED",
            conceptClassId: "Clinical Finding",
            standardConcept: "S",
            code: "legacy-code",
            validStartDate: "2020-01-01",
            validEndDate: "2099-12-31",
            validity: "V",
            conceptCode: "legacy-code",
            conceptName: "Legacy Concept",
            vocabularyId: "SNOMED",
          },
        ],
      } as any);
    };

    TerminologySvcAPI.prototype.resolveConceptSetExpression = (_datasetId: string, concepts: any[]) => {
      return Promise.resolve(concepts.map((c) => c.id));
    };

    TrexDAO.getTrexDao = async (_token: string, _datasetId: string) => {
      return {
        getConceptsFromIdentifiers: (_conceptIds: number[]) => Promise.resolve([]),
      } as any;
    };

    const result = await getIncludedConcepts("token", "dataset-1", ["legacy:1"]);

    assertEquals(result.length, 1);
    assertEquals(result[0].CONCEPT_ID, 101);
    assertEquals(result[0].CONCEPT_NAME, "Legacy Concept");
    assertEquals(result[0].USEMAPPED, true);
    assertEquals(result[0].USEDESCENDANTS, true);
  } finally {
    TerminologySvcAPI.prototype.getConceptSetById = originalGetConceptSetById;
    TerminologySvcAPI.prototype.resolveConceptSetExpression =
      originalResolveConceptSetExpression;
    TrexDAO.getTrexDao = originalGetTrexDao;
  }
});

Deno.test("getIncludedConcepts resolves webapi concept sets via terminology-svc", async () => {
  const originalGetConceptSetItems =
    WebApiConceptSetAPI.prototype.getConceptSetItems;
  const originalResolveConceptSetExpression =
    TerminologySvcAPI.prototype.resolveConceptSetExpression;
  const originalGetTrexDao = TrexDAO.getTrexDao;

  const toWebApiConcept = (id: number): IWebApiConcept => ({
    CONCEPT_ID: id,
    CONCEPT_NAME: `Resolved ${id}`,
    STANDARD_CONCEPT: "S",
    STANDARD_CONCEPT_CAPTION: "Standard",
    INVALID_REASON: null,
    INVALID_REASON_CAPTION: "Valid",
    CONCEPT_CODE: `code-${id}`,
    DOMAIN_ID: "Condition",
    VOCABULARY_ID: "SNOMED",
    CONCEPT_CLASS_ID: "Clinical Finding",
    VALID_START_DATE: "2020-01-01",
    VALID_END_DATE: "2099-12-31",
  });

  try {
    WebApiConceptSetAPI.prototype.getConceptSetItems = (id: number) => {
      assertEquals(id, 1);
      return Promise.resolve([
        {
          conceptId: 201,
          isExcluded: 0,
          includeDescendants: 1,
          includeMapped: 0,
        },
      ]);
    };

    TerminologySvcAPI.prototype.resolveConceptSetExpression = (
      _datasetId: string,
      concepts: any[],
    ) => {
      assertEquals(concepts, [
        {
          id: 201,
          useMapped: false,
          useDescendants: true,
          isExcluded: false,
        },
      ]);
      return Promise.resolve([201, 202]);
    };

    TrexDAO.getTrexDao = async (_token: string, _datasetId: string) => {
      return {
        getConceptsFromIdentifiers: (conceptIds: number[]) =>
          Promise.resolve(conceptIds.map(toWebApiConcept)),
      } as any;
    };

    const result = await getIncludedConcepts("token", "dataset-1", ["webapi:1"]);

    assertEquals(result.length, 2);
    const directConcept = result.find((c) => c.CONCEPT_ID === 201);
    const descendantConcept = result.find((c) => c.CONCEPT_ID === 202);

    assertEquals(directConcept?.CONCEPT_NAME, "Resolved 201");
    assertEquals(directConcept?.USEDESCENDANTS, true);
    assertEquals(directConcept?.USEMAPPED, false);
    assertEquals(descendantConcept?.CONCEPT_NAME, "Resolved 202");
    assertEquals(descendantConcept?.USEDESCENDANTS, false);
    assertEquals(descendantConcept?.USEMAPPED, false);
  } finally {
    WebApiConceptSetAPI.prototype.getConceptSetItems =
      originalGetConceptSetItems;
    TerminologySvcAPI.prototype.resolveConceptSetExpression =
      originalResolveConceptSetExpression;
    TrexDAO.getTrexDao = originalGetTrexDao;
  }
});

Deno.test("getIncludedConcepts deduplicates concepts across mixed sources", async () => {
  const originalGetConceptSetById = TerminologySvcAPI.prototype.getConceptSetById;
  const originalResolveConceptSetExpressionTerm =
    TerminologySvcAPI.prototype.resolveConceptSetExpression;
  const originalGetTrexDao = TrexDAO.getTrexDao;
  const originalGetConceptSetItems =
    WebApiConceptSetAPI.prototype.getConceptSetItems;

  try {
    TerminologySvcAPI.prototype.getConceptSetById = (_datasetId: string, id: number) => {
      return Promise.resolve({
        id,
        name: "Legacy set",
        shared: false,
        userName: "owner",
        createdBy: "owner",
        modifiedBy: "owner",
        createdDate: "2026-05-01T00:00:00.000Z",
        modifiedDate: "2026-05-02T00:00:00.000Z",
        concepts: [
          {
            id: 301,
            useMapped: false,
            useDescendants: false,
            isExcluded: false,
            conceptId: 301,
            display: "Shared Concept",
            domainId: "Condition",
            system: "SNOMED",
            conceptClassId: "Clinical Finding",
            standardConcept: "S",
            code: "shared-code",
            validStartDate: "2020-01-01",
            validEndDate: "2099-12-31",
            validity: "V",
            conceptCode: "shared-code",
            conceptName: "Shared Concept",
            vocabularyId: "SNOMED",
          },
        ],
      } as any);
    };

    TerminologySvcAPI.prototype.resolveConceptSetExpression = (_datasetId: string, concepts: any[]) => {
      return Promise.resolve(concepts.map((c) => c.id));
    };

    TrexDAO.getTrexDao = async (_token: string, _datasetId: string) => {
      return {
        getConceptsFromIdentifiers: (_conceptIds: number[]) => Promise.resolve([]),
      } as any;
    };

    WebApiConceptSetAPI.prototype.getConceptSetItems = (_id: number) => {
      return Promise.resolve([
        {
          conceptId: 301,
          isExcluded: 0,
          includeDescendants: 1,
          includeMapped: 1,
        },
      ]);
    };

    const result = await getIncludedConcepts("token", "dataset-1", [
      "legacy:1",
      "webapi:2",
    ]);

    assertEquals(result.length, 1);
    assertEquals(result[0].CONCEPT_ID, 301);
    // Legacy appears first in the combined list, so its flags win.
    assertEquals(result[0].USEMAPPED, false);
    assertEquals(result[0].USEDESCENDANTS, false);
  } finally {
    TerminologySvcAPI.prototype.getConceptSetById = originalGetConceptSetById;
    TerminologySvcAPI.prototype.resolveConceptSetExpression =
      originalResolveConceptSetExpressionTerm;
    TrexDAO.getTrexDao = originalGetTrexDao;
    WebApiConceptSetAPI.prototype.getConceptSetItems =
      originalGetConceptSetItems;
  }
});

Deno.test("getConceptSetUsage detects cohort usage via ConceptSets[].conceptSetId", async () => {
  const originalGetAtlasCohortDefinitionList =
    PortalServerAPI.prototype.getAtlasCohortDefinitionList;
  const originalGetAllBookmarks = BookmarksAPI.prototype.getAllBookmarks;

  try {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList = () =>
      Promise.resolve([
        {
          id: 1,
          name: "Cohort using legacy:7",
          description: null,
          expressionType: "type",
          expression: {
            ConceptSets: [
              { id: 0, name: "Set", expression: { items: [] }, conceptSetId: "legacy:7" },
            ],
            PrimaryCriteria: {
              CriteriaList: [{ ConditionOccurrence: { CodesetId: 0 } }],
            },
          },
          createdBy: null,
          createdDate: null,
          modifiedBy: null,
          modifiedDate: null,
          tags: [],
        },
      ] as unknown as IUserArtifactAtlasCohortDefinitionDto[]);
    BookmarksAPI.prototype.getAllBookmarks = () =>
      Promise.resolve({ bookmarks: [], schemaName: "test" } as unknown as IBookmarks);

    const result = await getConceptSetUsage("token", "dataset-1", "legacy:7");

    assertEquals(result.inUse, true);
    assertEquals(result.cohortDefinitions.length, 1);
    assertEquals(result.cohortDefinitions[0].name, "Cohort using legacy:7");
    assertEquals(result.bookmarks.length, 0);
  } finally {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList =
      originalGetAtlasCohortDefinitionList;
    BookmarksAPI.prototype.getAllBookmarks = originalGetAllBookmarks;
  }
});

Deno.test("getConceptSetUsage detects webapi concept set in cohort by compound id", async () => {
  const originalGetAtlasCohortDefinitionList =
    PortalServerAPI.prototype.getAtlasCohortDefinitionList;
  const originalGetAllBookmarks = BookmarksAPI.prototype.getAllBookmarks;

  try {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList = () =>
      Promise.resolve([
        {
          id: 2,
          name: "Cohort using webapi:7",
          description: null,
          expressionType: "type",
          expression: {
            ConceptSets: [
              { id: 0, name: "Set", expression: { items: [] }, conceptSetId: "webapi:7" },
            ],
            PrimaryCriteria: {
              CriteriaList: [{ ConditionOccurrence: { CodesetId: 0 } }],
            },
          },
          createdBy: null,
          createdDate: null,
          modifiedBy: null,
          modifiedDate: null,
          tags: [],
        },
      ] as unknown as IUserArtifactAtlasCohortDefinitionDto[]);
    BookmarksAPI.prototype.getAllBookmarks = () =>
      Promise.resolve({ bookmarks: [], schemaName: "test" } as unknown as IBookmarks);

    const result = await getConceptSetUsage("token", "dataset-1", "webapi:7");

    assertEquals(result.inUse, true);
    assertEquals(result.cohortDefinitions.length, 1);
    assertEquals(result.bookmarks.length, 0);
  } finally {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList =
      originalGetAtlasCohortDefinitionList;
    BookmarksAPI.prototype.getAllBookmarks = originalGetAllBookmarks;
  }
});

Deno.test("getConceptSetUsage detects bookmark usage by exact value match", async () => {
  const originalGetAtlasCohortDefinitionList =
    PortalServerAPI.prototype.getAtlasCohortDefinitionList;
  const originalGetAllBookmarks = BookmarksAPI.prototype.getAllBookmarks;

  try {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList = () =>
      Promise.resolve([] as unknown as IUserArtifactAtlasCohortDefinitionDto[]);
    BookmarksAPI.prototype.getAllBookmarks = () =>
      Promise.resolve({
        bookmarks: [
          {
            bmkId: "b1",
            bookmarkname: "Bookmark using legacy:7",
            bookmark: JSON.stringify({
              filter: {
                cards: {
                  content: [
                    {
                      attributes: [
                        {
                          value: [{ value: "legacy:7", display_value: "Set" }],
                        },
                      ],
                    },
                  ],
                },
              },
            }),
            viewname: null,
            modified: "2026-01-01",
            version: 1,
            user_id: "u1",
            shared: false,
          },
        ],
        schemaName: "test",
      } as unknown as IBookmarks);

    const result = await getConceptSetUsage("token", "dataset-1", "legacy:7");

    assertEquals(result.inUse, true);
    assertEquals(result.cohortDefinitions.length, 0);
    assertEquals(result.bookmarks.length, 1);
    assertEquals(result.bookmarks[0].name, "Bookmark using legacy:7");
  } finally {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList =
      originalGetAtlasCohortDefinitionList;
    BookmarksAPI.prototype.getAllBookmarks = originalGetAllBookmarks;
  }
});

Deno.test("getConceptSetUsage does not false-positive on substring bookmark values", async () => {
  const originalGetAtlasCohortDefinitionList =
    PortalServerAPI.prototype.getAtlasCohortDefinitionList;
  const originalGetAllBookmarks = BookmarksAPI.prototype.getAllBookmarks;

  try {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList = () =>
      Promise.resolve([] as unknown as IUserArtifactAtlasCohortDefinitionDto[]);
    BookmarksAPI.prototype.getAllBookmarks = () =>
      Promise.resolve({
        bookmarks: [
          {
            bmkId: "b1",
            bookmarkname: "Bookmark using legacy:70",
            bookmark: JSON.stringify({
              filter: {
                cards: {
                  content: [
                    {
                      attributes: [
                        {
                          value: [{ value: "legacy:70", display_value: "Set" }],
                        },
                      ],
                    },
                  ],
                },
              },
            }),
            viewname: null,
            modified: "2026-01-01",
            version: 1,
            user_id: "u1",
            shared: false,
          },
        ],
        schemaName: "test",
      } as unknown as IBookmarks);

    const result = await getConceptSetUsage("token", "dataset-1", "legacy:7");

    assertEquals(result.inUse, false);
    assertEquals(result.cohortDefinitions.length, 0);
    assertEquals(result.bookmarks.length, 0);
  } finally {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList =
      originalGetAtlasCohortDefinitionList;
    BookmarksAPI.prototype.getAllBookmarks = originalGetAllBookmarks;
  }
});

Deno.test("getConceptSetUsage does not confuse legacy and webapi concept sets with the same external id", async () => {
  const originalGetAtlasCohortDefinitionList =
    PortalServerAPI.prototype.getAtlasCohortDefinitionList;
  const originalGetAllBookmarks = BookmarksAPI.prototype.getAllBookmarks;

  try {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList = () =>
      Promise.resolve([
        {
          id: 3,
          name: "Cohort using legacy:7",
          description: null,
          expressionType: "type",
          expression: {
            ConceptSets: [
              { id: 0, name: "Set", expression: { items: [] }, conceptSetId: "legacy:7" },
            ],
            PrimaryCriteria: {
              CriteriaList: [{ ConditionOccurrence: { CodesetId: 0 } }],
            },
          },
          createdBy: null,
          createdDate: null,
          modifiedBy: null,
          modifiedDate: null,
          tags: [],
        },
      ] as unknown as IUserArtifactAtlasCohortDefinitionDto[]);
    BookmarksAPI.prototype.getAllBookmarks = () =>
      Promise.resolve({ bookmarks: [], schemaName: "test" } as unknown as IBookmarks);

    const result = await getConceptSetUsage("token", "dataset-1", "webapi:7");

    assertEquals(result.inUse, false);
    assertEquals(result.cohortDefinitions.length, 0);
    assertEquals(result.bookmarks.length, 0);
  } finally {
    PortalServerAPI.prototype.getAtlasCohortDefinitionList =
      originalGetAtlasCohortDefinitionList;
    BookmarksAPI.prototype.getAllBookmarks = originalGetAllBookmarks;
  }
});

Deno.test("getConceptSets propagates WebAPI errors instead of returning silent empty list", async () => {
  const originalGetConceptSetsTerm = TerminologySvcAPI.prototype.getConceptSets;
  const originalGetConceptSetsWeb = WebApiConceptSetAPI.prototype.getConceptSets;

  try {
    TerminologySvcAPI.prototype.getConceptSets = () =>
      Promise.resolve([] as unknown as ITerminologyConceptSet[]);
    WebApiConceptSetAPI.prototype.getConceptSets = () =>
      Promise.reject(new Error("WebAPI unavailable"));

    await assertRejects(
      () => getConceptSets("token", "dataset-1"),
      Error,
      "WebAPI unavailable",
    );
  } finally {
    TerminologySvcAPI.prototype.getConceptSets = originalGetConceptSetsTerm;
    WebApiConceptSetAPI.prototype.getConceptSets = originalGetConceptSetsWeb;
  }
});

Deno.test("checkIfConceptSetExists checks the legacy store only", async () => {
  // WebAPI is deliberately not asked. Its `uq_cs_name` constraint rejects a
  // duplicate at write time, and asking it here needs a permission that the
  // `concept set creator` role does not hold.
  const originalGetConceptSetsTerm = TerminologySvcAPI.prototype.getConceptSets;

  try {
    let legacyCalls = 0;
    TerminologySvcAPI.prototype.getConceptSets = () => {
      legacyCalls += 1;
      return Promise.resolve([] as unknown as ITerminologyConceptSet[]);
    };

    const result = await checkIfConceptSetExists(
      "token",
      "dataset-1",
      "webapi:7",
      "Name",
    );

    assertEquals(result, 0);
    assertEquals(legacyCalls, 1);
  } finally {
    TerminologySvcAPI.prototype.getConceptSets = originalGetConceptSetsTerm;
  }
});

Deno.test("checkIfConceptSetExists reports a legacy concept set with the same name", async () => {
  const originalGetConceptSetsTerm = TerminologySvcAPI.prototype.getConceptSets;

  try {
    TerminologySvcAPI.prototype.getConceptSets = () =>
      Promise.resolve(
        [{ id: 3, name: "Name" }] as unknown as ITerminologyConceptSet[],
      );

    assertEquals(
      await checkIfConceptSetExists("token", "dataset-1", "webapi:7", "Name"),
      1,
    );
  } finally {
    TerminologySvcAPI.prototype.getConceptSets = originalGetConceptSetsTerm;
  }
});

Deno.test("checkIfConceptSetExists excludes the legacy row being renamed", async () => {
  const originalGetConceptSetsTerm = TerminologySvcAPI.prototype.getConceptSets;

  try {
    TerminologySvcAPI.prototype.getConceptSets = () =>
      Promise.resolve(
        [{ id: 3, name: "Name" }] as unknown as ITerminologyConceptSet[],
      );

    // Renaming legacy:3 to the name it already holds is not a duplicate.
    assertEquals(
      await checkIfConceptSetExists("token", "dataset-1", "legacy:3", "Name"),
      0,
    );
  } finally {
    TerminologySvcAPI.prototype.getConceptSets = originalGetConceptSetsTerm;
  }
});

Deno.test("WebApiConceptSetAPI.createConceptSet maps a 409 to a name conflict", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 409 }))) as typeof fetch;

    const api = new WebApiConceptSetAPI("token");
    const error = await assertRejects(
      () => api.createConceptSet({ name: "Taken" }),
      ConceptSetNameConflictError,
    );
    assertEquals(error.conceptSetName, "Taken");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("WebApiConceptSetAPI.updateConceptSet maps a 409 to a name conflict", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 409 }))) as typeof fetch;

    const api = new WebApiConceptSetAPI("token");
    const error = await assertRejects(
      () => api.updateConceptSet(7, { id: 7, name: "Taken" }),
      ConceptSetNameConflictError,
    );
    assertEquals(error.conceptSetName, "Taken");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("WebApiConceptSetAPI.createConceptSet keeps other failures as plain errors", async () => {
  const originalFetch = globalThis.fetch;

  try {
    globalThis.fetch = (() =>
      Promise.resolve(new Response(null, { status: 500 }))) as typeof fetch;

    const api = new WebApiConceptSetAPI("token");
    const error = await assertRejects(
      () => api.createConceptSet({ name: "Any" }),
      Error,
      "Failed to create WebAPI concept set: 500",
    );
    assertEquals(error instanceof ConceptSetNameConflictError, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
