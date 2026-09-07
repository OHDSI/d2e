import { HttpException, Injectable, SCOPE } from "@danet/core";
import { EntityManager, In } from "npm:typeorm";
import { v4 as uuidv4 } from "uuid";
import { TransactionRunner } from "../../common/data-source/transaction-runner.ts";
import { RequestContextService } from "../../common/request-context.service.ts";
import { getDbCredentialsByCode, toUpperCaseIfHana } from "../../env.ts";
import { createLogger } from "../../logger.ts";
import { TenantService } from "../../tenant/tenant.service.ts";
import {
  IDatasetAttribute,
  IDatasetAttributeDto,
  IDatasetDashboardBaseDto,
  IDatasetDetailBaseDto,
  IDatasetDetailMetadataUpdateDto,
  IDatasetDto,
  IDatasetReleaseDto,
  IDatasetSnapshotDto,
} from "../../types.d.ts";
import { UserMgmtService } from "../../user-mgmt/user-mgmt.service.ts";
import { WebApiSourceService } from "../../webapi/webapi-source.service.ts";
import { resolveCacheId } from "../entity/dataset.entity.ts";
import {
  Dataset,
  DatasetAttribute,
  DatasetDashboard,
  DatasetDetail,
  DatasetTag,
} from "../entity/index.ts";
import {
  DatasetAttributeRepository,
  DatasetCodeQueryRepository,
  DatasetCodeRepository,
  DatasetDashboardRepository,
  DatasetDetailRepository,
  DatasetReleaseRepository,
  DatasetRepository,
  DatasetTagRepository,
} from "../repository/index.ts";
import { TrexApiService } from "../trex-api.service.ts";

const SWAP_TO = {
  STUDY: ["dataset", "study"],
  DATASET: ["study", "dataset"],
};

@Injectable({ scope: SCOPE.REQUEST })
export class DatasetCommandService {
  private readonly userId: string;
  private readonly logger = createLogger(this.constructor.name);

  constructor(
    private readonly transactionRunner: TransactionRunner,
    private readonly tenantService: TenantService,
    private readonly datasetRepo: DatasetRepository,
    private readonly releaseRepo: DatasetReleaseRepository,
    private readonly detailRepo: DatasetDetailRepository,
    private readonly dashboardRepo: DatasetDashboardRepository,
    private readonly attributeRepo: DatasetAttributeRepository,
    private readonly tagRepo: DatasetTagRepository,
    private readonly datasetCodeRepo: DatasetCodeRepository,
    private readonly datasetCodeQueryRepo: DatasetCodeQueryRepository,
    private readonly requestContextService: RequestContextService,
    private readonly webApiSourceService: WebApiSourceService,
    private readonly trexApiService: TrexApiService,
    private readonly userMgmtService: UserMgmtService,
  ) {
    this.userId = this.requestContextService.getAuthToken()?.sub;
  }

