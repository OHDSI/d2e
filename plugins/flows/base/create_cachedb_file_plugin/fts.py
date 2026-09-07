import duckdb

from prefect import task
from prefect.variables import Variable
from prefect.context import TaskRunContext
from prefect.logging import get_run_logger
from prefect.tasks import exponential_backoff

from .types import CopyParameters
from .copy import get_trex_connection
from .utils import (
    get_tables_for_fts,
    get_document_identifier,
    execute_statement,
    checkpoint_database,
)


@task(retries=3, 
      retry_delay_seconds=exponential_backoff(backoff_factor=2),
      log_prints=True, 
      task_run_name="create_fts_index_{copy_params.target_schema}",
      timeout_seconds=int(Variable.get("cache_task_timeout")))
def create_fts_index_task(
    use_trex_conn: bool,
    copy_params: CopyParameters,
    duckdb_file_path: str,
):
    """
    Create duckdb full text search indexes based on columns specified in tables_to_create_duckdb_fts_index
    """
    logger = get_run_logger()
    task_run_ctx = TaskRunContext.get()
    logger.info(f"This is task run attempt: {task_run_ctx.task_run.run_count} for task '{task_run_ctx.task.name}'.")

    if use_trex_conn:
        trex_conn = None
        pg_cursor = None
    
        try:
            trex_conn = get_trex_connection(copy_params.target_database)
            pg_cursor = trex_conn.cursor()
            pg_cursor.execute("CALL pg_clear_cache();")

            create_fts_index(pg_cursor, copy_params, logger)

        except Exception as e:
            logger.error(f"Failed to create fts index through Trex SQL interface: {e}")
            raise
        finally:
            if pg_cursor:
                pg_cursor.close()
            if trex_conn:
                trex_conn.close()

    else:
        with duckdb.connect(duckdb_file_path) as file_conn:
            create_fts_index(file_conn, copy_params, logger)

    
def create_fts_index(write_conn: any, copy_params: CopyParameters, logger):
    target_schema = copy_params.target_schema
    target_database = copy_params.target_database

    logger.info(f"Starting FTS index creation for schema '{target_schema}'.")

    write_conn.execute(get_table_names_query(target_database, target_schema))

    copied_tables = [table for (table,) in write_conn.fetchall()]

    logger.info(f"Found {len(copied_tables)} tables in schema '{copy_params.source_schema}'.")

    tables_for_fts = get_tables_for_fts(copy_params.fts_tables, copied_tables)
    logger.info(f"Tables selected for FTS index creation: {tables_for_fts}")

    for vocab_table in tables_for_fts:
        logger.info(f"Processing table '{vocab_table}' for FTS index creation.")

        config_document_identifier = get_document_identifier(vocab_table)
        logger.debug(
            f"Using document identifier '{config_document_identifier}' for table '{vocab_table}'."
        )

        write_conn.execute(get_column_names_query(target_database, target_schema, vocab_table))
        existing_columns = [column.lower() for (column,) in write_conn.fetchall()]

        logger.info(
            f"Existing columns in '{target_database}'.'{target_schema}'.'{vocab_table}': {existing_columns}"
        )


        if config_document_identifier not in existing_columns:
            logger.info(
                f"Column '{config_document_identifier}' not found in '{target_database}.{target_schema}.{vocab_table}'. Adding auto-increment column."
            )

            sequence_name = f"{vocab_table}_id_sequence"
            logger.debug(
                f"Creating sequence '{sequence_name}' for table '{vocab_table}'."
            )
            execute_statement(
                write_conn,
                create_sequence_query(
                    target_database, target_schema, sequence_name
                ),
            )
            logger.info(f"Sequence '{sequence_name}' created.")

            execute_statement(
                write_conn,
                add_autoincrement_col_query(
                    database_name=target_database,
                    schema_name=target_schema,
                    table_name=vocab_table,
                    column_name=config_document_identifier,
                    sequence_name=sequence_name,
                ),
            )
            logger.info(
                f"Auto-increment column '{config_document_identifier}' added to '{target_database}'.'{target_schema}'.'{vocab_table}'."
            )

        fts_creation_sql = get_duckdb_fts_creation_sql(
            database_name=target_database,
            schema_name=target_schema,
            table_name=vocab_table,
            document_identifier=config_document_identifier,
            columns=existing_columns,
        )
        logger.debug(
            f"FTS creation SQL for '{target_schema}'.'{vocab_table}': {fts_creation_sql}"
        )

        fts_creation_time = execute_statement(write_conn, fts_creation_sql)
        logger.info(
            f"DuckDB FTS index created for table '{vocab_table}' in schema '{target_schema}'. Execution took {fts_creation_time} seconds."
        )

        verify_fts_index(
            write_conn, target_database, target_schema, vocab_table, logger
        )

    # The index schemas and any surrogate-key columns added above are DDL, so
    # they sit in the WAL until checkpointed and are invisible to the next
    # connection that opens the cache.
    checkpoint_database(write_conn, target_database, logger)

    logger.info(f"Completed FTS index creation for schema '{target_schema}'.")


