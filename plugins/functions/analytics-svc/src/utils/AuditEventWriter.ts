import { env } from "../env.ts";

export const AUDIT_LOG_DIRECTORY = "/var/log/d2e/audit";
export const PATIENT_ACCESS_AUDIT_FILE = "patient-access.ndjson";
export const CDM_SQL_AUDIT_FILE = "cdm-sql-access.ndjson";

export type AuditEvent = Record<string, unknown>;

export type AuditTransport = {
    audit(message: unknown, user: string): void | Promise<void>;
};

export interface AuditEventWriter {
    append(fileName: string, event: AuditEvent): Promise<void>;
}

const encoder = new TextEncoder();

function getAuditFilePath(directory: string, fileName: string): string {
    if (!/^[a-z0-9][a-z0-9.-]*\.ndjson$/.test(fileName)) {
        throw new Error("Invalid audit file name");
    }

    return `${directory.replace(/\/+$/, "")}/${fileName}`;
}

async function chmodWhenAvailable(path: string, mode: number): Promise<void> {
    try {
        await Deno.chmod(path, mode);
    } catch (error) {
        if (
            error instanceof Error &&
            error.name === "PermissionDenied" &&
            error.message === "Deno.chmod is blocklisted"
        ) {
            return;
        }
        throw error;
    }
}

export class NdjsonAuditEventWriter implements AuditEventWriter {
    public constructor(private readonly directory = AUDIT_LOG_DIRECTORY) {}

    public async append(fileName: string, event: AuditEvent): Promise<void> {
        await Deno.mkdir(this.directory, { recursive: true, mode: 0o750 });
        await chmodWhenAvailable(this.directory, 0o750);

        const path = getAuditFilePath(this.directory, fileName);
        const bytes = encoder.encode(`${JSON.stringify(event)}\n`);
        const file = await Deno.open(path, {
            append: true,
            create: true,
            mode: 0o640,
            write: true,
        });

        try {
            await chmodWhenAvailable(path, 0o640);
            // Keep one event in one append operation so concurrent Trex workers
            // cannot interleave portions of separate NDJSON records.
            const bytesWritten = await file.write(bytes);
            if (bytesWritten !== bytes.length) {
                throw new Error("Incomplete audit event append");
            }
        } finally {
            file.close();
        }
    }
}

export class ConsoleAuditEventWriter implements AuditEventWriter {
    public append(_fileName: string, event: AuditEvent): Promise<void> {
        console.info(JSON.stringify(event));
        return Promise.resolve();
    }
}

export function createAuditEventWriter(): AuditEventWriter {
    return env.AUDIT_LOG_TO_CONSOLE?.toLowerCase() === "true"
        ? new ConsoleAuditEventWriter()
        : new NdjsonAuditEventWriter();
}

export function createPatientAccessAuditTransport(
    writer: AuditEventWriter = createAuditEventWriter()
): AuditTransport {
    return {
        async audit(message: unknown, user: string): Promise<void> {
            const eventData =
                message && typeof message === "object"
                    ? (message as AuditEvent)
                    : { message: String(message) };

            try {
                await writer.append(PATIENT_ACCESS_AUDIT_FILE, {
                    ...eventData,
                    "log-type": "audit",
                    "audit-log-type": "access",
                    "service-name": "analytics-svc",
                    schemaVersion: 1,
                    eventType: "patient.access",
                    actor: {
                        type: "user",
                        id: user,
                    },
                });
            } catch (_error) {
                // Audit persistence is fail-open. Never echo the event payload
                // or patient identifier into operational container logs.
                console.error("Patient audit event could not be written");
            }
        },
    };
}
