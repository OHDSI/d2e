import { decode } from "jsonwebtoken";
import functionsPackage from "../../../package.json" with { type: "json" };

export type AuditRequestContext = {
    traceId: string;
    requestUrl: string | null;
    clientId: string | null;
};

const requestTraceIds = new WeakMap<object, string>();

function stringValue(value: unknown): string | undefined {
    if (Array.isArray(value)) {
        return value.map(stringValue).find(Boolean);
    }
    return typeof value === "string" && value.length > 0 ? value : undefined;
}

export function getAuditRequestContext(request?: unknown): AuditRequestContext {
    const req = request && typeof request === "object"
        ? request as Record<string, unknown>
        : undefined;
    const headers = req?.headers && typeof req.headers === "object"
        ? req.headers as Record<string, unknown>
        : {};
    const traceId = stringValue(headers["x-req-correlation-id"]) ??
        (req && requestTraceIds.get(req)) ??
        crypto.randomUUID();
    if (req) {
        requestTraceIds.set(req, traceId);
    }

    let clientId: string | null = null;
    const authorization = stringValue(headers.authorization);
    if (authorization) {
        try {
            // Authentication happens upstream. Decode only the client identity;
            // never copy tokens or other claims into the audit envelope.
            const claims = decode(authorization.replace(/^Bearer\s+/i, ""));
            if (claims && typeof claims === "object") {
                clientId = stringValue(claims.client_id) ??
                    stringValue(claims.azp) ??
                    stringValue(claims.appid) ??
                    null;
            }
        } catch (_error) {
            // Missing or malformed optional metadata must not prevent auditing.
        }
    }

    const url = stringValue(req?.originalUrl) ??
        stringValue(req?.path) ??
        stringValue(req?.url);
    return {
        traceId,
        // Query parameters may contain credentials or patient filter values.
        requestUrl: url?.split(/[?#]/, 1)[0] || null,
        clientId,
    };
}

export function createAuditLogEnvelope({
    timestamp,
    subjectId,
    eventType,
    resourceType,
    resourceId,
    context,
}: {
    timestamp: string;
    subjectId: string;
    eventType: string;
    resourceType: "patient" | "dataset";
    resourceId?: unknown;
    context: AuditRequestContext;
}) {
    return {
        timestamp,
        "log-type": "audit",
        "audit-log-type": "access",
        "trace-id": context.traceId,
        "service-name": "analytics-svc",
        "service-version": functionsPackage.version,
        "req-url": context.requestUrl,
        "client-id": context.clientId,
        "subject-id": subjectId,
        "event-type": eventType,
        "resource-type": resourceType,
        "resource-id": stringValue(resourceId) ?? null,
    };
}
