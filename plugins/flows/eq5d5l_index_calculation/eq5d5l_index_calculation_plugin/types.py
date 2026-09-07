from pydantic import BaseModel
from typing import Dict, Optional

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

# Default measurement_concept_id for "EQ-5D-5L Index Value", from the `indexValue`
# item in templates/fhir/EQ-5D-5LQuestionnaire.json.
EQ5D5L_INDEX_MEASUREMENT_CONCEPT_ID = 42537273

# Default measurement_type_concept_id / observation_type_concept_id, from the
# omop-type-concept-id extension in templates/fhir/EQ-5D-5LQuestionnaire.json - shared
# by every item in that template, including indexValue.
EQ5D5L_TYPE_CONCEPT_ID = 32862


class Eq5d5lCalculateConfig(BaseModel):
    schema_name: str  # OMOP CDM schema for the dataset being scored
    database_code: str
    cache_id: Optional[str] = None
    country_code: str  # required, single value per run - selects the EuroQol value set

    # Raw answer code (value_source_value, e.g. "1" or "no-problems") -> level 1-5.
    # A purely numeric code (e.g. "1".."5") is used as the level directly and needs no
    # entry here. Only needed for non-numeric codes - per
    # EQ-5D-5LObservationMap.json's own example ("e.g. '1' or 'no-problems'"), the code
    # vocabulary isn't guaranteed numeric. Not defaulted - no safe guess for real
    # answer codes.
    answer_code_level_map: Optional[Dict[str, int]] = None

    measurement_concept_id: Optional[int] = None  # override EQ5D5L_INDEX_MEASUREMENT_CONCEPT_ID
    measurement_type_concept_id: int = EQ5D5L_TYPE_CONCEPT_ID
    dry_run: bool = False


class Eq5d5lPluginType(BaseModel):
    config: Eq5d5lCalculateConfig
