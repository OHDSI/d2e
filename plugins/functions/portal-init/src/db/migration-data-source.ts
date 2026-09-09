import { DataSource, DataSourceOptions } from "typeorm";
import { Config } from "../entity/config/config.entity.ts";
import { DatasetAttributeConfig } from "../entity/dataset/dataset-attribute-config.entity.ts";
import { DatasetAttribute } from "../entity/dataset/dataset-attribute.entity.ts";
import { DatasetCode } from "../entity/dataset/dataset-code.entity.ts";
import { DatasetDashboard } from "../entity/dataset/dataset-dashboard.entity.ts";
import { DatasetDetail } from "../entity/dataset/dataset-detail.entity.ts";
import { DatasetRelease } from "../entity/dataset/dataset-release.entity.ts";
import { DatasetTagConfig } from "../entity/dataset/dataset-tag-config.entity.ts";
import { DatasetTag } from "../entity/dataset/dataset-tag.entity.ts";
import { Dataset } from "../entity/dataset/dataset.entity.ts";
import { Feature } from "../entity/feature/feature.entity.ts";
import { Notebook } from "../entity/notebook/notebook.entity.ts";
import { UserArtifactGroup } from "../entity/user-artifact/user-artifact-group.entity.ts";
import { UserArtifact } from "../entity/user-artifact/user-artifact.entity.ts";
import { createDatasetTables1676872851977 } from "./migrations/1676872851977-create-dataset-tables.ts";
import { updateDataset1677809439828 } from "./migrations/1677809439828-update-dataset.ts";
import { updateDatasetDetail1677825145320 } from "./migrations/1677825145320-update-dataset-detail.ts";
import { updateDataset1678343392349 } from "./migrations/1678343392349-update-dataset.ts";
import { updateDataset1678762314955 } from "./migrations/1678762314955-update-dataset.ts";
import { UpdateDataset1682576221273 } from "./migrations/1682576221273-update-dataset.ts";
import { CreateMetadata1685082669454 } from "./migrations/1685082669454-create-metadata.ts";
import { CreateTag1685342973667 } from "./migrations/1685342973667-create-tag.ts";
import { CreateRelease1685342973670 } from "./migrations/1685342973670-create-dataset-release.ts";
import { UpdateDataset1691386594669 } from "./migrations/1691386594669-update-dataset.ts";
import { UpdateDataset1691644642674 } from "./migrations/1691644642674-update-dataset.ts";
import { CreateDatasetNotebook1698308495407 } from "./migrations/1698308495407-create-dataset-notebook.ts";
import { CreateMetadataConfigTables1700541858141 } from "./migrations/1700541858141-create-metadata-config-tables.ts";
import { CreateFeature1700544324752 } from "./migrations/1700544324752-create-feature.ts";
import { UpdateDatasetMetadata1700551597884 } from "./migrations/1700551597884-update-dataset-metadata.ts";
import { RenameMetadataToAttribute1700648789750 } from "./migrations/1700648789750-rename-metadata-to-attribute.ts";
import { UpdateMetadataConfigRelationship1701165537531 } from "./migrations/1701165537531-update-metadata-config-relationship.ts";
import { AddDatasetAttributeUniqueConstraint1701234230874 } from "./migrations/1701234230874-add-dataset-attribute-unique-constraint.ts";
import { DropDatasetNotebook1701393727124 } from "./migrations/1701393727124-drop-dataset-notebook.ts";
import { CreateNotebookTable1701394052067 } from "./migrations/1701394052067-create-notebook-table.ts";
import { AddIsSharedToNotebook1701441915734 } from "./migrations/1701441915734-add-is-shared-to-notebook.ts";
import { CreateDashboardTable1704260273863 } from "./migrations/1704260273863-create-dashboard-table.ts";
import { UpdateDashboard1705398488032 } from "./migrations/1705398488032-update-dashboard.ts";
import { UpdateDataset1706502348548 } from "./migrations/1706502348548-update-dataset.ts";
import { AddBasePathToDashboard1706769968727 } from "./migrations/1706769968727-add-base-path-to-dashboard.ts";
import { UpdateNotebookUserIdType1709882267428 } from "./migrations/1709882267428-update-notebook-user-id-type.ts";
import { UpdateDatasetAddTsvector1715738854019 } from "./migrations/1715738854019-update-dataset-add-tsvector.ts";
import { CreateConfigTable1718982722183 } from "./migrations/1718982722183-create-config-table.ts";
import { UpdateDatasetDashboardNameUnique1719500584671 } from "./migrations/1719500584671-update-dataset-dashboard-name-unique.ts";
import { UpdateDatasetAddFhirProjectId17211757718560 } from "./migrations/17211757718560-update-dataset-add-fhir-project-id.ts";
import { UpdateDatasetAddPlugin17211757718561 } from "./migrations/17211757718561-update-dataset-add-plugin.ts";
import { UpdateDatasetSplitDatamodelColumn17211757718562 } from "./migrations/17211757718562-update-dataset-split-datamodel-column.ts";
import { CreateUserArtifactTable1729863090719 } from "./migrations/1729863090719-create-user-artifact-table.ts";
import { CreateUserArtifactGroupTable1730946830529 } from "./migrations/1730946830529-create-user-artifact-group-table.ts";
import { CreateUserArtifactSequence1739779063184 } from "./migrations/1739779063184-create-user-artifact-sequence.ts";
import { SplitUserArtifact1749110029676 } from "./migrations/1749110029676-split-user-artifact.ts";
import { SplitUserArtifactIntoIndividualRows1753341753010 } from "./migrations/1753341753010-split-user-artifact-into-individual-rows.ts";
import { UpdateDatasetAddResultSchema17211757718563 } from "./migrations/17211757718563-update-dataset-add-result-schema.ts";
import { AddUniqueNameIndexToConceptSets1759126097000 } from "./migrations/1759126097000-add-unique-name-index-to-concept-sets.ts";
import { RemoveMaterializedCohortDefinitionsKey1759473576894 } from "./migrations/1759473576894-remove-materializedCohortDefinitions-key.ts";
import { createDatasetCodeTable1761883677510 } from "./migrations/1761883677510-create-dataset-code-table.ts";
import { UpdateDatasetTypeColumn17211757718564 } from "./migrations/17211757718564-update-dataset-type-column.ts";
import { AddDatasetFlowParametersColumn17211757718565 } from "./migrations/17211757718565-add-dataset-flow-parameters-column.ts";
import { UpdateDatasetDemoTypeColumn17211757718566 } from "./migrations/17211757718566-update-dataset-demo-type-column.ts";
import { AddNameToDatasetCode1769500730287 } from "./migrations/1769500730287-add-name-to-dataset-code.ts";
import { AddDatasetCodeQueryTable1769500853192 } from "./migrations/1769500853192-add-dataset-code-query-table.ts";
import { AddLanguageToDatasetCode1770345329000 } from "./migrations/1770345329000-add-language-to-dataset-code.ts";
import { AddDatasetCacheId1778417559068 } from "./migrations/1778417559068-add-dataset-cache-id.ts";
import { UpdateFhirDatasetIdColumn17763068271810 } from "./migrations/17763068271810-update-fhir-dataset-id-column.ts";
import { FixSourceDatasetCacheId1778417559069 } from "./migrations/1778417559069-fix-source-dataset-cache-id.ts";
import { FixCacheDatasetCacheId1778417559070 } from "./migrations/1778417559070-fix-cache-dataset-cache-id.ts";
import { env } from "../env.ts";

