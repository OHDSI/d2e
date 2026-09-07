// import https from "node:https";
import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import { services } from "../env.ts";
import { get, put } from "./request-util.ts";

interface IDatabaseDetailsUpdate {
  id: string;
  vocabSchemas: string[];
}

export class DbCredentialsAPI {
  private readonly baseURL: string;
  // private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for DbCredentials API!");
    }
    if (services.trex) {
      this.baseURL = services.trex;
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for DbCredentialsAPI");
      throw new Error("No url is set for DbCredentialsAPI");
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

  async getDbList() {
    try {
      this.logger.info("Get database list");
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/trex/db/`;
      const result = await get(url, options);
      return result.data;
    } catch (error) {
      console.error(`Error while getting database list`, error);
      throw error;
    }
  }

  async updateDbDetails(db: IDatabaseDetailsUpdate) {
    try {
      this.logger.info(`Updating database: ${JSON.stringify(db)}`);
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/trex/db/`;
      const result = await put(url, db, options);
      return result.data;
    } catch (error) {
      console.error(`Error while updating database`, error);
      throw error;
    }
  }
}
