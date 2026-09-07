import assert from "node:assert/strict";
import type { Connection } from "@alp/alp-base-utils";
import { env } from "../env.ts";
import {
    CdmSqlAuditLogger,
    createCdmSqlAuditContext,
    createCdmSqlAuditConnection,
    executeWithCdmSqlAudit,
    renderSqlWithParameters,
    type CdmSqlAuditContext,
} from "./CdmSqlAuditLogger.ts";

const context: CdmSqlAuditContext = {
    actorId: "test-user",
    datasetId: "dataset-2845",
    configs: {
        cohortBuilder: { id: "pa-config-2845", version: "A" },
        cdm: { id: "cdm-config-2845", version: "1" },
    },
    requestMethod: "POST",
    requestPath: "/analytics-svc/api/services/population",
    correlationId: "correlation-2845",
    requestQuery: {
        mriquery: "encoded-mri-query",
        datasetId: "dataset-2845",
    },
    requestParams: { service: "population" },
    requestBody: { chartType: "bar" },
    databaseCode: "test-cdm",
    databaseDialect: "hana",
    databaseEngine: "hana",
    schemaName: "CDM",
};

Deno.test("createCdmSqlAuditContext captures request and database metadata", () => {
    assert.deepEqual(
        createCdmSqlAuditContext({
            request: {
                method: "GET",
                path: "/analytics-svc/api/dataset-filter",
                headers: {
                    "x-req-correlation-id": ["correlation-2845"],
                },
                query: {
                    mriquery: "encoded-mri-query",
                    datasetId: "dataset-2845",
                },
                params: { service: "dataset-filter" },
                body: {
                    chartType: "bar",
                    password: "must-be-redacted",
                    nested: { access_token: "must-also-be-redacted" },
                },
                selectedstudyDbMetadata: { id: "canonical-dataset-2845" },
                paConfigId: "pa-config-2845",
                paConfigVersion: "A",
                cdmConfigId: "cdm-config-2845",
                cdmConfigVersion: "1",
            },
            actorId: "test-user",
            databaseCode: "characterization-db",
            databaseDialect: "postgresql",
            databaseEngine: "postgresql",
            schemaName: "DQD",
        }),
        {
            actorId: "test-user",
            datasetId: "canonical-dataset-2845",
            configs: {
                cohortBuilder: { id: "pa-config-2845", version: "A" },
                cdm: { id: "cdm-config-2845", version: "1" },
            },
            requestMethod: "GET",
            requestPath: "/analytics-svc/api/dataset-filter",
            correlationId: "correlation-2845",
            requestQuery: {
                mriquery: "encoded-mri-query",
                datasetId: "dataset-2845",
            },
            requestParams: { service: "dataset-filter" },
            requestBody: {
                chartType: "bar",
                password: "[REDACTED]",
                nested: { access_token: "[REDACTED]" },
            },
            databaseCode: "characterization-db",
            databaseDialect: "postgresql",
            databaseEngine: "postgresql",
            schemaName: "DQD",
        }
    );
});

function createWriter() {
    const events: Array<Record<string, unknown>> = [];
    return {
        events,
        writer: {
            append(fileName: string, event: Record<string, unknown>) {
                assert.equal(fileName, "cdm-sql-access.ndjson");
                events.push(event);
                return Promise.resolve();
            },
        },
    };
}

function createConnection(
    error?: Error
): Connection.ConnectionInterface {
    const connection = {
        conn: {},
        schemaName: "CDM",
        vocabSchemaName: "VOCAB",
        dialect: "hana",
        execute(
            _sql: string,
            _parameters: unknown[],
            callback: (error: Error | null, data: unknown) => void
        ) {
            callback(error ?? null, error ? null : [{ person_id: 1 }]);
        },
        executeQuery(
            sql: string,
            parameters: unknown[],
            callback: (error: Error | null, data: unknown) => void
        ) {
            this.execute(sql, parameters, callback);
        },
    };

    return connection as unknown as Connection.ConnectionInterface;
}

async function executeQuery(
    connection: Connection.ConnectionInterface,
    sql: string,
    parameters: Array<{ value: unknown }>
): Promise<unknown> {
    return await new Promise((resolve, reject) => {
        connection.executeQuery(sql, parameters as never, (error, result) => {
            if (error) {
                reject(error);
            } else {
                resolve(result);
            }
        });
    });
}

