import { Injectable, SCOPE } from "@danet/core";
import axios, { AxiosRequestConfig } from "../../../_shared/_axios.ts";
import { services } from "../env.ts";
import {
  IDatabaseSchemaFilterResult,
  IDatasetFilterScopesResult,
} from "../types.d.ts";
import { RequestContextService } from "../common/request-context.service.ts";
// import { Agent } from "node:https";

@Injectable({ scope: SCOPE.REQUEST })
export class AnalyticsApi {
  private readonly url: string;
  private readonly requestContextService: RequestContextService;
  private readonly jwt: string;
  private readonly channel;
  // private readonly httpsAgent: Agent

  constructor(requestContextService: RequestContextService) {
    this.requestContextService = requestContextService;
    this.jwt = this.requestContextService.getOriginalToken() || "";
    if (services.analytics) {
      this.url = services.analytics;
      this.channel = Trex.tokioChannel("d2e-functions/analytics-svc");
      // this.httpsAgent = new Agent({
      //   rejectUnauthorized: true,
      //   ca: env.SSL_CA_CERT
      // })
    } else {
      throw new Error("No url is set for AnalyticsApi");
    }
  }

  async getFilterScopes(
    datasetsWithSchema: string
  ): Promise<IDatasetFilterScopesResult> {
    const options = this.getRequestConfig();
    const params = new URLSearchParams();
    params.append("datasetsWithSchema", datasetsWithSchema);
    const url = `${
      this.url
    }/analytics-svc/api/services/dataset-filter/filter-scopes?${params.toString()}`;

    try {
      const result = await this.channel.get(url, options);
      return result.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `HTTP error! status: ${error.response?.status}, message: ${error.message}`
        );
      }
      throw error;
    }
  }

  async getDatabaseSchemaFilter(
    datasetsWithSchema: string,
    filterParams: any
  ): Promise<IDatabaseSchemaFilterResult> {
    const options = this.getRequestConfig();
    const params = new URLSearchParams();
    params.append("datasetsWithSchema", datasetsWithSchema);
    params.append("filterParams", JSON.stringify(filterParams));

    const url = `${
      this.url
    }/analytics-svc/api/services/dataset-filter/database-schema-filter?${params.toString()}`;
    const result = await this.channel.get(url, options);
    return result.data;
  }

  private getRequestConfig(): AxiosRequestConfig {
    return {
      headers: {
        Authorization: this.jwt,
      },
      // httpsAgent: this.httpsAgent,
    };
  }
}
