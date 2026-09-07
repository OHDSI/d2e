import { z } from "zod";
import { ConceptSetExpression } from "../types.ts";
import { ConceptSetCompoundIdSchema } from "../utils/conceptSetRef.ts";

export const ConceptSetDto = z.object({
  id: z.number(),
  name: z.string(),
});
export type IConceptSetDto = z.infer<typeof ConceptSetDto>;

export const ConceptSetItemsResponseDto = z.object({
  items: z.array(ConceptSetExpression),
});
export type IConceptSetItemsResponseDto = z.infer<
  typeof ConceptSetItemsResponseDto
>;

export const ConceptSetCheckDto = ConceptSetDto.extend({
  description: z.string().nullable().optional(),
  expression: ConceptSetItemsResponseDto.optional(),
});

// TODO: ADD TYPES
export const ConceptSetCheckResponseDto = z.object({
  warnings: z.array(z.unknown()),
});
export type IConceptSetCheckResponseDto = z.infer<
  typeof ConceptSetCheckResponseDto
>;

export const ConceptSetCreateDto = z.object({
  id: z.number().optional(),
  name: z.string().trim().min(1, "Concept set name cannot be empty"),
  shared: z.boolean().optional(),
  description: z.string().optional(),
  hasWriteAccess: z.boolean().optional(),
  createdDate: z.number().optional(),
  createdBy: z
    .object({
      name: z.string().optional(),
      id: z.number().optional(),
      login: z.string().optional(),
    })
    .optional(),
  modifiedDate: z.number().optional(),
  modifiedBy: z
    .object({
      name: z.string().optional(),
      id: z.number().optional(),
      login: z.string().optional(),
    })
    .optional(),
  tags: z.array(z.unknown()).optional(),
});
export type IConceptSetCreateDto = z.infer<typeof ConceptSetCreateDto>;

export const ConceptSetItemDto = z.object({
  conceptId: z.number(),
  isExcluded: z.boolean(),
  includeDescendants: z.boolean(),
  includeMapped: z.boolean(),
});

export const ConceptSetItemListDto = z.array(ConceptSetItemDto);
export type IConceptSetItemListDto = z.infer<typeof ConceptSetItemListDto>;

const ConceptSetTagBase = z.object({
  createdBy: z
    .object({
      name: z.string().optional(),
      id: z.number().optional(),
      login: z.string().optional(),
    })
    .nullable()
    .optional(),
  modifiedBy: z
    .object({
      name: z.string().optional(),
      id: z.number().optional(),
      login: z.string().optional(),
    })
    .nullable()
    .optional(),
  createdDate: z.number().nullable().optional(),
  modifiedDate: z.number().nullable().optional(),
  writeAccess: z.boolean().nullable().optional(),
  readAccess: z.boolean().nullable().optional(),
  id: z.number(),
  name: z.string(),
  type: z.string(),
  count: z.number(),
  showGroup: z.boolean(),
  multiSelection: z.boolean(),
  permissionProtected: z.boolean(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  mandatory: z.boolean(),
  allowCustom: z.boolean(),
  description: z.string().nullable().optional(),
});

export const ConceptSetTag: z.ZodType<any> = ConceptSetTagBase.extend({
  groups: z.lazy(() => z.array(ConceptSetTag).nullable().optional()),
});

export const ConceptSetResponseDto = z.object({
  createdDate: z.number().nullable().optional(),
  createdBy: z
    .object({
      name: z.string(),
      id: z.number().optional(),
      login: z.string().optional(),
    })
    .nullable()
    .optional(),
  modifiedDate: z.number().nullable().optional(),
  modifiedBy: z
    .object({
      name: z.string(),
      id: z.number().optional(),
      login: z.string().optional(),
    })
    .nullable()
    .optional(),
  hasWriteAccess: z.boolean().nullable().optional(),
  hasReadAccess: z.boolean().nullable().optional(),
  tags: z.array(ConceptSetTag).nullable().optional(),
  description: z.string().nullable().optional(),
  id: ConceptSetCompoundIdSchema,
  externalId: z.number().int().nonnegative(),
  name: z.string(),
  shared: z.boolean(),
  source: z.enum(["legacy", "webapi"]),
});
export type IConceptSetResponseDto = z.infer<typeof ConceptSetResponseDto>;

export const ConceptSetListResponseDto = z.array(ConceptSetResponseDto);
export type IConceptSetListResponseDto = z.infer<
  typeof ConceptSetListResponseDto
>;

export const ConceptSetInUseErrorDto = z.object({
  error: z.literal("CONCEPT_SET_IN_USE"),
  message: z.string(),
  cohortDefinitions: z.array(
    z.object({
      id: z.number(),
      name: z.string(),
    }),
  ),
  bookmarks: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
    }),
  ),
});
export type IConceptSetInUseErrorDto = z.infer<typeof ConceptSetInUseErrorDto>;

export const ConceptSetNameConflictErrorDto = z.object({
  error: z.literal("CONCEPT_SET_NAME_EXISTS"),
  message: z.string(),
  conceptSetName: z.string(),
});
export type IConceptSetNameConflictErrorDto = z.infer<
  typeof ConceptSetNameConflictErrorDto
>;

export const IncludedConceptDto = z.object({
  CONCEPT_ID: z.number(),
  CONCEPT_NAME: z.string(),
  DOMAIN_ID: z.string(),
  VOCABULARY_ID: z.string(),
  CONCEPT_CLASS_ID: z.string(),
  STANDARD_CONCEPT: z.string().nullable(),
  CONCEPT_CODE: z.string(),
  VALID_START_DATE: z.number(),
  VALID_END_DATE: z.number(),
  INVALID_REASON: z.string().nullable(),
  USEMAPPED: z.boolean(),
  USEDESCENDANTS: z.boolean(),
});
export type IIncludedConcept = z.infer<typeof IncludedConceptDto>;

export const IncludedConceptsRequestDto = z.object({
  conceptSetIds: z.array(z.string()),
  datasetId: z.string(),
});
export type IIncludedConceptsRequestDto = z.infer<
  typeof IncludedConceptsRequestDto
>;

export const IncludedConceptsResponseDto = z.array(IncludedConceptDto);
