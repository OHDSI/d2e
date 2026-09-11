import { DatasetAPI } from "../api/DatasetAPI.ts";
import { DbCredentialsAPI } from "../api/DbCredentialsAPI.ts";
import { JobPluginsAPI } from "../api/JobPluginsAPI.ts";
import { PortalAPI } from "../api/PortalAPI.ts";
import { UserMgmtAPI } from "../api/UserMgmtAPI.ts";
import { env } from "../env.ts";
import {
  IDataset,
  IDbCreateDto,
  IDbCredentialDto,
  IDemoInput,
  IProgress,
} from "../type.d.ts";

const algo: RsaOaepParams = { name: "RSA-OAEP" };

export class DemoService {
  private readonly logger = console; //createLogger(this.constructor.name)
  private credentialsPublicKeys: { [type: string]: string } = {};

  public async addDatabase(token: string, input: IDemoInput) {
    this.logger.info("Adding database");

    const dbCredentialsAPI = new DbCredentialsAPI(token);
    const dbList = await dbCredentialsAPI.getDbList();

    const exist = dbList.find((db) => db.code === env.DEMO_DB_CODE);
    if (exist) {
      this.logger.info(`Database exist: ${JSON.stringify(exist)}`);
      return exist;
    }

    const credentials: IDbCredentialDto[] = [];
    if (env.DEMO_DB_USER && env.DEMO_DB_PASSWORD) {
      try {
        this.credentialsPublicKeys = JSON.parse(input.encryptionKeys);
        this.logger.debug(
          `Loaded credentials public keys: ${JSON.stringify(
            this.credentialsPublicKeys
          )}`
        );
      } catch (err) {
        this.logger.error(
          `Error while loading credentials public keys: ${JSON.stringify(err)}`
        );
        throw new Error("Error while configuring for credential encryption");
      }

      const salt = this.createSalt();
      const encryptedPassword = await this.encrypt(env.DEMO_DB_PASSWORD, salt);

      credentials.push(
        {
          username: env.DEMO_DB_USER,
          password: encryptedPassword,
          serviceScope: "Internal",
          salt,
          userScope: "Admin",
        },
        {
          username: env.DEMO_DB_USER,
          password: encryptedPassword,
          serviceScope: "Internal",
          salt,
          userScope: "Read",
        }
      );
    }

    const db: IDbCreateDto = {
      ...env.DEMO_DB_DEFAULT,
      code: env.DEMO_DB_CODE,
      vocabSchemas: [env.DEMO_DB_CDM_SCHEMA],
      credentials: credentials,
    };
    const result = await dbCredentialsAPI.createDb(db);
    this.logger.info(`Database added: ${JSON.stringify(result)}`);

    return result;
  }

  public async addDataset(token: string) {
    this.logger.info("Adding dataset");

    const portalAPI = new PortalAPI(token);
    const datasetAPI = new DatasetAPI(token);

    const dataset = {
      ...env.DEMO_DATASET,
      databaseCode: env.DEMO_DB_CODE,
      cdmSchemaValue: env.DEMO_DB_CDM_SCHEMA,
      vocabSchemaValue: env.DEMO_DB_CDM_SCHEMA,
      resultsSchemaValue: env.DEMO_DB_RESULT_SCHEMA,
    };

    // Right after the demo database is registered, TrexSQL needs time to attach
    // the source database and expose its schemas. Until that completes, the
    // dataset service's schema-existence precheck rejects creation without
    // inserting a row, so we retry create-and-confirm until the dataset is
    // actually visible in the portal.
    const maxAttempts = 30;
    const retryDelayMs = 10000;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const existingDataset = this.findDemoDataset(
        await this.getDatasetsSafe(portalAPI)
      );
      if (existingDataset?.id) {
        this.logger.info(
          `Dataset confirmed in portal: ${JSON.stringify(existingDataset)}`
        );
        return existingDataset;
      }

      const result = await datasetAPI.createDataset(dataset);
      this.logger.info(`Dataset added: ${JSON.stringify(result)}`);

      // Look the dataset back up so we always carry the server-assigned id
      // forward, regardless of which fields the gateway echoes in its response.
      const refreshed = await this.getDatasetsSafe(portalAPI);
      const createdDataset =
        (result?.id && refreshed.find((d) => d.id === result.id)) ||
        this.findDemoDataset(refreshed);

      if (createdDataset?.id) {
        this.logger.info(
          `Dataset confirmed in portal: ${JSON.stringify(createdDataset)}`
        );
        return createdDataset;
      }

      this.logger.info(
        `Dataset not visible yet (attempt ${attempt}/${maxAttempts}); ` +
          `source schema may still be attaching. Retrying in ${retryDelayMs}ms.`
      );
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }

