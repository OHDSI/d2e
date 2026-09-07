import { AxiosRequestConfig } from "../../../_shared/_axios.ts";
import { env } from "../env.ts";
import { get } from "./request-util.ts";

export class FilesManagerAPI {
  private readonly baseURL: string;
  private readonly httpsAgent: any;
  private readonly logger = console;
  private readonly token: string;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for FilesManagerAPI!");
    }

    if (env.SERVICE_ROUTES.filesManager) {
      this.baseURL = env.SERVICE_ROUTES.filesManager;
    } else {
      this.logger.error("No url is set for FilesManagerAPI");
      throw new Error("No url is set for FilesManagerAPI");
    }
  }

  async getFile(fileId: number) {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/${fileId}`;
      const result = await get(url, options);
      return result.data;
    } catch (error) {
      console.error(`Error while getting file with fileId ${fileId}: ${error}`);
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
      responseType: "arraybuffer", // To preserve the binary data
    };

    return options;
  }
}
