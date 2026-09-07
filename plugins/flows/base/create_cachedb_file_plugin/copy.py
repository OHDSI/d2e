import duckdb
from typing import Any
from psycopg2 import connect

from prefect import task
from prefect.cache_policies import NONE
from prefect.variables import Variable
from prefect.blocks.system import Secret
from prefect.context import TaskRunContext
from prefect.logging import get_run_logger
from prefect.runtime import flow_run as prefect_flow_run
from prefect.tasks import exponential_backoff

from .types import CopyParameters, QueryColumns
from .filter import filter_tables, CDM_COLUMN_FILTER_MAP
from .utils import execute_statement, set_bigquery_global_settings, VOCAB_TABLES
from .chunk_utils import (
    describe_chunk_progress,
    describe_dry_run_summary,
    describe_plan,
    find_column_case_insensitive,
    plan_chunks,
    resolve_target_chunk_rows,
)
from .checkpoint import (
    COPY_STATUS_TABLE_NAME,
    apply_fresh_copy,
    clear_resume_point,
    drop_status_tables,
    ensure_status_tables,
    mark_complete,
    mark_failed,
    mark_in_progress,
    read_checkpoint,
    record_chunk_progress,
    reset_table,
)
from .errors import ChunkCopyError, PlannerError, ReconciliationError
from .planner_types import ChunkConfig, ChunkStrategy
from .source_stats import build_source_adapter

from _shared_flow_utils.types import SupportedDatabaseDialects


def get_trex_connection(database_code: str):    
    conn = connect(
        host=Variable.get("trex_sql_host"),
        port=Variable.get("trex_sql_port"),
        user=Variable.get("trex_sql_user"),
        password=Secret.load("trex-sql-password").get(),
        dbname=database_code,
    )
    conn.autocommit = True
    return conn


@task(retries=3,
      retry_delay_seconds=exponential_backoff(backoff_factor=2),
      log_prints=True, 
      task_run_name="create_schema_if_not_exists_{copy_params.target_schema}",
      timeout_seconds=int(Variable.get("cache_task_timeout", default="10800")))
def create_schema_if_not_exists_task(use_trex_conn: bool, copy_params: CopyParameters, duckdb_file_path: str):
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

            create_schema_if_not_exists(pg_cursor, copy_params, logger)

        except Exception as e:
            logger.error(f"Failed to create schema through Trex SQL interface: {e}")
            raise
        finally:
            if pg_cursor:
                pg_cursor.close()
            if trex_conn:
                trex_conn.close()

    else:
        with duckdb.connect(duckdb_file_path) as file_conn:
            create_schema_if_not_exists(file_conn, copy_params, logger)


def create_schema_if_not_exists(write_conn: Any, copy_params: CopyParameters, logger):
    logger.info(f"Creating schema '{copy_params.target_schema}' in cache database '{copy_params.target_database}' if it doesn't exist...")
    sql = f'CREATE SCHEMA IF NOT EXISTS "{copy_params.target_database}"."{copy_params.target_schema}";'
    execute_statement(write_conn, sql)
    logger.info(f"Schema '{copy_params.target_schema}' created.")


@task(retries=3, 
      retry_delay_seconds=exponential_backoff(backoff_factor=2),
      tags=["flow-level-concurrency"],
      log_prints=True, 
      task_run_name="create_schema_tables_from_{copy_params.source_schema}",
      # Deliberately no timeout_seconds. The copy budget now lives on
      # copy_table_chunk, one hour per chunk, so a slow schema is bounded chunk
      # by chunk instead of by a single envelope covering every table in it.
      # A schema-wide 3h cap is what killed a large copy mid-table and threw
      # away the partial target on the way out (issue 3033).
      cache_policy=NONE)
def create_schema_tables_task(use_trex_conn: bool, read_conn: Any, copy_params: CopyParameters, duckdb_file_path: str):
    logger = get_run_logger()

    task_run_ctx = TaskRunContext.get()
    logger.info(f"This is task run attempt: {task_run_ctx.task_run.run_count} for task '{task_run_ctx.task.name}'.")

    if use_trex_conn:
        trex_conn = None
        pg_cursor = None
    
        try:
            trex_conn = get_trex_connection(copy_params.target_database)
            pg_cursor = trex_conn.cursor()

            create_schema_tables(pg_cursor, read_conn, copy_params, logger)

        except Exception as e:
            logger.error(f"Failed to copy schema tables through Trex SQL interface: {e}")
            raise
        finally:
            if pg_cursor:
                pg_cursor.close()
            if trex_conn:
                trex_conn.close()

    else:
        with duckdb.connect(duckdb_file_path) as file_conn:
            create_schema_tables(file_conn, read_conn, copy_params, logger)


