import { request } from "./request";

const PORTAL_BASE_URL = "system-portal";

export interface PortalDataset {
  id: string;
  type?: string;
}

export class Portal {
  /**
   * Fetch a dataset so callers can branch on its type.
   *
   * Only `webapi` datasets are registered as an OHDSI WebAPI source
   * (webapi.source + its daimons), so only they can answer
   * /d2e-webapi/vocabulary/:datasetId/search. Everything else has to use the
   * d2e-native terminology search instead.
   */
  public getDataset(datasetId: string): Promise<PortalDataset> {
    const params = new URLSearchParams();
    params.append("datasetId", datasetId);

    return request({
      baseURL: PORTAL_BASE_URL,
      url: `/dataset?${params}`,
      method: "GET",
    });
  }
}
