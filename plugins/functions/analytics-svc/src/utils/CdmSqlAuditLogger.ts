import type { ConnectionInterface } from "../../../_shared/alp-base-utils/src/Connection.ts";
import { env } from "../env.ts";
import {
    CDM_SQL_AUDIT_FILE,
    type AuditEventWriter,
    createAuditEventWriter,
} from "./AuditEventWriter.ts";

const SQL_METHODS = new Set([
    "execute",
    "executeQuery",
    "executeStreamQuery",
    "executeUpdate",
    "executeBulkUpdate",
    "executeBulkInsert",
    "executeProc",
]);

export type CdmSqlAuditContext = {
    actorId: string;
    datasetId?: string;
    configs?: {
        cohortBuilder?: CdmSqlAuditConfigMetadata;
        cdm?: CdmSqlAuditConfigMetadata;
    };
    requestMethod: string;
    requestPath: string;
    correlationId?: string;
    requestQuery?: unknown;
    requestParams?: unknown;
    requestBody?: unknown;
    databaseCode?: string;
    databaseDialect?: string;
    databaseEngine: "hana" | "duckdb" | "postgresql";
    schemaName?: string;
};

type CdmSqlAuditConfigMetadata = {
    id: string;
    version: string;
};

type CreateCdmSqlAuditContextOptions = {
    request: unknown;
    actorId: string;
    databaseCode?: string;
    databaseDialect?: string;
    databaseEngine: CdmSqlAuditContext["databaseEngine"];
    schemaName?: string;
};

type CdmSqlExecution = {
    operation: string;
    sql: string;
    parameters: unknown;
    parameterCount: number;
    successful: boolean;
    durationMs: number;
    error?: unknown;
};

type CdmSqlAuditRecorder = {
    record(execution: CdmSqlExecution): Promise<void>;
};

type ExecuteWithCdmSqlAuditOptions<T> = {
    context: CdmSqlAuditContext;
    operation: string;
    sql: string;
    parameters?: unknown;
    execute: () => T | Promise<T>;
    recorder?: CdmSqlAuditRecorder;
};

const SENSITIVE_REQUEST_FIELDS = new Set([
    "authorization",
    "cookie",
    "setcookie",
    "password",
    "secret",
    "token",
    "clientsecret",
    "accesstoken",
    "refreshtoken",
    "idtoken",
]);

function snapshotRequestValue(
    value: unknown,
    seen = new WeakSet<object>()
): unknown {
    if (
        value === null ||
        value === undefined ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return value;
    }
    if (typeof value === "bigint") {
        return String(value);
    }
    if (value instanceof Date) {
        return value.toISOString();
    }
    if (typeof value !== "object") {
        return String(value);
    }
    if (seen.has(value)) {
        return "[Circular]";
    }

    seen.add(value);
    if (Array.isArray(value)) {
        const snapshot = value.map((entry) =>
            snapshotRequestValue(entry, seen)
        );
        seen.delete(value);
        return snapshot;
    }

    const snapshot: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
        const normalizedKey = key.toLowerCase().replace(/[-_]/g, "");
        snapshot[key] = SENSITIVE_REQUEST_FIELDS.has(normalizedKey)
            ? "[REDACTED]"
            : snapshotRequestValue(entry, seen);
    }
    seen.delete(value);
    return snapshot;
}

function getErrorDetails(error: unknown): Record<string, string> | undefined {
    if (!error || typeof error !== "object") {
        return undefined;
    }

    const details: Record<string, string> = {};
    const name = (error as { name?: unknown }).name;
    const code = (error as { code?: unknown }).code;
    if (typeof name === "string") {
        details.name = name;
    }
    if (typeof code === "string" || typeof code === "number") {
        details.code = String(code);
    }

    return Object.keys(details).length > 0 ? details : undefined;
}

function getStringValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return value.map(getStringValue).find(Boolean);
    }
    if (typeof value === "string" && value.length > 0) {
        return value;
    }
    if (typeof value === "number") {
        return String(value);
    }
    return undefined;
}

function getConfigMetadata(
    id: unknown,
    version: unknown
): CdmSqlAuditConfigMetadata | undefined {
    const configId = getStringValue(id);
    const configVersion = getStringValue(version);
    return configId && configVersion
        ? { id: configId, version: configVersion }
        : undefined;
}

