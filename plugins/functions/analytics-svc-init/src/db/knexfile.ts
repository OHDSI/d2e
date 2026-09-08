import { Knex } from "knex";
import * as path from "path";
import { env } from "../env.ts";

let ssl: Knex.PgConnectionConfig["ssl"] = JSON.parse(env.PG__SSL.toLowerCase());
if (env.PG_CA_ROOT_CERT) {
  ssl = {
    rejectUnauthorized: true,
    ca: env.PG_CA_ROOT_CERT,
  };
}

const config: Knex.Config = {
  client: "pg",
  connection: {
    host: env.PG__HOST,
    port: env.PG__PORT,
    database: env.PG__DB_NAME,
    user: env.PG_USER,
    password: env.PG_PASSWORD,
    ssl,
  },
  searchPath: [env.PG_SCHEMA],
  pool: {
    min: env.PG__MIN_POOL,
    max: env.PG__MAX_POOL,
    idleTimeoutMillis: env.PG__IDLE_TIMEOUT_IN_MS,
  },
  debug: env.PG__DEBUG,
  migrations: {
    extension: ".ts",
    schemaName: env.PG_SCHEMA,
    tableName: "knex_migrations", // table name used for storing the migration state
    directory: `${path
      .dirname(path.fromFileUrl(import.meta.url))
      .replace(/\/usr\/src/, ".")}/migrations`,
  }
};

export default config;