const migrationDataSourceOptions: DataSourceOptions = {
  type: "postgres",
  host: env.PG_HOST,
  port: env.PG_PORT,
  username: env.PG_MANAGE_USER,
  password: env.PG_MANAGE_PASSWORD,
  database: env.PG_DATABASE,
  schema: env.PG_SCHEMA,
  ssl: (() => {
    let ssl: any = JSON.parse(env.PG__SSL.toLowerCase());
    if (env.PG__CA_ROOT_CERT) {
      ssl = {
        rejectUnauthorized: true,
        ca: env.PG__CA_ROOT_CERT,
      };
    }
    return ssl;
  })(),
  poolSize: parseInt(env.PG__MAX_POOL) || 10,
  entities: [
    Config,
    DatasetAttributeConfig,
    DatasetAttribute,
    DatasetCode,
    DatasetDashboard,
    DatasetDetail,
    DatasetRelease,
    DatasetTagConfig,
    DatasetTag,
    Dataset,
    Feature,
    Notebook,
    UserArtifactGroup,
    UserArtifact,
  ],
  migrations: [
    createDatasetTables1676872851977,
    updateDataset1677809439828,
    updateDatasetDetail1677825145320,
    updateDataset1678343392349,
    updateDataset1678762314955,
    UpdateDataset1682576221273,
    CreateMetadata1685082669454,
    CreateTag1685342973667,
    CreateRelease1685342973670,
    UpdateDataset1691386594669,
    UpdateDataset1691644642674,
    CreateDatasetNotebook1698308495407,
    CreateMetadataConfigTables1700541858141,
    CreateFeature1700544324752,
    UpdateDatasetMetadata1700551597884,
    RenameMetadataToAttribute1700648789750,
    UpdateMetadataConfigRelationship1701165537531,
    AddDatasetAttributeUniqueConstraint1701234230874,
    DropDatasetNotebook1701393727124,
    CreateNotebookTable1701394052067,
    AddIsSharedToNotebook1701441915734,
    CreateDashboardTable1704260273863,
    UpdateDashboard1705398488032,
    UpdateDataset1706502348548,
    AddBasePathToDashboard1706769968727,
    UpdateNotebookUserIdType1709882267428,
    UpdateDatasetAddTsvector1715738854019,
    CreateConfigTable1718982722183,
    UpdateDatasetDashboardNameUnique1719500584671,
    CreateUserArtifactTable1729863090719,
    CreateUserArtifactGroupTable1730946830529,
    UpdateDatasetAddFhirProjectId17211757718560,
    UpdateDatasetAddPlugin17211757718561,
    UpdateDatasetSplitDatamodelColumn17211757718562,
    CreateUserArtifactSequence1739779063184,
    SplitUserArtifact1749110029676,
    SplitUserArtifactIntoIndividualRows1753341753010,
    UpdateDatasetAddResultSchema17211757718563,
    AddUniqueNameIndexToConceptSets1759126097000,
    RemoveMaterializedCohortDefinitionsKey1759473576894,
    createDatasetCodeTable1761883677510,
    UpdateDatasetTypeColumn17211757718564,
    AddDatasetFlowParametersColumn17211757718565,
    UpdateDatasetDemoTypeColumn17211757718566,
    AddNameToDatasetCode1769500730287,
    AddDatasetCodeQueryTable1769500853192,
    AddLanguageToDatasetCode1770345329000,
    AddDatasetCacheId1778417559068,
    UpdateFhirDatasetIdColumn17763068271810,
    FixSourceDatasetCacheId1778417559069,
    FixCacheDatasetCacheId1778417559070,
  ],
};
const migrationDataSource = new DataSource(migrationDataSourceOptions);
export default migrationDataSource;
