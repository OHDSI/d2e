import datetime
import os
from typing import Optional

from .types import (
    Eq5d5lPluginType,
    Eq5d5lCalculateConfig,
    DIMENSION_ORDER,
    DIMENSION_CONCEPT_ID_MAP,
    EQ5D5L_INDEX_MEASUREMENT_CONCEPT_ID,
)
from .scoring import load_value_set, assemble_health_state, health_state_to_index

from _shared_flow_utils.dao.DBDao import DBDao
from _shared_flow_utils.types import SupportedDatabaseDialects

from prefect import flow, task
from prefect.logging import get_run_logger

os.environ['plugin_name'] = 'eq5d5l_index_calculation_plugin'


@flow(log_prints=True)
def eq5d5l_index_calculation_plugin(options: Eq5d5lPluginType):
    logger = get_run_logger()
    config = options.config
    logger.info(f"Flow parameters received: {config.json()}")
    calculate_eq5d5l_index(config)


def calculate_eq5d5l_index(config: Eq5d5lCalculateConfig):
    logger = get_run_logger()

    value_set = load_value_set(config.country_code)
    logger.info(f"Loaded EuroQol value set for country_code='{config.country_code}'")

    dbdao = DBDao(database_code=config.database_code, cache_id=config.omop_dataset_id)

    dimension_concept_id_map = DIMENSION_CONCEPT_ID_MAP

    observation_rows = read_eq5d5l_observations(
        dbdao=dbdao,
        schema_name=config.schema_name,
        dimension_concept_id_map=dimension_concept_id_map,
    )
    logger.info(f"Fetched {len(observation_rows)} observation row(s) for the 5 EQ-5D-5L dimensions")

    rows = calculate_index_rows(
        observation_rows=observation_rows,
        dimension_concept_id_map=dimension_concept_id_map,
        answer_code_level_map=config.answer_code_level_map,
        value_set=value_set,
        measurement_type_concept_id=config.measurement_type_concept_id,
    )
    logger.info(f"Computed {len(rows)} EQ-5D-5L index row(s)")

    if config.dry_run:
        logger.info("dry_run=True, skipping write to measurement")
        return rows

    measurement_concept_id = resolve_measurement_concept_id(config.measurement_concept_id)
    for row in rows:
        row["measurement_concept_id"] = measurement_concept_id
        row["range_low"] = value_set.get("range_low")
        row["range_high"] = value_set.get("range_high")

    inserted_rows = write_measurements(
        dbdao=dbdao,
        schema_name=config.schema_name,
        measurement_concept_id=measurement_concept_id,
        rows=rows,
    )
    logger.info(
        f"Wrote {len(rows)} EQ-5D-5L measurement row(s) to "
        f"{config.schema_name}.measurement (measurement_concept_id={measurement_concept_id})"
    )

    write_fhir_key_map(
        database_code=config.database_code,
        schema_name=config.schema_name,
        rows=inserted_rows,
    )
    return rows


@task(log_prints=True)
def read_eq5d5l_observations(dbdao, schema_name: str, dimension_concept_id_map: dict) -> list:
    """
    Read the 5 EQ-5D-5L dimension observation rows from the OMOP `observation` table,
    identified by observation_concept_id per dimension. This assumes the upstream FHIR
    QuestionnaireResponse -> OMOP transform (EQ-5D-5LObservationMap.json, run outside
    this plugin) has already populated these rows.
    This plugin does not connect to the FHIR cache or do any FHIR resolution itself.
    """
    concept_ids = list(dimension_concept_id_map.values())
    return dbdao.select_rows_where_in(
        schema=schema_name,
        table="observation",
        columns=[
            "observation_id",
            "person_id",
            "observation_concept_id",
            "observation_source_value",
            "value_source_value",
            "observation_date",
            "observation_datetime",
            "visit_occurrence_id",
        ],
        where_column="observation_concept_id",
        where_values=concept_ids,
    )


def _extract_level(code: Optional[str], answer_code_level_map: Optional[dict]) -> Optional[int]:
    if code is None:
        return None
    try:
        return int(code)
    except (TypeError, ValueError):
        pass
    if answer_code_level_map and code in answer_code_level_map:
        return answer_code_level_map[code]
    return None