def create_schema_tables(write_conn: Any, read_conn: Any, copy_params: CopyParameters, logger):
    source_schema = copy_params.source_schema

    # Create both bookkeeping tables if they don't exist, migrating a
    # pre-chunking status table first. Under dryRun this only reports what it
    # would do: it used to run before the dryRun check and DROP a real legacy
    # status table in a mode documented as changing nothing.
    ensure_status_tables(
        write_conn,
        copy_params.target_database,
        copy_params.target_schema,
        logger,
        dry_run=copy_params.dry_run,
    )

    if copy_params.fresh_copy:
        # Keyed on (flow_run_id, target_schema): that is what makes this safe
        # under create_schema_tables_task's retries=3 -- attempt 2 must not
        # destroy what attempt 1 copied -- and what gives the datamart schema
        # and the results schema each their own reset inside one flow run.
        apply_fresh_copy(
            write_conn,
            copy_params.target_database,
            copy_params.target_schema,
            str(prefect_flow_run.id),
            dry_run=copy_params.dry_run,
            logger=logger,
        )

    # Determine tables to copy
    source_tables = copy_params.table_filter.keys() if copy_params.table_filter else read_conn.get_table_names(source_schema)
    tables_to_copy = sorted(filter_tables(source_tables))
    
    has_separate_vocab_schema = False

    # Handle vocabulary tables if vocab_schema is provided
    if copy_params.vocab_schema and copy_params.vocab_schema != copy_params.source_schema:
        has_separate_vocab_schema = True
        logger.info(f"Vocabulary schema '{copy_params.vocab_schema}' provided - will copy vocab tables from this schema instead of '{copy_params.source_schema}'")
        
        # Remove vocab tables from current schema copy
        tables_to_copy = [table for table in tables_to_copy if table not in VOCAB_TABLES]

        logger.info(
            f"Found {len(tables_to_copy)} tables/views to copy from schema '{copy_params.source_schema}': {tables_to_copy}"
        )
        
        # Add vocab tables to copy from vocab_schema
        vocab_tables_in_schema = read_conn.get_table_names(copy_params.vocab_schema)
        vocab_tables_to_copy = [table for table in VOCAB_TABLES if table in vocab_tables_in_schema]
        
        logger.info(
            f"Found {len(vocab_tables_to_copy)} vocab tables/views to copy from schema '{copy_params.vocab_schema}': {vocab_tables_to_copy}"
        )

        tables_to_copy.extend(vocab_tables_to_copy)
    else:
        if copy_params.vocab_schema:
            logger.info(f"Vocabulary schema '{copy_params.vocab_schema}' is the same as source schema - copying all tables including vocab tables")
        else:
            logger.info("No vocabulary schema provided - copying all tables from source schema")

        logger.info(
            f"Found {len(tables_to_copy)} tables/views to copy from schema '{copy_params.source_schema}': {tables_to_copy}"
        )

    original_count = len(tables_to_copy)

    # Check for already completed tables
    completed_tables = _completed_tables(write_conn, copy_params, logger)
    logger.info(f"Found {len(completed_tables)} already completed tables: {completed_tables}")

    # Filter out already completed tables
    tables_left_to_copy = [t for t in tables_to_copy if t not in completed_tables]
    skipped_count = original_count - len(tables_left_to_copy)
    logger.info(f"There are {len(tables_left_to_copy)}/{original_count} tables left to copy from schema(s): {copy_params.source_schema}{', ' + copy_params.vocab_schema if has_separate_vocab_schema else ''}: {tables_left_to_copy}")
    if skipped_count > 0:
        logger.info(f"Skipping {skipped_count} already completed tables: {completed_tables}")

    # BigQuery-specific global settings
    if read_conn.tenant_configs.dialect == SupportedDatabaseDialects.BIGQUERY.value:
        execute_statement(write_conn, set_bigquery_global_settings())

    msg = f"Beginning table copy for schema '{copy_params.source_schema}'"
    if has_separate_vocab_schema:
        msg += f" with separate vocab schema '{copy_params.vocab_schema}'"
    logger.info(msg)

    unplannable_tables = []

    for idx, table in enumerate(tables_left_to_copy, start=1):
        # Determine which schema this table should be copied from
        source_schema_for_table = copy_params.vocab_schema if (has_separate_vocab_schema and table in VOCAB_TABLES) else copy_params.source_schema

        logger.info(
            f"[{idx}/{len(tables_left_to_copy)}] Copying table '{table}' from schema '{source_schema_for_table}'..."
        )

        # Determine columns to copy for the current table
        source_columns = copy_params.table_filter.get(table) if copy_params.table_filter else None
        columns_to_copy = source_columns if source_columns else ["*"]

        patient_col = CDM_COLUMN_FILTER_MAP.get(table, {}).get("person_id_column")
        timestamp_col = CDM_COLUMN_FILTER_MAP.get(table, {}).get("timestamp_column")

        query_columns = QueryColumns(
            table=table,
            columns_to_copy=columns_to_copy,
            patient_filter_col=patient_col if patient_col in columns_to_copy else None,
            timestamp_filter_col=timestamp_col if timestamp_col in columns_to_copy else None
        )

        # Call copy_table directly
        try:
            copy_table_task(write_conn, read_conn, copy_params, query_columns, source_schema_for_table)
        except PlannerError as exc:
            if not copy_params.dry_run:
                # A real run still fails fast: an unplannable table is either
                # copied unbounded or not copied at all, and neither may be
                # papered over.
                raise
            # A dry run exists to tell the operator about every unplannable
            # table in the schema, not just the first one it hits.
            unplannable_tables.append(table)
            logger.error(
                f"[dry run] '{table}' cannot be planned and would fail a real copy: {exc}"
            )
            continue

        # Call copy_indexes directly. Not under dryRun: copy_table returns
        # before the target is created, so CREATE INDEX ... ON <target> would
        # hit a table that does not exist. On Postgres get_indexes_for_pk
        # always reports a real primary key, so that fired on the very first
        # table, burnt this task's three retries and killed the flow.
        if not copy_params.dry_run:
            copy_indexes(write_conn, read_conn, copy_params, query_columns, source_schema_for_table, logger)
        else:
            logger.info(
                f"[dry run] skipped index creation for '{table}': the target table "
                "was not created, so there is nothing to index."
            )

    if copy_params.dry_run:
        logger.info(
            describe_dry_run_summary(
                copy_params.source_schema,
                len(tables_left_to_copy) - len(unplannable_tables),
                unplannable_tables,
            )
        )
        # Nothing was written, so there is nothing to clean up -- and dropping
        # the bookkeeping tables would destroy the checkpoints a real run needs
        # to resume from.
        return

    # All tables copied successfully, drop the ephemeral bookkeeping tables.
    drop_status_tables(write_conn, copy_params.target_database, copy_params.target_schema)


