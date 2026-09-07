import os, logging
from rpy2.rinterface_lib.callbacks import logger as rpy2_logger
from rpy2 import robjects

from prefect import flow, task
from prefect.logging import get_run_logger

from .types import PhenotypeOptionsType
from _shared_flow_utils.types import UserType
from _shared_flow_utils.dao.DBDao import DBDao
from _shared_flow_utils.api.PhenotypeAPI import PhenotypeAPI
from _shared_flow_utils.api.PhenotypeTagAPI import PhenotypeTagAPI

os.environ["plugin_name"] = "phenotype_plugin"


@task(log_prints=True)
def validate_integer_string(input_string: str) -> bool:
    """
    Validates that the input string contains only comma-separated integers.

    Args:
        input_string (str): A string containing comma-separated integers or 'default'.
        Example: '3,4,25' or 'default'

    Returns:
        bool: True if validation passes
    """
    logger = get_run_logger()
    if input_string == "default":
        logger.info(
            "Cohorts ID is set to 'default', retrieving all cohorts from the Phenotype."
        )
        return True
    else:
        input_string = input_string.strip()
        logger = get_run_logger()
        numbers = input_string.split(",")
        for num in numbers:
            num = num.strip()  # Remove any surrounding whitespace
            if not num.isdigit():
                error_message = f"""Input CohortsId: {input_string} is not supported, use ',' as seperator, e.g.: '3,4,25' """
                logger.error(error_message)
                raise ValueError(error_message)
        return True


@task(log_prints=True)
def get_cohort_definitions(cohorts_id: str, vocabschema_name: str, materialize: bool):
    """
    Retrieve cohort definitions from the Phenotype Library.
    Args:
        cohorts_id (str): Comma-separated string of cohort IDs or 'default'.
        vocabschema_name (str): The name of the vocabulary schema.
    Returns:
        list: List of cohort definitions with cohortId, cohortName, json, and sql.
    """
    r_script_path = os.path.join(os.path.dirname(__file__), 'get_cohort_definitions.R')

    with robjects.default_converter.context():
        
        # Source the R script to load the function
        robjects.r(f'source("{r_script_path}")')
        r_get_cohort_definitions = robjects.r['get_cohort_definitions']
        result = r_get_cohort_definitions(
            cohortsID=cohorts_id,
            vocabschemaName=vocabschema_name,
            materialize = materialize)
        
        if materialize:
            return result
        else:
            # TODO, simplify this part
            # Convert R result to Python list
            cohort_definitions = []
            for i in range(0, len(result)):
                cohort_def = {
                    "cohortId": int(result[i].rx2("cohortId")[0]),
                    "cohortName": str(result[i].rx2("cohortName")[0]),
                    "json": str(result[i].rx2("json")[0]),
                    "sql": str(result[i].rx2("sql")[0]),
                    "status": str(result[i].rx2("status")[0]),
                }
                cohort_definitions.append(cohort_def)
            return cohort_definitions


@task(log_prints=True)
def atlas_cohort_definitions(
    cohort_definitions: list, dataset_id: str, user_name: str
) -> list:
    """
    Create cohort definitions using the REST API.
    Args:
        cohort_definitions (list): List of cohort definition dictionaries containing
                                  cohortId, cohortName, json, and sql keys
        dataset_id (str): Unique identifier for the target dataset
        user_name (str): Username of the person creating the cohorts

    Returns:
        list: List of API response objects for successfully created cohorts

    """
    logger = get_run_logger()
    phenotype_api = PhenotypeAPI()
    phenotype_tag_api = PhenotypeTagAPI()
    created_cohorts = []
    name_index = phenotype_api.get_cohort_name_index(dataset_id)
    logger.info(f"Indexed {len(name_index)} existing WebAPI cohort definitions")

    # get_cohort_definitions.R already maps blank/NA to "Unspecified".
    statuses = {cohort_def["status"] for cohort_def in cohort_definitions}
    phenotype_library_tag, status_tags = phenotype_tag_api.resolve_import_tags(
        dataset_id, statuses
    )

    # Collected while writing, applied in bulk afterwards -- see tag_cohort_definitions.
    cohort_ids_by_status = {}

    for cohort_def in cohort_definitions:
        try:
            status = cohort_def["status"]
            result = phenotype_api.create_single_cohort_definition(
                cohort_def, dataset_id, user_name, name_index
            )
            created_cohorts.append(result)
            cohort_ids_by_status.setdefault(status, []).append(result["id"])
        except Exception as e:
            error_message = (
                f"Failed to save cohort {cohort_def['cohortId']}: {str(e)}. "
                f"{len(created_cohorts)} cohorts were written before this and are "
                f"still untagged; re-run the flow to finish them."
            )
            logger.error(error_message)
            raise Exception(error_message) from e

    tag_cohort_definitions(
        phenotype_tag_api, dataset_id, phenotype_library_tag, status_tags,
        cohort_ids_by_status,
    )
    return created_cohorts


