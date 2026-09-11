import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import { services } from "../env.ts";
import { get } from "./request-util.ts";

export class UserMgmtAPI {
  private readonly baseURL: string;
  private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;
  private readonly channel;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for UserMgmtAPI!");
    }

    if (services.usermgmt) {
      this.baseURL = services.usermgmt;
      this.channel = Trex.tokioChannel("d2e-functions/alp-usermgmt");
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for UserMgmtAPI");
      throw new Error("No url is set for UserMgmtAPI");
    }
  }

  async registerStudyRoles(params: {
    userIds: string[];
    tenantId: string;
    studyId: string;
    roles: string[];
  }): Promise<any> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/user-group/register-study-roles`;
      console.log("Registering study roles with params:", params);
      const result = await this.channel.post(url, params, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while registering study roles: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getUsers(): Promise<{ id: string; username: string; idpUserId?: string }[]> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/user`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while getting users: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getMyRoles(): Promise<{
    datasetRoles: { tenantId: string; datasetId: string; role: string }[];
  }> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/me/roles`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while getting /me/roles: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getMe(): Promise<{ id: string; username: string }> {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/me`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while getting /me: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
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
