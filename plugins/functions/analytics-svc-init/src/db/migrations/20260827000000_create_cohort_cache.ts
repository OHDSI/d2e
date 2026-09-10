import { Knex } from "knex";
const env = Deno.env.toObject()

const rawUp = `CREATE TABLE IF NOT EXISTS "${env.PG_SCHEMA}"."cohort_cache" (
    "key" text NOT NULL,
    "value" jsonb NOT NULL,
    "written_at" timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT "PK_cohort_cache" PRIMARY KEY ("key")
);`

const rawDown = `DROP TABLE IF EXISTS "${env.PG_SCHEMA}"."cohort_cache";`

export async function up(knex: Knex): Promise<void> {
    return knex.schema.withSchema(env.PG_SCHEMA).raw(rawUp)
}

export async function down(knex: Knex): Promise<void> {
    return knex.schema.withSchema(env.PG_SCHEMA).raw(rawDown)
}
