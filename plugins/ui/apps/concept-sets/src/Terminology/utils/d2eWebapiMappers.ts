import {
  IWebapiConcept,
  Concept,
  FhirConceptMapElementTarget,
  IWebapiConceptRelated,
  IWebapiConceptSet,
  ConceptSet,
  IWebapiConceptRecordCount,
  TerminologyTableConcept,
  ConceptRecordCount,
  FhirValueSetExpansionContainsWithExt,
} from "./types";

export const mapd2eWebapiConcept = (concept: IWebapiConcept): Concept => {
  return {
    conceptId: concept.CONCEPT_ID,
    display: concept.CONCEPT_NAME,
    conceptName: concept.CONCEPT_NAME,
    domainId: concept.DOMAIN_ID,
    system: concept.VOCABULARY_ID,
    vocabularyId: concept.VOCABULARY_ID,
    conceptClassId: concept.CONCEPT_CLASS_ID,
    standardConcept: concept.STANDARD_CONCEPT as string,
    concept: concept.STANDARD_CONCEPT_CAPTION,
    code: concept.CONCEPT_CODE,
    conceptCode: concept.CONCEPT_CODE,
    validStartDate: new Date(concept.VALID_START_DATE).toLocaleDateString(),
    validEndDate: new Date(concept.VALID_END_DATE).toLocaleDateString(),
    validity: concept.INVALID_REASON_CAPTION,
    score: concept.SCORE,
  };
};

export const combinedConceptAndConceptRecordCounts = (
  concepts: Concept[],
  conceptRecordCounts: IWebapiConceptRecordCount[]
): TerminologyTableConcept[] => {
  const mappedConceptRecordCounts = _mapd2eWebapiConceptRecordCount(conceptRecordCounts);

  return concepts.map((concept) => {
    const conceptRecordCount = mappedConceptRecordCounts.find(
      (e) => e.conceptId === concept.conceptId
    ) as ConceptRecordCount;
    return {
      ...concept,
      recordCount: conceptRecordCount.recordCount.toLocaleString(),
      descendantRecordCount: conceptRecordCount.descendantRecordCount.toLocaleString(),
      personCount: conceptRecordCount.personCount.toLocaleString(),
      descendantPersonCount: conceptRecordCount.descendantPersonCount.toLocaleString(),
    };
  });
};

const _mapd2eWebapiConceptRecordCount = (conceptRecordCounts: IWebapiConceptRecordCount[]): ConceptRecordCount[] => {
  return conceptRecordCounts.map((e) => {
    const conceptId = Object.keys(e)[0];
    const values = Object.values(e)[0];
    return {
      conceptId: Number(conceptId),
      recordCount: values[0],
      descendantRecordCount: values[1],
      personCount: values[2],
      descendantPersonCount: values[3],
    };
  });
};

// TODO: Discuss implementation
export const mapd2eWebapiConceptDetails = (
  conceptsRelated: IWebapiConceptRelated[]
): FhirConceptMapElementTarget[] => {
  return conceptsRelated.reduce((acc, conceptRelated) => {
    acc = acc.concat(_reduceConceptRelated(conceptRelated));
    return acc;
  }, [] as FhirConceptMapElementTarget[]);
};

// TODO: Discuss implementation
const _reduceConceptRelated = (
  conceptRelated: IWebapiConceptRelated
): FhirConceptMapElementTarget[] => {
  return conceptRelated.RELATIONSHIPS.reduce(
    (acc, conceptRelatedRelationship) => {
      if (
        conceptRelatedRelationship.RELATIONSHIP_DISTANCE === 1 &&
        conceptRelated.STANDARD_CONCEPT === "S"
      ) {
        acc.push({
          code: conceptRelated.CONCEPT_ID,
          display: conceptRelated.CONCEPT_NAME,
          vocabularyId: conceptRelated.VOCABULARY_ID,
          equivalence: conceptRelatedRelationship.RELATIONSHIP_NAME,
        });
      }
      return acc;
    },
    [] as FhirConceptMapElementTarget[]
  );
};

export const mapd2eWebapiConceptSet = (
  conceptSet: IWebapiConceptSet
): ConceptSet => {
  return {
    concepts: [],
    name: conceptSet.name,
    id: conceptSet.id,
    externalId: conceptSet.externalId,
    shared: conceptSet.shared,
    hasWriteAccess: conceptSet.hasWriteAccess,
    hasReadAccess: conceptSet.hasReadAccess,
    createdBy: conceptSet.createdBy.name,
    createdDate: conceptSet.createdDate
      ? new Date(conceptSet.createdDate).toISOString().split("T")[0]
      : undefined,
    modifiedBy: conceptSet.modifiedBy.name,
    modifiedDate: conceptSet.modifiedDate
      ? new Date(conceptSet.modifiedDate).toISOString().split("T")[0]
      : undefined,
    userName: conceptSet.createdBy.name,
    source: conceptSet.source,
  };
};

/**
 * The d2e-native terminology search returns FHIR ValueSet expansion entries,
 * which already extend `Concept` -- unlike the WebAPI search, whose UPPER_CASE
 * payload needs mapd2eWebapiConcept. Normalise the few fields the table reads
 * under a different name so both search paths hand back the same shape.
 */
export const mapTerminologyConcept = (
  concept: FhirValueSetExpansionContainsWithExt
): Concept => {
  return {
    ...concept,
    conceptName: concept.conceptName ?? concept.display,
    conceptCode: concept.conceptCode ?? concept.code,
    vocabularyId: concept.vocabularyId ?? concept.system,
  };
};
