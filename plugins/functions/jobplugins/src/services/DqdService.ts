import { AnalyticsSvcAPI } from "../api/AnalyticsAPI.ts";
import { PortalServerAPI } from "../api/PortalServerAPI.ts";
import { PrefectAPI } from "../api/PrefectAPI.ts";
import {
  DATA_QUALITY_DOMAINS,
  FLOW_RUN_STATE_TYPES,
  PrefectDeploymentName,
  PrefectFlowName,
  PrefectTagNames,
} from "../const.ts";
import {
  IDataCharacterizationResult,
  IDataQualityResult,
  IDomainContinuityResult,
} from "../types.ts";
import { DataQualityOverviewParser } from "../utils/DataQualityOverviewParser.ts";
import { parseCdmVersionForOhdsi } from "../utils/OhdsiParser.ts";
import {
  DC_DIRECT_DIALECTS_USE_TREX_VARIABLE,
  isTruthyVariable,
} from "./dcTarget.ts";

export class DqdService {
  private dataQualityOverviewParser = new DataQualityOverviewParser();

  private flowRunNamePrefix: string = "DQD";

  public async getDataQualityResult(flowRunId: string, token: string) {
    const prefectApi = new PrefectAPI(token);

    const completedFlowRun = await prefectApi.pollFlowRunCompletion(flowRunId);

    const artifacts = await prefectApi.getFlowRunsArtifactsByFlowRunId(
      completedFlowRun.flowRunId
    );

    if (artifacts.length === 0) {
      return null;
    }

    const artifactData = JSON.parse(artifacts[0].data);
    return artifactData.CheckResults;
  }

  public async getDataQualityOverview(flowRunId: string, token: string) {
    const prefectApi = new PrefectAPI(token);

    const completedFlowRun = await prefectApi.pollFlowRunCompletion(flowRunId);

    const artifacts = await prefectApi.getFlowRunsArtifactsByFlowRunId(
      completedFlowRun.flowRunId
    );
    if (artifacts.length === 0) {
      return null;
    }

    const artifactData = JSON.parse(artifacts[0].data);
    const checkResults = artifactData.CheckResults;
    const derivedResults = this.dataQualityOverviewParser.parse(checkResults);

    return derivedResults;
  }

  public async getLatestFlowRunWithoutCohort(datasetId: string, token: string) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const { schemaName, databaseCode } = await portalServerApi.getDataset(
      datasetId
    );
    const flowRuns = await prefectApi.getFlowRunsByDataset(
      databaseCode,
      schemaName,
      PrefectTagNames.DQD,
      this.flowRunNamePrefix
    );

