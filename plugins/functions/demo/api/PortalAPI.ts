import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import { services } from "../env.ts";
import { get } from "./request-util.ts";
import { IDataset } from "../type.d.ts";

export class PortalAPI {
  private readonly baseURL: string;
  private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;
  private readonly channel;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for PortalAPI!");
    }

    if (services.portalServer) {
      this.baseURL = services.portalServer;
      this.channel = Trex.tokioChannel("d2e-functions/portal");
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for PortalAPI");
      throw new Error("No url is set for PortalAPI");
    }
  }

  async getDataset(datasetId: string): Promise<IDataset> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset?datasetId=${encodeURIComponent(
        datasetId
      )}`;
      const result = await get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Error while getting dataset: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getDatasets(): Promise<IDataset[]> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset/list/systemadmin`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while getting datasets: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getCacheStatus(datasetId: string): Promise<{
    ready: boolean;
    cacheExists: boolean;
    cacheAttached: boolean;
    // When the cache file last changed. Readiness alone does not mean the copy
    // has finished, so callers use this to tell a settled cache from a growing one.
    lastModified?: number | null;
    activeJobStatus?: string | null;
    lastJobError?: string | null;
  }> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset/${encodeURIComponent(datasetId)}/cache-status`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while getting cache status: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  // Starts the cache job. getCacheStatus only reports; without this nothing ever
  // builds the cache, so a caller that merely polls waits out its own timeout.
  async refreshCache(datasetId: string): Promise<void> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset/${encodeURIComponent(datasetId)}/refresh-cache`;
      await this.channel.post(url, {}, options);
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while refreshing cache: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  private getRequestConfig() {
    let options: AxiosRequestConfig = {};

    options = {
      headers: {
        Authorization: this.token,
      },
      httpsAgent: this.httpsAgent,
    };

    return options;
  }
}