def _completed_tables(write_conn: Any, copy_params: CopyParameters, logger) -> list[str]:
    """Tables this schema has already finished copying.

    Tolerates a missing status table, but only under dryRun: that is the mode
    in which ``ensure_status_tables`` deliberately creates nothing, so on a
    clean schema there is no table to read and no table has completed. A real
    run always has one, and a failure to read it there is a real failure.
    """
    statement = (
        f'SELECT table_name FROM "{copy_params.target_database}"'
        f'."{copy_params.target_schema}"."{COPY_STATUS_TABLE_NAME}" '
        "WHERE status = 'COMPLETE'"
    )
    if not copy_params.dry_run:
        return [row[0] for row in _fetchall_rows(write_conn, statement)]
    try:
        return [row[0] for row in _fetchall_rows(write_conn, statement)]
    except Exception as exc:
        logger.info(
            f"[dry run] no '{COPY_STATUS_TABLE_NAME}' to read in "
            f'"{copy_params.target_database}"."{copy_params.target_schema}" ({exc}); '
            "treating every table as not yet copied."
        )
        return []


def create_empty_target_table_if_absent(write_conn: Any, copy_params: CopyParameters, query_columns: QueryColumns, source_schema: str):
    """Create the target's empty shell, but only when it is missing.

    IF NOT EXISTS is load-bearing. This runs on every attempt, including a
    resume, and the DROP + CREATE that the pre-rewrite helper did here would
    throw away exactly the chunks ``chunks_completed`` says are already
    durably copied -- which is how a large table used to restart from chunk 0
    on every retry (issue 3033).
    """
    target = (
        f'"{copy_params.target_database}"."{copy_params.target_schema}"'
        f'."{query_columns.table}"'
    )
    select_sql = create_select_query(copy_params, query_columns, source_schema, None)
    execute_statement(
        write_conn,
        f"CREATE TABLE IF NOT EXISTS {target} AS SELECT * FROM ({select_sql}) WHERE 1=0;",
    )


