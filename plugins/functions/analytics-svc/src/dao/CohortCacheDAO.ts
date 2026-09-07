import pg from "pg";
import { Logger } from "@alp/alp-base-utils";
import { env } from "../env.ts";
import {
    CohortCacheValue,
    isCohortCacheValue,
} from "../utils/cohortCacheKey.ts";

const { Client } = pg;
const logger = Logger.CreateLogger("analytics-log");

const DEFAULT_SCHEMA = "analytics";
const TABLE_NAME = "cohort_cache";
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_$]*$/;

export type CohortCacheUpsertEntry = {
    key: string;
    value: CohortCacheValue;
};

/**
 * A stored row: the cached value plus the write timestamp the TTL is measured
 * from.
 */
export type CohortCacheRow = {
    value: CohortCacheValue;
    writtenAt: Date;
};

const toNumber = (value: unknown, fallback: number): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export class CohortCacheDAO {
    private getSchemaName = (): string => {
        const schema = env.PG_SCHEMA || DEFAULT_SCHEMA;
        if (!IDENTIFIER_PATTERN.test(schema)) {
            throw new Error(`Invalid PG_SCHEMA for cohort cache: ${schema}`);
        }
        return schema;
    };

    private getQualifiedTableName = (): string =>
        `"${this.getSchemaName()}"."${TABLE_NAME}"`;

    private getSslConfig = ():
        | boolean
        | { rejectUnauthorized: boolean; ca: string } => {
        const sslEnabled =
            String(env.PG__SSL ?? "false").toLowerCase() === "true";
        if (!sslEnabled) {
            return false;
        }
        if (env.PG_CA_ROOT_CERT) {
            return { rejectUnauthorized: true, ca: env.PG_CA_ROOT_CERT };
        }
        return true;
    };

    /**
     * Opens a client, runs `run` against it, and always closes the client.
     */
    private withClient = async <T>(
        run: (client: pg.Client) => Promise<T>
    ): Promise<T> => {
        const client = new Client({
            host: env.PG__HOST,
            port: toNumber(env.PG__PORT, 5432),
            database: env.PG__DB_NAME,
            user: env.PG_USER,
            password: env.PG_PASSWORD,
            ssl: this.getSslConfig(),
        });
        await client.connect();
        try {
            return await run(client);
        } finally {
            try {
                await client.end();
            } catch (err) {
                logger.error(
                    `Failed to close cohort cache connection: ${
                        err instanceof Error ? err.message : String(err)
                    }`
                );
            }
        }
    };

    /**
     * Returns one entry per key whose row holds a recognisable cache value. A
     * key absent from the map has no usable row; a key present with
     * `{ materializedCohort: null }` is a stored negative entry and counts as
     * a hit.
     */
    public lookup = async (
        keys: string[]
    ): Promise<Map<string, CohortCacheRow>> => {
        const found = new Map<string, CohortCacheRow>();
        if (!keys || keys.length === 0) {
            return found;
        }
        const result = await this.withClient<pg.QueryResult>((client) =>
            client.query(
                `SELECT "key", "value", "written_at" FROM ${this.getQualifiedTableName()} WHERE "key" = ANY($1::text[])`,
                [keys]
            )
        );
        for (const row of result.rows) {
            const value = row.value;
            if (isCohortCacheValue(value)) {
                found.set(row.key, { value, writtenAt: row.written_at });
            }
        }
        return found;
    };

    /**
     * Upserts the whole batch in one statement, returning the affected row
     * count. `written_at` is advanced on every write and is what `lookup`
     * returns for the TTL staleness check.
     */
    public upsert = async (
        entries: CohortCacheUpsertEntry[]
    ): Promise<number> => {
        if (!entries || entries.length === 0) {
            return 0;
        }
        const keys: string[] = [];
        const values: string[] = [];
        for (const entry of entries) {
            keys.push(entry.key);
            values.push(JSON.stringify(entry.value));
        }
        const result = await this.withClient<pg.QueryResult>((client) =>
            client.query(
                `INSERT INTO ${this.getQualifiedTableName()} ("key", "value", "written_at")
                 SELECT batch."key", batch."value"::jsonb, now()
                 FROM unnest($1::text[], $2::text[]) AS batch("key", "value")
                 ON CONFLICT ("key")
                 DO UPDATE SET "value" = EXCLUDED."value", "written_at" = now()`,
                [keys, values]
            )
        );
        return result.rowCount ?? 0;
    };

    public deleteKey = async (key: string): Promise<number> => {
        if (!key) {
            return 0;
        }
        const result = await this.withClient<pg.QueryResult>((client) =>
            client.query(
                `DELETE FROM ${this.getQualifiedTableName()} WHERE "key" = $1`,
                [key]
            )
        );
        return result.rowCount ?? 0;
    };
}
