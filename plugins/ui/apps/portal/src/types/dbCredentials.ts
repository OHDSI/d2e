export enum DB_DIALECTS {
  POSTGRES = "postgres",
  HANA = "hana",
  BIG_QUERY = "bigquery",
  SNOWFLAKE = "snowflake",
}
export type DbDialect = `${DB_DIALECTS}`;
export const DB_DIALECTS_KEY_VALUE = [
  {
    key: DB_DIALECTS.POSTGRES,
    value: "PostgreSQL",
  },
  {
    key: DB_DIALECTS.HANA,
    value: "Hana",
  },
  {
    key: DB_DIALECTS.BIG_QUERY,
    value: "BigQuery (experimental)",
  },
  {
    key: DB_DIALECTS.SNOWFLAKE,
    value: "Snowflake (experimental)",
  },
];

export enum AUTHENTICATION_MODES {
  PASSWORD = "Password",
}
export type AuthenticationMode = `${AUTHENTICATION_MODES}`;

export interface IDatabase {
  id: string;
  code: string;
  host: string;
  port: number;
  name: string;
  dialect: DbDialect;
  extra: IDbExtra[];
  authenticationMode: AuthenticationMode;
  credentials: IDbCredential[];
  vocabSchemas: string[];
  publications: IDbPublication[];
  hasLegacyExtra?: boolean;
}

// Response from API
export interface IDatabaseResponse {
  id: string;
  code: string;
  host: string;
  port: number;
  name: string;
  dialect: DbDialect;
  db_extra: any;
  credentials: IDbCredential[];
  vocab_schemas: string[];
  publications: IDbPublication[];
}

export interface IDbExtra {
  id?: string;
  value: string;
  serviceScope: ServiceScopeType;
}

export interface IDbCredential {
  id?: string;
  username: string;
  password: string;
  salt: string;
  userScope: UserScopeType;
  serviceScope: ServiceScopeType;
}

export interface IDbPublication {
  publication: string;
  slot: string;
}

export enum USER_SCOPE_TYPES {
  ADMIN = "Admin",
  READ = "Read",
}
export const CREDENTIAL_USER_SCOPES = Object.values(USER_SCOPE_TYPES);

export type UserScopeType = `${USER_SCOPE_TYPES}`;

export enum SERVICE_SCOPE_TYPES {
  INTERNAL = "Internal",
  DATA_PLATFORM = "DataPlatform",
}

export type ServiceScopeType = `${SERVICE_SCOPE_TYPES}`;

export interface IDbExtraAdd extends Omit<IDbExtra, "id"> {}

export interface IDbCredentialAdd extends Omit<IDbCredential, "id"> {}

export interface INewDatabase extends Omit<IDatabase, "id" | "extra" | "credentials"> {
  extra: {
    Internal?: string;
    DataPlatform?: string;
  };
  credentials: IDbCredentialAdd[];
}

export interface IDatabaseCredentialsUpdate
  extends Omit<IDatabase, "code" | "host" | "port" | "name" | "dialect" | "extra" | "vocabSchemas" | "publications"> {
  id: string;
  authenticationMode: AuthenticationMode;
  credentials: IDbCredentialAdd[];
}

export interface IDatabaseDetailsUpdate
  extends Omit<IDatabase, "code" | "dialect" | "extra" | "authenticationMode" | "credentials"> {
  id: string;
  vocabSchemas: string[];
  extra: { [key: string]: Record<string, unknown> };
}

export interface ITestConnection {
  user: string;
  password: string;
  host: string;
  database: string;
  port: number;
  extra?: Record<string, any>;
}

export interface ITestConnectionResult {
  success: boolean;
  message: string;
  error?: string;
  code?: string;
}

export const SSL_MODES = [
  { key: "", value: "None" },
  { key: "disable", value: "Disable" },
  { key: "allow", value: "Allow" },
  { key: "prefer", value: "Prefer" },
  { key: "require", value: "Require" },
  { key: "verify-ca", value: "Verify CA" },
  { key: "verify-full", value: "Verify Full" },
];