  async createDataset(datasetDto: IDatasetDto) {
    // if the dialect is hana, vocabSchemaName and resultsSchemaName are required to be in uppercase due to HANA's case sensitivity
    datasetDto.vocabSchemaName = toUpperCaseIfHana(
      datasetDto.vocabSchemaName,
      datasetDto.dialect,
    );
    datasetDto.resultsSchemaName = toUpperCaseIfHana(
      datasetDto.resultsSchemaName,
      datasetDto.dialect,
    );

    const createDatasetFn = async (
      entityMgr: EntityManager,
      datasetDto: IDatasetDto,
    ) => {
      const tenant = this.tenantService.getTenant();
      if (datasetDto.tenantId !== tenant.id) {
        throw new HttpException(
          400,
          `Invalid tenantId ${datasetDto.tenantId} provided`,
        );
      }
      const { detail, dashboards, attributes, tags, ...dataset } = datasetDto;
      const { id } = dataset;

      const entity = this.datasetRepo.create(
        this.swapVariables<Dataset>(dataset, SWAP_TO.DATASET),
      );
      // insertDataset bypasses @BeforeInsert (TypeORM .insert() skips hooks); mirror
      // Dataset.applyCacheIdDefault by calling the same resolver it uses.
      if (entity.cacheId == null) {
        entity.cacheId = resolveCacheId(entity);
      }
      const result = await this.datasetRepo.insertDataset(
        entityMgr,
        this.addOwner(entity, true),
      );

      const detailEntity = this.detailRepo.create({
        id: uuidv4(),
        datasetId: id,
        ...this.addOwner(detail, true),
      });

      await this.detailRepo.insertDetail(entityMgr, detailEntity);

      dashboards.forEach(async (dashboard) => {
        const dashboardEntity = this.dashboardRepo.create({
          id: uuidv4(),
          datasetId: id,
          ...this.addOwner(dashboard, true),
        });
        await this.dashboardRepo.insertDashboard(entityMgr, dashboardEntity);
      });

      attributes.forEach(async (attribute) => {
        const attributeEntity = this.attributeRepo.create({
          datasetId: id,
          ...this.addOwner(attribute, true),
        });
        await this.attributeRepo.insertAttribute(entityMgr, attributeEntity);
      });

      tags.forEach(async (tag) => {
        const tagEntity = this.tagRepo.create({
          datasetId: id,
          name: tag,
        });
        await this.tagRepo.insertTag(entityMgr, this.addOwner(tagEntity, true));
      });

      return result;
    };
    // Insert the dataset row first so its id is visible to callers as soon as we return,
    // even if the upstream WebAPI sync takes longer than the caller's HTTP timeout.
    const result = await this.transactionRunner.run(
      createDatasetFn,
      datasetDto,
    );

    // Then register the source and kick off the TrexSQL cache build. The cache build
    // is fire-and-forget inside syncDatasetToWebApi — downstream consumers (DQD, DC)
    // must poll cache readiness via GET /system-portal/dataset/:id/cache-status
    // before issuing queries that read the cache catalog.
    await this.syncDatasetToWebApi(
      {
        id: datasetDto.id,
        databaseCode: datasetDto.databaseCode,
        dialect: datasetDto.dialect,
        schemaName: datasetDto.schemaName,
        vocabSchemaName: datasetDto.vocabSchemaName,
        resultsSchemaName: datasetDto.resultsSchemaName,
        type: datasetDto.type,
        fhirDatasetId: datasetDto.fhirDatasetId ?? null,
      },
      datasetDto.detail,
    );

    // Best-effort: notify trex to (re)attach the new dataset's cache file and source DB
    // so a freshly-set cache_id becomes available without a trex restart. Resolved through
    // the same helper the insert path uses, so the attached value cannot drift from the
    // value persisted to cache_id.
    const cacheId = datasetDto.cacheId ?? resolveCacheId(datasetDto);
    await this.trexApiService.attach({
      cacheIds: cacheId ? [cacheId] : [],
      connectionIds: datasetDto.databaseCode ? [datasetDto.databaseCode] : [],
    });

    // Sync of the per-dataset Logto role + scopes; lazy-recreated on first researcher assignment if it fails.
    if (datasetDto.tokenDatasetCode) {
      try {
        await this.userMgmtService.ensureDatasetRole(
          datasetDto.id,
          datasetDto.tokenDatasetCode,
          datasetDto.type,
        );
      } catch (err) {
        this.logger.error(
          `Logto dataset-role sync failed for ${datasetDto.id}: ${err}`,
        );
      }
    }

    return result;
  }

  async createRelease(datasetReleaseDto: IDatasetReleaseDto) {
    const createReleaseFn = async (
      entityMgr: EntityManager,
      datasetReleaseDto: IDatasetReleaseDto,
    ) => {
      const entity = this.releaseRepo.create(datasetReleaseDto);
      const existingRecord =
        await this.releaseRepo.getReleaseByDatasetIdAndName(
          entity.datasetId,
          entity.name,
        );
      if (existingRecord.length > 0) {
        throw new HttpException(
          400,
          `Dataset with release name '${entity.name}' already exists`,
        );
      }
      const result = await this.releaseRepo.insertRelease(
        entityMgr,
        this.addOwner(entity, true),
      );

      return result;
    };
    return this.transactionRunner.run(createReleaseFn, datasetReleaseDto);
  }

  async offboardDataset(id: string) {
    const dataset = await this.datasetRepo.getDataset(id);
    const tokenDatasetCode = dataset?.tokenDatasetCode;

    const deleteDatasetFn = async (entityMgr: EntityManager, id: string) => {
      const result = await entityMgr.getRepository(Dataset).delete(id);
      if (result.affected === 0) {
        throw new HttpException(400, `Invalid dataset ID provided: ${id}`);
      } else {
        return {
          id,
        };
      }
    };
    const result = await this.transactionRunner.run(deleteDatasetFn, id);

    const authToken = this.requestContextService.getOriginalToken();
    if (authToken && dataset?.type === "webapi") {
      this.webApiSourceService
        .deleteSourceForDataset(id, authToken)
        .catch((err) =>
          this.logger.error(`WebAPI delete failed for ${id}: ${err}`),
        );
    }

    // Delete the per-dataset Logto role + scopes (fire-and-forget).
    if (tokenDatasetCode) {
      this.userMgmtService
        .removeDatasetRole(id, tokenDatasetCode)
        .catch((err) =>
          this.logger.error(
            `Logto dataset-role delete failed for ${id}: ${err}`,
          ),
        );
    }

    return result;
  }

