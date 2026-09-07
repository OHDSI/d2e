import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import { services } from "../env.ts";
import { get, post } from "./request-util.ts";
import { IDbCreateDto, IDbDto } from "../type.d.ts";

export class DbCredentialsAPI {
  private readonly baseURL: string;
  private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for DbCredentialsApi!");
    }

    if (services.trex) {
      this.baseURL = services.trex;
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for DbCredentialsApi");
      throw new Error("No url is set for DbCredentialsApi");
    }
  }

  async getDbList(): Promise<IDbDto[]> {
    try {
      this.logger.info("Get database list");
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/trex/db/`;
      const result = await get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while getting database list: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async createDb(dto: IDbCreateDto) {
    try {
      this.logger.info("Create database");
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/trex/db/`;
      const result = await post(url, dto, options);
      return result.data;
    } catch (error: any) {
      const status = error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while creating database: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
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
