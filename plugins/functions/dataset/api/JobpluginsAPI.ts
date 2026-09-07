// import https from "node:https";
import { AxiosRequestConfig } from "../../_shared/_axios.ts";
import {
  ICreateDatamodelFlowRunDto
} from "../../jobplugins/src/types.ts";
import { services } from "../env.ts";
import { post } from "./request-util.ts";

export class JobPluginsAPI {
  private readonly baseURL: string;
  // private readonly httpsAgent: any;
  private readonly logger = console; //createLogger(this.constructor.name)
  private readonly token: string;
  private readonly endpoint: string = "/jobplugins";
  private readonly channel;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for Jobplugins API!");
    }
    if (services.jobplugins) {
      this.baseURL = services.jobplugins + this.endpoint;
      this.channel = Trex.tokioChannel("d2e-functions/jobplugins");
      // this.httpsAgent = new https.Agent({
      //   rejectUnauthorized: true,
      //   ca: env.GATEWAY_CA_CERT
      // });
    } else {
      this.logger.error("No url is set for JobpluginsAPI");
      throw new Error("No url is set for JobpluginsAPI");
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

  async createDatamodelFlowRun(data: ICreateDatamodelFlowRunDto) {
    this.logger.info("Running create datamodel flow run");
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/datamodel/create_datamodel_run`;
      const result = await this.channel.post(url, data, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Failed create datamodel flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getDatamodels() {
    this.logger.info("Running get datamodel list");
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/datamodel/list`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Failed get datamodels: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async getSchemasVersionInformation(): Promise<any> {
    this.logger.info(`Getting schemas version information`);
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/db-svc/fetch-version-info`;
      const result = await this.channel.post(url, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Failed get schemas version information: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async createCDMSchema(
    databaseCode: string,
    schemaName: string,
    dataModel: string,
    dialect: string,
    vocabSchema: string
  ): Promise<any> {
    this.logger.info(`Create CDM schema ${schemaName} in ${databaseCode}`);
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/db-svc/run`;
      const body = {
        dbSvcOperation: "createCDMSchema",
        requestType: "post",
        requestUrl: `/alpdb/${dialect}/database/${databaseCode}/data-model/${dataModel}/schema/${schemaName}`,
        requestBody: {
          vocabSchema: vocabSchema,
        },
      };
      const result = await this.channel.post(url, body, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Failed to create CDM schema ${schemaName} with data model ${dataModel} in ${databaseCode}: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async copyCDMSchema(
    databaseCode: string,
    sourceSchemaName: string,
    targetSchemaName: string,
    dialect: string,
    snapshotCopyConfig: any
  ) {
    const data = {
      database: databaseCode,
      sourceSchema: sourceSchemaName,
      targetSchemaName: targetSchemaName,
    };
    this.logger.info(`Copy CDM schema (${JSON.stringify(data)})`);
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/db-svc/run`;
      const body = {
        dbSvcOperation: "copyCDMSchema",
        requestType: "post",
        requestUrl: `/alpdb/${dialect}/database/${databaseCode}/data-model/omop5-4/schemasnapshot/${targetSchemaName}?sourceschema=${sourceSchemaName}`,
        requestBody: { snapshotCopyConfig: snapshotCopyConfig },
      };
      const result = await this.channel.post(url, body, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Failed to copy CDM schema ${sourceSchemaName} in ${databaseCode}: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async updateSchema(
    schemaName: string,
    dataModel: string,
    databaseCode: string,
    dialect: string,
    vocabSchema: string
  ): Promise<any> {
    this.logger.info(`Updating schema for ${schemaName}`);
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/db-svc/run`;
      const body = {
        dbSvcOperation: "updateSchema",
        requestType: "put",
        requestUrl: `/alpdb/${dialect}/database/${databaseCode}/data-model/${dataModel}?schema=${schemaName}`,
        requestBody: { vocabSchema },
      };
      const result = await this.channel.post(url, body, options);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Failed to update schema for ${schemaName}: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }

  async createDatamartCacheFlowRun(
    datasetId: string,
    cacheDatasetId: string,
    snapshotCopyConfig: object,
    flowId?: string,
    flowRunName?: string
  ): Promise<any> {
    this.logger.info(`Running datamart cache flow run`);

    try {
      const postOptions = await this.getRequestConfig();
      const url = `${this.baseURL}/cachedb/create-file`;
      const body = {
        datasetId,
        cacheDatasetId,
        flowId,
        snapshotCopyConfig,
        flowRunName,
      };
      const result = await post(url, body, postOptions);
      return result.data;
    } catch (error: any) {
      const status = error.status || error.response?.status;
      const responseData = error.response?.data;
      this.logger.error(`Error running datamart flow run: ${error.message}, status: ${status}, data: ${JSON.stringify(responseData)}`);
      throw error;
    }
  }
}