@task(retries=3,
      retry_delay_seconds=exponential_backoff(backoff_factor=2),
      log_prints=True,
      task_run_name="copy_chunk_{query_columns.table}_{chunk_index}",
      # default= matters: these lookups run at import time, and a deployment
      # that has not been re-initialised since this variable was added has no
      # value for it. Without the default, Variable.get returns None and int()
      # raises, so the whole plugin fails to import on the worker.
      timeout_seconds=int(Variable.get("cache_chunk_timeout", default="3600")),
      cache_policy=NONE)
def copy_table_chunk(write_conn: Any, copy_params: CopyParameters, query_columns: QueryColumns,
                     source_schema: str, predicate: str, chunk_index: int, total_chunks: int):
    logger = get_run_logger()
    target = (
        f'"{copy_params.target_database}"."{copy_params.target_schema}"'
        f'."{query_columns.table}"'
    )
    logger.info(
        f"Chunk {chunk_index + 1}/{total_chunks} for '{query_columns.table}': {predicate}"
    )
    insert_sql = None
    try:
        # DELETE before INSERT, in that order. DuckDB over pgwire autocommits
        # every statement, so a crash between the INSERT and the progress
        # update leaves the chunk copied but recorded as incomplete; the
        # replay's leading DELETE removes that copy before reinserting it.
        # Swapping these two lines reintroduces duplicate rows on resume.
        # The plan's predicates are pairwise disjoint, so this DELETE can
        # never remove another chunk's rows.
        delete_seconds = execute_statement(write_conn, f"DELETE FROM {target} WHERE {predicate};")
        select_sql = create_select_query(copy_params, query_columns, source_schema, predicate)
        target_columns = ", ".join(
            f'"{column}"' for column in query_columns.columns_to_copy
        )
        insert_sql = f"INSERT INTO {target} ({target_columns}) {select_sql};"
        insert_seconds = execute_statement(write_conn, insert_sql)
    except Exception as exc:
        if insert_sql is not None:
            logger.error(
                f"Chunk {chunk_index + 1}/{total_chunks} INSERT failed for "
                f"'{query_columns.table}'. SQL: {insert_sql}"
            )
        raise ChunkCopyError(
            f"Chunk {chunk_index + 1}/{total_chunks} of '{query_columns.table}' "
            f"failed ({predicate}): {exc}"
        ) from exc

    # On BigQuery's total_bytes_processed: it is NOT available here. The source
    # is read through the DuckDB BigQuery extension, which surfaces no job
    # statistics, so there is nothing to log and nothing worth inventing. It
    # has to be read from the BigQuery job history during the canary run.
    logger.info(
        describe_chunk_progress(
            query_columns.table,
            chunk_index,
            total_chunks,
            _count_rows_in(write_conn, target, predicate, logger),
            _elapsed_seconds(delete_seconds, insert_seconds),
        )
    )


def _elapsed_seconds(*timings) -> float:
    """Total seconds from ``execute_statement``'s ``@time_execution`` strings."""
    total = 0.0
    for timing in timings:
        try:
            total += float(timing)
        except (TypeError, ValueError):
            continue
    return total


def _count_rows_in(write_conn: Any, target: str, predicate: str, logger) -> int | None:
    """Rows this chunk left in the target, or ``None`` if that could not be read.

    A COUNT(*) over one chunk's predicate, against the local cache rather than
    the source. Neither a psycopg2 cursor against Trex pgwire nor a duckdb
    connection reports affected rows through a surface the other shares, so the
    count is the portable answer.

    Never allowed to fail the chunk: the rows are already durably copied by the
    time this runs, and turning a successful chunk into a ChunkCopyError over a
    log line would cost the whole table a retry.
    """
    try:
        write_conn.execute(f"SELECT COUNT(*) FROM {target} WHERE {predicate};")
        row = write_conn.fetchone()
        return None if row is None or row[0] is None else int(row[0])
    except Exception as exc:
        logger.warning(f"Could not count the rows copied into {target}: {exc}")
        return None


