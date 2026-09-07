import { env } from "../env";
import { Dataset } from "../types";
import https from "https";
import { AxiosRequestConfig } from "../../../_shared/_axios.ts";

export class PortalAPI {
  private readonly baseURL: string;
  private readonly token: string;
  private readonly logger = console;
  private readonly channel;
  // private readonly httpsAgent: https.Agent;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for Portal API!");
    }
    if (env.SERVICE_ROUTES.portalServer) {
      this.baseURL = env.SERVICE_ROUTES.portalServer;
      this.channel = Trex.tokioChannel("d2e-functions/portal");
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      // });
    } else {
      throw new Error("No url is set for PortalAPI");
    }
  }

  private async getRequestConfig() {
    let options: AxiosRequestConfig = {
      headers: {
        Authorization: this.token,
      },
    };

    return options;
  }

  async getDataset(id: string): Promise<Dataset> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset?datasetId=${id}`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error) {
      console.log(error);
      this.logger.error(`Error while getting dataset ${id}`);
      throw new Error(`Error while getting dataset ${id}`);
    }
  }
}
