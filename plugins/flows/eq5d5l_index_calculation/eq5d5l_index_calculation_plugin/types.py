from pydantic import BaseModel

ValueSetDir = 'flows/eq5d5l_index_calculation_plugin/external/value_sets'

# Dimension order used to assemble the 5-digit EQ-5D-5L health state
# (e.g. mobility=1, self_care=1, usual_activities=2, pain_discomfort=2, anxiety_depression=3 -> "11223").
DIMENSION_ORDER = ["mobility", "self_care", "usual_activities", "pain_discomfort", "anxiety_depression"]

# {dimension -> observation_concept_id}. These are the same concept ids the
# FHIR->OMOP pipeline writes to observation.observation_concept_id for each
# dimension - see each item.code.coding.code in
# templates/fhir/EQ-5D-5LQuestionnaire.json (the source of truth both
# EQ5D5L-to-OMOP-Observation and this plugin are meant to agree with).
DIMENSION_CONCEPT_ID_MAP = {
    "mobility": 44806412,
    "self_care": 44806413,
    "usual_activities": 44813555,
    "pain_discomfort": 44806414,
    "anxiety_depression": 44813556,
}

# measurement_concept_id written for "EQ-5D-5L Index Value", from the `indexValue`
# item in templates/fhir/EQ-5D-5LQuestionnaire.json. Fixed - not configurable per run,
# since every deployment's FHIR->OMOP pipeline is meant to use this same template.
EQ5D5L_INDEX_MEASUREMENT_CONCEPT_ID = 42537273

# measurement_type_concept_id / observation_type_concept_id written for the computed
# index row, from the omop-type-concept-id extension in
# templates/fhir/EQ-5D-5LQuestionnaire.json - shared by every item in that template,
# including indexValue. Fixed for the same reason as EQ5D5L_INDEX_MEASUREMENT_CONCEPT_ID.
EQ5D5L_TYPE_CONCEPT_ID = 32862

# `metadata.name` for the row this plugin writes to record which EuroQol value set/
# scoring algorithm produced a run's index values (see flow.write_algorithm_metadata).
EQ5D5L_ALGORITHM_METADATA_NAME = "EQ-5D-5L Index Calculation Algorithm"


class Eq5d5lCalculateConfig(BaseModel):
    dry_run: bool = False
    database_code: str
    schema_name: str  # OMOP CDM schema for the dataset being scored
    omop_dataset_id: str
    country_code: str  # required, single value per run - selects the EuroQol value set


class Eq5d5lPluginType(BaseModel):
    config: Eq5d5lCalculateConfig