@task(log_prints=True, task_run_name="copy_table_{query_columns.table}", tags=["table-level-concurrency"], cache_policy=NONE)
def copy_table_task(write_conn: Any, read_conn: Any, copy_params: CopyParameters, query_columns: QueryColumns, source_schema: str):
    logger = get_run_logger()
    table = query_columns.table
    database = copy_params.target_database
    schema = copy_params.target_schema
    try:
        expected = copy_table(
            write_conn, read_conn, copy_params, query_columns, source_schema, logger
        )
        if copy_params.dry_run:
            return expected
        # COMPLETE is written only after the target has been reconciled
        # against the source, so a later run can trust it and skip the table.
        reconcile_table(write_conn, read_conn, copy_params, source_schema, table, logger)
        mark_complete(write_conn, database, schema, table)
        return expected
    except ReconciliationError as exc:
        # The one failure the resume point cannot survive. Reconciliation runs
        # only after every chunk has completed, so chunks_completed already
        # equals chunks_total: the next run would resume at range(N, N), copy
        # nothing and reconcile to the identical mismatch, forever. Clearing
        # the resume point makes the next run replan the table from scratch.
        # The rows stay: clear_resume_point nulls plan_id, so copy_table's
        # plan-mismatch branch calls reset_table, the one place allowed to drop
        # a partial target.
        logger.error(
            f"Copy of table '{table}' failed reconciliation: {exc}. Clearing the "
            "resume point so the next attempt copies the table again from the start."
        )
        mark_failed(write_conn, database, schema, table)
        clear_resume_point(write_conn, database, schema, table)
        raise
    except Exception as exc:
        logger.error(f"Copy of table '{table}' failed: {exc}")
        # Deliberately NO DROP of the target table here, and deliberately no
        # clear_resume_point either. The partial rows plus the chunks_completed
        # counter are the resume point; the cleanup() this replaces dropped the
        # target on the way out, which is precisely what made a retry restart a
        # large table from chunk 0 and never converge (issue 3033). Never
        # reintroduce a DROP on this path.
        if not copy_params.dry_run:
            mark_failed(write_conn, database, schema, table)
        raise


def reconcile_table(write_conn: Any, read_conn: Any, copy_params: CopyParameters, source_schema: str, table: str, logger):
    """Fail the copy unless the target holds exactly as many rows as the source."""
    if copy_params.patient_filter or copy_params.timestamp_filter:
        # The target is intentionally a subset under a snapshot config, so
        # there is no count to reconcile it against.
        logger.info(
            f"Skipping reconciliation for '{table}': snapshot filters are active."
        )
        return

    adapter = build_source_adapter(read_conn)
    source_count = adapter.count_rows_exact(source_schema, table)

    target = f'"{copy_params.target_database}"."{copy_params.target_schema}"."{table}"'
    write_conn.execute(f"SELECT COUNT(*) FROM {target}")
    target_count = int(write_conn.fetchone()[0])

    if source_count != target_count:
        raise ReconciliationError(
            f"Row count mismatch for '{source_schema}.{table}': "
            f"source={source_count:,} target={target_count:,} "
            f"delta={target_count - source_count:,}"
        )

    logger.info(f"Reconciled '{table}': {target_count:,} rows")


def build_chunk_config(dialect: str, copy_params: CopyParameters) -> ChunkConfig:
    """The planner's tuning knobs for one copy. chunkSize overrides the default."""
    return ChunkConfig(
        target_chunk_rows=resolve_target_chunk_rows(dialect, copy_params.chunk_size),
        dry_run=copy_params.dry_run,
    )


