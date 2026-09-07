import os

from typing import Set
from pathlib import Path
from time import time

from prefect.blocks.system import Secret

from _shared_flow_utils.types import SupportedDatabaseDialects


DUCKDB_EXTENSIONS_FILEPATH = os.path.join(os.getcwd(), "duckdb_extensions")


DUCKDB_FULLTEXT_SEARCH_CONFIG = {
    "concept": {
        "document_identifier": "concept_id",
    },
    "concept_relationship": {
        # primary key does not exist in concept_relationship table
        "document_identifier": "fts_document_identifier_id",
    },
    "relationship": {
        "document_identifier": "relationship_id",
    },
    "vocabulary": {
        "document_identifier": "vocabulary_id",
    },
    "concept_synonym": {
        # primary key does not exist in concept_synonym table,
        "document_identifier": "fts_document_identifier_id",
    },
    "concept_class": {
        "document_identifier": "concept_class_id",
    },
    "domain": {
        "document_identifier": "domain_id",
    },
    "concept_ancestor": {
        # primary key does not exist in concept_ancestor table
        "document_identifier": "fts_document_identifier_id",
    },
    "concept_recommended": {
        # primary key does not exist in concept_ancestor table
        "document_identifier": "fts_document_identifier_id",
    },
    "note": {
        "document_identifier": "note_id",
    },
}

VOCAB_TABLES = ["concept", "vocabulary", "concept_relationship", "concept_synonym", "concept_ancestor", "concept_class", "relationship", "domain", "drug_strength", "source_to_concept_map"]

def check_supported_dialects(dialect: str):
    supported_dialects = [
        SupportedDatabaseDialects.POSTGRES.value,
        SupportedDatabaseDialects.BIGQUERY.value,
        SupportedDatabaseDialects.SNOWFLAKE.value,
    ]
    if dialect not in supported_dialects:
        raise ValueError(
            f"Input dialect '{dialect}' is not supported. Supported dialects: {', '.join(supported_dialects)}"
        )


def time_execution(func):
    def wrapper(*args, **kwargs):
        time_start = time()
        func(*args, **kwargs)
        time_end = time()
        time_duration = time_end - time_start
        return f"{time_duration:.3f}"

    return wrapper


@time_execution
def execute_statement(conn: any, statement: str):
    conn.execute(statement)


def checkpoint_database(conn: any, database_name: str, logger=None) -> None:
    """
    Flush the DuckDB WAL for ``database_name`` to the database file.

    DuckDB keeps committed writes in the WAL until a checkpoint. A session that
    wrote them still sees them, but a *different* connection opening the file --
    which is what DQD and DC do -- resolves against the on-disk state and reports
    freshly created tables as missing. Checkpointing after the cache write makes
    the schema visible to every later reader.
    """
    statement = f'CHECKPOINT "{database_name}";'
    try:
        conn.execute(statement)
        if logger:
            logger.info(f"Checkpointed database '{database_name}'.")
    except Exception as e:
        # A failed checkpoint costs durability of the just-written schema, not
        # the data itself, so it must be visible rather than swallowed.
        if logger:
            logger.warning(
                f"CHECKPOINT on '{database_name}' failed: {e}. Newly created "
                "objects may not be visible to other connections until the next "
                "checkpoint."
            )
        raise


def get_document_identifier(table_name: str) -> str:
    """
    Returns the document identifier for a given table name based on the DUCKDB_FULLTEXT_SEARCH_CONFIG
    """
    return DUCKDB_FULLTEXT_SEARCH_CONFIG[table_name]["document_identifier"]


def get_tables_for_fts(tables: list[str], copied_tables: list[str]) -> Set[str]:
    """
    Returns a list of tables that are configured for full-text search,
    present in both user input and copied tables, and defined in the config.
    """
    user_tables = set(tables)
    copied = set(copied_tables)
    config_tables = set(DUCKDB_FULLTEXT_SEARCH_CONFIG.keys())
    tables_for_fts = user_tables & copied & config_tables
    return tables_for_fts


def load_service_account_credentials():
    """
    Load Google service account credentials for BigQuery access.
    """
    google_service_account_json_path = Secret.load("google-service-account-json").get()
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = google_service_account_json_path


def set_bigquery_global_settings():
    """
    Set BigQuery specific settings for the DuckDB connection.
    """
    return """
    SET bq_arrow_compression='ZSTD'; 
    SET bq_experimental_use_incubating_scan=TRUE;
    """

def check_if_file_exists(file_path: str) -> bool:
    """
    Checks if the specified file exists at the given path.
    """
    return Path(file_path).exists()


def resolve_duckdb_file_path(duckdb_database_name: str, folder_path: str) -> str:
    """
    Returns the full path to the DuckDB database file
    """
    return str(Path(folder_path) / f"{duckdb_database_name}.db")