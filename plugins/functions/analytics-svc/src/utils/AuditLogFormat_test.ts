import assert from "node:assert/strict";
import { env } from "../env.ts";
import { AuditLogger } from "./AuditLogger.ts";
import {
    ConsoleAuditEventWriter,
    createPatientAccessAuditTransport,
    NdjsonAuditEventWriter,
} from "./AuditEventWriter.ts";
import { CdmSqlAuditLogger } from "./CdmSqlAuditLogger.ts";

for (const destination of ["console", "file"]) {
    Deno.test(`audit ${destination} output adds routing fields and preserves existing payloads`, async () => {
        const directory = await Deno.makeTempDir({ prefix: "audit-format-" });
        const previousPatientFlag = env.IS_AUDIT_LOG_ENABLED;
        const originalInfo = console.info;
        const calls: unknown[][] = [];
        console.info = (...args: unknown[]) => calls.push(args);
        try {
            env.IS_AUDIT_LOG_ENABLED = "true";
            const writer = destination === "console"
                ? new ConsoleAuditEventWriter()
                : new NdjsonAuditEventWriter(directory);
            await AuditLogger.create({
                user: "user-1",
                auditTransport: createPatientAccessAuditTransport(writer),
            }).log("pid", "patient list", [{ pid: "patient-1", age: 42 }]);
            const sqlLogger = new CdmSqlAuditLogger({
                actorId: "user-1",
                datasetId: "dataset-1",
                requestMethod: "GET",
                requestPath: "/patient",
                correlationId: "correlation-1",
                databaseEngine: "postgresql",
            }, writer);
            for (const successful of [true, false]) {
                await sqlLogger.record({
                    operation: "executeQuery",
                    sql: "SELECT\n? AS test_value",
                    parameters: [1],
                    parameterCount: 1,
                    successful,
                    durationMs: 2,
                });
            }

            let lines: string[];
            if (destination === "console") {
                lines = calls.map((args) => {
                    assert.equal(args.length, 1);
                    assert.equal(typeof args[0], "string");
                    assert.equal((args[0] as string).includes("\n"), false);
                    return args[0] as string;
                });
            } else {
                assert.deepEqual(calls, []);
                lines = [];
                for (
                    const file of [
                        "patient-access.ndjson",
                        "cdm-sql-access.ndjson",
                    ]
                ) {
                    const content = await Deno.readTextFile(
                        `${directory}/${file}`,
                    );
                    assert.equal(content.endsWith("\n"), true);
                    lines.push(...content.trimEnd().split("\n"));
                }
            }
            assert.equal(lines.length, 3);
            const payloads = lines.map((line) => {
                const {
                    "log-type": logType,
                    "audit-log-type": auditLogType,
                    "service-name": serviceName,
                    occurredAt,
                    ...payload
                } = JSON.parse(line);
                assert.equal(logType, "audit");
                assert.equal(auditLogType, "access");
                assert.equal(serviceName, "analytics-svc");
                assert.equal(new Date(occurredAt).toISOString(), occurredAt);
                return payload;
            });
            assert.deepEqual(payloads[0], {
                action: "read",
                personId: "patient-1",
                accessChannel: "patient list",
                successful: true,
                attributes: ["age"],
                schemaVersion: 1,
                eventType: "patient.access",
                actor: { type: "user", id: "user-1" },
            });
            for (const [index, successful] of [true, false].entries()) {
                assert.deepEqual(payloads[index + 1], {
                    schemaVersion: 1,
                    eventType: "cdm.sql",
                    actor: { type: "user", id: "user-1" },
                    request: {
                        method: "GET",
                        path: "/patient",
                        correlationId: "correlation-1",
                    },
                    database: { engine: "postgresql" },
                    operation: "executeQuery",
                    sql: "SELECT\n1 AS test_value",
                    parameterCount: 1,
                    successful,
                    durationMs: 2,
                    datasetId: "dataset-1",
                });
            }
        } finally {
            console.info = originalInfo;
            env.IS_AUDIT_LOG_ENABLED = previousPatientFlag;
            await Deno.remove(directory, { recursive: true });
        }
    });
}
