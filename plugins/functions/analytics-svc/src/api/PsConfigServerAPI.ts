import axios, { AxiosRequestConfig } from "../../../_shared/_axios.ts";
import { env } from "../env";

// TLS trust note: this API previously passed an explicit `httpsAgent` carrying
// the internal CA. The fetch-based shim accepts and ignores `httpsAgent`, so
// there is no per-request TLS control here any more — trust comes solely from
// the runtime's system CA store (DENO_TLS_CA_STORE=system in trex).
//
// The PS config server is typically external/HANA-side rather than one of our
// own containers, so its certificate may not chain to the internal CA. To reach
// such a server, add its CA to TLS__EXTRA__CA_CRTS (see docker-compose.yml,
// trex) — the entrypoint installs it into the OS store before startup. There is
// deliberately no verification bypass.
export default class PsConfigServerAPI {
    private readonly baseUrl: string;
    private readonly oauthUrl: string;

    constructor() {
        if (env.SERVICE_ROUTES.psConfig) {
            this.baseUrl = env.SERVICE_ROUTES.psConfig;
            this.oauthUrl = env.ALP_GATEWAY_OAUTH__URL;
        }
        if (!this.baseUrl) {
            throw new Error("PS Config Server URL is not configured!");
        }
    }

    private async getRequestConfig(token: string) {
        let options: AxiosRequestConfig = {};
        if (token) {
            options = {
                ...options,
                headers: {
                    Authorization: token,
                },
            };
        }
        return options;
    }

    async getClientCredentialsToken() {
        const params = {
            grant_type: "client_credentials",
            client_id: env.IDP__ALP_SVC__CLIENT_ID,
            client_secret: env.IDP__ALP_SVC__CLIENT_SECRET,
        };

        const options: AxiosRequestConfig = {
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            }
        };

        const data = Object.keys(params)
            .map(
                (key) =>
                    `${encodeURIComponent(key)}=${encodeURIComponent(
                        params[key]
                    )}`
            )
            .join("&");

        const result = await axios.post(this.oauthUrl, data, options);

        return `Bearer ${result.data.access_token}`;
    }

    async getCDWConfig({ action, configId, configVersion, lang }, token) {
        const options = await this.getRequestConfig(token);
        const body = {
            action,
            configId,
            configVersion,
            lang,
        };
        const result = await axios.post(
            `${this.baseUrl}/hc/hph/patient/app/services/config.xsjs`,
            body,
            options
        );
        return result.data;
    }
}
