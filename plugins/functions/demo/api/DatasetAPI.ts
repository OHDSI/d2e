import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import { services } from "../env.ts";
import { post } from "./request-util.ts";

export class DatasetAPI {
  private readonly baseURL: string;
  private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;
  private readonly channel;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for DatasetAPI!");
    }

    if (services.dataset) {
      this.baseURL = services.dataset;
      this.channel = Trex.tokioChannel("d2e-functions/dataset");
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for DatasetAPI");
      throw new Error("No url is set for DatasetAPI");
    }
  }

  async createDataset(dto: any) {
    try {
      this.logger.info("Create dataset");
      const options = await this.getRequestConfig();
      const url = this.baseURL;
      const result = await this.channel.post(url, dto, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while creating dataset: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
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
