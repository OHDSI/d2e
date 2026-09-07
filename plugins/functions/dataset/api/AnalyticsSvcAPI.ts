import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import { services, env } from "../env.ts";

//import { createLogger } from '../Logger'
import https from "node:https";

export class AnalyticsSvcAPI {
  private readonly baseURL: string;
  // private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;
  private readonly endpoint: string = "/analytics-svc/api/services/";
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
      //   // ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for AnalyticsSvcAPI");
      throw new Error("No url is set for AnalyticsSvcAPI");
    }
  }

  private async getRequestConfig() {
    let options: AxiosRequestConfig = {};

    options = {
      headers: {
        Authorization: this.token,
      },
      // httpsAgent: this.httpsAgent,
    };

    return options;
  }

  async getAllCohorts(datasetId: string) {
    const options = await this.getRequestConfig();
    const url = `${this.baseURL}cohort?datasetId=${datasetId}&excludePatientIds=true`;
    const result = await this.channel.get(url, options);
    return result.data;
  }

  // alpdb endpoints
  async checkIfSchemaExists(
    dialect: string,
    databaseCode: string,
    schemaName: string
  ): Promise<boolean> {
    this.logger.info(
      `Checking if schema exists for ${schemaName} in ${databaseCode}`
    );
    const options = await this.getRequestConfig();
    const url = `${
      this.baseURL
    }alpdb/schema/exists?dialect=${encodeURIComponent(
      dialect
    )}&databaseCode=${encodeURIComponent(
      databaseCode
    )}&schemaName=${encodeURIComponent(schemaName)}`;
    try {
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error) {
      const errorMessage = `Failed to check if schema exists for ${schemaName} in ${databaseCode}`;
      this.logger.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }

  async getCdmSchemaSnapshotMetadata(datasetId: string) {
    this.logger.info(`Getting CDM schema snapshot metadata for ${datasetId}`);
    const options = await this.getRequestConfig();
    const url = `${this.baseURL}alpdb/metadata/schemasnapshot?datasetId=${datasetId}`;
    const result = await this.channel.get(url, options);
    if (result.data) {
      return result.data;
    }
    throw new Error(
      `Failed to get CDM schema snapshot metadata for ${datasetId}`
    );
  }
}