    throw new Error(
      `Dataset could not be created and confirmed in portal after ${maxAttempts} attempts`
    );
  }

  private findDemoDataset(datasets: IDataset[]) {
    return datasets.find(
      (dataset) =>
        dataset.databaseCode === env.DEMO_DB_CODE &&
        dataset.schemaName === env.DEMO_DB_CDM_SCHEMA &&
        dataset.vocabSchemaName === env.DEMO_DB_CDM_SCHEMA &&
        dataset.sourceStudyId == null &&
        dataset.visibilityStatus !== "HIDDEN"
    );
  }

  private async getDatasetsSafe(
    portalAPI: PortalAPI,
    attempts = 5,
    delayMs = 3000
  ): Promise<IDataset[]> {
    for (let i = 1; i <= attempts; i++) {
      try {
        const datasets = await portalAPI.getDatasets();
        if (Array.isArray(datasets)) {
          return datasets;
        }
      } catch (error) {
        this.logger.info(
          `getDatasets attempt ${i}/${attempts} failed: ${error.message}`
        );
      }
      if (i < attempts) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return [];
  }

  // Poll cache status until bao reports COMPLETED. The dataset POST returns as
  // soon as the row is inserted, so DQD/DC would otherwise race against the
  // still-building TrexSQL cache and fail with cache-not-ready errors.
  /**
   * Wait until the cache file stops growing.
   *
   * For dialects that build the cache without a job row, readiness is reported
   * as soon as the file exists and is attached - which happens long before the
   * copy has finished. Setup then hands a half-populated cache to whatever runs
   * next: patient counts answer from the tables that made it, while anything
   * touching a table still being copied fails with a catalog error naming it.
   * The file's own modification time is the only progress signal available
   * here, so wait for it to hold still.
   */
  private async waitForCacheToSettle(
    portalAPI: PortalAPI,
    datasetId: string,
    quietMs = 30_000,
    timeoutMs = 600_000,
  ): Promise<void> {
    const pollMs = 5_000;
    const deadline = Date.now() + timeoutMs;
    let lastSeen: number | null = null;
    let unchangedSince = Date.now();

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, pollMs));
      let modified: number | null = null;
      try {
        modified = (await portalAPI.getCacheStatus(datasetId)).lastModified ?? null;
      } catch (e) {
        // A failed poll says nothing about the copy; keep waiting.
        this.logger.warn(
          `Cache settle poll failed for ${datasetId}: ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }

      if (modified !== lastSeen) {
        lastSeen = modified;
        unchangedSince = Date.now();
        continue;
      }
      if (Date.now() - unchangedSince >= quietMs) {
        this.logger.info(
          `Cache for dataset ${datasetId} settled (unchanged for ${Math.round(quietMs / 1000)}s)`,
        );
        return;
      }
    }
    this.logger.warn(
      `Cache for dataset ${datasetId} was still changing after ${Math.round(timeoutMs / 1000)}s; continuing anyway`,
    );
  }

  public async waitForCache(token: string, _input: any, progress?: IProgress) {
    this.logger.info("Waiting for cache");

    const dataset = progress?.steps?.find(
      (step) => step.code === "dataset"
    )?.result;
    if (!dataset?.id) {
      throw new Error("Dataset not found in progress; cannot wait for cache");
    }

    const portalAPI = new PortalAPI(token);

    // Ask for the cache before waiting on it: when nothing has started the job,
    // polling alone sits at activeJobStatus:null until the timeout below expires.
    // Registering the dataset can start one on its own, though, and asking again
    // while that one is copying is refused with "session busy" - the build that
    // is running still finishes, but the request that lost the race is the one
    // that would have attached the result. An existing cache file is the signal
    // that something already started, since a build that reports no job row
    // creates the file before it copies into it.
    let triggered = true;
    let asked = false;
    const startingStatus = await portalAPI.getCacheStatus(dataset.id).catch(() => undefined);
    if (startingStatus?.cacheExists) {
      this.logger.info(
        `A cache already exists for ${dataset.id}; waiting for it rather than asking for another.`,
      );
    } else {
      asked = true;
      try {
        await portalAPI.refreshCache(dataset.id);
      } catch (e) {
        triggered = false;
        this.logger.error(
          `Could not start the cache job for ${dataset.id}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }

    // A failed trigger gets a short grace period, not the full budget. Something
    // else may already have started the job, so it is worth a brief look — but
    // waiting fifteen minutes for a job nobody started turns a clear failure
    // into a silent stall, and with retries above it that is three quarters of
    // an hour before anyone sees the real error.
    const pollTimeoutMs = triggered ? 15 * 60 * 1000 : 60 * 1000;
    const pollIntervalMs = 5000;
    const deadline = Date.now() + pollTimeoutMs;
    const graceDeadline = Date.now() + 60 * 1000;
    let lastStatus;
    while (Date.now() < deadline) {
      // A poll that comes back empty is a transient condition, not a fatal one:
      // the endpoint answers 200 with no body while the dataset is still being
      // registered. Reading `.ready` straight off it turned that into
      // "Cannot read properties of undefined", which reported a cache problem
      // when the truth was simply that nothing had answered yet.
      lastStatus = await portalAPI.getCacheStatus(dataset.id).catch((e) => {
        this.logger.warn(
          `Cache status poll failed for ${dataset.id}: ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
        return undefined;
      });
      if (!lastStatus) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
        continue;
      }
      if (lastStatus.ready) {
        this.logger.info(
          `Cache reports ready for dataset ${dataset.id}: ${JSON.stringify(lastStatus)}`
        );
        await this.waitForCacheToSettle(portalAPI, dataset.id);
        return lastStatus;
      }
      if (
        lastStatus.activeJobStatus &&
        ["FAILED", "STOPPED", "ABANDONED"].includes(lastStatus.activeJobStatus)
      ) {
        throw new Error(
          `Cache build for dataset ${dataset.id} ${lastStatus.activeJobStatus}: ${lastStatus.lastJobError ?? "no error message"}`
        );
      }
      this.logger.info(
        `Cache not ready yet for dataset ${dataset.id}: ${JSON.stringify(lastStatus)}`
      );
      // The cache file that made this skip the trigger belonged to a build that
      // is evidently not running: nothing has reported a job and the cache has
      // not come ready. Ask once, late enough that a build already in flight has
      // finished rather than being interrupted by the request.
      if (!asked && !lastStatus.activeJobStatus && Date.now() > graceDeadline) {
        asked = true;
        this.logger.info(`Nothing is building the cache for ${dataset.id}; asking for one.`);
        await portalAPI.refreshCache(dataset.id).catch((e) => {
          this.logger.error(
            `Could not start the cache job for ${dataset.id}: ${
              e instanceof Error ? e.message : String(e)
            }`,
          );
        });
      }
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new Error(
      `Cache build for dataset ${dataset.id} did not become ready within ${pollTimeoutMs}ms (last=${JSON.stringify(lastStatus)})`
    );
  }

  public async runDQD(token: string, _input: IDemoInput, progress?: IProgress) {
    this.logger.info("Running DQD");

    const jobPluginsAPI = new JobPluginsAPI(token);
    const dataset = progress?.steps?.find(
      (step) => step.code === "dataset"
    )?.result;

    if (!dataset) {
      throw new Error("Dataset not found");
    }

    const { id: datasetId, vocabSchemaName } = dataset;
    const dqdFlowRun = await jobPluginsAPI.createDqdFlowRun({
      datasetId,
      releaseId: "",
      vocabSchemaName,
      comment: "Demo setup",
    });

    // Normalize result to always be { flowRunId: string }
    let result: { flowRunId: string };
    if (dqdFlowRun?.flowRunId) {
      result = { flowRunId: dqdFlowRun.flowRunId };
    } else if (dqdFlowRun?.data?.flowRunId) {
      result = { flowRunId: dqdFlowRun.data.flowRunId };
    } else {
      throw new Error(
        `No flowRunId found in response: ${JSON.stringify(dqdFlowRun)}`
      );
    }

    this.logger.info(`DQD flow-run created: ${JSON.stringify(result)}`);

    const flowRunId = result.flowRunId;

    const dqdResults = await jobPluginsAPI.getDqdFlowRunOverviewResults({
      flowRunId,
      datasetId,
    });

    // Assert correctedPassPercentage is at least 94 (CDM 5.4 baseline; was 95 with prior Achilles)
    const correctedPassPercentage =
      dqdResults?.total?.total?.correctedPassPercentage;
    const pct = parseInt(
      String(correctedPassPercentage ?? "").replace("%", ""),
      10
    );
    if (Number.isNaN(pct) || pct < 94) {
      throw new Error(
        `DQD results assertion failed: correctedPassPercentage is ${correctedPassPercentage}, expected >= 94`
      );
    }

    this.logger.info(`DQD flow-run results: ${JSON.stringify(dqdResults)}`);
    return dqdResults ? dqdResults : dqdResults.data;
  }

  public async runDC(token: string, _input: any, progress?: IProgress) {
    this.logger.info("Running DC");

    const jobPluginsAPI = new JobPluginsAPI(token);
    const dataset = progress?.steps?.find(
      (step) => step.code === "dataset"
    )?.result;

    if (!dataset) {
      throw new Error("Dataset not found");
    }

    const { id: datasetId } = dataset;
    const result = await jobPluginsAPI.createDcFlowRun({
      datasetId,
      releaseId: "",
      comment: "Demo setup",
    });

    this.logger.info(`DC flow-run created: ${JSON.stringify(result.data)}`);
    return result.flowRunId ? result : result.data;
  }

  public async createCache(
    token: string,
    _input: IDemoInput,
    progress?: IProgress
  ) {
    this.logger.info("Creating cache");

    const jobPluginsAPI = new JobPluginsAPI(token);
    const dataset = progress?.steps?.find(
      (step) => step.code === "dataset"
    )?.result;

    if (!dataset) {
      throw new Error("Dataset not found");
    }

    const { id: datasetId, cacheId: cacheDatasetId } = dataset;
    const result = await jobPluginsAPI.createCacheFlowRun({
      datasetId,
      cacheDatasetId,
    });

    this.logger.info(`Cache flow-run created: ${JSON.stringify(result.data)}`);
    const flowRunId = result.flowRunId ? result : result.data;

    const cacheStatusResponse = await jobPluginsAPI.getCacheFlowRunStatus(
      flowRunId
    );
    this.logger.info(
      `Cache flow-run status: ${JSON.stringify(cacheStatusResponse)}`
    );

    return cacheStatusResponse.flowRunId
      ? cacheStatusResponse
      : cacheStatusResponse.data;
  }

  public async updateDatasetMetadata(
    token: string,
    _input: any,
    progress?: IProgress
  ) {
    this.logger.info("Updating metadata");

    const jobPluginsAPI = new JobPluginsAPI(token);
    const dataset = progress?.steps?.find(
      (step) => step.code === "dataset"
    )?.result;

    if (!dataset) {
      throw new Error("Dataset not found");
    }
    const portalAPI = new PortalAPI(token);
    const { id: datasetId } = dataset;

    const cacheDataset = await portalAPI.getDataset(datasetId);

    if (!cacheDataset) {
      throw new Error("Cache dataset not found");
    }

    if (!dataset?.plugin) {
      throw new Error("Dataset has empty plugin");
    }

    if (!cacheDataset?.plugin) {
      throw new Error("Cache dataset has empty plugin");
    }

    const result = await jobPluginsAPI.createGetVersionInfoFlowRun({
      flowRunName: `cache-get_version_info`,
      options: {
        options: {
          flowActionType: "get_version_info",
          token: "",
          database_code: "",
          data_model: "",
          plugin: "create_cachedb_file_plugin",
          datasets: [cacheDataset],
        },
      },
    });

    this.logger.info(
      `Dataset metadata updated: ${JSON.stringify(result.data)}`
    );
    return result.flowRunId ? result : result.data;
  }

  public async runPhenotype(
    token: string,
    _input: IDemoInput,
    progress?: IProgress
  ) {
    this.logger.info("Running Phenotype");

    const jobPluginsAPI = new JobPluginsAPI(token);
    const userMgmtAPI = new UserMgmtAPI(token);
    const user = await userMgmtAPI.getMe();
    const roles = await userMgmtAPI.getMyRoles();
    const accessibleDatasetIds = new Set(
      roles.datasetRoles
        .filter((r) => r.role === "STUDY_RESEARCHER")
        .map((r) => r.datasetId),
    );
    // For standalone phenotype flow, get the first dataset the user has access to
    const datasetId = Array.from(accessibleDatasetIds)[0];
    if (!datasetId) {
      throw new Error("No accessible datasets available for the current user");
    }

    const result = await jobPluginsAPI.createPhenotypeFlowRun({
      options: {
        materialize: false,
        cohorts_id: "default",
        dataset_id: datasetId,
        user_name: user.username,
      },
    });

    this.logger.info(
      `Phenotype flow-run created: ${JSON.stringify(result.data || result)}`
    );
    return result.flowRunId ? result : result.data;
  }

  public async addResearcherRoleToDataset(
    token: string,
    _input: any,
    progress?: IProgress
  ) {
    this.logger.info("Adding researcher role to demo dataset");
    const dataset = progress?.steps?.find(
      (step) => step.code === "dataset"
    )?.result;
    const { id: datasetId } = dataset;

    if (!dataset) {
      this.logger.error("Dataset not found in progress");
      throw new Error("Dataset not found");
    }

    const userMgmtAPI = new UserMgmtAPI(token);
    const result = await userMgmtAPI.registerStudyRoles({
      userIds: [await this.initialUserId(userMgmtAPI)],
      tenantId: "e0348e4d-2e17-43f2-a3c6-efd752d17c23",
      studyId: datasetId,
      roles: ["RESEARCHER"],
    });
    this.logger.info(
      `Researcher role added to admin: ${JSON.stringify(result)}`
    );
    return result;
  }

  // The account is looked up rather than named by a fixed id. That id used to be
  // both the usermgmt primary key and the identity provider's subject, which
  // only held while a single provider minted both; granting to a stale one
  // succeeds against usermgmt and then propagates to nobody.
  private async initialUserId(userMgmtAPI: UserMgmtAPI): Promise<string> {
    const name = env.IDP__INITIAL_USER__NAME;
    if (!name) {
      throw new Error("IDP__INITIAL_USER__NAME is not set, so the demo grants have no subject");
    }
    const email = name.includes("@") ? name : `${name}@${env.IDP__INITIAL_USER__DOMAIN}`;
    const users = await userMgmtAPI.getUsers();
    const match = users.find((user) => user.username === email) ??
      users.find((user) => user.username === name);
    if (!match) {
      throw new Error(`No user named ${email} to grant the demo dataset to`);
    }
    if (!match.idpUserId) {
      // Without a subject the grant lands on a row no token maps to, which is
      // the silent failure this lookup exists to avoid.
      throw new Error(`${email} has no identity-provider subject recorded, so roles cannot be granted`);
    }
    return match.id;
  }

  private async encrypt(data: string, salt: string) {
    const pub = this.credentialsPublicKeys["Internal"];
    if (!pub) {
      const errorMessage = `No public key defined for credential encryption`;
      console.error(errorMessage);
      throw new Error(errorMessage);
    }

    try {
      const publicKey = await crypto.subtle.importKey(
        "spki",
        this.convertPEMtoBinary(pub),
        { ...algo, hash: "SHA-256" },
        true,
        ["encrypt"]
      );

      const dataText = this.setupData(data, salt);
      const enc = new TextEncoder();
      const encoded = enc.encode(dataText);
      const buffer = await window.crypto.subtle.encrypt(
        algo,
        publicKey,
        encoded
      );
      return this.convertBufferToBase64(buffer);
    } catch (error) {
      const errorMsg = "Error while encrypting data";
      console.error(errorMsg, error);
      throw new Error(errorMsg);
    }
  }

  private createSalt(): string {
    const randomBytes = new Uint8Array(16);
    crypto.getRandomValues(randomBytes);
    return btoa(String.fromCharCode(...randomBytes));
  }

  private setupData(data: string | object, salt: string) {
    if (typeof data === "object") {
      return JSON.stringify(data);
    }
    return this.addSalt(data, salt);
  }

  private addSalt(value: string, salt: string) {
    const max = value.length;
    const min = 0;
    const index = Math.floor(Math.random() * (max - min + 1) + min);
    return value.slice(0, index) + salt + value.slice(index);
  }

  private convertBufferToBase64(buffer: ArrayBuffer) {
    let binary = "";
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private convertPEMtoBinary(pem: string): ArrayBuffer {
    const pemContents = pem
      .replace("-----BEGIN PUBLIC KEY-----", "")
      .replace("-----END PUBLIC KEY-----", "")
      .replace(/\n/g, "");

    return this.base64ToArrayBuffer(pemContents);
  }

  private base64ToArrayBuffer(b64: string) {
    const byteString = atob(b64);
    const byteArray = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      byteArray[i] = byteString.charCodeAt(i);
    }
    return byteArray;
  }
}
