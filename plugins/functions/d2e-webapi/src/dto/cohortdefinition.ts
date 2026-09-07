import { z } from "zod";
import { CohortExpressionQueryOptions, CohortExpression } from "../types.ts";
import { AtlasCohortDefinitionArtifact } from "../../../_shared/user-artifacts/types.ts";
import { CombinedCohortDefinitionListSchema } from "../api/types.ts";

export const AtlasCohortDefinitionDto = AtlasCohortDefinitionArtifact;
export type IAtlasCohortDefinitionDto = z.infer<
  typeof AtlasCohortDefinitionDto
>;

export const UserArtifactAtlasCohortDefinitionDto =
  AtlasCohortDefinitionArtifact;
export type IUserArtifactAtlasCohortDefinitionDto = z.infer<
  typeof UserArtifactAtlasCohortDefinitionDto
>;

export const CohortDefinitionListResponseDto = z.array(
  CombinedCohortDefinitionListSchema,
);
export type ICohortDefinitionListResponseDto = z.infer<
  typeof CohortDefinitionListResponseDto
>;

export const CohortDefinitionResponseDto = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullable(),
  expressionType: z.string(),
  expression: CohortExpression,
  createdBy: z.string().nullable().optional(),
  createdDate: z.number().nullable(),
  modifiedBy: z.string().nullable().optional(),
  modifiedDate: z.number().nullable(),
  tags: z.array(z.string()),
  hasWriteAccess: z.boolean(),
  hasReadAccess: z.boolean(),
});

export const CohortDefinitionCreateResponseDto =
  CohortDefinitionResponseDto.omit({ modifiedDate: true, tags: true });

const WebAPICohortUserDto = z.object({
  name: z.string(),
  id: z.number(),
  login: z.string(),
});

const WebAPICohortTagDto = z.object({
  name: z.string(),
  id: z.number(),
  hasWriteAccess: z.boolean().optional(),
  modifiedBy: WebAPICohortUserDto.nullish(),
  createdBy: WebAPICohortUserDto.nullish(),
  createdDate: z.union([z.number(), z.string()]),
  modifiedDate: z.union([z.number(), z.string()]).nullish(),
  icon: z.string().nullish(),
  permissionProtected: z.boolean(),
  multiSelection: z.boolean(),
  mandatory: z.boolean(),
  type: z.enum(["SYSTEM", "CUSTOM", "PRIZM"]),
  description: z.string().nullish(),
  count: z.number(),
  groups: z.array(z.unknown()),
  color: z.string().nullish(),
  showGroup: z.boolean(),
  allowCustom: z.boolean(),
});

export const WebAPICohortDefinitionResponseDto = z.object({
  id: z.number(),
  name: z.string(),
  description: z.string().nullish(),
  hasWriteAccess: z.boolean().optional(),
  tags: z.array(WebAPICohortTagDto).optional(),
  expressionType: z.enum([
    "SIMPLE_EXPRESSION",
    "CUSTOM_SQL",
    "EXTERNAL_SOURCED",
  ]),
  expression: CohortExpression,
  modifiedBy: WebAPICohortUserDto.optional(),
  createdBy: WebAPICohortUserDto,
  createdDate: z.union([z.number(), z.string()]),
  modifiedDate: z.union([z.number(), z.string()]).optional(),
});
export type IWebAPICohortDefinitionResponseDto = z.infer<
  typeof WebAPICohortDefinitionResponseDto
>;

export const CohortDefinitionCopyResponseDto =
  CohortDefinitionCreateResponseDto.omit({ description: true });

export const CohortDefinitionSqlDto = z.object({
  expression: CohortExpression,
  options: CohortExpressionQueryOptions,
});

export const CohortDefinitionSqlResponseDto = z.object({
  templateSql: z.string(),
});

export const CohortDefinitionIdVersionResponseDto = z.array(
  z.object({
    assetId: z.number(),
    version: z.number(),
    archived: z.boolean(),
    createdDate: z.number(),
  }),
);

export const CohortDefinitionIdInfoResponseDto = z.array(
  z.object({
    id: z.object({ cohortDefinitionId: z.number(), sourceId: z.number() }),
    startTime: z.number(),
    executionDuration: z.number(),
    status: z.string(),
    isValid: z.boolean(),
    isCanceled: z.boolean(),
    failMessage: z.string().nullable(),
    personCount: z.number().nullable(),
    recordCount: z.number().nullable(),
    createdBy: z.string().nullable(),
  }),
);
export type ICohortDefinitionIdInfoResponseDto = z.infer<
  typeof CohortDefinitionIdInfoResponseDto
>;

export const CohortDefinitionCheckV2ResponseDto = z.object({
  warnings: z.array(
    z.object({
      type: z.string().optional(),
      severity: z.string(),
      message: z.string(),
      // Local Circe id within the cohort expression's `ConceptSets[]` array
      // (1..N per cohort), NOT a global concept-set reference. Do NOT migrate
      // this to the compound "legacy:N" / "webapi:N" form — the cohort
      // validator does not know the global id.
      conceptSetId: z.number().optional(),
    }),
  ),
});
export type ICohortDefinitionCheckV2ResponseDto = z.infer<
  typeof CohortDefinitionCheckV2ResponseDto
>;

export const GenerateCohortResponseDto = z.object({
  status: z.string(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  exitStatus: z.string(),
  executionId: z.string(),
  jobInstance: z.object({
    instanceId: z.string(),
    name: z.string(),
  }),
  jobParameters: z.object({
    jobName: z.string(),
    generate_stats: z.string(),
    jobAuthor: z.string(),
    sessionId: z.string(),
    cohort_definition_id: z.number(),
    source_id: z.string(),
    time: z.number(),
    target_database_schema: z.string(),
  }),
  ownerType: z.string().nullable(),
});
export type IGenerateCohortResponseDto = z.infer<
  typeof GenerateCohortResponseDto
>;
