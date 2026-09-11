import { Logger, EnvVarUtils } from "@alp/alp-base-utils";
import { URL } from "url";
import { IMRIRequest, QuerySvcResultType } from "../types";
const log = Logger.CreateLogger("analytics-log");
const envVarUtils = new EnvVarUtils(Deno.env.toObject());
import { env } from "../env";

export async function generateQuery(
    req: IMRIRequest,
    payload,
    path: string = ""
): Promise<QuerySvcResultType> {
    const queryGenSvcApi = Trex.tokioChannel("d2e-functions/query-gen-svc");
    log.addRequestCorrelationID(req);
    let reqCorrelationId: string = "DUMMY_REQ_CORRELATION_ID";

    // Add datasetId to body as toplevel key for trex authz
    if (payload.queryParams?.datasetId) {
        payload["datasetId"] = payload.queryParams.datasetId;
    } else if (payload.configParams?.datasetId) {
        payload["datasetId"] = payload.configParams.datasetId;
    }
    payload["dialect"] = req.dbCredentials.studyAnalyticsCredential.dialect;
    const data = JSON.stringify(payload);

    const accessToken = req.headers.authorization;
    if (log.getRequestCorrelationID(req)) {
        reqCorrelationId = log.getRequestCorrelationID(req);
    }

    const defaultPath = `analytics-svc/api/services/query`;

    const pathName = path ? defaultPath + "/" + path : defaultPath;

    const sourceOrigin = req.headers["x-source-origin"];

    let urlParams;
    if (envVarUtils.isTestEnv() && !envVarUtils.isHttpTestRun()) {
        // this flow is only for integation test
        urlParams = new URL(pathName, `http://localhost:41008`);
    } else {
        urlParams = new URL(pathName, env.SERVICE_ROUTES.queryGen);
    }

    const options = {
        headers: {
            "Content-Type": "application/json",
            "auth-type": "azure-ad",
            "authorization": accessToken,
            "user-agent": "ALP Service",
            // Omit x-source-origin when absent: an `undefined` header value throws
            // ERR_HTTP_INVALID_HEADER_VALUE in Node's http client. Pass-through header.
            ...(sourceOrigin != null ? { "x-source-origin": sourceOrigin } : {}),
            "x-req-correlation-id": reqCorrelationId,
        },
    };
    try {
        const response = await queryGenSvcApi.post(
            urlParams.toString(),
            data,
            options
        );
        if (response.status >= 200 && response.status <= 399) {
            return response.data as QuerySvcResultType;
        } else {
            log.error(JSON.stringify(response.data));
            // An empty error body would otherwise be thrown as a nothing, which
            // reaches callers as a failure carrying no reason and fails again
            // where they read it. Carry the status, which says what happened
            // even when the body does not.
            throw Object.assign(
                new Error(`the query generator responded ${response.status}`),
                { status: response.status, data: response.data }
            );
        }
    } catch (err) {
        log.enrichErrorWithRequestCorrelationID(err, req);
        log.error(`query generator error: ${err}`);
        throw err;
    }
}