@task(log_prints=True)
def calculate_index_rows(
    observation_rows: list,
    dimension_concept_id_map: dict,
    answer_code_level_map: Optional[dict],
    value_set: dict,
    measurement_type_concept_id: int,
) -> list:
    """
    Group the flat observation rows by observation_source_value - per
    EQ-5D-5LObservationMap.json's design, this holds the plain source
    QuestionnaireResponse id (qrId) shared by all 5 dimension rows of one
    administration, after the downstream python_node's resolution step - then score
    each complete group.
    """
    logger = get_run_logger()
    concept_to_dimension = {v: k for k, v in dimension_concept_id_map.items()}

    groups = {}
    for row in observation_rows:
        dim = concept_to_dimension.get(row["observation_concept_id"])
        if dim is None:
            continue
        qr_id = row["observation_source_value"]
        if qr_id is None:
            logger.warning(
                f"observation_id={row['observation_id']}: no observation_source_value "
                f"(expected the source QuestionnaireResponse id) - cannot group into a "
                f"questionnaire administration, skipping"
            )
            continue
        groups.setdefault(qr_id, []).append((dim, row))

    rows = []
    for qr_id, dim_rows in groups.items():
        dimension_answers = {}
        visit_occurrence_id = None
        person_ids = set()
        observed_at = None
        for dim, row in dim_rows:
            level = _extract_level(row["value_source_value"], answer_code_level_map)
            if level is not None:
                dimension_answers[dim] = level
            if row["visit_occurrence_id"] is not None:
                visit_occurrence_id = row["visit_occurrence_id"]
            if observed_at is None:
                observed_at = row["observation_datetime"] or row["observation_date"]
            person_ids.add(row["person_id"])

        if len(person_ids) > 1:
            logger.warning(
                f"qrId={qr_id}: rows disagree on person_id ({person_ids}) - "
                f"skipping this questionnaire administration"
            )
            continue

        missing = [d for d in DIMENSION_ORDER if d not in dimension_answers]
        if missing:
            logger.warning(
                f"qrId={qr_id}: missing or unparseable dimension(s) {missing} - "
                f"skipping this questionnaire administration"
            )
            continue

        health_state = assemble_health_state(dimension_answers)
        index_value = health_state_to_index(health_state, value_set)

        is_datetime = isinstance(observed_at, datetime.datetime)
        measurement_date = observed_at.date() if is_datetime else observed_at
        measurement_datetime = observed_at if is_datetime else None

        rows.append({
            "person_id": int(person_ids.pop()),
            "measurement_date": measurement_date,
            "measurement_datetime": measurement_datetime,
            "measurement_type_concept_id": measurement_type_concept_id,
            "value_as_number": index_value,
            "visit_occurrence_id": int(visit_occurrence_id) if visit_occurrence_id is not None else None,
            "measurement_source_value": qr_id,
            "value_source_value": health_state,
        })
    return rows


def resolve_measurement_concept_id(override: Optional[int]) -> int:
    """
    Resolve the OMOP concept_id representing "EQ-5D-5L index value". Defaults to
    EQ5D5L_INDEX_MEASUREMENT_CONCEPT_ID (the `indexValue` item's concept id in
    templates/fhir/EQ-5D-5LQuestionnaire.json) unless overridden for a deployment
    whose pipeline used a different concept id.
    """
    return override if override is not None else EQ5D5L_INDEX_MEASUREMENT_CONCEPT_ID


@task(log_prints=True)
def write_measurements(dbdao, schema_name: str, measurement_concept_id: int, rows: list) -> list:
    """
    Overwrite-on-rerun: in a single transaction, delete all measurement rows for this
    dataset tagged with measurement_concept_id, then insert the freshly computed set.
    Scoped by measurement_concept_id (dedicated to EQ-5D-5L index values) since
    schema_name already identifies the dataset 1:1 - no new unique constraint needed
    on the shared OMOP measurement table. Returns the inserted rows (with their
    assigned measurement_id) so callers can build fhir_omop_key_map entries from them.
    """
    logger = get_run_logger()
    if not rows:
        logger.warning(
            "No EQ-5D-5L index rows were computed - leaving existing "
            f"{schema_name}.measurement rows (measurement_concept_id={measurement_concept_id}) "
            "untouched rather than deleting them with nothing to replace them."
        )
        return []

    return dbdao.delete_and_insert_rows(
        schema=schema_name,
        table="measurement",
        delete_column="measurement_concept_id",
        delete_value=measurement_concept_id,
        insert_rows=rows,
        id_column="measurement_id",
    )


@task(log_prints=True)
def write_fhir_key_map(database_code: str, schema_name: str, rows: list):
    """
    Upsert FHIR QuestionnaireResponse -> OMOP measurement lineage into
    fhir_omop_key_map, mirroring FhirMappingNode's key-map write so this plugin's
    computed index rows are discoverable the same way the EQ5D5L-to-OMOP-Measurement
    pipeline's own rows are.
    """
    if not rows:
        return
    logger = get_run_logger()
    mapping_schema = f"{database_code}_{schema_name}_fhir_mapping"
    mapping_dao = DBDao(dialect=SupportedDatabaseDialects.TREX, database_code=database_code)

    key_map_rows = [
        (
            row["measurement_source_value"],
            "QuestionnaireResponse",
            "measurement",
            str(row["measurement_id"]),
        )
        for row in rows
    ]

    mapping_dao.batch_insert_values(
        mapping_schema,
        "fhir_omop_key_map",
        ["fhir_id", "fhir_resource_type", "omop_table_name", "omop_id"],
        key_map_rows,
        on_conflict="ON CONFLICT (fhir_id, fhir_resource_type, omop_table_name, omop_id) DO NOTHING",
    )
    logger.info(f"Upserted {len(key_map_rows)} fhir_omop_key_map row(s) in {mapping_schema}")
