import { MigrationInterface, QueryRunner } from "npm:typeorm";

/**
 * Repairs cache/data-mart rows created by fc0eb12 (PR #3064).
 *
 * That commit gave every snapshot its own catalog name, sanitizeIdForCacheId(snapshotId).
 * Nothing in the system attaches such a catalog in trex — createDatasetSnapshot makes no
 * /attach call — while the datamart cache flow connects to trex with dbname = cache_id and
 * issues catalog-qualified DDL. Data marts created between fc0eb12 and this migration
 * therefore point at a catalog that does not exist and their cache flow run fails.
 *
 * Restores the source connection's catalog: the source row's cache_id, which is its
 * database_code (issue #2877 / FixSourceDatasetCacheId1778417559069) and is attached at
 * dataset creation. Rows created before fc0eb12 already match and are skipped.
 */
export class FixCacheDatasetCacheId1778417559070
  implements MigrationInterface
{
  name = "FixCacheDatasetCacheId1778417559070";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "portal"."dataset" AS d
      SET "cache_id" = COALESCE(s."cache_id", s."database_code")
      FROM "portal"."dataset" AS s
      WHERE d."source_dataset_id" = s."id"
        AND COALESCE(s."cache_id", s."database_code") IS NOT NULL
        AND d."cache_id" IS DISTINCT FROM COALESCE(s."cache_id", s."database_code")
    `);
  }

  public async down(): Promise<void> {
    // Non-reversible by design: the pre-migration cache_id named a trex catalog that was
    // never attached, so restoring it would only reintroduce the broken reference.
  }
}
