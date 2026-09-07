import { request } from "./request";
import {
  IDatabase,
  IDatabaseCredentialsUpdate,
  INewDatabase,
  IDatabaseDetailsUpdate,
  IDatabaseResponse,
  AUTHENTICATION_MODES,
  SERVICE_SCOPE_TYPES,
  ITestConnection,
  ITestConnectionResult,
} from "../types";
import omit from "lodash/omit";

const TREX_BASE_URL = "trex/";
const DB_BASE_URL = "gateway/api/db/";

export class DbCredentialsMgr {
  public async getDbList(): Promise<IDatabase[]> {
    const list = await request<IDatabaseResponse[]>({
      baseURL: TREX_BASE_URL,
      url: "db/",
      method: "GET",
    });

    return list.map((d) => {
      const dbExtra = d.db_extra ?? {};
      // If db_extra already has an "Internal" key, use its value directly; otherwise wrap the whole object
      const hasLegacyExtra = dbExtra && typeof dbExtra === "object" && !Array.isArray(dbExtra) && "Internal" in dbExtra;
      const internalValue = hasLegacyExtra
        ? typeof dbExtra.Internal === "string"
          ? dbExtra.Internal
          : JSON.stringify(dbExtra.Internal)
        : typeof dbExtra === "string"
        ? dbExtra
        : JSON.stringify(dbExtra);

      return {
        ...omit(d, "db_extra", "authentication_mode", "vocab_schemas"),
        extra: [{ value: internalValue, serviceScope: SERVICE_SCOPE_TYPES.INTERNAL }],
        authenticationMode: AUTHENTICATION_MODES.PASSWORD,
        vocabSchemas: d.vocab_schemas,
        hasLegacyExtra,
      };
    });
  }

  public addDb(db: INewDatabase) {
    return request({
      baseURL: TREX_BASE_URL,
      url: "db/",
      method: "POST",
      data: db,
    });
  }

  public updateDbCredentials(dbCredentials: IDatabaseCredentialsUpdate) {
    return request({
      baseURL: TREX_BASE_URL,
      url: "db/",
      method: "PUT",
      data: dbCredentials,
    });
  }

  public updateDbDetails(db: IDatabaseDetailsUpdate) {
    return request({
      baseURL: TREX_BASE_URL,
      url: "db/",
      method: "PUT",
      data: db,
    });
  }

  public deleteDb(id: string) {
    return request({
      baseURL: TREX_BASE_URL,
      url: `db/${id}`,
      method: "DELETE",
    });
  }
  public async testConnection(data: ITestConnection): Promise<ITestConnectionResult> {
    return await request<ITestConnectionResult>({
      baseURL: DB_BASE_URL,
      url: "test",
      method: "POST",
      data,
    });
  }
}