def copy_table(write_conn: Any, read_conn: Any, copy_params: CopyParameters, query_columns: QueryColumns, source_schema: str, logger=None):
    table = query_columns.table
    database = copy_params.target_database
    schema = copy_params.target_schema
    dialect = read_conn.tenant_configs.dialect

    adapter = build_source_adapter(read_conn)
    config = build_chunk_config(dialect, copy_params)

    # A snapshot table_filter can narrow the copy to a subset of columns. The
    # chunk column has to come from that subset: every chunk runs
    # "DELETE FROM <target> WHERE <predicate>" before its INSERT, and the
    # target only has the copied columns, so chunking on one that was filtered
    # out makes every chunk fail as a ChunkCopyError. ["*"] means the whole row
    # is copied, so any column is fair game.
    allowed_columns = (
        query_columns.columns_to_copy
        if query_columns.columns_to_copy and query_columns.columns_to_copy != ["*"]
        else None
    )

    stats = adapter.collect(source_schema, table, config, logger, allowed_columns)
    plan = plan_chunks(dialect, source_schema, table, stats, config)
    logger.info(describe_plan(plan, source_schema, table))

    if config.dry_run:
        logger.info(
            f"[dry run] skipping the copy of '{source_schema}.{table}'; "
            "nothing was created, copied or dropped."
        )
        return stats.row_count

    if plan.strategy is ChunkStrategy.SINGLE_STATEMENT:
        target = f'"{database}"."{schema}"."{table}"'
        select_sql = create_select_query(copy_params, query_columns, source_schema)
        mark_in_progress(write_conn, database, schema, table, plan.plan_id, 1, stats.row_count)
        execute_statement(write_conn, f"DROP TABLE IF EXISTS {target};")
        execute_statement(write_conn, f"CREATE TABLE {target} AS {select_sql}")
        record_chunk_progress(write_conn, database, schema, table, 1)
        return stats.row_count

    # Expand "*" so the chunk SELECT lists real columns, and recompute the
    # filter columns against them: the CDM map's casing does not always match
    # the source catalog's.
    if query_columns.columns_to_copy == ["*"]:
        actual_columns = read_conn.get_columns(source_schema, table)
        query_columns = QueryColumns(
            table=table,
            columns_to_copy=actual_columns,
            patient_filter_col=find_column_case_insensitive(
                actual_columns, CDM_COLUMN_FILTER_MAP.get(table, {}).get("person_id_column")
            ),
            timestamp_filter_col=find_column_case_insensitive(
                actual_columns, CDM_COLUMN_FILTER_MAP.get(table, {}).get("timestamp_column")
            ),
        )

    checkpoint = read_checkpoint(write_conn, database, schema, table)
    start_at = 0
    if checkpoint is not None and checkpoint.plan_id == plan.plan_id:
        # min(): chunks_completed can exceed the plan length only if the stored
        # counter is corrupt, and range() would then silently copy nothing.
        start_at = min(checkpoint.chunks_completed, len(plan.predicates))
        logger.info(
            f"Resuming '{table}' at chunk {start_at + 1}/{len(plan.predicates)} "
            f"(plan {plan.plan_id[:12]})"
        )
    elif checkpoint is not None:
        # The rows already copied were written under different chunk
        # boundaries, so mixing them with the new predicates could duplicate
        # or drop rows. Start this table again.
        logger.warning(
            f"Plan for '{table}' changed ({checkpoint.plan_id} -> {plan.plan_id}); "
            "discarding the partial copy and starting from chunk 1."
        )
        reset_table(write_conn, database, schema, table, logger)

    mark_in_progress(
        write_conn, database, schema, table, plan.plan_id, len(plan.predicates), stats.row_count
    )
    if start_at:
        # mark_in_progress writes chunks_completed = 0 when it inserts, so the
        # resume point has to be written back before the loop begins.
        record_chunk_progress(write_conn, database, schema, table, start_at)

    create_empty_target_table_if_absent(write_conn, copy_params, query_columns, source_schema)

    for index in range(start_at, len(plan.predicates)):
        copy_table_chunk(
            write_conn, copy_params, query_columns, source_schema,
            plan.predicates[index], index, len(plan.predicates),
        )
        record_chunk_progress(write_conn, database, schema, table, index + 1)

    return stats.row_count


def _fetchall_rows(conn: Any, statement: str):
    """Run a query and return its rows.

    execute() then fetchall() is the whole surface a psycopg2 cursor against
    Trex pgwire and a plain duckdb connection have in common, which is why
    every read in this plugin is spelled this way.
    """
    conn.execute(statement)
    return conn.fetchall()