  async transformToWebApi(
    sourceId: string,
  ): Promise<{ id: string; transformed: boolean; reason?: string }> {
    let tokenDatasetCode: string | undefined;
    const run = async (entityMgr: EntityManager) => {
      const source = await entityMgr.findOne(Dataset, {
        where: { id: sourceId },
      });
      if (!source) {
        throw new HttpException(404, `Dataset ${sourceId} not found`);
      }
      tokenDatasetCode = source.tokenDatasetCode;
      if (source.sourceDatasetId) {
        throw new HttpException(
          400,
          `Dataset ${sourceId} is a snapshot (sourceDatasetId=${source.sourceDatasetId}); transform must be invoked on the source row.`,
        );
      }

      const snapshots = await entityMgr.find(Dataset, {
        where: { sourceDatasetId: sourceId },
      });
      if (snapshots.length === 0) {
        this.logger.info(
          `Dataset ${sourceId} is already webapi-managed; no-op.`,
        );
        return {
          id: sourceId,
          transformed: false,
          reason: "already webapi-managed",
        };
      }
      if (snapshots.length > 1) {
        throw new HttpException(
          400,
          `Dataset ${sourceId} has ${snapshots.length} snapshots; manual inspection required (multiple snapshots).`,
        );
      }
      const snapshot = snapshots[0];

      const targetVisibility =
        snapshot.visibilityStatus && snapshot.visibilityStatus !== "HIDDEN"
          ? snapshot.visibilityStatus
          : "DEFAULT";
      await this.datasetRepo.updateRowShape(entityMgr, sourceId, {
        visibilityStatus: targetVisibility,
        type: "webapi",
      });

      const snapshotDetail = await entityMgr.findOne(DatasetDetail, {
        where: { datasetId: snapshot.id },
      });
      if (snapshotDetail) {
        const sourceDetail = await entityMgr.findOne(DatasetDetail, {
          where: { datasetId: sourceId },
        });
        if (sourceDetail) {
          // Keep the source dataset's own name; the snapshot (cache) name must
          // not become the converted webapi dataset's name. Merge the rest.
          await entityMgr.update(
            DatasetDetail,
            { id: sourceDetail.id },
            {
              description: snapshotDetail.description,
              summary: snapshotDetail.summary,
              showRequestAccess: snapshotDetail.showRequestAccess,
            },
          );
        } else {
          await entityMgr.update(
            DatasetDetail,
            { id: snapshotDetail.id },
            { datasetId: sourceId },
          );
        }
      }

      // Skip rows whose identity-key already exists on the source.
      const moveTable = async (
        entityCls: any,
        conflictField: string,
        skipPredicate?: (row: Record<string, unknown>) => boolean,
      ) => {
        const fromSnapshot = await entityMgr.find(entityCls, {
          where: { datasetId: snapshot.id },
        });
        const onSource = await entityMgr.find(entityCls, {
          where: { datasetId: sourceId },
        });
        const existingKeys = new Set(
          (onSource as any[]).map((r) => r[conflictField]),
        );
        for (const row of fromSnapshot as any[]) {
          if (skipPredicate?.(row)) {
            await entityMgr.delete(entityCls, { id: row.id });
            continue;
          }
          if (existingKeys.has(row[conflictField])) {
            this.logger.info(
              `Skipping ${entityCls.name} row ${row.id} on snapshot — key ${conflictField}=${row[conflictField]} already on source.`,
            );
            continue;
          }
          await entityMgr.update(
            entityCls,
            { id: row.id },
            { datasetId: sourceId },
          );
        }
      };
      // Drop source_dataset_id instead of moving it to the source
      await moveTable(
        DatasetAttribute,
        "attributeId",
        (row) => row.attributeId === "source_dataset_id",
      );
      await moveTable(DatasetDashboard, "name");
      await moveTable(DatasetTag, "name");

      // user-mgmt has no role-listing endpoint, so snapshot grants are orphaned — re-grant on sourceId manually.
      this.logger.warn(
        `transformToWebApi(${sourceId}): role grants on snapshot ${snapshot.id} are orphaned; re-grant roles on ${sourceId} manually.`,
      );

      await entityMgr.delete(Dataset, { id: snapshot.id });

      this.logger.info(
        `Transformed dataset ${sourceId}: merged snapshot ${snapshot.id}, visibility=${targetVisibility}.`,
      );
      return { id: sourceId, transformed: true };
    };

    const result = await this.transactionRunner.run(run, undefined);

    if (result.transformed) {
      if (tokenDatasetCode) {
        try {
          await this.userMgmtService.ensureDatasetRole(
            sourceId,
            tokenDatasetCode,
            "webapi",
          );
        } catch (err) {
          this.logger.error(
            `Logto dataset-role sync failed for ${sourceId}: ${err}`,
          );
        }
      }

      const source = await this.datasetRepo.getDataset(sourceId);
      const detail = await this.detailRepo.getDetail(sourceId);

      if (source && detail) {
        await this.syncDatasetToWebApi(
          {
            id: source.id,
            databaseCode: source.databaseCode,
            dialect: source.dialect,
            schemaName: source.schemaName,
            vocabSchemaName: source.vocabSchemaName,
            resultsSchemaName: source.resultsSchemaName,
            type: "webapi",
            fhirDatasetId: source.fhirDatasetId ?? null,
          },
          detail,
        );
      }
    }

    return result;
  }

