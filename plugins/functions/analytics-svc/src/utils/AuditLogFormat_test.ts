import assert from "node:assert/strict";
import { env } from "../env.ts";
import { AuditLogger } from "./AuditLogger.ts";
import { NdjsonAuditEventWriter } from "./AuditEventWriter.ts";
import {
    CdmSqlAuditLogger,
    createCdmSqlAuditContext,
} from "./CdmSqlAuditLogger.ts";
import { getAuditRequestContext } from "./AuditLogFormat.ts";
import functionsPackage from "../../../package.json" with { type: "json" };

function bearer(claims: Record<string, unknown>): string {
    const encode = (value: Record<string, unknown>) =>
        btoa(JSON.stringify(value))
            .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    return `Bearer ${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.`;
}

Deno.test("audit request metadata uses client claims and excludes URL query values", () => {
    for (const claim of ["client_id", "azp", "appid"]) {
        const request = {
            originalUrl: "/analytics-svc/patient?token=secret#fragment",
            path: "/patient",
            headers: {
                authorization: bearer({ [claim]: "d2e-web", sub: "user-1" }),
                "x-req-correlation-id": ["trace-1"],
            },
        };
        assert.deepEqual(getAuditRequestContext(request), {
            traceId: "trace-1",
            requestUrl: "/analytics-svc/patient",
            clientId: "d2e-web",
        });
    }
});

Deno.test("missing audit metadata uses null and a trace ID scoped to the request", () => {
    const request = { headers: { authorization: "Bearer invalid" } };
    const first = getAuditRequestContext(request);
    assert.equal(first.requestUrl, null);
    assert.equal(first.clientId, null);
    assert.match(first.traceId, /^[0-9a-f-]{36}$/);
    assert.deepEqual(getAuditRequestContext(request), first);
    assert.notEqual(getAuditRequestContext({}).traceId, first.traceId);
    assert.equal(getAuditRequestContext().requestUrl, null);
});

Deno.test("patient and SQL loggers emit the same JSON envelope to stdout", async () => {
    const previousPatientFlag = env.IS_AUDIT_LOG_ENABLED;
    const previousConsoleFlag = env.AUDIT_LOG_TO_CONSOLE;
    const originalInfo = console.info;
    const calls: unknown[][] = [];
    console.info = (...args: unknown[]) => calls.push(args);
    try {
        env.IS_AUDIT_LOG_ENABLED = "true";
        env.AUDIT_LOG_TO_CONSOLE = "true";
        const request = {
            method: "GET",
            path: "/patient",
            originalUrl: "/analytics-svc/patient?datasetId=dataset-1",
            headers: {
                authorization: bearer({ sub: "user-1", client_id: "d2e-web" }),
            },
            selectedstudyDbMetadata: { id: "dataset-1" },
        };
        await AuditLogger.create({ request }).log(
            "pid",
            "patient list",
            [{ pid: "patient-1", age: 42 }],
        );
        const sqlLogger = new CdmSqlAuditLogger(createCdmSqlAuditContext({
            request,
            actorId: "user-1",
            databaseEngine: "postgresql",
        }));
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

        assert.equal(calls.length, 3);
        const events = calls.map((args) => {
            assert.equal(args.length, 1);
            assert.equal(typeof args[0], "string");
            assert.equal((args[0] as string).includes("\n"), false);
            return JSON.parse(args[0] as string);
        });
        for (const event of events) {
            assert.equal(event["log-type"], "audit");
            assert.equal(event["audit-log-type"], "access");
            assert.equal(event.timestamp, event.occurredAt);
            assert.equal(
                new Date(event.timestamp).toISOString(),
                event.timestamp,
            );
            assert.equal(event["trace-id"], events[0]["trace-id"]);
            assert.equal(event["service-name"], "analytics-svc");
            assert.equal(event["service-version"], functionsPackage.version);
            assert.equal(event["req-url"], "/analytics-svc/patient");
            assert.equal(event["client-id"], "d2e-web");
            assert.equal(event["subject-id"], "user-1");
            assert.equal(JSON.stringify(event).includes("Bearer"), false);
        }
        assert.equal(events[0]["event-type"], "read");
        assert.equal(events[0]["resource-type"], "patient");
        assert.equal(events[0]["resource-id"], "patient-1");
        assert.deepEqual(events[0].attributes, ["age"]);
        assert.equal("age" in events[0], false);
        for (const event of events.slice(1)) {
            assert.equal(event["event-type"], "execute");
            assert.equal(event["resource-type"], "dataset");
            assert.equal(event["resource-id"], "dataset-1");
            assert.equal(event.sql, "SELECT\n1 AS test_value");
        }
        assert.equal(events[1].successful, true);
        assert.equal(events[2].successful, false);
    } finally {
        console.info = originalInfo;
        env.IS_AUDIT_LOG_ENABLED = previousPatientFlag;
        env.AUDIT_LOG_TO_CONSOLE = previousConsoleFlag;
    }
});

Deno.test("SQL audit files retain the stdout envelope when metadata is unavailable", async () => {
    const directory = await Deno.makeTempDir({ prefix: "audit-format-" });
    try {
        const logger = new CdmSqlAuditLogger({
            actorId: "user-1",
            requestMethod: "GET",
            requestPath: "/test",
            databaseEngine: "hana",
        }, new NdjsonAuditEventWriter(directory));
        await logger.record({
            operation: "executeQuery",
            sql: "SELECT 1",
            parameters: [],
            parameterCount: 0,
            successful: true,
            durationMs: 0,
        });
        const lines =
            (await Deno.readTextFile(`${directory}/cdm-sql-access.ndjson`))
                .trimEnd().split("\n");
        assert.equal(lines.length, 1);
        const event = JSON.parse(lines[0]);
        assert.equal(event["log-type"], "audit");
        assert.equal(event["audit-log-type"], "access");
        assert.equal(event["resource-id"], null);
        assert.equal(event["client-id"], null);
        assert.equal(event["subject-id"], "user-1");
        assert.match(event["trace-id"], /^[0-9a-f-]{36}$/);
    } finally {
        await Deno.remove(directory, { recursive: true });
    }
});