Deno.test("renderSqlWithParameters preserves complete inline SQL", () => {
    const sql = renderSqlWithParameters(
        "SELECT * FROM person WHERE id = 123 AND name = 'O''Hara--private' -- patient",
        []
    );

    assert.equal(
        sql,
        "SELECT * FROM person WHERE id = 123 AND name = 'O''Hara--private' -- patient"
    );
});

Deno.test("renderSqlWithParameters inlines question placeholders outside literals", () => {
    const sql = renderSqlWithParameters(
        "SELECT '?' AS marker, person_id FROM person WHERE name = ? AND age = ?",
        [{ value: "O'Hara" }, { value: 42 }]
    );

    assert.equal(
        sql,
        "SELECT '?' AS marker, person_id FROM person WHERE name = 'O''Hara' AND age = 42"
    );
});

Deno.test("renderSqlWithParameters inlines numbered placeholders", () => {
    const sql = renderSqlWithParameters(
        "SELECT * FROM person WHERE id = $2 OR name = $1",
        [{ value: "Alice" }, { value: 2845 }]
    );

    assert.equal(
        sql,
        "SELECT * FROM person WHERE id = 2845 OR name = 'Alice'"
    );
});

Deno.test("CDM SQL audit flag is independent from patient audit flag", () => {
    const previousCdmFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const previousPatientFlag = env.IS_AUDIT_LOG_ENABLED;
    const connection = createConnection();

    try {
        env.IS_AUDIT_LOG_ENABLED = "true";
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "false";
        assert.equal(
            createCdmSqlAuditConnection(connection, context),
            connection
        );

        env.IS_AUDIT_LOG_ENABLED = "false";
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        assert.notEqual(
            createCdmSqlAuditConnection(connection, context),
            connection
        );
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousCdmFlag;
        env.IS_AUDIT_LOG_ENABLED = previousPatientFlag;
    }
});

Deno.test("audited connection preserves constructor identity", () => {
    const previousFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const connection = createConnection();

    try {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        const auditedConnection = createCdmSqlAuditConnection(
            connection,
            context
        );

        assert.equal(
            auditedConnection.constructor,
            connection.constructor
        );
        assert.equal(
            auditedConnection.constructor.name,
            connection.constructor.name
        );
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousFlag;
    }
});

Deno.test("audited connection writes one successful event per SQL call", async () => {
    const previousFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const { events, writer } = createWriter();

    try {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        const connection = createCdmSqlAuditConnection(
            createConnection(),
            context,
            new CdmSqlAuditLogger(context, writer)
        );
        const result = await executeQuery(
            connection,
            "SELECT * FROM person WHERE person_id = 123 AND name = 'Alice' AND external_id = ?",
            [{ value: "sensitive-parameter" }]
        );

        assert.deepEqual(result, [{ person_id: 1 }]);
        assert.equal(events.length, 1);
        const event = events[0] as any;
        assert.equal(event.schemaVersion, 1);
        assert.equal(event.eventType, "cdm.sql");
        assert.match(
            event.occurredAt,
            /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
        );
        assert.deepEqual(event.actor, { type: "user", id: "test-user" });
        assert.equal(event.datasetId, "dataset-2845");
        assert.deepEqual(event.configs, {
            cohortBuilder: { id: "pa-config-2845", version: "A" },
            cdm: { id: "cdm-config-2845", version: "1" },
        });
        assert.deepEqual(event.request, {
            method: "POST",
            path: "/analytics-svc/api/services/population",
            correlationId: "correlation-2845",
            query: {
                mriquery: "encoded-mri-query",
                datasetId: "dataset-2845",
            },
            params: { service: "population" },
            body: { chartType: "bar" },
        });
        assert.deepEqual(event.database, {
            engine: "hana",
            dialect: "hana",
            code: "test-cdm",
            schema: "CDM",
        });
        assert.equal(event.operation, "executeQuery");
        assert.equal(
            event.sql,
            "SELECT * FROM person WHERE person_id = 123 AND name = 'Alice' AND external_id = 'sensitive-parameter'"
        );
        assert.equal(event.parameterCount, 1);
        assert.equal(event.successful, true);
        assert.equal(typeof event.durationMs, "number");
        assert.equal(JSON.stringify(event).includes("Alice"), true);
        assert.equal(JSON.stringify(event).includes("sensitive-parameter"), true);
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousFlag;
    }
});

