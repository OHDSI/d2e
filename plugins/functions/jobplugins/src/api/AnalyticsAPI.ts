import https from "node:https";
import { AxiosRequestConfig } from "../../../_shared/_axios.ts";
import { env, services } from "../env.ts";

export class AnalyticsSvcAPI {
  private readonly baseURL: string;
  // private readonly httpsAgent: any;
  private readonly token: string;
  private readonly endpoint: string = "/analytics-svc/api/services";
  private readonly channel;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for Analytics API!");
    }

    if (services.analytics) {
      this.baseURL = services.analytics + this.endpoint;
      this.channel = Trex.tokioChannel("d2e-functions/analytics-svc");
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT,
      // });
    } else {
      console.error("No url is set for AnalyticsSvcAPI");
      throw new Error("No url is set for AnalyticsAPI");
    }
  }

  isAuthorized(): boolean {
    return this.baseURL.startsWith("https://localhost:") ||
      this.baseURL.startsWith("https://alp-minerva-gateway-")
      ? false
      : true;
  }

  async getDataCharacterizationResults(
    cacheId: string,
    databaseCode: string,
    resultsSchema: string,
    sourceKey: string,
    vocabSchema: string,
    datasetId: string,
    useSourceConnection: boolean = false
  ) {
    const errorMessage = "Error while getting data characterization results";
    try {
      console.log(`vocabSchema ${vocabSchema} datasetId ${datasetId}`);
      const options = await this.createOptions("GET");
      // URL segment uses cacheId (alias for the analytics-svc dataset lookup);
      // databaseCode kept in the signature for downstream credential/schema resolution callers may need.
      const aliasSegment = cacheId ?? databaseCode;
      const url = `${this.baseURL}/data-characterization/${encodeURIComponent(
        aliasSegment
      )}/${encodeURIComponent(vocabSchema)}/${encodeURIComponent(
        resultsSchema.toLowerCase()
      )}/${encodeURIComponent(sourceKey)}?datasetId=${encodeURIComponent(
        datasetId
      )}&useSourceConnection=${useSourceConnection}`;
      const response = await this.channel.get(url, options);
      if (response.status !== 200) {
        throw new Error(errorMessage);
      }
      return await response.data;
    } catch (error) {
      console.error(`${errorMessage}: ${error}`);
      throw error;
    }
  }

  // Fetch Data Characterization Drilldown
  async getDataCharacterizationResultsDrilldown(
    cacheId: string,
    databaseCode: string,
    resultsSchema: string,
    sourceKey: string,
    conceptId: string,
    vocabSchema: string,
    datasetId: string,
    useSourceConnection: boolean = false
  ) {
    try {
      // URL segment uses cacheId (alias for the analytics-svc dataset lookup);
      // databaseCode kept in the signature for downstream callers that may need it.
      const aliasSegment = cacheId ?? databaseCode;
      const url = `${this.baseURL}/data-characterization/${encodeURIComponent(
        aliasSegment
      )}/${encodeURIComponent(vocabSchema)}/${encodeURIComponent(
        resultsSchema.toLowerCase()
      )}/${encodeURIComponent(sourceKey)}/${encodeURIComponent(
        conceptId
      )}?datasetId=${encodeURIComponent(
        datasetId
      )}&useSourceConnection=${useSourceConnection}`;
      console.log(`Calling ${url} for conceptId ${conceptId}`);
      const options = this.createOptions("GET");
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(
        `Error while getting data characterization drilldown: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`
      );
      throw error;
    }
  }

  // Fetch CDM version
  async getCdmVersion(datasetId: string) {
    try {
      const url = `${this.baseURL}/alpdb/cdmversion?datasetId=${datasetId}`;
      console.log(`Calling ${url} to fetch CDM version`);
      const options = this.getRequestConfig();
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error) {
      // The endpoint runs `SELECT CDM_VERSION FROM <catalog>.<schema>.CDM_SOURCE`.
      // cdm_source is optional in the OMOP DDL, so a CDM loaded without it -- or one
      // whose cache has not finished building -- fails here with a bare 500. Both
      // callers (DQD and data characterisation) already guard against an empty
      // version but never reach that check, because this rejects first: the user
      // was shown "Error creating DQD flow run: Request failed with status 500"
      // with nothing pointing at the missing table. Keep the original error as the
      // cause and say what to look at.
      console.error(`Error while getting cdm version: ${error}`);
      const detail = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not determine the CDM version for dataset ${datasetId}. ` +
          `It is read from the CDM_SOURCE table in the dataset's CDM schema — check that ` +
          `the table exists and holds a row with cdm_version set, and that the dataset's ` +
          `cache has finished building. Underlying error: ${detail}`,
      );
    }
  }

  private getRequestConfig() {
    let options: AxiosRequestConfig = {};

    options = {
      headers: {
        Authorization: this.token,
      },
      // httpsAgent: this.httpsAgent,
    };

    return options;
  }

  private createOptions(method: string): RequestInit {
    return {
      method,
      headers: {
        Authorization: this.token,
        "Content-Type": "application/json",
      },
    };
  }
}