export function createCdmSqlAuditContext({
    request,
    actorId,
    databaseCode,
    databaseDialect,
    databaseEngine,
    schemaName,
}: CreateCdmSqlAuditContextOptions): CdmSqlAuditContext {
    const requestObject =
        request && typeof request === "object"
            ? (request as Record<string, unknown>)
            : {};
    const headers =
        requestObject.headers && typeof requestObject.headers === "object"
            ? (requestObject.headers as Record<string, unknown>)
            : {};
    const query =
        requestObject.query && typeof requestObject.query === "object"
            ? (requestObject.query as Record<string, unknown>)
            : {};
    const body =
        requestObject.body && typeof requestObject.body === "object"
            ? (requestObject.body as Record<string, unknown>)
            : {};
    const selectedStudy =
        requestObject.selectedstudyDbMetadata &&
        typeof requestObject.selectedstudyDbMetadata === "object"
            ? (requestObject.selectedstudyDbMetadata as Record<
                  string,
                  unknown
              >)
            : {};
    const correlationHeader = headers["x-req-correlation-id"];
    const correlationId = Array.isArray(correlationHeader)
        ? correlationHeader.find((value) => typeof value === "string")
        : typeof correlationHeader === "string"
        ? correlationHeader
        : undefined;
    const datasetId =
        getStringValue(selectedStudy.id) ??
        getStringValue(query.datasetId) ??
        getStringValue(body.datasetId) ??
        getStringValue(headers.datasetid);
    const cohortBuilderConfig = getConfigMetadata(
        requestObject.paConfigId,
        requestObject.paConfigVersion
    );
    const cdmConfig = getConfigMetadata(
        requestObject.cdmConfigId,
        requestObject.cdmConfigVersion
    );
    const configs =
        cohortBuilderConfig || cdmConfig
            ? {
                  cohortBuilder: cohortBuilderConfig,
                  cdm: cdmConfig,
              }
            : undefined;

    return {
        actorId,
        datasetId,
        configs,
        requestMethod:
            typeof requestObject.method === "string"
                ? requestObject.method
                : "unknown",
        requestPath:
            typeof requestObject.path === "string"
                ? requestObject.path
                : typeof requestObject.originalUrl === "string"
                ? requestObject.originalUrl
                : "unknown",
        correlationId,
        requestQuery: snapshotRequestValue(requestObject.query),
        requestParams: snapshotRequestValue(requestObject.params),
        requestBody: snapshotRequestValue(requestObject.body),
        databaseCode,
        databaseDialect,
        databaseEngine,
        schemaName,
    };
}

function countParameters(value: unknown): number {
    if (!Array.isArray(value)) {
        return 0;
    }

    if (value.length > 0 && Array.isArray(value[0])) {
        return value.reduce(
            (count, parameters) =>
                count + (Array.isArray(parameters) ? parameters.length : 0),
            0
        );
    }

    return value.length;
}

function sqlForOperation(
    operation: string,
    value: unknown,
    parameterCount: number
): string {
    const statement = typeof value === "string" ? value : String(value ?? "");
    if (operation !== "executeProc") {
        return statement;
    }

    const placeholders = Array.from(
        { length: parameterCount },
        () => "?"
    ).join(", ");
    return `CALL ${statement}(${placeholders})`;
}

function unwrapParameter(parameter: unknown): unknown {
    if (
        parameter &&
        typeof parameter === "object" &&
        "value" in parameter
    ) {
        return (parameter as { value?: unknown }).value;
    }
    return parameter;
}

function formatSqlLiteral(parameter: unknown): string {
    const value = unwrapParameter(parameter);
    if (value === null || value === undefined) {
        return "NULL";
    }
    if (typeof value === "number" || typeof value === "bigint") {
        return String(value);
    }
    if (typeof value === "boolean") {
        return value ? "TRUE" : "FALSE";
    }
    if (value instanceof Date) {
        return `'${value.toISOString()}'`;
    }
    if (value instanceof Uint8Array) {
        const hex = Array.from(value, (byte) =>
            byte.toString(16).padStart(2, "0")
        ).join("");
        return `X'${hex}'`;
    }

    let stringValue: string;
    if (typeof value === "string") {
        stringValue = value;
    } else {
        try {
            stringValue = JSON.stringify(value) ?? String(value);
        } catch (_error) {
            stringValue = String(value);
        }
    }
    return `'${stringValue.replace(/'/g, "''")}'`;
}

