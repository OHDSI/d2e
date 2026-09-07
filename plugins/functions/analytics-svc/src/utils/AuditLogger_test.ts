import assert from "node:assert/strict";
import { AuditLogger, getAuditUserIdFromRequest } from "./AuditLogger.ts";
import { env } from "../env.ts";
import {
    createPatientAccessAuditTransport,
    NdjsonAuditEventWriter,
} from "./AuditEventWriter.ts";

type AuditAttribute = {
    name: string;
    successful: boolean;
};

type AuditMessageContent = {
    action: "read";
    occurredAt: string;
    personId: string;
    accessChannel?: string;
    successful: boolean;
    configs?: {
        cohortBuilder?: { id: string; version: string };
        cdm?: { id: string; version: string };
    };
    attachment?: { id: string; name: string };
    attributes: string[];
    auditUser: string;
};

async function withMutedConsole(testFn: () => Promise<void> | void) {
    const originalConsole = {
        debug: console.debug,
        error: console.error,
        info: console.info,
        log: console.log,
        warn: console.warn,
    };
    const noop = () => {};

    console.debug = noop;
    console.error = noop;
    console.info = noop;
    console.log = noop;
    console.warn = noop;

    try {
        await testFn();
    } finally {
        console.debug = originalConsole.debug;
        console.error = originalConsole.error;
        console.info = originalConsole.info;
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
    }
}

function createAuditTransportMock() {
    const messages: AuditMessageContent[] = [];

    return {
        messages,
        auditTransport: {
            audit(message: unknown, auditUser: string) {
                messages.push({
                    ...(message as Omit<AuditMessageContent, "auditUser">),
                    auditUser,
                });
            },
        },
    };
}

function createLogger(auditTransport: {
    audit(message: unknown, user: string): void;
}) {
    return AuditLogger.create({
        auditTransport,
        cohortBuilderConfigMetaData: { id: "test-pa-config", version: "A" },
        cdmConfigMetaData: { id: "test-config", version: "v1" },
        user: "test-user",
    });
}

