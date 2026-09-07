"""Pure chunk planning. This module must never import prefect or touch a database."""

import hashlib
from collections.abc import Iterable, Sequence
from datetime import date, datetime
from decimal import Decimal

from .errors import PlannerError
from .planner_types import (
    ChunkColumnCandidate,
    ChunkConfig,
    ChunkPlan,
    ChunkStats,
    ChunkStrategy,
)

PLANNER_VERSION = 2

DEFAULT_TARGET_CHUNK_ROWS = {
    "bigquery": 5_000_000,
    "postgres": 1_000_000,
}
FALLBACK_TARGET_CHUNK_ROWS = 1_000_000

#: A plan is rejected when its NULL chunk holds more than this many times
#: ``target_chunk_rows``.
#:
#: ``build_predicates`` emits exactly one ``"col" IS NULL`` predicate, and
#: nothing sizes or splits it -- nothing *can* split it, since every row in it
#: has the same key. So an oversized NULL chunk cannot be fixed, only detected
#: and refused. It matters most on BigQuery, where INFORMATION_SCHEMA reports
#: nearly every column ``is_nullable = 'YES'``: a NULL-heavy partition or
#: cluster column produces a single INSERT holding most of a multi-hundred-
#: million-row table, straight through the one-hour ``cache_chunk_timeout``.
MAX_NULL_CHUNK_MULTIPLE = 3

#: A plan is rejected when its chunks are this many times larger than the size
#: the planner asked for.
#:
#: ``interval_count < 2`` only catches a plan that collapsed all the way to one
#: predicate. Three distinct values give two chunks, one of them holding most
#: of the table, and that passed every other guard while being logged as
#: CHUNKED. ``CHUNK_COLUMN_MAP`` has real examples -- ``fact_relationship`` ->
#: ``domain_concept_id_1`` (2-4 distinct values), ``drug_strength`` ->
#: ``drug_concept_id`` -- and ``pick_bq_candidate`` prefers a BigQuery
#: partition column, so a table partitioned on a handful of dates has the same
#: shape.
#:
#: The comparison is against ``_planned_chunk_rows``, not ``target_chunk_rows``
#: alone: when ``max_chunks`` (or ``min_chunk_rows``) binds, the planner has
#: already chosen chunks larger than the target on purpose, to keep the
#: predicate list bounded. Failing there would leave the operator no recourse,
#: since raising ``chunkSize`` makes chunks bigger and ``max_chunks`` is not a
#: flow option.
MAX_CHUNK_SIZE_MULTIPLE = 5


def resolve_target_chunk_rows(dialect: str, override: int | None) -> int:
    """Rows per chunk. An explicit chunkSize from the caller always wins.

    It only wins if it is usable: a zero or negative override is a config
    mistake, and accepting one produces either a ZeroDivisionError or a single
    unbounded chunk rather than the smaller chunks the caller asked for.
    """
    if override is not None:
        if not isinstance(override, int) or isinstance(override, bool) or override < 1:
            raise PlannerError(
                f"chunkSize must be a positive integer, got {override!r}."
            )
        return override
    return DEFAULT_TARGET_CHUNK_ROWS.get(dialect, FALLBACK_TARGET_CHUNK_ROWS)


