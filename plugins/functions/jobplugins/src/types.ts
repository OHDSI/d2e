export interface IPrefectFlowRunDto {
  id: string;
  parameters: {
    options: {
      releaseId: string;
      cohortDefinitionId: string;
    };
  };
}

type IDataQualityArtifactScalar<T> = T | T[];

export interface IDataQualityResult {
  startTimestamp?: IDataQualityArtifactScalar<string>;
  endTimestamp?: IDataQualityArtifactScalar<string>;
  executionTime?: IDataQualityArtifactScalar<string>;
  executionTimeSeconds?: IDataQualityArtifactScalar<number>;
  Overview: {
    countOverallFailed: number;
    countFailedPlausibility: number;
    countFailedConformance: number;
    countFailedCompleteness: number;
  };
  Metadata: {
    cdmReleaseDate: string;
    dqdVersion?: string;
  }[];
  CheckResults: IDataQualityCheckResult[];
}

export interface IDataQualityCheckResult {
  numViolatedRows?: number;
  pctViolatedRows?: number;
  numDenominatorRows?: number;
  executionTime?: string;
  queryText: string;
  checkName: string;
  checkLevel: string;
  checkDescription: string;
  cdmTableName: string;
  cdmFieldName?: string;
  sqlFile: string;
  category: string;
  subcategory?: string;
  context: string;
  checkId: string;
  failed: number;
  passed: number;
  thresholdValue?: number;
  notesValue?: string;
  conceptId?: string;
  unitConceptId?: string;
  notApplicable?: number;
  isError?: number;
  error?: string;
}

export interface IDataCharacterizationResult {
  exportToAres: {
    cdmReleaseDate: string;
    "records-by-domain": { domain: string; countRecords: number }[];
  };
}

export interface IDomainContinuityResult {
  domain: string;
  records: {
    cdmReleaseDate: string;
    count: number;
  }[];
}

export interface IDqdResultDto {
  flowRunId?: string;
  flowRunIds?: string[];
}

export interface CohortSurvivalFlowRunDto {
  options: CohortSurvivalFlowRunOptions;
}

interface CohortSurvivalFlowRunOptions {
  databaseCode: string;
  cacheId?: string;
  schemaName: string;
  datasetId: string;
  targetCohortDefinitionId: number;
  outcomeCohortDefinitionId: number;
  analysisType?: string; // Optional, defaults to "single_event"
  competingOutcomeCohortDefinitionId?: number; // Optional, required for competing_risk analysis
  strataCohorts: {
    id: number;
    name: string;
  }[];
}

export interface CohortGeneratorFlowRunDto {
  options: CohortGeneratorFlowRunOptions;
}

interface CohortGeneratorFlowRunOptions {
  databaseCode: string;
  cacheId?: string;
  schemaName: string;
  resultsSchemaName: string;
  stringvocabSchemaName: string;
  cohortJson: CohortJson;
  datasetId: string;
  description: string;
  owner: string;
}

interface CohortJson {
  id: number;
  name: string;
  createdDate: number;
  modifiedDate: number;
  hasWriteAccess: boolean;
  tags: string[];
  expressionType: object;
}

export interface DBSvcFlowRunDto {
  dbSvcOperation: string;
  requestType: string;
  requestUrl: string;
  requestBody?: object; // Optional property
}

export interface DatasetAttributesFlowRunDto {
  versionInfo: object;
  datasetSchemaMapping: any[];
}

export enum FlowRunState {
  SCHEDULED = "Scheduled",
  LATE = "Late",
  RESUMING = "Resuming",
  AWAITING_RETRY = "AwaitingRetry",
  PENDING = "Pending",
  PAUSED = "Paused",
  RUNNING = "Running",
  RETRYING = "Retrying",
  COMPLETED = "Completed",
  CANCELLED = "Cancelled",
  CANCELLING = "Cancelling",
  CRASHED = "Crashed",
  FAILED = "Failed",
  TIMED_OUT = "TimedOut",
}
export interface ICreateDqdFlowRunDto {
  datasetId: string;
  comment?: string;
  vocabSchemaName?: string;
}
export interface DataModel {
  flowName: string;
  datamodel: string;
  flowId: string;
}
export interface PluginFlow {
  name: string;
  tags: string[];
  type: string;
  volumes?: string[];
  datamodels: string[];
  entrypoint: string;
  parameter_openapi_schema: object;
}

export interface ICreateDatamodelFlowRunDto {
  flowRunName: string;
  options: ICreateDatamodelFlowRunOptions;
}

export interface ICreateDatamartFlowRunDto {
  flowRunName: string;
  options: object;
}

export interface IGetVersionInfoFlowRunDto {
  flowRunName: string;
  options: IGetVersionInfoFlowRunOptions;
}

export interface IFlowRunQueryDto {
  startDate?: Date;
  endDate?: Date;
  states?: FlowRunState[];
  tags?: string[];
  flowIds?: string[];
  deploymentIds?: string[];
  deploymentNames?: string[];
  workPools?: string[];
}

