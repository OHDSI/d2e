import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import { services } from "../env.ts";
import {
  IDcCreateFlowRun,
  IDqdCreateFlowRun,
  IGetVersionInfoCreateFlowRun,
  IPhenotypeCreateFlowRun,
  ICacheCreateFlowRun,
  ICacheStatusFlowRun,
  IDQDResultFlowRun,
} from "../type.d.ts";
import { post, get } from "./request-util.ts";

export class JobPluginsAPI {
  private readonly baseURL: string;
  private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;
  private readonly endpoint: string = "/jobplugins";
  private readonly channel;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for JobPluginsAPI!");
    }

    if (services.jobplugins) {
      this.baseURL = services.jobplugins + this.endpoint;
      this.channel = Trex.tokioChannel("d2e-functions/jobplugins");
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for JobPluginsAPI");
      throw new Error("No url is set for JobPluginsAPI");
    }
  }

  async createCacheFlowRun(dto: ICacheCreateFlowRun) {
    try {
      this.logger.info(`Create cache flow run: ${JSON.stringify(dto)}`);
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/cachedb/create-file`;
      this.logger.info(`POST ${url}`);
      const result = await this.channel.post(url, dto, options);
      this.logger.info(`Cache flow run result: ${JSON.stringify(result)}`);
      this.logger.info(`Cache flow run result.data: ${JSON.stringify(result?.data)}`);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while creating cache flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getCacheFlowRunStatus(dto: ICacheStatusFlowRun) {
    try {
      this.logger.info(
        `Get create cache flow run status for flow run: ${JSON.stringify(dto)}`
      );
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/cachedb/completed/${dto.flowRunId}`;
      const result = await get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while checking status of create cache flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async createDqdFlowRun(dto: IDqdCreateFlowRun) {
    try {
      this.logger.info(`Create DQD flow run: ${JSON.stringify(dto)}`);
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dqd/data-quality/flow-run`;
      const result = await this.channel.post(url, dto, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while creating DQD flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getDqdFlowRunOverviewResults(dto: IDQDResultFlowRun) {
    try {
      this.logger.info(
        `Get DQD flow run overview results for flow run: ${JSON.stringify(dto)}`
      );

      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dqd/data-quality/flow-run/${dto.flowRunId}/overview?datasetId=${dto.datasetId}`;
      const result = await get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while checking results of DQD flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async createDcFlowRun(dto: IDcCreateFlowRun) {
    try {
      this.logger.info(`Create DC flow run: ${JSON.stringify(dto)}`);
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dqd/data-characterization/flow-run`;
      const result = await this.channel.post(url, dto, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while creating DC flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async createGetVersionInfoFlowRun(dto: IGetVersionInfoCreateFlowRun) {
    try {
      this.logger.info(
        `Create data-model version-info: ${JSON.stringify(dto)}`
      );
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/datamodel/get_version_info`;
      const result = await this.channel.post(url, dto, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while creating data-model version-info: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async createPhenotypeFlowRun(dto: IPhenotypeCreateFlowRun) {
    try {
      this.logger.info(`Create phenotype flow run: ${JSON.stringify(dto)}`);
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/phenotype/flow-run`;
      const result = await this.channel.post(url, dto, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      console.error(`Error while creating phenotype flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
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
