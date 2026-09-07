import { Logger, EnvVarUtils } from "@alp/alp-base-utils";
const envVarUtils = new EnvVarUtils(Deno.env.toObject());
import * as http from "http";
import * as dotenv from "dotenv";
import { URL } from "url";
import { IMRIRequest, BookmarkCMDType } from "../types";
import { env } from "../env";
import axios, { AxiosRequestConfig } from "../../../_shared/_axios.ts";

dotenv.config();
const log = Logger.CreateLogger();

export async function loadBookmarks(
    req: IMRIRequest,
    queryParams,
    bookmark_cmd: BookmarkCMDType
) {
    let urlParams;

    if (envVarUtils.isTestEnv() && !envVarUtils.isHttpTestRun()) {
        // this flow is only for integration test
        urlParams = new URL(`http://localhost:41005`);
    } else {
        urlParams = new URL(env.SERVICE_ROUTES.bookmark);
    }

    const { hostname, port, protocol } = urlParams
    const sourceOrigin = req.headers["x-source-origin"];

    const username_response = await axios.get(
        `${new URL(env.SERVICE_ROUTES.usermgmt)}/me`,
        {
            headers: {
                Authorization: req.headers.authorization,
            },
        }
    );

    if (!username_response.data || !username_response.data.username) {
        throw new Error("Invalid username")
    }

    let options: http.RequestOptions = {
        hostname,
        port,
        protocol,
        headers: {
            "Content-Type": "application/json",
            "authorization": req.headers.authorization,
            "user-agent": "ALP Service",
            // Only forward x-source-origin when present. Node's http client throws
            // ERR_HTTP_INVALID_HEADER_VALUE on an `undefined` header value, which
            // 500'd cohort-compare: its query-gen flow resolves the cohort bookmarks
            // through this proxy, and that request path arrives without the header.
            // The header is a pass-through correlation hint, so omitting it is safe.
            ...(sourceOrigin != null ? { "x-source-origin": sourceOrigin } : {}),
        }
    };

    switch (bookmark_cmd) {
        case BookmarkCMDType.LOAD_BOOKMARKS:
            const bookmarkIds = queryParams.bmkIds;
            const paConfigId = queryParams.configId;
            const fullPath = `/analytics-svc/api/services/bookmark/bookmarkIds?ids=${bookmarkIds}&paConfigId=${paConfigId}&username=${username_response.data.username}&datasetId=${queryParams.datasetId}`;
            options.path = fullPath;
            options.method = "GET";
            break;
        default:
            console.log("Invalid request!");
            throw new Error("Invalid request!");
    }

    return new Promise((resolve, reject) => {
        const post_req = http
            .request(options, (response) => {
                let body = "";

                response.on("data", (d) => {
                    body += d;
                });

                response.on("end", () => {
                    try {
                        if (
                            response.statusCode >= 200 &&
                            response.statusCode <= 399
                        ) {
                            resolve(JSON.parse(body));
                        } else {
                            reject(body);
                        }
                    } catch (err) {
                        log.error(`query generator error: ${body}`);
                        reject(err);
                    }
                });
            })
            .on("error", (err) => {
                log.error(JSON.stringify(err));
                reject(err);
            });
        post_req.end();
    });
}