def create_select_query(copy_params: CopyParameters, query_columns: QueryColumns, source_schema: str, where_sql: str | None = None) -> str:
    """Build the source SELECT, optionally narrowed by one chunk predicate.

    ``where_sql`` is a predicate string or nothing -- never a row range. An
    earlier version also accepted a ``(start, end)`` pair and turned it into a
    paged query, which was unreachable (every caller passes a predicate or
    None) and wrong anyway: it paged with no ORDER BY, so two pages could
    overlap or skip rows depending on the source's scan order. Chunking is the
    planner's job, and it partitions on a column, not on row position.
    """
    columns_to_copy = query_columns.columns_to_copy
    table = query_columns.table
    database = copy_params.source_database
    schema = source_schema

    if not columns_to_copy or columns_to_copy == ["*"]:
        columns_sql = "*"
    else:
        columns_sql = ", ".join(f'"{col}"' for col in columns_to_copy)

    base_query = f'SELECT {columns_sql} FROM "{database}"."{schema}"."{table}"'

    has_where = False
    if where_sql:
        has_where = True
        base_query += f" WHERE {where_sql}"

    # Add patient and timestamp filters
    filters = []
    if query_columns.patient_filter_col and copy_params.patient_filter:
        ids = ", ".join(str(int(pid)) for pid in copy_params.patient_filter)
        filters.append(f"{query_columns.patient_filter_col} IN ({ids})")
    if query_columns.timestamp_filter_col and copy_params.timestamp_filter:
        ts_value = str(copy_params.timestamp_filter).replace("'", "''")
        filters.append(f"{query_columns.timestamp_filter_col} = '{ts_value}'")

    if filters:
        base_query += (" AND " if has_where else " WHERE ") + " AND ".join(filters)
    
    return base_query

def create_index_query(
    database_name: str,
    schema_name: str,
    table_name: str,
    index_name: str,
    column_names: list[str],
    unique: bool = False,
) -> str:
    # by default indexes created on columns in asc order
    columns_str = ", ".join(column_names)
    return f'''
        CREATE {"UNIQUE" if unique else ""} INDEX IF NOT EXISTS {index_name} 
        ON "{database_name}"."{schema_name}"."{table_name}" ({columns_str});
        '''

def copy_indexes(write_conn: Any, read_conn: Any, copy_params: CopyParameters, query_columns: QueryColumns, source_schema : str, logger = None):
    table = query_columns.table
    columns_to_copy = query_columns.columns_to_copy

    if columns_to_copy == ["*"]:
        columns_to_copy = read_conn.get_columns(source_schema, table)

    target_database = copy_params.target_database
    target_schema = copy_params.target_schema   


    indexes = read_conn.get_indexes_for_table(source_schema, table)
    
    if not indexes:
        logger.info(
            f"No indexes found for table '{table}'. Skipping index copy."
        )
    else:
        logger.info(f"Found {len(indexes)} indexes for table '{table}'.")
        
        for index in indexes:
            if not set(index.get('column_names')).issubset(set(columns_to_copy)):
                logger.info(
                    f"Skipping index '{index.get('name')}' on columns {index.get('column_names')} as these columns were not copied."
                )
                continue
            else:
                logger.debug(
                    f"Creating index '{index.get('name')}' on columns {index.get('column_names')} (unique={index.get('unique')}) for table '{table}'."
                )

                execute_statement(
                    write_conn,
                    create_index_query(
                        target_database,
                        target_schema,
                        table,
                        index.get("name"),
                        index.get("column_names"),
                        index.get("unique"),
                    ),
                )

                logger.info(
                    f"{'Unique' if index.get('unique') else 'Non-unique'} index '{index.get('name')}' created for table '{table}' on columns {index.get('column_names')}."
                )

    pk_index = read_conn.get_indexes_for_pk(source_schema, table)
    pk_index_name = pk_index.get("name")
    pk_index_columns = pk_index.get("constrained_columns")
    
    if not pk_index_name and not pk_index_columns:
        logger.info(
            f"No primary key index found for table '{table}'. Skipping primary index copy"
        )

    elif not set(pk_index_columns).issubset(set(columns_to_copy)):
        logger.info(
            f"Skipping primary key index '{pk_index_name}' on columns {pk_index_columns} as these columns were not copied."
        )
    else:
        if pk_index_name is not None and pk_index_columns != []:
            logger.debug(
                f"Creating primary key index '{pk_index_name}' on columns {pk_index_columns} for table '{table}'."
            )
            execute_statement(
                write_conn,
                create_index_query(
                    target_database,
                    target_schema,
                    table,
                    pk_index_name,
                    pk_index_columns,
                    unique=True,
                ),
            )
            logger.info(
                f"Primary Key Index '{pk_index_name}' copied for table '{table}' in schema '{target_database}'.'{target_schema}'."
            )