function copyQuotedSegment(
    sql: string,
    start: number,
    quote: "'" | '"' | "`"
): { text: string; next: number } {
    let cursor = start + 1;
    while (cursor < sql.length) {
        if (sql[cursor] === "\\") {
            cursor += 2;
            continue;
        }
        if (sql[cursor] === quote) {
            if (sql[cursor + 1] === quote) {
                cursor += 2;
                continue;
            }
            cursor += 1;
            break;
        }
        cursor += 1;
    }
    return { text: sql.slice(start, cursor), next: cursor };
}

function renderSingleSql(sql: string, parameters: unknown[]): string {
    const output: string[] = [];
    let questionParameterIndex = 0;
    let cursor = 0;

    while (cursor < sql.length) {
        const current = sql[cursor];
        const next = sql[cursor + 1];

        if (current === "'" || current === '"' || current === "`") {
            const segment = copyQuotedSegment(sql, cursor, current);
            output.push(segment.text);
            cursor = segment.next;
            continue;
        }

        if (current === "-" && next === "-") {
            const lineEnd = sql.slice(cursor + 2).search(/[\r\n]/);
            const commentEnd =
                lineEnd < 0 ? sql.length : cursor + 2 + lineEnd;
            output.push(sql.slice(cursor, commentEnd));
            cursor = commentEnd;
            continue;
        }

        if (current === "/" && next === "*") {
            const commentEnd = sql.indexOf("*/", cursor + 2);
            const nextCursor =
                commentEnd < 0 ? sql.length : commentEnd + 2;
            output.push(sql.slice(cursor, nextCursor));
            cursor = nextCursor;
            continue;
        }

        if (current === "$") {
            const delimiterMatch = sql
                .slice(cursor)
                .match(/^\$(?:[a-z_][a-z0-9_]*)?\$/i);
            if (delimiterMatch) {
                const delimiter = delimiterMatch[0];
                const literalEnd = sql.indexOf(
                    delimiter,
                    cursor + delimiter.length
                );
                const nextCursor =
                    literalEnd < 0
                        ? sql.length
                        : literalEnd + delimiter.length;
                output.push(sql.slice(cursor, nextCursor));
                cursor = nextCursor;
                continue;
            }

            const numberedParameter = sql.slice(cursor).match(/^\$(\d+)/);
            if (numberedParameter) {
                const parameterIndex = Number(numberedParameter[1]) - 1;
                if (parameterIndex >= 0 && parameterIndex < parameters.length) {
                    output.push(formatSqlLiteral(parameters[parameterIndex]));
                    cursor += numberedParameter[0].length;
                    continue;
                }
            }
        }

        if (current === "?" && questionParameterIndex < parameters.length) {
            output.push(
                formatSqlLiteral(parameters[questionParameterIndex])
            );
            questionParameterIndex += 1;
            cursor += 1;
            continue;
        }

        output.push(current);
        cursor += 1;
    }

    return output.join("");
}

export function renderSqlWithParameters(
    sql: string,
    parameters: unknown
): string {
    if (!Array.isArray(parameters) || parameters.length === 0) {
        return sql;
    }

    if (Array.isArray(parameters[0])) {
        return parameters
            .map((parameterSet) =>
                renderSingleSql(
                    sql,
                    Array.isArray(parameterSet) ? parameterSet : []
                )
            )
            .join(";\n");
    }

    return renderSingleSql(sql, parameters);
}

export class CdmSqlAuditLogger implements CdmSqlAuditRecorder {
    public constructor(
        private readonly context: CdmSqlAuditContext,
        private readonly writer: AuditEventWriter = createAuditEventWriter()
    ) {}

    public static isEnabled(): boolean {
        return (
            env.IS_CDM_SQL_AUDIT_LOG_ENABLED?.toLowerCase() === "true"
        );
    }

    public async record(execution: CdmSqlExecution): Promise<void> {
        try {
            const completeSql = renderSqlWithParameters(
                execution.sql,
                execution.parameters
            );
            const message: Record<string, unknown> = {
                schemaVersion: 1,
                eventType: "cdm.sql",
                occurredAt: new Date().toISOString(),
                actor: {
                    type: "user",
                    id: this.context.actorId,
                },
                request: {
                    method: this.context.requestMethod,
                    path: this.context.requestPath,
                    correlationId: this.context.correlationId,
                    query: this.context.requestQuery,
                    params: this.context.requestParams,
                    body: this.context.requestBody,
                },
                database: {
                    engine: this.context.databaseEngine,
                    dialect: this.context.databaseDialect,
                    code: this.context.databaseCode,
                    schema: this.context.schemaName,
                },
                operation: execution.operation,
                sql: completeSql,
                parameterCount: execution.parameterCount,
                successful: execution.successful,
                durationMs: execution.durationMs,
            };
            if (this.context.datasetId) {
                message.datasetId = this.context.datasetId;
            }
            if (this.context.configs) {
                message.configs = this.context.configs;
            }
            const error = getErrorDetails(execution.error);
            if (error) {
                message.error = error;
            }

            // The routing fields stay at the top level; everything that describes
            // the event itself lives under `message`, so a collector can route on
            // the former without walking the payload.
            await this.writer.append(CDM_SQL_AUDIT_FILE, {
                "log-type": "audit",
                "audit-log-type": "access",
                "service-name": "analytics-svc",
                message,
            });
        } catch (_error) {
            // Audit persistence is fail-open. Never echo SQL, parameters,
            // errors, or request/user data into operational container logs.
            console.error("CDM SQL audit event could not be written");
        }
    }
}