def resolve_chunk_count(row_count: int, config: ChunkConfig) -> int:
    """Number of chunks, derived from row count and hard-capped.

    Deliberately independent of the chunk column's min/max span: deriving the
    count from the span is what made the planner allocate an unbounded list for
    hash-distributed keys (issue 3033).
    """
    if row_count <= 0:
        return 1
    n = -(-row_count // config.target_chunk_rows)  # ceil division
    # Large tables require at least two chunks; one is still an unbounded copy.
    if row_count >= config.small_table_threshold:
        n = max(2, n)
    n = min(n, config.max_chunks)
    n = min(n, max(1, row_count // config.min_chunk_rows))
    return max(1, n)


def sql_literal(value: object) -> str:
    """Render a boundary value as a SQL literal.

    The accepted set is deliberately narrow. Anything a chunk boundary should
    never be -- NULL, a bool, a float -- is rejected rather than guessed at, so
    a surprising value from the source catalog fails planning instead of
    silently producing a predicate that matches the wrong rows.
    """
    if value is None:
        raise PlannerError("Cannot render NULL as a chunk boundary literal.")
    # bool is a subclass of int, so it has to be rejected first.
    if isinstance(value, bool):
        raise PlannerError("Boolean chunk boundaries are not supported.")
    if isinstance(value, float):
        raise PlannerError(
            "Float chunk boundaries are not supported: rounding would make chunk "
            "edges overlap or leave gaps."
        )
    if isinstance(value, Decimal):
        if not value.is_finite():
            raise PlannerError(
                f"Non-finite chunk boundary: {value}. DuckDB reads a bare NaN or "
                "Infinity as a column reference, so this would fail mid-copy "
                "rather than during planning."
            )
        # str() would render Decimal('1E+3') in scientific notation, which
        # DuckDB types as DOUBLE -- the same lossy-float boundary that floats
        # are rejected to avoid. format(..., "f") keeps it exact.
        return format(value, "f")
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (datetime, date)):
        return f"'{value.isoformat()}'"
    if isinstance(value, str):
        escaped = value.replace("'", "''")
        return f"'{escaped}'"
    raise PlannerError(f"Unsupported chunk boundary type: {type(value).__name__}.")


def quote_identifier(name: str) -> str:
    escaped = name.replace('"', '""')
    return f'"{escaped}"'


def normalise_boundaries(raw_boundaries: Iterable) -> list:
    """Sorted, de-duplicated, NULL-free boundary values.

    Mixed or unhashable boundary values are a planning failure, not a bug in
    the caller's control flow: they arrive from a source catalog. Raising the
    raw TypeError would escape the ``except CacheCopyError`` the orchestration
    layer wraps a table copy in, so it is translated here.
    """
    try:
        return sorted({value for value in raw_boundaries if value is not None})
    except TypeError as exc:
        raise PlannerError(
            f"Chunk boundaries could not be sorted or de-duplicated: {exc}. "
            "The source returned values of mixed or unorderable types."
        ) from exc


def build_predicates(column: ChunkColumnCandidate, raw_boundaries: Iterable) -> tuple[str, ...]:
    """Turn quantile boundaries into mutually exclusive, exhaustive predicates.

    ``raw_boundaries`` is the adapter's quantile output and includes the column
    minimum and maximum. Those outer endpoints are dropped: the first and last
    chunks are left unbounded so that rows added or discovered outside the
    sampled range are still copied. The remaining cuts become half-open
    intervals, which is what keeps a row from landing in two chunks when a
    value sits exactly on a boundary.

    On quoting: identifiers here are double-quoted (``"col" < 5``) on purpose,
    for every dialect. These predicates are evaluated by DuckDB against an
    ATTACHed source table -- they are never sent to BigQuery as SQL -- so
    DuckDB's quoting rules are the ones that apply. Backticks would be a bug,
    not a portability fix; this has now been "corrected" twice in review.
    """
    cuts = normalise_boundaries(raw_boundaries)
    cuts = cuts[1:-1] if len(cuts) > 2 else []

    col = quote_identifier(column.name)
    if not cuts:
        # Fewer than three distinct values: there is nothing to cut on, so the
        # non-NULL rows are one chunk.
        predicates = [f"{col} IS NOT NULL"]
    else:
        literals = [sql_literal(cut) for cut in cuts]
        predicates = [f"{col} < {literals[0]}"]
        for lower, upper in zip(literals, literals[1:]):
            predicates.append(f"{col} >= {lower} AND {col} < {upper}")
        predicates.append(f"{col} >= {literals[-1]}")

    if column.nullable:
        # Every comparison above is false for NULL, so NULLs need their own
        # chunk or they are silently dropped from the copy.
        predicates.append(f"{col} IS NULL")

    return tuple(predicates)


def count_interval_predicates(predicates: Sequence[str], includes_null_chunk: bool) -> int:
    """How many predicates describe a value interval, excluding the NULL chunk.

    The NULL chunk is bookkeeping, not a slice of the value range, so it must
    not be counted when judging whether a plan actually divides the table.
    """
    return len(predicates) - (1 if includes_null_chunk else 0)


def _thin_boundaries(values: Sequence, max_values: int) -> list:
    """Evenly drop boundaries until at most ``max_values`` remain.

    An adapter may hand back more quantiles than the capped chunk count allows.
    Thinning here -- rather than truncating -- keeps the retained cuts spread
    across the whole range, so the chunks stay roughly equal in size while the
    cap on chunk count is still honoured.
    """
    if max_values < 2:
        # Asking for fewer than two boundaries is asking for something no
        # interval can be built from. Returning the caller's list unchanged
        # would be the opposite of what was asked, so keep only the outer pair
        # and let plan_chunks reject the degenerate plan that results.
        max_values = 2
    if len(values) <= max_values:
        return list(values)
    step = (len(values) - 1) / (max_values - 1)
    picked = [values[round(i * step)] for i in range(max_values)]
    # round() can land on the same index twice for tiny steps; de-duplicate
    # while preserving order. That only ever lowers the count.
    seen = []
    for value in picked:
        if not seen or value != seen[-1]:
            seen.append(value)
    return seen


def planned_chunk_rows(row_count: int, chunk_count: int, config: ChunkConfig) -> int:
    """Rows per chunk the planner asked for, after its own caps.

    Normally this is ``target_chunk_rows``. When ``max_chunks`` or
    ``min_chunk_rows`` binds, ``resolve_chunk_count`` has deliberately chosen
    fewer, larger chunks than the target, and that larger size is the honest
    yardstick for :data:`MAX_CHUNK_SIZE_MULTIPLE`.
    """
    per_chunk = -(-row_count // max(1, chunk_count))  # ceil division
    return max(config.target_chunk_rows, per_chunk)


def compute_plan_id(
    dialect: str,
    schema: str,
    table: str,
    column_name: str | None,
    strategy: ChunkStrategy,
    predicates: Sequence[str],
) -> str:
    """Stable identity for a plan.

    The hash covers the predicates that will actually be executed, not the
    boundaries they were derived from. Those are not the same thing in either
    direction: two different boundary lists can yield byte-identical predicates
    (``build_predicates`` discards the outer endpoints), and one boundary list
    can yield two different predicate lists (a nullable column gains a NULL
    chunk). Since ``plan_id`` is the resume key -- a different id means the
    stored checkpoints no longer describe the work about to be done -- it has
    to track the executed predicates exactly.
    """
    parts = [
        str(PLANNER_VERSION),
        dialect,
        schema,
        table,
        str(column_name),
        strategy.value,
        str(len(predicates)),
    ]
    parts.extend(predicates)
    return hashlib.sha256("\x1f".join(parts).encode("utf-8")).hexdigest()


def plan_chunks(
    dialect: str,
    schema: str,
    table: str,
    stats: ChunkStats,
    config: ChunkConfig,
) -> ChunkPlan:
    """Decide how a table will be copied. Pure: no database access."""
    if stats.row_count < config.small_table_threshold:
        return ChunkPlan(
            plan_id=compute_plan_id(
                dialect, schema, table, None, ChunkStrategy.SINGLE_STATEMENT, ()
            ),
            strategy=ChunkStrategy.SINGLE_STATEMENT,
            column_name=None,
            column_kind=None,
            predicates=(),
            estimated_rows_per_chunk=stats.row_count,
            includes_null_chunk=False,
        )

    if stats.column is None:
        raise PlannerError(
            f"{schema}.{table} has {stats.row_count:,} rows but no usable chunk column. "
            "Refusing to fall back to an unbounded single-statement copy: on a table "
            "this size that is what exhausts the worker rather than failing cleanly "
            "(issue 3033). Provide a chunk column or raise the small-table threshold."
        )

    if stats.column.nullable and stats.null_count is not None:
        null_chunk_limit = MAX_NULL_CHUNK_MULTIPLE * config.target_chunk_rows
        if stats.null_count > null_chunk_limit:
            raise PlannerError(
                f"{schema}.{table}: chunking on {stats.column.name} would put "
                f"{stats.null_count:,} NULL rows into a single chunk, more than "
                f"{MAX_NULL_CHUNK_MULTIPLE}x the {config.target_chunk_rows:,}-row "
                f"target ({null_chunk_limit:,}). The NULL chunk cannot be split -- "
                "every row in it has the same key -- so this would run as one "
                "oversized INSERT and blow the per-chunk timeout. Choose a chunk "
                f"column with fewer NULLs than {stats.column.name}, or exclude this "
                "table from the copy."
            )

    chunk_count = resolve_chunk_count(stats.row_count, config)
    # n boundaries yield n-1 predicates, so cap the boundaries at chunk_count+1
    # to keep the plan inside max_chunks (plus the NULL chunk, if any).
    boundaries = _thin_boundaries(normalise_boundaries(stats.boundaries), chunk_count + 1)
    predicates = build_predicates(stats.column, boundaries)

    interval_count = count_interval_predicates(predicates, stats.column.nullable)
    if interval_count < 2:
        raise PlannerError(
            f"{schema}.{table} has {stats.row_count:,} rows but chunking on "
            f"{stats.column.name} collapsed to a single unbounded predicate: the "
            f"source returned {len(boundaries)} distinct boundary value(s), so the "
            "column is too low-cardinality to chunk on. Refusing to run what would "
            "be an unbounded whole-table copy mislabelled as CHUNKED (issue 3033). "
            "Pick a higher-cardinality chunk column or raise the small-table "
            "threshold above this row count."
        )

    # Not redundant with the guard above, in either direction. A 600k-row table
    # that collapses to one interval is well inside this size limit and only
    # the degenerate-plan guard catches it; a 900M-row table cut into two
    # 450M-row chunks passes the degenerate-plan guard and only this one
    # catches it. The degenerate case is checked first because "too
    # low-cardinality to chunk on" says more than a size ratio does.
    estimated_rows_per_chunk = max(1, stats.row_count // interval_count)
    size_limit = MAX_CHUNK_SIZE_MULTIPLE * planned_chunk_rows(
        stats.row_count, chunk_count, config
    )
    if estimated_rows_per_chunk > size_limit:
        raise PlannerError(
            f"{schema}.{table} has {stats.row_count:,} rows but chunking on "
            f"{stats.column.name} yields only {interval_count} chunks of about "
            f"{estimated_rows_per_chunk:,} rows each, more than "
            f"{MAX_CHUNK_SIZE_MULTIPLE}x the {config.target_chunk_rows:,}-row target: "
            f"the source returned {len(boundaries)} distinct boundary value(s), so the "
            "column has too few distinct values to cut this table evenly. Chunks that "
            "size blow the per-chunk timeout and risk exhausting the worker (issue "
            "3033). Pick a higher-cardinality chunk column."
        )

    return ChunkPlan(
        plan_id=compute_plan_id(
            dialect, schema, table, stats.column.name, ChunkStrategy.CHUNKED, predicates
        ),
        strategy=ChunkStrategy.CHUNKED,
        column_name=stats.column.name,
        column_kind=stats.column.kind,
        predicates=predicates,
        estimated_rows_per_chunk=estimated_rows_per_chunk,
        includes_null_chunk=stats.column.nullable,
    )


def describe_plan(plan: ChunkPlan, schema: str, table: str) -> str:
    """One-line summary of a plan, for the copy log."""
    if plan.strategy is ChunkStrategy.SINGLE_STATEMENT:
        return f"{schema}.{table}: single statement (below small-table threshold)"
    # A CHUNKED plan always carries the column it was chunked on.
    return (
        f"{schema}.{table}: {len(plan.predicates)} chunks on {plan.column_name} "
        f"({plan.column_kind.value}), "
        f"~{plan.estimated_rows_per_chunk:,} rows/chunk, "
        f"null_chunk={plan.includes_null_chunk}, plan_id={plan.plan_id[:12]}"
    )


def describe_chunk_progress(
    table: str, chunk_index: int, total_chunks: int, rows: int | None, seconds: float
) -> str:
    """One line per finished chunk: how much moved, and how long it took.

    ``chunk_index`` is zero-based, as the copy loop counts; the line is
    one-based, as an operator reading it does.

    ``rows`` is ``None`` when the count could not be taken. That is reported as
    unknown rather than as zero: a genuinely empty chunk is a real and
    interesting answer, and conflating the two hides it.
    """
    counted = "unknown rows" if rows is None else f"{rows:,} rows"
    return (
        f"Chunk {chunk_index + 1}/{total_chunks} of '{table}' copied "
        f"{counted} in {seconds:.1f}s"
    )


def describe_dry_run_summary(schema: str, planned: int, unplannable: Sequence[str]) -> str:
    """Closing line of a dry run: how much of the schema is actually copyable.

    A dry run that aborted on the first ``PlannerError`` told the operator
    about one table and nothing else, which is the opposite of what the mode is
    for. The count of clean tables is as load-bearing as the list of broken
    ones: it is what says the rest of the schema is fine.
    """
    total = planned + len(unplannable)
    line = (
        f"[dry run] {schema}: {planned}/{total} table(s) planned cleanly, "
        f"{len(unplannable)} could not be planned"
    )
    if unplannable:
        line += f": {sorted(unplannable)}"
    return line + ". Nothing was created, copied or dropped."


def find_column_case_insensitive(columns: list[str], target: str) -> str | None:
    if not target:
        return None
    for col in columns:
        if col.lower() == target.lower():
            return col
    return None
