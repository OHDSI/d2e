import { AnalyticsSvcAPI } from "../api/AnalyticsAPI.ts";
import { PortalServerAPI } from "../api/PortalServerAPI.ts";
import { PrefectAPI } from "../api/PrefectAPI.ts";
import {
  FLOW_RUN_STATE_TYPES,
  PrefectDeploymentName,
  PrefectFlowName,
  PrefectTagNames,
} from "../const.ts";
import {
  DataCharacterizationFlowRunDto,
  DataCharacterizationOptions,
} from "../types.ts";
import { parseCdmVersionForOhdsi } from "../utils/OhdsiParser.ts";
import {
  DC_DIRECT_DIALECTS_USE_TREX_VARIABLE,
  isTruthyVariable,
  resolveDcTarget,
} from "./dcTarget.ts";

export class DataCharacterizationService {
  private flowRunNamePrefix: string = "DC";

  public async getDataCharacterizationResults(
    flowRunId: string,
    sourceKey: string,
    token: string
  ) {
    const analyticsSvcApi = new AnalyticsSvcAPI(token);
    const prefectApi = new PrefectAPI(token);
    const dcFlowRun = await prefectApi.getFlowRun(flowRunId);
    const dcFlowRunOptions: DataCharacterizationOptions =
      dcFlowRun.parameters.options;
    const {
      resultsSchema,
      databaseCode,
      cacheId,
      vocabSchemaName,
      datasetId,
      useSourceConnection,
    } = dcFlowRunOptions;

    return await analyticsSvcApi.getDataCharacterizationResults(
      cacheId ?? databaseCode,
      databaseCode,
      resultsSchema,
      sourceKey,
      vocabSchemaName,
      datasetId,
      useSourceConnection ?? false
    );
  }

  public async getDataCharacterizationResultsDrilldown(
    flowRunId: string,
    sourceKey: string,
    conceptId: string,
    token: string
  ) {
    const analyticsSvcApi = new AnalyticsSvcAPI(token);
    const prefectApi = new PrefectAPI(token);
    const dcFlowRun = await prefectApi.getFlowRun(flowRunId);
    const dcFlowRunOptions: DataCharacterizationOptions =
      dcFlowRun.parameters.options;
    const {
      resultsSchema,
      databaseCode,
      cacheId,
      vocabSchemaName,
      datasetId,
      useSourceConnection,
    } = dcFlowRunOptions;

    return await analyticsSvcApi.getDataCharacterizationResultsDrilldown(
      cacheId ?? databaseCode,
      databaseCode,
      resultsSchema,
      sourceKey,
      conceptId,
      vocabSchemaName,
      datasetId,
      useSourceConnection ?? false
    );
  }

  public async getLatestDataCharacterizationFlowRun(
    datasetId: string,
    token: string
  ) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const { schemaName, databaseCode } = await portalServerApi.getDataset(
      datasetId
    );

    const flowRuns = await prefectApi.getFlowRunsByDataset(
      databaseCode,
      schemaName,
      PrefectTagNames.DATA_CHARACTERIZATION,
      this.flowRunNamePrefix
    );

    if (flowRuns.length === 0) {
      return null;
    }