Deno.test("audited connection preserves Promise-based execution", async () => {
    const previousFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const { events, writer } = createWriter();
    const promiseConnection = {
        conn: {},
        schemaName: "main",
        vocabSchemaName: "main",
        dialect: "duckdb",
        executeQuery() {
            return Promise.resolve([{ count: 1 }]);
        },
    } as unknown as Connection.ConnectionInterface;

    try {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        const duckdbContext: CdmSqlAuditContext = {
            ...context,
            databaseEngine: "duckdb",
        };
        const connection = createCdmSqlAuditConnection(
            promiseConnection,
            duckdbContext,
            new CdmSqlAuditLogger(duckdbContext, writer)
        );
        const result = await (connection.executeQuery as any)(
            "SELECT count(*) FROM person",
            []
        );

        assert.deepEqual(result, [{ count: 1 }]);
        assert.equal(events.length, 1);
        assert.equal((events[0] as any).successful, true);
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousFlag;
    }
});

Deno.test("executeWithCdmSqlAudit records the supplied CDM SQL", async () => {
    const previousFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const { events, writer } = createWriter();

    try {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        const result = await executeWithCdmSqlAudit({
            context,
            operation: "executeQuery",
            sql: "SELECT * FROM person WHERE person_id = ?",
            parameters: [{ value: 2845 }],
            execute: () => Promise.resolve({ data: [{ person_id: 2845 }] }),
            recorder: new CdmSqlAuditLogger(context, writer),
        });

        assert.deepEqual(result, { data: [{ person_id: 2845 }] });
        assert.equal(events.length, 1);
        assert.equal(
            (events[0] as any).sql,
            "SELECT * FROM person WHERE person_id = 2845"
        );
        assert.equal((events[0] as any).successful, true);
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousFlag;
    }
});

Deno.test("executeWithCdmSqlAudit records failures and preserves the error", async () => {
    const previousFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const { events, writer } = createWriter();
    const databaseError = Object.assign(new Error("query failed"), {
        name: "DatabaseError",
        code: "HANA-2845",
    });

    try {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        await assert.rejects(
            () =>
                executeWithCdmSqlAudit({
                    context,
                    operation: "executeQuery",
                    sql: "SELECT * FROM person WHERE person_id = ?",
                    parameters: [{ value: 2845 }],
                    execute: () => Promise.reject(databaseError),
                    recorder: new CdmSqlAuditLogger(context, writer),
                }),
            (error) => error === databaseError
        );

        assert.equal(events.length, 1);
        assert.equal((events[0] as any).successful, false);
        assert.deepEqual((events[0] as any).error, {
            name: "DatabaseError",
            code: "HANA-2845",
        });
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousFlag;
    }
});

Deno.test("failed SQL audit records safe error metadata", async () => {
    const previousFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const { events, writer } = createWriter();
    const error = Object.assign(
        new Error("sensitive database error detail"),
        { name: "DatabaseError", code: 401 }
    );

    try {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        const connection = createCdmSqlAuditConnection(
            createConnection(error),
            context,
            new CdmSqlAuditLogger(context, writer)
        );

        await assert.rejects(
            () => executeQuery(connection, "SELECT 1", []),
            /sensitive database error detail/
        );

        assert.equal(events.length, 1);
        const event = events[0] as any;
        assert.equal(event.successful, false);
        assert.deepEqual(event.error, {
            name: "DatabaseError",
            code: "401",
        });
        assert.equal(
            JSON.stringify(event).includes("sensitive database error detail"),
            false
        );
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousFlag;
    }
});

Deno.test("SQL audit persistence failures are fail-open and payload-safe", async () => {
    const previousFlag = env.IS_CDM_SQL_AUDIT_LOG_ENABLED;
    const originalConsoleError = console.error;
    const consoleCalls: unknown[][] = [];

    try {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = "true";
        console.error = (...args: unknown[]) => consoleCalls.push(args);
        const connection = createCdmSqlAuditConnection(
            createConnection(),
            context,
            {
                record() {
                    throw new Error("sensitive audit persistence detail");
                },
            }
        );

        const result = await executeQuery(
            connection,
            "SELECT * FROM person WHERE person_id = 2845",
            []
        );

        assert.deepEqual(result, [{ person_id: 1 }]);
        assert.deepEqual(consoleCalls, [
            ["CDM SQL audit event could not be written"],
        ]);
        assert.equal(
            JSON.stringify(consoleCalls).includes("person_id"),
            false
        );
        assert.equal(
            JSON.stringify(consoleCalls).includes(
                "sensitive audit persistence detail"
            ),
            false
        );
    } finally {
        env.IS_CDM_SQL_AUDIT_LOG_ENABLED = previousFlag;
        console.error = originalConsoleError;
    }
});