  async createDatasetSnapshot(snapshotDto: IDatasetSnapshotDto) {
    // Cache/snapshot datasets do NOT create WebAPI sources - they use the source dataset's WebAPI source
    // The TrexSQL cache is created for the source dataset, not for snapshots

    // Captured inside the transaction so the attach after it uses exactly the
    // value persisted to cache_id, and the source connection the cache reads from.
    let attachTarget: { cacheId: string | null; databaseCode: string | null } | null =
      null;

    const createSnapshotFn = async (
      entityMgr: EntityManager,
      snapshotDto: IDatasetSnapshotDto,
    ) => {
      const {
        id: snapshotId,
        sourceDatasetId,
        newDatasetName,
        schemaName,
        vocabSchemaName: newVocabSchemaName,
        resultsSchemaName: newResultsSchemaName,
        timestamp,
        type: newType,
        flowParameters,
      } = snapshotDto;
      const sourceDataset = await this.datasetRepo.getDataset(sourceDatasetId);
      if (!sourceDataset) {
        throw new HttpException(
          400,
          `Dataset with id ${sourceDatasetId} not found`,
        );
      }

      const {
        tenantId,
        databaseCode,
        vocabSchemaName: sourceVocabSchemaName,
        resultsSchemaName: sourceResultsSchemaName,
        tokenDatasetCode,
        paConfigId,
        dataModel,
        dialect,
        plugin,
      } = sourceDataset;

      // Sanitize the new dataset name to create a valid token dataset code
      const sanitizedName = newDatasetName
        .trim()
        .replace(/[^a-zA-Z0-9_]/g, "_") // Replace invalid characters with underscore
        .replace(/_+/g, "_") // Replace multiple underscores with single underscore
        .replace(/^_+|_+$/g, ""); // Remove leading/trailing underscores

      const newTokenDatasetCode =
        `${tokenDatasetCode}_dm_${sanitizedName}`.substring(0, 80);

      // Copy dataset with new schema name

      // Use provided schema names from request, or fall back to source dataset schema names
      const finalVocabSchemaName = newVocabSchemaName || sourceVocabSchemaName;
      const finalResultsSchemaName =
        newResultsSchemaName || sourceResultsSchemaName;

      const datasetSnapshot: Partial<Dataset> = {
        id: snapshotId,
        type: newType,
        tenantId,
        databaseCode,
        // A cache dataset owns its own catalog, named after its OWN id — the cache file is
        // written against this row (see resolveCacheWriteTarget in jobplugins), not the
        // source row. It must not inherit the source's cache_id: for a `source` row that
        // value is the databaseCode (issue #2877), which would make the cache build write
        // into the source connection's own catalog. Resolved through the shared helper so
        // HANA keeps its databaseCode — it is queried directly and has no DuckDB cache.
        cacheId: resolveCacheId({
          dialect,
          type: newType,
          id: snapshotId,
          databaseCode,
        }),
        dialect,
        schemaName,
        vocabSchemaName: finalVocabSchemaName,
        resultsSchemaName: finalResultsSchemaName,
        tokenDatasetCode: newTokenDatasetCode,
        paConfigId,
        dataModel,
        plugin,
        sourceDatasetId,
        visibilityStatus: "DEFAULT",
        flowParameters: flowParameters ?? null,
      };
      this.logger.info(
        `Create dataset snapshot with id ${snapshotId} from source dataset ${sourceDatasetId}`,
      );
      const datasetEntity = this.datasetRepo.create(datasetSnapshot);
      const newDatasetResult = await this.datasetRepo.insertDataset(
        entityMgr,
        this.addOwner(datasetEntity, true),
      );
      attachTarget = {
        cacheId: datasetSnapshot.cacheId ?? null,
        databaseCode: databaseCode ?? null,
      };

      // Copy dataset detail with new dataset name
      const sourceDatasetDetail =
        await this.detailRepo.getDetail(sourceDatasetId);
      const datasetDetail: DatasetDetail = {
        ...sourceDatasetDetail,
        id: uuidv4(),
        datasetId: snapshotId,
        name: newDatasetName,
      };
      this.logger.info(`Copy dataset detail: ${newDatasetName}`);
      await this.detailRepo.insertDetail(
        entityMgr,
        this.addOwner(datasetDetail, true),
      );

      // Create version attribute
      const version = String(timestamp.valueOf());
      const newVersionAttribute: IDatasetAttribute = {
        attributeId: "version",
        // Unix timestamp
        value: version,
      };
      await this.addCustomAttribute(entityMgr, snapshotId, newVersionAttribute);

      // Create source dataset id attribute
      const newDatasetIdAttribute: IDatasetAttribute = {
        attributeId: "source_dataset_id",
        value: sourceDatasetId,
      };
      await this.addCustomAttribute(
        entityMgr,
        snapshotId,
        newDatasetIdAttribute,
      );

      // Create source dataset name attribute
      const newDatasetNameAttribute: IDatasetAttribute = {
        attributeId: "source_dataset_name",
        value: sourceDatasetDetail.name,
      };
      await this.addCustomAttribute(
        entityMgr,
        snapshotId,
        newDatasetNameAttribute,
      );

      // Copy dataset attribute (excluding the ones inserted previously)
      const sourceDatasetAttributes =
        await this.attributeRepo.getAttributeDto(sourceDatasetId);
      const existingAttributes = await this.attributeRepo.getAttributeDto(
        snapshotId,
        entityMgr,
      );
      const existingAttributeIds = existingAttributes.map(
        (att) => att.attributeId,
      );

      for (const attribute of sourceDatasetAttributes.filter(
        (att) => !existingAttributeIds.includes(att.attributeId),
      )) {
        this.logger.info(`Copy dataset attribute: ${attribute.attributeId}`);
        const newAttributes = this.attributeRepo.createAttribute(
          snapshotId,
          attribute,
        );
        await this.attributeRepo.insertAttribute(
          entityMgr,
          this.addOwner(newAttributes, true),
        );
      }

      // Copy dataset tags
      const sourceDatasetTags = await this.tagRepo.getTags(sourceDatasetId);
      for (const datasetTag of sourceDatasetTags) {
        const newTag: Partial<DatasetTag> = {
          datasetId: snapshotId,
          name: datasetTag.name,
        };
        this.logger.info(`Copy dataset tag: ${datasetTag.name}`);
        await this.tagRepo.insertTag(entityMgr, this.addOwner(newTag, true));
      }

      return newDatasetResult;
    };

    const result = await this.transactionRunner.run(
      createSnapshotFn,
      snapshotDto,
    );

    // A cache dataset owns a catalog named after its OWN id (see resolveCacheId),
    // and createDataset only ever attaches the *source* row's cache_id — which is
    // the databaseCode. Nothing else attaches this one, so without this call the
    // first cache build fails with `Catalog "_<id>" does not exist!` on every
    // non-HANA source dataset. Best-effort for the same reason as createDataset:
    // trex re-attaches on restart, so a failure here delays the cache, it does
    // not corrupt the row that was just committed.
    if (attachTarget) {
      const { cacheId, databaseCode } = attachTarget;
      await this.trexApiService.attach({
        cacheIds: cacheId ? [cacheId] : [],
        connectionIds: databaseCode ? [databaseCode] : [],
      });
    }
    return result;
  }