export async function executeWithCdmSqlAudit<T>({
    context,
    operation,
    sql,
    parameters = [],
    execute,
    recorder = new CdmSqlAuditLogger(context),
}: ExecuteWithCdmSqlAuditOptions<T>): Promise<T> {
    if (!CdmSqlAuditLogger.isEnabled()) {
        return await execute();
    }

    const startedAt = performance.now();
    const record = async (
        successful: boolean,
        error?: unknown
    ): Promise<void> => {
        try {
            await recorder.record({
                operation,
                sql,
                parameters,
                parameterCount: countParameters(parameters),
                successful,
                durationMs: Math.max(
                    0,
                    Math.round((performance.now() - startedAt) * 1000) / 1000
                ),
                error,
            });
        } catch (_error) {
            console.error("CDM SQL audit event could not be written");
        }
    };

    try {
        const result = await execute();
        await record(true);
        return result;
    } catch (error) {
        await record(false, error);
        throw error;
    }
}

export function createCdmSqlAuditConnection(
    connection: ConnectionInterface,
    context: CdmSqlAuditContext,
    recorder: CdmSqlAuditRecorder = new CdmSqlAuditLogger(context)
): ConnectionInterface {
    if (!CdmSqlAuditLogger.isEnabled()) {
        return connection;
    }

    return new Proxy(connection, {
        get(target, property) {
            const value = Reflect.get(target, property, target);
            if (property === "constructor") {
                return value;
            }
            if (
                typeof property !== "string" ||
                !SQL_METHODS.has(property) ||
                typeof value !== "function"
            ) {
                return typeof value === "function" ? value.bind(target) : value;
            }

            return (...args: unknown[]) => {
                const startedAt = performance.now();
                const parameters = args[1];
                const parameterCount = countParameters(args[1]);
                const sql = sqlForOperation(
                    property,
                    args[0],
                    parameterCount
                );
                const callbackIndex = args.findIndex(
                    (argument, index) => index >= 2 && typeof argument === "function"
                );
                let completed = false;

                const record = async (
                    successful: boolean,
                    error?: unknown
                ): Promise<void> => {
                    if (completed) {
                        return;
                    }
                    completed = true;
                    const durationMs = Math.max(
                        0,
                        Math.round((performance.now() - startedAt) * 1000) /
                            1000
                    );
                    try {
                        await recorder.record({
                            operation: property,
                            sql,
                            parameters,
                            parameterCount,
                            successful,
                            durationMs,
                            error,
                        });
                    } catch (_error) {
                        console.error(
                            "CDM SQL audit event could not be written"
                        );
                    }
                };

                if (callbackIndex >= 0) {
                    const callback = args[callbackIndex] as (
                        ...callbackArgs: unknown[]
                    ) => unknown;
                    args[callbackIndex] = (...callbackArgs: unknown[]) => {
                        const error = callbackArgs[0];
                        void record(!error, error).finally(() => {
                            callback(...callbackArgs);
                        });
                    };
                }

                try {
                    const result = value.apply(target, args);
                    if (callbackIndex < 0) {
                        if (
                            result &&
                            typeof result === "object" &&
                            "then" in result &&
                            typeof (result as { then?: unknown }).then ===
                                "function"
                        ) {
                            return Promise.resolve(result).then(
                                async (resolved) => {
                                    await record(true);
                                    return resolved;
                                },
                                async (error) => {
                                    await record(false, error);
                                    throw error;
                                }
                            );
                        }
                        void record(true);
                    }
                    return result;
                } catch (error) {
                    void record(false, error);
                    throw error;
                }
            };
        },
    });
}
