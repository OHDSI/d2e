import { Logger, EnvVarUtils } from "@alp/alp-base-utils";
import { URL } from "url";
import { IMRIRequest, QuerySvcResultType } from "../types";
const log = Logger.CreateLogger("analytics-log");
const envVarUtils = new EnvVarUtils(Deno.env.toObject());
import { env } from "../env";

enum SUPPORTED_HTTP_METHODS {
    GET = "GET",
    POST = "POST",
}

export const terminologyRequest = async (
    req: IMRIRequest,
    method: SUPPORTED_HTTP_METHODS,
    path: string = "",
    payload: null | any
): Promise<any> => {
    const terminologySvcApi = Trex.tokioChannel(
        "d2e-functions/terminology-svc"
    );
    log.addRequestCorrelationID(req);
    const reqCorrelationId: string = envVarUtils.isTestEnv()
        ? "DUMMY_REQ_CORRELATION_ID"
        : log.getRequestCorrelationID(req);
    const accessToken = envVarUtils.isTestEnv()
        ? "Bearer DUMMY_TOKEN"
        : req.headers.authorization;

    const defaultPath = `terminology/${path}`;

    const sourceOrigin = req.headers["x-source-origin"];

    const options = {
        headers: {
            "Content-Type": "application/json",
            "authorization": accessToken,
            "user-agent": "ALP Service",
            // Omit x-source-origin when absent: an `undefined` header value throws
            // ERR_HTTP_INVALID_HEADER_VALUE in Node's http client. Pass-through header.
            ...(sourceOrigin != null ? { "x-source-origin": sourceOrigin } : {}),
            "x-req-correlation-id": reqCorrelationId,
        },
    };

    const urlParams = new URL(defaultPath, env.SERVICE_ROUTES.terminology);

    try {
        let response;
        switch (method) {
            case SUPPORTED_HTTP_METHODS.GET:
                response = await terminologySvcApi.get(
                    urlParams.toString(),
                    options
                );
                break;
            case SUPPORTED_HTTP_METHODS.POST:
                response = await terminologySvcApi.post(
                    urlParams.toString(),
                    payload,
                    options
                );
                break;
            default:
                throw `HTTP method:${method} is not supported in terminologyRequest`;
        }

        if (response.status >= 200 && response.status <= 399) {
            return response.data;
        } else {
            log.error(JSON.stringify(response.data));
            // An empty error body would otherwise be thrown as a nothing, which
            // reaches callers as a failure carrying no reason and fails again
            // where they read it. Carry the status, which says what happened
            // even when the body does not.
            throw Object.assign(
                new Error(`terminology svc responded ${response.status}`),
                { status: response.status, data: response.data }
            );
        }
    } catch (err) {
        log.enrichErrorWithRequestCorrelationID(err, req);
        log.error(`terminology svc proxy error: ${err}`);
        throw err;
    }
};
