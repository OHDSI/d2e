import { Logger, EnvVarUtils } from "@alp/alp-base-utils";
import { URL } from "url";
import { IMRIRequest } from "../types";
const log = Logger.CreateLogger("analytics-log");
const envVarUtils = new EnvVarUtils(Deno.env.toObject());
import { env } from "../env";

enum SUPPORTED_HTTP_METHODS {
    GET = "GET",
    POST = "POST",
}

export const d2eWebapiRequest = async (
    req: IMRIRequest,
    method: SUPPORTED_HTTP_METHODS,
    path: string = "",
    payload: null | any,
    datasetId?: string
): Promise<any> => {
    const d2eWebapi = Trex.tokioChannel("d2e-functions/d2e-webapi");
    log.addRequestCorrelationID(req);
    const reqCorrelationId: string = envVarUtils.isTestEnv()
        ? "DUMMY_REQ_CORRELATION_ID"
        : log.getRequestCorrelationID(req);
    const accessToken = envVarUtils.isTestEnv()
        ? "Bearer DUMMY_TOKEN"
        : req.headers.authorization;

    const defaultPath = `d2e-webapi/${path}`;

    const sourceOrigin = req.headers["x-source-origin"];

    // d2e-webapi routes require the dataset to be supplied via the `datasetid`
    // request header (see d2e-webapi datasetRoutes preHandler). Fall back to the
    // header already present on the inbound request when no explicit id is given.
    const resolvedDatasetId =
        datasetId ?? (req.headers["datasetid"] as string | undefined);

    const options = {
        headers: {
            "Content-Type": "application/json",
            "authorization": accessToken,
            "user-agent": "ALP Service",
            "x-source-origin": sourceOrigin,
            "x-req-correlation-id": reqCorrelationId,
            ...(resolvedDatasetId ? { datasetid: resolvedDatasetId } : {}),
        },
    };

    const baseUrl = env.SERVICE_ROUTES["d2e-webapi"];
    if (!baseUrl) {
        throw new Error("d2e-webapi service route is not configured");
    }

    const urlParams = new URL(defaultPath, baseUrl);

    try {
        let response;
        switch (method) {
            case SUPPORTED_HTTP_METHODS.GET:
                response = await d2eWebapi.get(urlParams.toString(), options);
                break;
            case SUPPORTED_HTTP_METHODS.POST:
                response = await d2eWebapi.post(
                    urlParams.toString(),
                    payload,
                    options
                );
                break;
            default:
                throw `HTTP method:${method} is not supported in d2eWebapiRequest`;
        }

        if (response.status >= 200 && response.status <= 399) {
            return response.data;
        } else {
            log.error(JSON.stringify(response.data));
            // The body is whatever upstream chose to send and is empty on plenty
            // of failures, so throwing it verbatim hands the caller a nothing to
            // fail on: it reaches the response callback as neither an error nor a
            // result, and reading a status off it throws where nobody catches it.
            // Carry the status, which says what happened even when the body does
            // not, and keep the body for anything that wants to read it.
            throw Object.assign(
                new Error(`d2e-webapi responded ${response.status}`),
                { status: response.status, data: response.data }
            );
        }
    } catch (err) {
        log.enrichErrorWithRequestCorrelationID(err, req);
        log.error(`d2e-webapi proxy error: ${err}`);
        throw err;
    }
};
