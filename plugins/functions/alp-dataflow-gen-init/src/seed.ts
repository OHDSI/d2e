import { env } from "./env";
import { BlockType, DBCredentials, PrefectVariable, PrefectSecret, transformDBCredentials } from "./types";
import { PrefectAPI } from "./PrefectAPI";
import { customDockerWorkpool, customProcessWorkpool } from "./customWorkpool";

export async function seed(): Promise<void> {
  let prefectApi = new PrefectAPI();

  // Prefect sits behind nginx, which is listening before Prefect is: an unready
  // Prefect answers 502 immediately, and the calls below treat that as fatal.
  await prefectApi.waitUntilReady();

  // create prefect variables
  const prefectVariables = env.VARIABLES;

  // Collect rather than abort, for the same reason as the secrets loop below.
  // A single 502 here (observed in CI: "[502] Failed to create/update Prefect
  // variable service_routes!") used to throw straight out of seed(), so the
  // secrets loop never ran and every flow then failed on a missing secret.
  const variableFailures: string[] = [];
  for (const varName in prefectVariables) {
    if (prefectVariables.hasOwnProperty(varName)) {
      const variable: PrefectVariable = {
        name: varName,
        value: prefectVariables[varName],
      };
      try {
        const variableName = await prefectApi.createPrefectVariable(variable);
      } catch (error: any) {
        variableFailures.push(
          `${varName} (${error.response?.status ?? error.code ?? error.message})`
        );
      }
    }
  }

  // create prefect secrets
  const prefectSecrets = env.SECRETS;

  // Create every secret, then report. Previously one failure aborted the loop,
  // so a single bad value silently left the remaining secrets uncreated and the
  // first flow to need one failed with "Unable to find block document named ...".
  // Collect instead: create what can be created, and fail loudly naming all of
  // the ones that could not.
  const secretFailures: string[] = [];
  for (const secretName in prefectSecrets) {
    if (prefectSecrets.hasOwnProperty(secretName)) {
      const secretOptions: PrefectSecret = {
        value: prefectSecrets[secretName],
      };
      try {
        const secretBlockId = await prefectApi.createBlockDocument(
          secretName,
          secretOptions,
          BlockType.SECRET
        );
      } catch (error: any) {
        secretFailures.push(
          `${secretName} (${error.response?.status ?? error.code ?? error.message})`
        );
      }
    }
  }
  // Report variables and secrets together: a partial seed is what makes flows
  // fail much later with an unhelpful "Unable to find block document" error, so
  // name everything that is missing in one place.
  if (variableFailures.length > 0 || secretFailures.length > 0) {
    const parts = [];
    if (variableFailures.length > 0) {
      parts.push(
        `${variableFailures.length} variable(s): ${variableFailures.join(", ")}`
      );
    }
    if (secretFailures.length > 0) {
      parts.push(
        `${secretFailures.length} secret(s): ${secretFailures.join(", ")}`
      );
    }
    throw new Error(`Prefect seeding incomplete — failed to create ${parts.join("; ")}`);
  }

  const dbm = Trex.databaseManager();
  const dbCredentials: DBCredentials[] = await dbm.getDatabaseCredentials();
  const transformedCredentials = transformDBCredentials(dbCredentials);

  const dbCredBlockName = "database-credentials";
  const dbCredentialsOptions: PrefectSecret = {
    value: transformedCredentials,
  };
  const dbCredBlockId = await prefectApi.createBlockDocument(
    dbCredBlockName,
    dbCredentialsOptions,
    BlockType.SECRET
  );

  // create flow results block
  const flowResultsBlockOptions = {
    basepath: prefectVariables.flows_results_s3_dir_path,
    settings: {
      key: prefectVariables.minio_access_key,
      secret: env.SECRETS["minio-secret-key"],
      client_kwargs: {
        endpoint_url: `http://${prefectVariables.minio_endpoint}:${prefectVariables.minio_port}`,
      },
    },
  };

  const flowResultBlockId = await prefectApi.createBlockDocument(
    prefectVariables.flows_results_sb_name,
    flowResultsBlockOptions,
    BlockType.RFS
  );

  // apply custom workpool template (selected by WORKPOOL_TYPE; "docker" is the
  // legacy/rollback path)
  const result = await prefectApi.updateWorkPool(
    env.WORKPOOL_NAME,
    env.WORKPOOL_TYPE === "process" ? customProcessWorkpool : customDockerWorkpool
  );
}