def fts_index_schema(schema_name: str, table_name: str) -> str:
    """
    The schema DuckDB creates for a table's FTS index.
    """
    return f"fts_{schema_name}_{table_name}"


def verify_fts_index(
    write_conn: any, database_name: str, schema_name: str, table_name: str, logger
) -> None:
    """
    Fail unless the FTS index for ``table_name`` is actually complete.

    ``create_fts_index`` writes ``stats`` last, and ``match_bm25`` is defined
    against it. An index whose build was interrupted therefore leaves the index
    schema in place -- so the index looks present in information_schema -- while
    ``match_bm25`` does not exist. Concept search then fails at query time with a
    missing-function error rather than at build time, which is where this was
    first observed. Checking for ``stats`` turns that into a loud build failure.
    """
    index_schema = fts_index_schema(schema_name, table_name)
    write_conn.execute(
        fts_index_stats_query(database_name, index_schema)
    )
    if not write_conn.fetchall():
        raise RuntimeError(
            f"FTS index '{database_name}.{index_schema}' is incomplete: its "
            f"'stats' table is missing, so {index_schema}.match_bm25 does not "
            f"exist. The index build for '{schema_name}.{table_name}' did not "
            "finish; re-run it rather than treating the schema as built."
        )
    logger.info(f"Verified FTS index '{index_schema}' is complete.")


def fts_index_stats_query(database_name: str, index_schema: str) -> str:
    """
    Create a SQL query that finds the 'stats' table of an FTS index schema.
    """
    return f"""
        SELECT table_name
        FROM information_schema.tables
        WHERE table_catalog = '{database_name}'
        AND table_schema = '{index_schema}'
        AND table_name = 'stats'
    """


def get_duckdb_fts_creation_sql(
    database_name: str,
    schema_name: str,
    table_name: str,
    document_identifier: str | int,
    columns: list[str],
) -> str:
    # Todo: Add single quotes to ignore regex after upgrading to a duckdb version which has the fix
    return f''' PRAGMA
        create_fts_index("{database_name}"."{schema_name}"."{table_name}",
            {document_identifier},
            {", ".join(columns)},
            stemmer='english', 
            stopwords='english',
            ignore='(\\.|[^a-z0-9!@#$%^&*()`+"\-\\\/])+',
            strip_accents=1, 
            lower=1, 
            overwrite=1)
        '''


def create_sequence_query(
    database_name: str, schema_name: str, sequence_name: str
) -> str:
    """
    Create a SQL query to create a sequence if it does not exist.
    """
    return f'CREATE OR REPLACE SEQUENCE "{database_name}"."{schema_name}"."{sequence_name}" START 1;'


def add_autoincrement_col_query(
    database_name: str,
    schema_name: str,
    table_name: str,
    column_name: str,
    sequence_name: str,
) -> str:
    """
    Create a SQL query to add an auto-increment column to a table.
    """
    # For NEXTVAL use single quotes here, so duckdb treat it as a sequence name (plain string) rather than column references to resolve.
    return f'ALTER TABLE "{database_name}"."{schema_name}"."{table_name}" ADD COLUMN "{column_name}" INTEGER DEFAULT NEXTVAL(\'{database_name}.{schema_name}.{sequence_name}\');'


def get_table_names_query(database_name: str, schema_name: str) -> str:
    """
    Create a SQL query to fetch table names from a schema.
    """
    return f"""
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_catalog = '{database_name}'
        AND table_schema = '{schema_name}'
    """


def get_column_names_query(database_name: str, schema_name: str, table_name: str) -> str:
    """
    Create a SQL query to fetch table names from a schema.
    """
    return f"""
        SELECT column_name 
        FROM information_schema.columns
        WHERE table_catalog = '{database_name}'
        AND table_schema = '{schema_name}'
        AND table_name = '{table_name}'
    """