  async updateDatasetDetailMetadata(
    datasetDetailMetadataUpdateDto: IDatasetDetailMetadataUpdateDto,
  ) {
    const updateDatasetDetailMetadataFn = async (
      entityMgr: EntityManager,
      datasetUpdateDto: IDatasetDetailMetadataUpdateDto,
    ) => {
      const {
        id: datasetId,
        detail,
        dashboards,
        tags,
        attributes,
      } = datasetUpdateDto;

      await this.updateDataset(entityMgr, datasetUpdateDto);
      await this.updateDatasetDetail(entityMgr, datasetId, detail);
      await this.updateDatasetDashboards(entityMgr, datasetId, dashboards);
      await this.updateDatasetTags(entityMgr, datasetId, tags);
      await this.updateDatasetAttributes(entityMgr, datasetId, attributes);

      return {
        id: datasetId,
      };
    };
    return this.transactionRunner.run(
      updateDatasetDetailMetadataFn,
      datasetDetailMetadataUpdateDto,
    );
  }

  private async updateDataset(
    entityMgr: EntityManager,
    datasetUpdateDto: IDatasetDetailMetadataUpdateDto,
  ) {
    const {
      id: datasetId,
      type,
      tokenDatasetCode,
      paConfigId,
      visibilityStatus,
      fhirDatasetId,
      vocabSchemaName,
      resultsSchemaName,
    } = datasetUpdateDto;

    const currDataset = await this.datasetRepo.getDataset(datasetId);

    if (!currDataset) {
      throw new HttpException(400, `Dataset with id ${datasetId} not found`);
    }
    const dataset: Partial<Dataset> = {
      ...currDataset,
      type,
      tokenDatasetCode,
      visibilityStatus,
      paConfigId,
      fhirDatasetId,
    };

    if (vocabSchemaName !== undefined) {
      dataset.vocabSchemaName = toUpperCaseIfHana(
        vocabSchemaName,
        dataset.dialect,
      );
    }

    if (resultsSchemaName !== undefined) {
      dataset.resultsSchemaName = toUpperCaseIfHana(
        resultsSchemaName,
        dataset.dialect,
      );
    }

    await this.datasetRepo.updateDataset(
      entityMgr,
      datasetId,
      this.addOwner(dataset),
    );
  }