def tag_cohort_definitions(phenotype_tag_api, dataset_id: str, phenotype_library_tag: dict,
                           status_tags: dict, cohort_ids_by_status: dict) -> None:
    """Record where the cohorts came from, and what their review status is.
    """
    logger = get_run_logger()
    all_cohort_ids = [i for ids in cohort_ids_by_status.values() for i in ids]
    if not all_cohort_ids:
        return

    phenotype_tag_api.assign_tags_to_cohorts(
        dataset_id, [phenotype_library_tag["id"]], all_cohort_ids
    )
    logger.info(
        f"Tagged {len(all_cohort_ids)} cohort definitions as "
        f"'{phenotype_library_tag['name']}'"
    )

    for status, cohort_ids in sorted(cohort_ids_by_status.items()):
        phenotype_tag_api.assign_tags_to_cohorts(
            dataset_id, [status_tags[status]["id"]], cohort_ids
        )
        logger.info(f"Tagged {len(cohort_ids)} cohort definitions as '{status}'")


@task(log_prints=True)
def materialize_cohort_definitions(
    dbdao: DBDao,
    cohort_definitions,
    cdmschema_name: str,
    cohortschema_name: str,
    cohorttable_name: str,
    user: UserType,
):
    """
    Materialize cohort definitions into the database.
    """
    logger = get_run_logger()
    
    # Setup database connection for R
    set_db_driver_env_string = dbdao.set_db_driver_env()
    set_connection_string = dbdao.get_r_database_connector_connection_string(
        user_type=user
    )

    # Load R scripts from files
    script_dir = os.path.dirname(__file__)
    materialize_script_path = os.path.join(script_dir, 'materialize_cohorts.R')
    result_tables_script_path = os.path.join(script_dir, 'create_result_tables.R')

    with robjects.conversion.localconverter(robjects.default_converter):
        # Source the R scripts to load the functions
        robjects.r(f"""
            source('{materialize_script_path}')
            source('{result_tables_script_path}')
        """)
        # Get the R functions
        r_materialize_cohorts = robjects.r['materialize_cohorts']
        r_create_result_tables = robjects.r['create_result_tables']
        # Call materialize_cohorts function
        logger.info("Materializing cohorts to database...")
        r_materialize_cohorts(
            set_db_driver_env_string=set_db_driver_env_string,
            set_connection_string=set_connection_string,
            cohortDefinitions=cohort_definitions,
            cdmschemaName=cdmschema_name,
            cohortschemaName=cohortschema_name,
            cohorttableName=cohorttable_name
        )
        # Call create_result_tables function
        logger.info("Creating result tables...")
        r_create_result_tables(
            set_db_driver_env_string=set_db_driver_env_string,
            set_connection_string=set_connection_string,
            cohortschemaName=cohortschema_name,
            cohorttableName=cohorttable_name,
            cohortDefinitions=cohort_definitions
        )
        logger.info("Cohort materialization completed successfully.")


@flow(log_prints=True)
def phenotype_plugin(options: PhenotypeOptionsType):
    # Setup rpy2 logger
    logging.basicConfig()
    rpy2_logger.setLevel(logging.DEBUG)
    logger = get_run_logger()
    logger.info(f"Flow parameters received: {options.json()}")
    logger.info("******************* Running Phenotype Plugin *******************")

    database_code = options.database_code
    cache_id = options.cache_id
    cdmschema_name = options.cdmschema_name
    cohortschema_name = options.cohortschema_name
    cohorttable_name = "phenotypes"  # Fixed the prefix of the phenotype result tables
    vocabschema_name = options.vocabschema_name
    cohorts_id = options.cohorts_id
    materialize = options.materialize
    dataset_id = options.dataset_id
    user_name = options.user_name
    user = UserType.ADMIN_USER

    # Validate cohorts_id if not default
    if not validate_integer_string(cohorts_id):
        error_message = f"Invalid cohorts_id: {cohorts_id}. It should be a comma-separated string of integers or 'default'."
        logger.error(error_message)
        raise ValueError(error_message)
    
    cohort_definitions = get_cohort_definitions(
        cohorts_id=cohorts_id,
        vocabschema_name=vocabschema_name,
        materialize=materialize,
    )
    logger.info(
        "******************* Complete Retrieving Cohort Definition Sets *******************"
    )

    if materialize:
        logger.info("Materializing cohort definitions to database")
        # Setup database connection only when needed for materialization
        dbdao = DBDao(database_code=database_code, cache_id=cache_id)

        materialize_cohort_definitions(
            cohort_definitions=cohort_definitions,
            dbdao=dbdao,
            cdmschema_name=cdmschema_name,
            cohortschema_name=cohortschema_name,
            cohorttable_name=cohorttable_name,
            user=user,
        )
        logger.info(
            "******************* Complete Materializing Cohort *******************"
        )
    else:
        logger.info("Creating cohort definitions")
        created_cohorts = atlas_cohort_definitions(
            cohort_definitions=cohort_definitions,
            dataset_id=dataset_id,
            user_name=user_name,
        )
        logger.info(
            "******************* Complete Creating Cohort Definition Sets *******************"
        )
        logger.info(f"{len(created_cohorts)} cohorts created successfully.")