function encodeBase64Url(value: Record<string, unknown>): string {
    return btoa(JSON.stringify(value))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

function createUnsignedJwt(payload: Record<string, unknown>): string {
    return `${encodeBase64Url({ alg: "none", typ: "JWT" })}.${encodeBase64Url(
        payload
    )}.`;
}

function logAsync(
    logger: AuditLogger,
    data: Array<Record<string, unknown>>,
    selectedAttributes?: Array<{ id: string }>
): Promise<unknown> {
    return logger.log(
        "pid",
        "patient list",
        data,
        undefined,
        selectedAttributes
    );
}

function assertIsoTimestamp(value: string) {
    assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.ok(!Number.isNaN(Date.parse(value)));
}

Deno.test(
    "AuditLogger logs selected attribute names without values or pid",
    async () => {
        await withMutedConsole(async () => {
            env.IS_AUDIT_LOG_ENABLED = "true";
            const { auditTransport, messages } = createAuditTransportMock();
            const logger = createLogger(auditTransport);

            const result = await logAsync(
                logger,
                [
                    {
                        pid: ["patient-1"],
                        age: 42,
                        gender: "female",
                    },
                ],
                [{ id: "pid" }, { id: "age" }, { id: "gender" }]
            );

            assert.equal(result, null);
            assert.equal(messages.length, 1);
            assert.equal(messages[0].auditUser, "test-user");
            assertIsoTimestamp(messages[0].occurredAt);
            assert.equal(messages[0].personId, "patient-1");
            assert.equal(messages[0].accessChannel, "patient list");
            assert.equal(messages[0].successful, true);
            assert.deepEqual(messages[0].configs, {
                cohortBuilder: { id: "test-pa-config", version: "A" },
                cdm: { id: "test-config", version: "v1" },
            });
            assert.deepEqual(messages[0].attributes, ["age", "gender"]);
            assert(
                messages[0].attributes.every(
                    (attribute) =>
                        !attribute.includes("patient-1") &&
                        !attribute.includes("42") &&
                        !attribute.includes("female")
                )
            );
        });
    }
);

Deno.test(
    "AuditLogger falls back to row keys when selected attributes are absent",
    async () => {
        await withMutedConsole(async () => {
            env.IS_AUDIT_LOG_ENABLED = "true";
            const { auditTransport, messages } = createAuditTransportMock();
            const logger = createLogger(auditTransport);

            const result = await logAsync(logger, [
                { pid: "patient-1", age: 42, gender: "female" },
            ]);

            assert.equal(result, null);
            assert.deepEqual(messages[0].attributes, ["age", "gender"]);
        });
    }
);

Deno.test(
    "AuditLogger logs selected attributes when audit row only contains pid",
    async () => {
        await withMutedConsole(async () => {
            env.IS_AUDIT_LOG_ENABLED = "true";
            const { auditTransport, messages } = createAuditTransportMock();
            const logger = createLogger(auditTransport);

            const result = await logger.log(
                "patient.attributes.pid",
                "patient stream",
                [{ "patient.attributes.pid": "patient-1" }],
                undefined,
                [
                    { id: "patient.attributes.pid" },
                    { id: "patient.attributes.Age" },
                    { id: "patient.attributes.Gender_concept_name" },
                ]
            );

            assert.equal(result, null);
            assert.equal(messages.length, 1);
            assert.equal(messages[0].personId, "patient-1");
            assert.equal(messages[0].accessChannel, "patient stream");
            assert.deepEqual(messages[0].attributes, [
                "patient.attributes.Age",
                "patient.attributes.Gender_concept_name",
            ]);
        });
    }
);

Deno.test("getAuditUserIdFromRequest returns stable user id from JWT", () => {
    const token = createUnsignedJwt({
        sub: "subject-user",
        oid: "object-user",
        name: "Demo User",
    });

    const userId = getAuditUserIdFromRequest({
        headers: {
            authorization: `Bearer ${token}`,
        },
    });

    assert.equal(userId, "object-user");
});

Deno.test("AuditLogger create derives user from request", async () => {
    await withMutedConsole(async () => {
        env.IS_AUDIT_LOG_ENABLED = "true";
        const token = createUnsignedJwt({
            sub: "subject-user",
            oid: "object-user",
        });
        const { auditTransport, messages } = createAuditTransportMock();

        const result = await logAsync(
            AuditLogger.create({
                auditTransport,
                cohortBuilderConfigMetaData: {
                    id: "test-pa-config",
                    version: "A",
                },
                cdmConfigMetaData: { id: "test-config", version: "v1" },
                request: {
                    headers: {
                        authorization: `Bearer ${token}`,
                    },
                },
            }),
            [{ pid: "patient-1", age: 42 }]
        );

        assert.equal(result, null);
        assert.equal(messages[0].auditUser, "object-user");
        assert.deepEqual(messages[0].configs, {
            cohortBuilder: { id: "test-pa-config", version: "A" },
            cdm: { id: "test-config", version: "v1" },
        });
    });
});

Deno.test(
    "getAuditUserIdFromRequest returns undefined for missing or invalid auth",
    () => {
        assert.equal(getAuditUserIdFromRequest(), undefined);
        assert.equal(
            getAuditUserIdFromRequest({
                headers: {
                    authorization: "Bearer dummy jwt",
                },
            }),
            undefined
        );
    }
);

Deno.test("AuditLogger create scopes user to a new instance", async () => {
    await withMutedConsole(async () => {
        env.IS_AUDIT_LOG_ENABLED = "true";
        const { auditTransport, messages } = createAuditTransportMock();

        await logAsync(createLogger(auditTransport), [
            { pid: "patient-1", age: 42 },
        ]);
        const token = createUnsignedJwt({
            sub: "subject-user-2",
            oid: "object-user-2",
        });
        const result = await logAsync(
            AuditLogger.create({
                auditTransport,
                cohortBuilderConfigMetaData: {
                    id: "test-pa-config-2",
                    version: "B",
                },
                cdmConfigMetaData: { id: "test-config", version: "v1" },
                request: {
                    headers: {
                        authorization: `Bearer ${token}`,
                    },
                },
            }),
            [{ pid: "patient-2", age: 43 }]
        );

        assert.equal(result, null);
        assert.equal(messages[0].auditUser, "test-user");
        assert.equal(messages[1].auditUser, "object-user-2");
        assert.deepEqual(messages[1].configs?.cohortBuilder, {
            id: "test-pa-config-2",
            version: "B",
        });
    });
});

Deno.test("AuditLogger log resolves after all chunks complete", async () => {
    await withMutedConsole(async () => {
        env.IS_AUDIT_LOG_ENABLED = "true";
        const { auditTransport, messages } = createAuditTransportMock();
        const logger = createLogger(auditTransport);
        const patients = Array.from({ length: 11 }, (_, index) => ({
            pid: `patient-${index + 1}`,
            age: index + 1,
        }));

        const result = await logAsync(logger, patients, [
            { id: "pid" },
            { id: "age" },
        ]);

        assert.equal(result, null);
        assert.equal(messages.length, 11);
        assert(
            messages.every(
                (message) =>
                    message.attributes.length === 1 &&
                    message.attributes[0] === "age"
            )
        );
    });
});

Deno.test(
    "AuditLogger reports disabled audit log when audit flag is false",
    async () => {
        await withMutedConsole(async () => {
            env.IS_AUDIT_LOG_ENABLED = "false";
            const { auditTransport, messages } = createAuditTransportMock();
            const logger = createLogger(auditTransport);

            const result = await logAsync(logger, [
                {
                    pid: "patient-1",
                    age: 42,
                },
            ]);

            assert.equal(result, null);
            assert.equal(messages.length, 0);
        });
    }
);

Deno.test("AuditLogger isEnabled reflects audit flag", () => {
    env.IS_AUDIT_LOG_ENABLED = "true";
    assert.equal(AuditLogger.isEnabled(), true);

    env.IS_AUDIT_LOG_ENABLED = "false";
    assert.equal(AuditLogger.isEnabled(), false);
});

Deno.test("AuditLogger create requires an audit user", () => {
    const { auditTransport } = createAuditTransportMock();

    assert.throws(
        () =>
            AuditLogger.create({
                auditTransport,
                cdmConfigMetaData: { id: "test-config", version: "v1" },
                request: {
                    headers: {},
                },
            }),
        /requires a user/
    );
});

Deno.test(
    "AuditLogger file transport writes one patient NDJSON event without console output",
    async () => {
        const auditDirectory = await Deno.makeTempDir({
            prefix: "d2e-patient-audit-",
        });
        const originalConsole = {
            debug: console.debug,
            error: console.error,
            info: console.info,
            log: console.log,
            warn: console.warn,
        };
        const consoleCalls: unknown[][] = [];
        const captureConsole = (...args: unknown[]) => consoleCalls.push(args);

        console.debug = captureConsole;
        console.error = captureConsole;
        console.info = captureConsole;
        console.log = captureConsole;
        console.warn = captureConsole;

        try {
            env.IS_AUDIT_LOG_ENABLED = "true";

            const result = await logAsync(
                AuditLogger.create({
                    user: "file-user",
                    auditTransport: createPatientAccessAuditTransport(
                        new NdjsonAuditEventWriter(auditDirectory)
                    ),
                }),
                [{ pid: "patient-1", age: 42 }],
                [{ id: "pid" }, { id: "age" }]
            );

            assert.equal(result, null);

            const auditFile = `${auditDirectory}/patient-access.ndjson`;
            const lines = (await Deno.readTextFile(auditFile))
                .trimEnd()
                .split("\n");
            assert.equal(lines.length, 1);

            const event = JSON.parse(lines[0]);
            assert.equal(event.schemaVersion, 1);
            assert.equal(event.eventType, "patient.access");
            assertIsoTimestamp(event.occurredAt);
            assert.deepEqual(event.actor, {
                type: "user",
                id: "file-user",
            });
            assert.equal(event.action, "read");
            assert.equal(event.personId, "patient-1");
            assert.equal(event.accessChannel, "patient list");
            assert.equal(event.successful, true);
            assert.deepEqual(event.attributes, ["age"]);
            assert.deepEqual(consoleCalls, []);
        } finally {
            console.debug = originalConsole.debug;
            console.error = originalConsole.error;
            console.info = originalConsole.info;
            console.log = originalConsole.log;
            console.warn = originalConsole.warn;
            await Deno.remove(auditDirectory, { recursive: true });
        }
    }
);
