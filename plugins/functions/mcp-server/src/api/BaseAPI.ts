import { env } from "../env";

export interface CallOptions {
  authorization?: string;
  datasetId?: string;
  timeout?: number;
}

// Shared Trex HTTP client base. Subclasses own their error mapping.
export abstract class BaseAPI {
  protected readonly channel: any;
  protected readonly baseURL: string;
  protected readonly defaultTimeout = 20000;

  constructor(pluginName: string, routeKey: string) {
    // @ts-ignore Trex global injected at runtime
    this.channel = Trex.tokioChannel(`d2e-functions/${pluginName}`);
    this.baseURL = env.SERVICE_ROUTES[routeKey];
  }

  protected buildRequestConfig(opts: CallOptions) {
    const headers: Record<string, string> = {};
    if (opts.authorization !== undefined) headers["Authorization"] = opts.authorization;
    if (opts.datasetId !== undefined) headers["datasetId"] = opts.datasetId;
    return { headers, timeout: opts.timeout ?? this.defaultTimeout };
  }

  // Returns raw { data, status } — callers own error mapping and status checks.
  protected async call<T>(
    method: "get" | "post" | "put",
    path: string,
    opts: CallOptions,
    body?: unknown,
  ): Promise<{ data: T; status: number }> {
    const config = this.buildRequestConfig(opts);
    const url = `${this.baseURL}${path}`;
    let response: any;
    if (method === "get") {
      response = await this.channel.get(url, config);
    } else {
      response = await this.channel[method](url, body ?? {}, config);
    }
    return { data: response.data as T, status: response.status };
  }
}
