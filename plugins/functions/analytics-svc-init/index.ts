import knex from "knex";
import config from "./src/db/knexfile-admin.ts";
import { env } from "./src/env.ts";
import { MigrationSource } from "./src/db/MigrationSource.ts";
import { pruneCohortCache } from "./src/db/pruneCohortCache.ts";

const k = knex(config);
await k.migrate.latest({ migrationSource: new MigrationSource() });
console.log("analytics-svc-init migrations: done");

await pruneCohortCache(k, env.PG_SCHEMA);
