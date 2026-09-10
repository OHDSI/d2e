import * as cohort from "./cohort.ts";
import * as cohortCache from "./cohortCache.ts";
import * as cohortCompare from "./cohortCompare.ts";
import * as cohortSurvival from "./cohortSurvival.ts";
import * as concept from "./concept.ts";
import * as customDBs from "./customDBs.ts";
import * as dataCharacterization from "./dataCharacterization.ts";
import * as datasetFilter from "./datasetFilter.ts";
import * as dbsvc from "./dbsvc.ts";
import * as parquet from "./parquet.ts";
import * as patient from "./patient.ts";
import * as population from "./population.ts";
import * as values from "./values.ts";

export const controllers: Record<string, Record<string, unknown>> = {
  cohort,
  cohortCache,
  cohortCompare,
  cohortSurvival,
  concept,
  customDBs,
  dataCharacterization,
  datasetFilter,
  dbsvc,
  parquet,
  patient,
  population,
  values,
};