export interface DataCharacterizationOptions {
  comment: string;
  datasetId: string;
  releaseId: string;
  schemaName: string;
  releaseDate: string;
  databaseCode: string;
  cacheId?: string;
  resultsSchema: string;
  vocabSchemaName: string;
  cdmVersionNumber: string;
  useSourceConnection?: boolean;
}

export interface DataCharacterizationFlowRunDto {
  datasetId: string;
  comment?: string;
  releaseId?: string;
  excludeAnalysisIds?: string;
  // Whether DC should build the achilles_result_concept_count table.
  // Enabled by default; the concept record-count endpoint depends on it.
  executeConceptRecordCount?: boolean;
}

export interface SearchEmbeddingFlowRunDto {
  database_code: string;
  cache_id?: string;
  schema_name: string;
}

export interface KeyValue {
  key: string;
  value: string;
}

export interface DatabaseVariable {
  name: string;
  code: string;
}

export interface SchemaVariable {
  name: string;
  schema: string;
}

export interface IReactFlow {
  nodes: IReactFlowNode[];
  edges: IReactFlowEdge[];
  variables: KeyValue[];
  importLibs: string[];
  databases: DatabaseVariable[];
  schemas: SchemaVariable[];
}

export interface IReactFlowNode {
  id: string;
  type: string;
  data: IFlowBasicNodeData | IFlowCsvNodeData;
  position: {
    x: number;
    y: number;
  };
  sourcePosition: string;
  targetPosition: string;
  dragHandle: string;
  width: number;
  height: number;
  parentNode?: string;
}

interface IReactFlowEdge {
  id: string;
  source: string;
  target: string;
}

interface IFlowBasicNodeData {
  name: string;
  description: string;
  executorOptions?: IPrefectExecutorOptions;
}

interface IPrefectExecutorOptions {
  executor_type: string;
  executor_address: IPrefectExecutorAddress;
}

interface IPrefectExecutorAddress {
  host: string;
  port: string;
  ssl: boolean;
}

export interface IDataflowDto {
  id?: string;
  name: string;
  dataflow: IDataflowRevisionDto;
}

export interface IDataflowRevisionDto extends IReactFlow {
  comment?: string;
}
export interface IDataflowDuplicateDto {
  name: string;
}

export interface IDataflowDuplicateDto {
  name: string;
}

export interface IFlowCsvNodeData extends IFlowBasicNodeData {
  file: string;
  delimiter: string;
  hasheader: boolean;
  columns: string[];
  encoding?: string;
}

export interface IPrefectEdge {
  source?: string;
  target: string;
}

export interface IPrefectParameters {
  variables?: KeyValue[];
  import_libs?: string[];
  databases?: DatabaseVariable[];
  schemas?: SchemaVariable[];
  json_graph: {
    edges: IPrefectEdge;
    nodes: object;
  };
  options?: IPrefectOptions;
}

interface IPrefectOptions {
  trace_config: IPrefectTraceConfig;
  test_mode: boolean;
}

interface IPrefectTraceConfig {
  trace_mode: boolean;
  trace_db: string;
}

interface ICreateDatamodelFlowRunOptions {
  options: {
    flow_action_type: string;
    database_code: string;
    data_model: string;
    schema_name: string;
    results_schema: string;
    vocab_schema: string;
    plugin: string;
  };
}

interface IGetVersionInfoFlowRunOptions {
  options: {
    flow_action_type: string;
    database_code: string;
    data_model: string;
    schema_name: string;
    vocab_schema: string;
    plugin: string;
  };
}

export interface ICreateCachedbFileFlowRunDto {
  flowActionType: string;
  databaseCode: string;
  cacheId?: string;
  schemaName: string;
  snapshotSchemaName?: string;
  resultsSchemaName?: string;
  snapshotCopyConfig?: object;
  vocabSchemaName: string;
}

export interface ICreateWhiteRabbitFlowRunDto {
  options: ICreateWhiteRabbitFlowRunOptions;
}

interface ICreateWhiteRabbitFlowRunOptions {
  data?: object;
  run_type: string;
}

export interface PhenotypeFlowRunDto {
  options: PhenotypeFlowRunOptions;
}

interface PhenotypeFlowRunOptions {
  materialize: boolean;
  cohorts_id: string;
  dataset_id: string;
  user_name: string | null;
}

export interface IPrefectArtifact {
  id: string;
  created: string;
  updated: string;
  key: string;
  type: string;
  description: string;
  data: string;
  metadata_: string;
  flow_run_id: string;
  task_run_id: string;
}

export interface NodeData {
  result: string;
  error: boolean;
  errorMessage: string | null;
  nodeName: string;
}

export type CanvasResult =
  | {
      canvasId: string;
      revisionId: string;
      name: string;
    }
  | {
      canvasId: string;
      error: string;
    };

export interface FileOperationResponse {
  status: "success";
  filePath: string;
  bucket: string;
}

export interface TemplateDto {
  id: string;
  name: string;
  description: string;
  nodes: IReactFlowNode[];
  edges: IReactFlowEdge[];
}

export interface TemplateFhirDto {
  id: string;
  name: string;
  description: string;
  structureMap: string;
}
