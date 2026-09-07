import { Injectable, SCOPE } from "@danet/core";
// import { Agent } from 'node:https';
import { AxiosRequestConfig } from "../../../_shared/_axios.ts";
import { PA_CONFIG_TYPE } from "../common/const.ts";
import { RequestContextService } from "../common/request-context.service.ts";
import { env, services } from "../env.ts";
import { PaConfig, PaConfigType } from "../types.d.ts";

interface CdmConfig {
  configId: string;
  configName: string;
  configs: {
    meta: {
      configId: string;
      configName: string;
    };
  }[];
}

const CONFIG_TYPE_ACTIONS = {
  [PA_CONFIG_TYPE.BACKEND]: "getBackendConfig",
  [PA_CONFIG_TYPE.USER]: "getMyConfig",
};

@Injectable({ scope: SCOPE.REQUEST })
export class PaConfigApi {
  private readonly jwt: string;
  private readonly url: string;
  private readonly channel;
  // private readonly httpsAgent: Agent;

  constructor(private readonly requestContextService: RequestContextService) {
    if (services.paConfig) {
      this.jwt = this.requestContextService.getOriginalToken() || "";
      this.url = services.paConfig;
      this.channel = Trex.tokioChannel("d2e-functions/mri-pa-config");
      // this.httpsAgent = new Agent({
      //   rejectUnauthorized: true,
      //   ca: env.SSL_CA_CERT
      // });
    } else {
      throw new Error("No url is set for PaConfigApi");
    }
  }

  async getAllConfigs(): Promise<CdmConfig[]> {
    const requestConfig = this.getRequestConfig();
    const body = {
      action: "getAll",
    };
    const url = `${this.url}/enduser`;
    const timestamp = new Date().valueOf();
    console.time(`time-portal-pa-getAllConfigs-${timestamp}`);
    const result = await this.channel.post(url, body, requestConfig);
    console.timeEnd(`time-portal-pa-getAllConfigs-${timestamp}`);
    return result.data;
  }

  async getPaConfig(
    id: string,
    type: PaConfigType,
    datasetId: string
  ): Promise<PaConfig> {
    const requestConfig = this.getRequestConfig();
    const body = {
      action: CONFIG_TYPE_ACTIONS[type],
      configId: id,
    };
    const url = `${this.url}/enduser?datasetId=${datasetId}`;
    const timestamp = new Date().valueOf();
    console.time(`time-portal-pa-config-${timestamp}`);
    const result = await this.channel.post(url, body, requestConfig);
    console.timeEnd(`time-portal-pa-config-${timestamp}`);
    return result.data;
  }

  private getRequestConfig(): AxiosRequestConfig {
    return {
      headers: {
        Authorization: this.jwt,
      },
    };
  }
}