  private async updateDatasetDetail(
    entityMgr: EntityManager,
    datasetId: string,
    detail: IDatasetDetailBaseDto,
  ) {
    const detailEntity = await entityMgr
      .getRepository(DatasetDetail)
      .findOne({ where: { datasetId } });

    if (detailEntity) {
      await entityMgr
        .getRepository(DatasetDetail)
        .update({ datasetId }, this.addOwner(detail));
    } else {
      throw new HttpException(
        400,
        `Dataset detail with datasetId ${datasetId} not found`,
      );
    }
  }

  private async updateDatasetDashboards(
    entityMgr: EntityManager,
    datasetId: string,
    dashboards: IDatasetDashboardBaseDto[],
  ) {
    const { deletedDashboards, newDashboards } =
      await this.filterDashboardChanges(datasetId, dashboards);
    for (const dashboard of deletedDashboards) {
      const { name, url, basePath } = dashboard;
      this.logger.debug(`Delete dataset ${datasetId} dashboard: ${name}`);
      await this.dashboardRepo.deleteDashboard(entityMgr, {
        name,
        url,
        basePath,
      });
    }
    for (const dashboard of newDashboards) {
      const entity = this.dashboardRepo.create({
        datasetId,
        ...dashboard,
        id: uuidv4(),
      });
      this.logger.debug(
        `Create dataset ${datasetId} dashboard ${JSON.stringify(entity)}`,
      );
      await this.dashboardRepo.insertDashboard(
        entityMgr,
        this.addOwner(entity, true),
      );
    }
  }

  private async updateDatasetTags(
    entityMgr: EntityManager,
    datasetId: string,
    tags: string[],
  ) {
    const tagChanges = await this.filterTagChanges(datasetId, tags);
    if (tagChanges.deletedTags) {
      this.logger.debug(
        `Delete dataset ${datasetId} tags: ${JSON.stringify(tagChanges.deletedTags)}`,
      );
      await this.tagRepo.deleteTag(entityMgr, {
        datasetId,
        name: In(tagChanges.deletedTags),
      });
    }
    for (const tag of tagChanges.newTags) {
      const newDatasetTag: Partial<DatasetTag> = {
        datasetId,
        name: tag,
      };
      this.logger.debug(`Create dataset ${datasetId} tag ${tag}`);
      await this.tagRepo.insertTag(
        entityMgr,
        this.addOwner(newDatasetTag, true),
      );
    }
  }

  private async updateDatasetAttributes(
    entityMgr: EntityManager,
    datasetId: string,
    attributes: IDatasetAttribute[],
  ) {
    const { deletedAttributes, newAttributes } =
      await this.filterAttributeChanges(datasetId, attributes);
    for (const attribute of deletedAttributes) {
      const criteria = this.attributeRepo.createAttribute(datasetId, attribute);
      this.logger.debug(
        `Delete dataset ${datasetId} attribute: ${JSON.stringify(criteria)}`,
      );
      await this.attributeRepo.deleteAttribute(entityMgr, criteria);
    }
    for (const attribute of newAttributes) {
      const entity = this.attributeRepo.createAttribute(datasetId, attribute);
      this.logger.debug(
        `Create dataset ${datasetId} attribute ${JSON.stringify(entity)}`,
      );
      await this.attributeRepo.insertAttribute(
        entityMgr,
        this.addOwner(entity, true),
      );
    }
  }

  async updateDatabaseCode(datasetId: string, databaseCode: string) {
    const currDataset = await this.datasetRepo.getDataset(datasetId);

    if (!currDataset) {
      throw new HttpException(400, `Dataset with id ${datasetId} not found`);
    }

    const dataset: Partial<Dataset> = {
      ...currDataset,
      databaseCode,
    };

    const entityMgr = (this.datasetRepo as any).manager as EntityManager;

    await this.datasetRepo.updateDataset(
      entityMgr,
      datasetId,
      this.addOwner(dataset),
    );

    return { id: datasetId };
  }