    return flowRuns.find(
      (flowRun) => !flowRun.parameters.options.cohortDefinitionId
    );
  }

  public async getLatestFlowRunWithCohort(
    datasetId: string,
    cohortDefinitionId: string,
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
      PrefectTagNames.DQD,
      this.flowRunNamePrefix
    );

    const cohortflowRuns = flowRuns.filter((flowRun) => {
      return (
        flowRun.parameters.options.cohortDefinitionId === cohortDefinitionId
      );
    });

    if (cohortflowRuns.length === 0) {
      return null;
    }

    return cohortflowRuns[0];
  }

  public async getFlowRunByReleaseId(
    datasetId: string,
    releaseId: string,
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
      PrefectTagNames.DQD,
      this.flowRunNamePrefix
    );

    return flowRuns.find(
      (run) => run.parameters.options.releaseId === releaseId.toString()
    );
  }

  public async createDataQualityFlowRun(
    dataQualityFlowRunDto: any,
    token: string
  ) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const analyticsSvcApi = new AnalyticsSvcAPI(token);

    const {
      datasetId,
      comment,
      vocabSchemaName,
      releaseId,
      cohortDefinitionId,
      useSourceConnection,
    } = dataQualityFlowRunDto;

    const dataset = await portalServerApi.getDataset(datasetId);
    const {
      databaseCode,
      schemaName,
      vocabSchemaName: vocabSchema,
      resultsSchemaName: resultsSchema,
    } = dataset;
    const cacheId = dataset.cacheId ?? databaseCode;
    // Same rule as data characterization: HANA cannot be reached through the
    // trex pgwire passthrough, so it runs on the source unless the caller says
    // otherwise or the Prefect switch sends it back through trex.
    const directDialectsUseTrex = isTruthyVariable(
      await prefectApi.getVariableValue(DC_DIRECT_DIALECTS_USE_TREX_VARIABLE),
    );
    const resolvedUseSourceConnection = useSourceConnection ??
      (dataset.dialect?.toLowerCase() === "hana" && !directDialectsUseTrex);
    const releaseDate = (
      await this.getReleaseDate(releaseId, portalServerApi)
    ).split("T")[0];

    const cdmVersionNumber = await analyticsSvcApi.getCdmVersion(datasetId);
    // Handle case where CDM version is not found for the dataset, as CDM version is required to run DQD flow
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
        vocabSchemaName: vocabSchema || vocabSchemaName,
        resultsSchemaName: resultsSchema || schemaName,
        comment,
        cohortDefinitionId,
        releaseId,
        releaseDate,
        useSourceConnection: resolvedUseSourceConnection,
      },
    };

    const flowRunId = await prefectApi.createFlowRun(
      name,
      PrefectDeploymentName.DQD,
      PrefectFlowName.DQD,
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

  public async getDataQualityHistoryByCategory(
    datasetId: string,
    token: string
  ) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const dataQualityResults = await this.getDatasetDataQualityResults(
      datasetId,
      portalServerApi,
      prefectApi
    );

    return dataQualityResults
      .map((dataQualityResult) => {
        return {
          cdmReleaseDate: dataQualityResult.Metadata[0].cdmReleaseDate,
          failed: {
            completeness: dataQualityResult.Overview.countFailedCompleteness[0],
            conformness: dataQualityResult.Overview.countFailedConformance[0],
            plausibility: dataQualityResult.Overview.countFailedPlausibility[0],
          },
        };
      })
      .sort(
        (a, b) =>
          this.getDateTime(a.cdmReleaseDate) -
          this.getDateTime(b.cdmReleaseDate)
      );
  }

  public async getDataQualityHistory(datasetId: string, token: string) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const dataQualityResults = await this.getDatasetDataQualityResults(
      datasetId,
      portalServerApi,
      prefectApi
    );

    return dataQualityResults
      .map((dataQualityResult) => {
        return {
          cdmReleaseDate: dataQualityResult.Metadata[0].cdmReleaseDate,
          failed: dataQualityResult.Overview.countOverallFailed[0],
        };
      })
      .sort(
        (a, b) =>
          this.getDateTime(a.cdmReleaseDate) -
          this.getDateTime(b.cdmReleaseDate)
      );
  }
  public async getDataQualityHistoryByDomain(datasetId: string, token: string) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const dataQualityResults = await this.getDatasetDataQualityResults(
      datasetId,
      portalServerApi,
      prefectApi
    );

    return dataQualityResults
      .map((dataQualityResult) => {
        const domainFailures = dataQualityResult.CheckResults.reduce(
          (acc, cr) => {
            if (DATA_QUALITY_DOMAINS.includes(cr.cdmTableName)) {
              acc[cr.cdmTableName] = cr.failed;
            } else {
              console.warn(
                `Data quality check results missing CDM table name: ${JSON.stringify(
                  cr
                )}`
              );
            }
            return acc;
          },
          {}
        );

        return {
          cdmReleaseDate: dataQualityResult.Metadata[0].cdmReleaseDate,
          failed: { ...domainFailures },
        };
      })
      .sort(
        (a, b) =>
          this.getDateTime(a.cdmReleaseDate) -
          this.getDateTime(b.cdmReleaseDate)
      );
  }

  public async getDatasetDomainContinuity(datasetId: string, token: string) {
    const prefectApi = new PrefectAPI(token);
    const portalServerApi = new PortalServerAPI(token);
    const { schemaName, databaseCode } = await portalServerApi.getDataset(
      datasetId
    );
    const flowRuns = (
      await prefectApi.getFlowRunsByDataset(
        databaseCode,
        schemaName,
        PrefectTagNames.DQD,
        this.flowRunNamePrefix
      )
    ).filter(
      // filter for completed flowRuns
      (flowRun) => flowRun.state_type === FLOW_RUN_STATE_TYPES.COMPLETED
    );

    const flowRunIds = flowRuns.map((run) => run.id);
    if (!flowRunIds.length) {
      return [];
    }
    const dqdResults = await this.getDqdResults(prefectApi, flowRunIds);
    const domainIndexes: { [key: string]: number } = {};

    return dqdResults
      .filter((r) => {
        return this.isDataCharacterizationResult(r.result);
      })
      .reduce((acc, r) => {
        const result = r.result as IDataCharacterizationResult;
        const continuityResults = this.transformToDomainContinuity(result);
        if (acc.length > 0) {
          continuityResults.forEach((r) => {
            const domainIndex = domainIndexes[r.domain];
            acc[domainIndex].records.push(...r.records);
          });
        } else {
          continuityResults.forEach(
            (r, index) => (domainIndexes[r.domain] = index)
          );
          acc = continuityResults;
        }
        return acc;
      }, []);
  }

  private async getDatasetDataQualityResults(
    datasetId: string,
    portalServerApi: PortalServerAPI,
    prefectApi: PrefectAPI
  ) {
    const { schemaName, databaseCode } = await portalServerApi.getDataset(
      datasetId
    );
    const flowRuns = (
      await prefectApi.getFlowRunsByDataset(
        databaseCode,
        schemaName,
        PrefectTagNames.DQD,
        this.flowRunNamePrefix
      )
    ).filter(
      // filter for completed flowRuns
      (flowRun) => flowRun.state_type === FLOW_RUN_STATE_TYPES.COMPLETED
    );
    const flowRunIds = flowRuns.map((run) => run.id);
    const dqdResults = await this.getDqdResults(prefectApi, flowRunIds);

    return dqdResults!
      .filter((r) => {
        return this.isDataQualityResult(r);
      })
      .map((r) => r as IDataQualityResult);
  }

  private async getDqdResults(prefectApi: PrefectAPI, flowRunIds: string[]) {
    let dqdResults;
    try {
      dqdResults = await prefectApi.getFlowRunsArtifacts(flowRunIds);
      return dqdResults;
    } catch (error) {
      throw error;
    }
  }

  // Type Gurad helper functions
  private isDataQualityResult = (
    result: Record<string, any>
  ): result is IDataQualityResult => {
    if (result) {
      const keys = ["Metadata", "Overview", "CheckResults"] as const;
      for (const key of keys) {
        if (
          !Object.prototype.hasOwnProperty.call(result, key) ||
          result[key] === undefined
        ) {
          return false;
        }
      }
      return true;
    }
    return false;
  };

  private async getReleaseDate(
    releaseId: string,
    portalServerApi: PortalServerAPI
  ): Promise<string> {
    if (releaseId) {
      const datasetRelease = await portalServerApi.getDatasetReleaseById(
        releaseId
      );
      return datasetRelease.releaseDate;
    }
    return new Date().toISOString();
  }

  private getDateTime(dateValue: string) {
    return dateValue ? new Date(dateValue).getTime() : 0;
  }

  private transformToDomainContinuity(result: IDataCharacterizationResult) {
    const aresResult = result.exportToAres;
    const domainsRecords = aresResult["records-by-domain"];
    const domainIndexes: { [key: string]: number } = {};
    return domainsRecords.reduce<IDomainContinuityResult[]>((acc, record) => {
      const domain = record.domain;
      const cdmReleaseDate = aresResult.cdmReleaseDate;
      const newCount = {
        cdmReleaseDate: `${cdmReleaseDate.substring(
          0,
          4
        )}-${cdmReleaseDate.substring(4, 6)}-${cdmReleaseDate.substring(6)}`,
        count: record.countRecords,
      };
      if (domainIndexes.hasOwnProperty(domain)) {
        const domainRecord = acc[domainIndexes[domain]];
        domainRecord.records.push(newCount);
      } else {
        domainIndexes[domain] = acc.length;
        acc.push({
          domain,
          records: [newCount],
        });
      }
      return acc;
    }, []);
  }

  private isDataCharacterizationResult = (
    result: Record<string, any>
  ): result is IDataCharacterizationResult => {
    if (result) {
      if (!Object.prototype.hasOwnProperty.call(result, "exportToAres")) {
        return false;
      }

      const aresResult = result["exportToAres"];
      const keys = ["cdmReleaseDate", "records-by-domain"] as const;

      for (const key of keys) {
        if (
          !Object.prototype.hasOwnProperty.call(aresResult, key) ||
          aresResult[key] === undefined
        ) {
          return false;
        }
      }
      return true;
    }
    return false;
  };
}
