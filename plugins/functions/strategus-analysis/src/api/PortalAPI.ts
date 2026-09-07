import { AxiosRequestConfig } from "../../../_shared/_axios.ts";
import { services } from "../env.ts";

interface CreateDatasetInput {
  id: string;
  type: string;
  tokenDatasetCode: string;
  tenantId: string;
  dialect: string;
  databaseCode: string;
  schemaName: string;
  vocabSchemaName: string;
  resultsSchemaName: string;
  dataModel: string;
  visibilityStatus: string;
  detail: {
    name: string;
    summary: string;
    description: string;
    showRequestAccess: boolean;
  };
  dashboards: {
    name: string;
    url: string;
  }[];
  attributes: {
    attributeId: string;
    value: string;
  }[];
  tags: string[];
}

export class PortalAPI {
  private readonly baseURL: string;
  private readonly logger = console;
  private readonly token: string;
  private readonly channel: any;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for Portal API!");
    }
    if (services.portalServer) {
      this.baseURL = services.portalServer;
      this.channel = Trex.tokioChannel("d2e-functions/portal");
    } else {
      throw new Error("No url is set for PortalAPI");
    }
  }

  private async getRequestConfig() {
    const options: AxiosRequestConfig = {
      headers: {
        Authorization: this.token,
      },
    };
    return options;
  }

  async getDataset(datasetId: string) {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset?datasetId=${encodeURIComponent(datasetId)}`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error) {
      this.logger.error(`Error fetching dataset ${datasetId}. ${error}`);
      throw new Error(`Error fetching dataset ${datasetId}. ${error}`);
    }
  }

  async getDatasetByToken(tokenStudyCode: string) {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset?tokenDatasetCode=${encodeURIComponent(tokenStudyCode)}`;
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error) {
      this.logger.error(`Error fetching dataset by token ${tokenStudyCode}. ${error}`);
      throw new Error(`Error fetching dataset by token ${tokenStudyCode}. ${error}`);
    }
  }

  async createDataset(data: CreateDatasetInput) {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset`;
      const result = await this.channel.post(url, data, options);
      return result.data;
    } catch (error) {
      this.logger.error(`Error creating dataset. ${error}`);
      throw new Error(`Error creating dataset. ${error}`);
    }
  }

  // The endpoint is not exposed in Trex (functions/package.json); Only available through Tokio channel
  // Clients cannot call the method directly via HTTP since it's only meant to be used internally by StrategusAnalysis when updating the dataset with new database code
  async updateDataset(datasetId: string, databaseCode: string) {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset/update-database-code`;
      const result = await this.channel.put(url, { datasetId, databaseCode }, options);
      return result.data;
    } catch (error) {
      this.logger.error(`Error updating dataset. ${error}`);
      throw new Error(`Error updating dataset. ${error}`);
    }
  }

  async deleteDataset(datasetId: string) {
    try {
      const options = await this.getRequestConfig();
      const url = `${this.baseURL}/dataset?datasetId=${encodeURIComponent(datasetId)}`;
      const result = await this.channel.delete(url, options);
      return result.data;
    } catch (error) {
      this.logger.error(`Error deleting dataset ${datasetId}. ${error}`);
      throw new Error(`Error deleting dataset ${datasetId}. ${error}`);
    }
  }
}