  async updateDatasetAttribute(datasetAttributeDto: IDatasetAttributeDto) {
    const updateAttributeFn = async (
      _entityMgr: EntityManager,
      datasetAttributeDto: IDatasetAttributeDto,
    ) => {
      const { studyId: datasetId } = datasetAttributeDto;
      const attribute = await this.attributeRepo.getDatasetAttribute(
        datasetId,
        datasetAttributeDto.attributeId,
      );
      const isNewEntity = !attribute;

      const dataAttributeEntity = this.addOwner(
        this.attributeRepo.createAttribute(datasetId, datasetAttributeDto),
        isNewEntity,
      );

      // Add previous user to created entity if is not new entity
      if (!isNewEntity) {
        dataAttributeEntity.createdBy = attribute.createdBy;
      }

      const result = await this.attributeRepo.upsert(dataAttributeEntity, [
        "datasetId",
        "attributeId",
      ]);
      return result.identifiers[0].id;
    };

    return this.transactionRunner.run(updateAttributeFn, datasetAttributeDto);
  }

  async updateDatasetDashboardCode(
    datasetId: string,
    code: string,
    type: string = "dashboard",
    name: string = "",
    language?: string,
  ) {
    const updateDashboardCodeFn = async (
      _entityMgr: EntityManager,
      dto: {
        datasetId: string;
        code: string;
        type: string;
        name: string;
        language?: string;
      },
    ) => {
      const datasetCode = await this.datasetCodeRepo.getDatasetCode(
        dto.datasetId,
        dto.type,
        dto.name,
      );
      const isNewEntity = !datasetCode;

      const datasetCodeEntity = this.addOwner(
        this.datasetCodeRepo.create({
          datasetId: dto.datasetId,
          type: dto.type,
          code: dto.code,
          name: dto.name,
          language: dto.language,
        }),
        isNewEntity,
      );

      // Add previous user to created entity if is not new entity
      if (!isNewEntity) {
        datasetCodeEntity.createdBy = datasetCode.createdBy;
      }

      const result = await this.datasetCodeRepo.upsert(datasetCodeEntity, [
        "datasetId",
        "type",
        "name",
      ]);
      return result.identifiers[0].id;
    };

    return this.transactionRunner.run(updateDashboardCodeFn, {
      datasetId,
      code,
      type,
      name,
      language,
    });
  }

  async upsertDatasetCodeQuery(
    datasetId: string,
    type: string,
    name: string,
    queryName: string,
    sql: string,
  ) {
    const upsertCodeQueryFn = async (
      _entityMgr: EntityManager,
      dto: {
        datasetId: string;
        type: string;
        name: string;
        queryName: string;
        sql: string;
      },
    ) => {
      const result = await this.datasetCodeQueryRepo.upsertDatasetCodeQuery(
        dto.datasetId,
        dto.type,
        dto.name,
        dto.queryName,
        dto.sql,
        this.userId,
      );
      return result.id;
    };

    return this.transactionRunner.run(upsertCodeQueryFn, {
      datasetId,
      type,
      name,
      queryName,
      sql,
    });
  }

  async deleteDatasetCodeQuery(
    datasetId: string,
    type: string,
    name: string,
    queryName: string,
  ) {
    return await this.datasetCodeQueryRepo.deleteDatasetCodeQuery(
      datasetId,
      type,
      name,
      queryName,
    );
  }

  private async addCustomAttribute(
    entityMgr: EntityManager,
    datasetId: string,
    customAttribute: IDatasetAttribute,
  ) {
    const { attributeId, value } = customAttribute;
    this.logger.info(`Create ${attributeId} attribute: ${value}`);
    const entity = this.attributeRepo.createAttribute(
      datasetId,
      customAttribute,
    );
    await this.attributeRepo.insertAttribute(
      entityMgr,
      this.addOwner(entity, true),
    );
  }

  private swapVariables<T>(object: any, swapPair: string[]) {
    const from = swapPair[0];
    const to = swapPair[1];
    const fromCapitalised = from.charAt(0).toUpperCase() + from.slice(1);
    for (const key in object) {
      if (key.includes(from)) {
        const newKey = key.replace(from, to);
        object[newKey] = object[key];
        delete object[key];
      } else if (key.includes(fromCapitalised)) {
        const toCapitalised = to.charAt(0).toUpperCase() + to.slice(1);
        const newKey = key.replace(fromCapitalised, toCapitalised);
        object[newKey] = object[key];
        delete object[key];
      }
    }
    return <T>object;
  }

  private addOwner<T>(object: T, isNewEntity = false) {
    if (isNewEntity) {
      return {
        ...object,
        createdBy: this.userId,
        modifiedBy: this.userId,
      };
    }
    return {
      ...object,
      modifiedBy: this.userId,
    };
  }