    return flowRuns[0];
  }

  public async getReleaseFlowRun(
    datasetId: string,
    releaseId: number,
    token: string
  ) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const { schemaName, databaseCode } = await portalServerApi.getDataset(
      datasetId
    );
    const flowRuns = await prefectApi.getFlowRunsByDataset(
      databaseCode,
      schemaName,
      PrefectTagNames.DATA_CHARACTERIZATION,
      this.flowRunNamePrefix
    );
    return flowRuns.find(
      (run) => run.parameters.options.releaseId === releaseId.toString()
    );
  }

  public async createDataCharacterizationFlowRun(
    dataCharacterizationFlowRunDto: DataCharacterizationFlowRunDto,
    token: string
  ) {
    const analyticsSvcApi = new AnalyticsSvcAPI(token);
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const datasetId = dataCharacterizationFlowRunDto.datasetId;
    const comment = dataCharacterizationFlowRunDto.comment;
    const overrideResultsSchema = dataCharacterizationFlowRunDto.resultsSchema;
    const releaseId = dataCharacterizationFlowRunDto.releaseId;
    const excludeAnalysisIds =
      dataCharacterizationFlowRunDto.excludeAnalysisIds ?? "";

    const dataset = await portalServerApi.getDataset(datasetId);
    const { dialect, databaseCode, schemaName, vocabSchemaName } = dataset;
    const cacheId = dataset.cacheId ?? databaseCode;

    const directDialectsUseTrex = isTruthyVariable(
      await prefectApi.getVariableValue(DC_DIRECT_DIALECTS_USE_TREX_VARIABLE),
    );
    const dcTarget = resolveDcTarget(
      dataset,
      overrideResultsSchema,
      dataCharacterizationFlowRunDto.useSourceConnection,
      directDialectsUseTrex,
    );

    let resultsSchema: string;
    if (dcTarget.resultsSchema !== null) {
      // webapi dataset: fixed schema, verbatim (must match the WebAPI
      // Results daimon tableQualifier), overwritten on every run.
      resultsSchema = dcTarget.resultsSchema;
    } else {
      resultsSchema = overrideResultsSchema || `${schemaName}_DC_${Date.now()}`;

      if (dialect === "hana") {
        resultsSchema = resultsSchema.toUpperCase();
      } else if (dialect === "postgres") {
        resultsSchema = resultsSchema.toLowerCase();

        if (resultsSchema.length > 63) {
          throw new Error(
            `Results schema name cannot exceed 63 characters for PostgreSQL dialect. Current length: ${resultsSchema.length}`
          );
        }
      }
    }

    const releaseDate = (await this.getReleaseDate(releaseId, token)).split(
      "T"
    )[0];

    const cdmVersionNumber = await analyticsSvcApi.getCdmVersion(datasetId);
    // Handle case where CDM version is not found for the dataset, as CDM version is required to run DC flow
    if (!cdmVersionNumber) {
      throw new Error(`CDM version not found for dataset ${datasetId}`);
    }

    const name = `${this.flowRunNamePrefix}_${databaseCode}.${schemaName}`;
    const parameters = {
      options: {
        schemaName,
        databaseCode,
        cacheId,
        datasetId,
        cdmVersionNumber: parseCdmVersionForOhdsi(cdmVersionNumber),
        vocabSchemaName,
        comment,
        resultsSchema,
        excludeAnalysisIds,
        releaseId,
        releaseDate,
        // Build the concept record-count table by default; the conceptRecordCount
        // endpoint reads it. Omitting it left the flow param null, which the flow
        // treated as "skip" while the read side still expected the table -> 500.
        executeConceptRecordCount:
          dataCharacterizationFlowRunDto.executeConceptRecordCount ?? true,
        useSourceConnection: dcTarget.useSourceConnection,
      },
    };

    const flowRunId = await prefectApi.createFlowRun(
      name,
      PrefectDeploymentName.DATA_CHARACTERIZATION,
      PrefectFlowName.DATA_CHARACTERIZATION,
      parameters
    );

    await prefectApi.createInputAuthToken(flowRunId);

    Promise.any([
      new Promise(() => {
        setTimeout(async () => {
          const msg = "Prefect input authtoken deletion";
          try {
            (await prefectApi.deleteInputAuthToken(flowRunId))
              ? console.log(`${msg} successful`)
              : console.log(`${msg} failed`);
          } catch (error) {
            console.log(`${msg} failed`);
            console.error(error);
          }
        }, 1000 * 60 * 5);
      }),
    ]);

    return { flowRunId };
  }

  public async getSchemaMappingList(token: string) {
    const prefectApi = new PrefectAPI(token);
    const dcFlowRuns = await prefectApi.getFlowRunsByDeploymentNames([
      PrefectDeploymentName.DATA_CHARACTERIZATION,
    ]);

    // Filter out the completed flow runs
    const completedDcFlowRuns = dcFlowRuns.filter(
      (flowRun) => flowRun.state_type === FLOW_RUN_STATE_TYPES.COMPLETED
    );

    // Get unique flow runs by schemaName using reduce
    const uniqueDcFlowRunsBySchemaName = completedDcFlowRuns.reduce(
      (acc, current) => {
        const existing = acc.find(
          (flowRun) =>
            flowRun.parameters.options.schemaName ===
            current.parameters.options.schemaName
        );
        if (!existing) {
          acc.push(current);
        }
        return acc;
      },
      [] as typeof completedDcFlowRuns
    );

    // Map over unique flow runs to extract schema mapping
    const schemaMapping = uniqueDcFlowRunsBySchemaName.map((dcFlowRun) => {
      const dcFlowRunOptions: DataCharacterizationOptions =
        dcFlowRun.parameters.options;
      return { [dcFlowRunOptions.schemaName]: dcFlowRunOptions.resultsSchema };
    });

    return schemaMapping;
  }

  private async getReleaseDate(
    releaseId: string | undefined,
    token: string
  ): Promise<string> {
    const portalServerApi = new PortalServerAPI(token);
    if (releaseId) {
      const datasetRelease = await portalServerApi.getDatasetReleaseById(
        releaseId
      );
      return datasetRelease.releaseDate;
    }
    return new Date().toISOString();
  }
}
