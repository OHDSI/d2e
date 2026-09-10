import { z } from "zod";
import { CohortExpression } from "../types.ts";

export interface ICohortDefinitionSyntax {
  atlasCohortDefinitionId: number;
  datasetId: string;
  expressionType: string;
  expression: z.infer<typeof CohortExpression> | string;
  tags: string[];
}
// Construct response into OMOP cohort definition format
export interface ICohortDefinition {
  name: string;
  description: string | null;
  syntax: ICohortDefinitionSyntax;
}

/**
 * A `COHORT_DEFINITION` row from
 * `GET /analytics-svc/api/services/cohort-definition`. That query aliases
 * every column, so the field names come back uppercase.
 */
export interface IAnalyticsCohortDefinition {
  COHORT_DEFINITION_ID: number;
  COHORT_DEFINITION_NAME: string;
  COHORT_DEFINITION_DESCRIPTION: string;
  DEFINITION_TYPE_CONCEPT_ID: number;
  COHORT_DEFINITION_SYNTAX: string;
  SUBJECT_CONCEPT_ID: number;
  COHORT_INITIATION_DATE: string;
}

export interface ICohortGeneratorFlowRun {
  datasetId: string;
  databaseCode: string;
  cacheId: string;
  schemaName: string;
  resultsSchemaName: string;
  vocabSchemaName: string;
  cohortJson: ICohortJsonType;
  description: string | null;
  cohortDefinitionId: number;
}

export interface ICohortJsonType {
  id: number;
  name: string;
  createdDate: number;
  modifiedDate: number;
  hasWriteAccess: boolean;
  tags: string[];
  expressionType: string;
  expression: z.infer<typeof CohortExpression> | string;
}

export interface IResolveConceptSetExpressionConcept {
  id: number;
  useMapped: boolean;
  useDescendants: boolean;
  isExcluded: boolean;
}

export interface ITerminologyConceptSetConcept {
  id: number;
  useMapped: boolean;
  useDescendants: boolean;
  isExcluded: boolean;
}

export interface ITerminologyConceptSetConceptWithConceptData {
  conceptId: number;
  display: string;
  domainId: string;
  system: string;
  conceptClassId: string;
  standardConcept: string;
  concept: string;
  code: string;
  validStartDate: string;
  validEndDate: string;
  validity: string;
  id: number;
  useMapped: boolean;
  useDescendants: boolean;
  isExcluded: boolean;
  conceptCode: string;
  conceptName: string;
  vocabularyId: string;
}

export interface ITerminologyConceptSetWithConceptData {
  id: number;
  name: string;
  shared: boolean;
  concepts: ITerminologyConceptSetConceptWithConceptData[];
  userName: string;
  createdBy: string;
  modifiedBy: string;
  createdDate: string;
  modifiedDate: string;
}

export interface ITerminologyConceptSet {
  id: number;
  name: string;
  shared: boolean;
  concepts: ITerminologyConceptSetConcept[];
  userName: string;
  createdBy: string;
  modifiedBy: string;
  createdDate: string;
  modifiedDate: string;
}

export interface ITerminologyFhirConcept {
  conceptId: number;
  display: string;
  domainId: string;
  system: string;
  conceptClassId: string;
  standardConcept: string;
  concept: string;
  code: string;
  validStartDate: string;
  validEndDate: string;
  validity: string;
  score?: number;
}
export interface ITerminologyFhirResource {
  resourceType: string;
  expansion: {
    total: number;
    offset: number;
    timestamp: string;
    contains: ITerminologyFhirConcept[];
  };
}

export interface ITerminologyConcept {
  concept_id: number;
  concept_name: string;
  domain_id: string;
  vocabulary_id: string;
  concept_class_id: string;
  standard_concept: string;
  concept_code: string;
  valid_start_date: string;
  valid_end_date: string;
  invalid_reason: string | null;
}

export interface ITerminologyCreateConceptSet {
  concepts: ITerminologyConceptSetConcept[];
  name: string;
  shared: boolean;
  userName: string;
}

const TerminologyFiltersSchema = z
  .object({
    conceptClassId: z.array(z.string()).default([]),
    domainId: z.array(z.string()).default([]),
    standardConcept: z.array(z.string()).default([]),
    vocabularyId: z.array(z.string()).default([]),
    validity: z.array(z.enum(["Valid", "Invalid"])).default([]),
  })
  .default({
    conceptClassId: [],
    domainId: [],
    standardConcept: [],
    vocabularyId: [],
    validity: [],
  });
export type ITerminologyFiltersSchema = z.infer<
  typeof TerminologyFiltersSchema
>;

export interface PortalUserArtifacts {
  createdBy: string;
  createdDate: string;
  modifiedBy: string;
  modifiedDate: string;
  userId: string;
  artifacts: unknown;
}

export const AtlasCohortDefinitionSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  createdBy: z.string().nullable(), // Atlas usernames are numbers, but string for d2e
  createdDate: z.number().nullable(),
  modifiedBy: z.string().nullable(), // Atlas usernames are numbers, but string for d2e
  modifiedDate: z.number().nullable(),
  hasWriteAccess: z.boolean(),
  hasReadAccess: z.boolean(),
  tags: z.array(z.string()),
  cohortDefinitionId: z.number().optional(),
});
export type IAtlasCohortDefinition = z.infer<
  typeof AtlasCohortDefinitionSchema
>;

export const BookmarkSchema = z.object({
  bmkId: z.string(),
  bookmarkname: z.string(),
  bookmark: z.string(),
  viewname: z.string().nullable(),
  modified: z.string(),
  version: z.number().nullable(),
  user_id: z.string(),
  shared: z.boolean(),
  cohortDefinitionId: z.number().optional(),
  paConfigId: z.string().optional(),
});
export type IBookmark = z.infer<typeof BookmarkSchema>;

export const MaterializedCohortSchema = z.object({
  id: z.number(),
  patientCount: z.number(),
  cohortDefinitionName: z.string(),
  createdOn: z.union([z.number(), z.string()]),
  description: z.string(),
  syntax: z.string().optional(),
});
export type IMaterializedCohort = z.infer<typeof MaterializedCohortSchema>;

export const BookmarksSchema = z.object({
  bookmarks: z.array(BookmarkSchema),
  schemaName: z.string(),
});

// The list endpoint returns bookmarks and materialized cohorts only.
export const CombinedCohortDefinitionListSchema = z.union([
  BookmarkSchema,
  MaterializedCohortSchema,
]);

export type ICombinedCohortDefnitionListItem = z.infer<
  typeof CombinedCohortDefinitionListSchema
>;

export type IBookmarks = z.infer<typeof BookmarksSchema>;

export interface IUserMe {
  id: string;
  username: string;
}

export interface IDataset {
  databaseName: string;
  databaseCode: string;
  cacheId: string | null;
  id: string;
  dialect: string;
  schemaName: string;
  resultsSchemaName: string;
  vocabSchemaName: string;
  dataModel: string;
  plugin: string;
  attributes: string[];
  tags: string[];
  dashboards: string[];
  tenant: {
    id: string;
    name: string;
    system: string;
  };
  tokenStudyCode: string;
  studyDetail: {
    name: string;
    id: string;
    description: string;
    summary: string;
    showRequestAccess: boolean;
  };
  sourceStudyId?: string | null;
}

export interface IFilterValue {
  datasetId?: string;
  bookmarkId?: string;
  atlasCohortDefinitionId?: number;
}

export interface IBaseMaterializedCohort {
  id: number;
  name: string;
  description: string;
  creationTimestamp: string;
  syntax: string;
  patientCount: number;
}

/**
 * A materialized cohort in its cached form, as analytics-svc stores it in
 * `analytics.cohort_cache`: the cohort shape minus `patientIds`, which is
 * never cached because the cache must not hold subject identifiers.
 *
 * The matching interface below is hand-written rather than `z.infer`red: this
 * package compiles with `strict: false`, and without `strictNullChecks` zod
 * infers every field as optional.
 */
export const CachedMaterializedCohortSchema = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  creationTimestamp: z.union([z.string(), z.number()]).nullable(),
  syntax: z.string().nullable(),
  patientCount: z.number(),
});

export interface ICachedMaterializedCohort {
  id: number;
  name: string;
  description: string | null;
  creationTimestamp: string | number | null;
  syntax: string | null;
  patientCount: number;
}

/**
 * One cohort cache entry as returned by the lookup endpoint.
 *
 * `materializedCohort: null` is a negative entry: the bookmark is known to
 * have no materialized cohort on this dataset. It is a hit, not a miss.
 */
export const CohortCacheEntrySchema = z.object({
  materializedCohort: CachedMaterializedCohortSchema.nullable(),
});

export interface ICohortCacheEntry {
  materializedCohort: ICachedMaterializedCohort | null;
}

/**
 * Response of `POST /analytics-svc/api/services/cohort-cache/lookup`.
 *
 * Every requested bookmark id appears in exactly one of the two: under
 * `entries` (a hit, whatever `materializedCohort` holds) or in `missing`.
 *
 * `stale` reports that at least one returned entry is past its TTL. Such an
 * entry is still a hit; the caller serves it and refreshes it in the
 * background. It defaults to `false`, so a response omitting the field reads
 * as fresh instead of failing the schema.
 */
export const CohortCacheLookupResponseSchema = z.object({
  entries: z.record(z.string(), CohortCacheEntrySchema),
  missing: z.array(z.string()),
  stale: z.boolean().default(false),
});

export interface ICohortCacheLookupResponse {
  entries: Record<string, ICohortCacheEntry>;
  missing: string[];
  stale: boolean;
}

/**
 * One entry of the `PUT /analytics-svc/api/services/cohort-cache` body.
 * `materializedCohort: null` writes a negative entry.
 */
export interface ICohortCacheWriteEntry {
  bookmarkId: string;
  materializedCohort: ICachedMaterializedCohort | null;
}