  private async filterAttributeChanges(
    datasetId: string,
    attributes: IDatasetAttribute[],
  ): Promise<{ [key: string]: IDatasetAttribute[] }> {
    const currDatasetAttributes =
      await this.attributeRepo.getAttributeDto(datasetId);
    const currAttributes = currDatasetAttributes.reduce<IDatasetAttribute[]>(
      (acc, currDatasetAttribute) => {
        const { studyId: _studyId, ...customAttribute } = currDatasetAttribute;
        acc.push(customAttribute);
        return acc;
      },
      [],
    );

    const isSameAttribute = (a: IDatasetAttribute, b: IDatasetAttribute) =>
      a.attributeId === b.attributeId && a.value === b.value;

    const deletedAttributes =
      this.onlyInLeft<IDatasetAttribute>(
        currAttributes,
        attributes,
        isSameAttribute,
      ) || [];
    const newAttributes =
      this.onlyInLeft<IDatasetAttribute>(
        attributes,
        currAttributes,
        isSameAttribute,
      ) || [];

    return {
      deletedAttributes,
      newAttributes,
    };
  }

  private async filterTagChanges(
    datasetId,
    tags,
  ): Promise<{ [key: string]: string[] }> {
    const currDatasetTags = await this.tagRepo.getTags(datasetId);
    const currTags = currDatasetTags.map((datasetTag) => datasetTag.name);
    const [remainingTags, deletedTags] = currTags.reduce(
      ([remainingTags, deletedTags], tag) => {
        return tags.includes(tag)
          ? [[...remainingTags, tag], deletedTags]
          : [remainingTags, [...deletedTags, tag]];
      },
      [[], []],
    );
    const newTags = tags.filter((tag) => !remainingTags.includes(tag));
    return {
      deletedTags,
      newTags,
    };
  }

  private async filterDashboardChanges(
    datasetId: string,
    dashboards: IDatasetDashboardBaseDto[],
  ): Promise<{ [key: string]: IDatasetDashboardBaseDto[] }> {
    const currDashboards = await this.dashboardRepo.find({
      where: { datasetId },
    });

    const isSameDashboard = (
      a: IDatasetDashboardBaseDto,
      b: IDatasetDashboardBaseDto,
    ) => a.name === b.name && a.url === b.url && a.basePath === b.basePath;

    const deletedDashboards =
      this.onlyInLeft<IDatasetDashboardBaseDto>(
        currDashboards,
        dashboards,
        isSameDashboard,
      ) || [];
    const newDashboards =
      this.onlyInLeft<IDatasetDashboardBaseDto>(
        dashboards,
        currDashboards,
        isSameDashboard,
      ) || [];

    return {
      deletedDashboards,
      newDashboards,
    };
  }

  private onlyInLeft<T>(
    left: T[],
    right: T[],
    compareFunction: (a: T, b: T) => boolean,
  ) {
    return left.filter(
      (leftItems) =>
        !right.some((rightItems) => compareFunction(leftItems, rightItems)),
    );
  }

  private async syncDatasetToWebApi(
    datasetInfo: {
      id: string;
      databaseCode: string;
      dialect?: string;
      schemaName?: string;
      vocabSchemaName?: string;
      resultsSchemaName?: string;
      type?: string;
      fhirDatasetId: string | null;
    },
    detail: DatasetDetail | { name: string },
  ): Promise<void> {
    // Only webapi-managed datasets get WebAPI records.
    if (datasetInfo.fhirDatasetId || datasetInfo.type !== "webapi") {
      this.logger.info(
        `Skipping WebAPI sync for non-webapi dataset ${datasetInfo.id} (type=${datasetInfo.type})`,
      );
      return;
    }

    const dbCredentials = getDbCredentialsByCode(datasetInfo.databaseCode);
    if (!dbCredentials) {
      throw new HttpException(
        400,
        `No database credentials found for ${datasetInfo.databaseCode}`,
      );
    }

    const authToken = this.requestContextService.getOriginalToken();
    if (!authToken) {
      throw new HttpException(401, "No auth token available for WebAPI sync");
    }

    const dataset = {
      id: datasetInfo.id,
      dialect: datasetInfo.dialect,
      schemaName: datasetInfo.schemaName,
      vocabSchemaName: datasetInfo.vocabSchemaName,
      resultsSchemaName: datasetInfo.resultsSchemaName,
    } as Dataset;

    const detailEntity =
      "datasetId" in detail
        ? (detail as DatasetDetail)
        : ({ name: detail.name } as DatasetDetail);

    try {
      await this.webApiSourceService.syncSourceForDataset(
        dataset,
        detailEntity,
        dbCredentials,
        authToken,
      );
    } catch (err) {
      this.logger.error(`WebAPI sync failed for ${datasetInfo.id}: ${err}`);
      throw new HttpException(502, `Failed to create WebAPI source: ${err}`);
    }
  }
}
