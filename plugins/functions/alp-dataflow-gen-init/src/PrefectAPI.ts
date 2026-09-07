import axios from "../../_shared/_axios.ts";
import { env } from "./env";
import { BlockType } from "./types";
import { PrefectVariable } from "./types";

export class PrefectAPI {
  private readonly baseURL: string;

  constructor() {
    if (env.VARIABLES.service_routes.prefect) {
      this.baseURL = env.VARIABLES.service_routes.prefect;
    } else {
      throw new Error("No url is set for Prefect");
    }
  }

  private createOptions() {
    return {
      headers: { "Content-Type": "application/json" },
    };
  }

  /**
   * Block until Prefect answers, or throw.
   *
   * nginx terminates TLS in front of Prefect and starts before it, so an
   * unready Prefect returns 502/503 straight away rather than refusing the
   * connection. Every seeding call below treats that as fatal, so without this
   * wait a slow Prefect start leaves all variables and secrets uncreated and
   * flows fail much later with "Unable to find block document named ...".
   */
  public async waitUntilReady(
    timeoutMs = 300_000,
    intervalMs = 3_000,
  ): Promise<void> {
    const url = `${this.baseURL}/health`;
    const deadline = Date.now() + timeoutMs;
    let lastReason = "no attempt made";

    while (Date.now() < deadline) {
      try {
        await axios.get(url, this.createOptions());
        return;
      } catch (error: any) {
        lastReason = error.response?.status
          ? `HTTP ${error.response.status}`
          : (error.code ?? error.message ?? "unknown error");
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(
      `Prefect at ${url} not ready after ${Math.round(timeoutMs / 1000)}s ` +
        `(last: ${lastReason}); refusing to seed partially`,
    );
  }

  public async createPrefectVariable(
    variableObj: PrefectVariable
  ): Promise<string> {
    let url = `${this.baseURL}/variables/`;
    const successMsg = `Successfully created/updated Prefect variable '${variableObj.name}'!`;
    const variableOptions = {
      name: variableObj.name,
      value: variableObj.value,
    };
    const options = this.createOptions();
    try {
      const result = await axios.post(url, variableOptions, options);
      console.log(successMsg);
      return result.data.name;
    } catch (error) {
      // Handle 409 (Conflict) or 500 with UniqueViolation (database constraint error)
      const status = error.response?.status;
      const isUniqueViolation = status === 409 ||
        (status === 500 && error.response?.data?.detail?.includes?.('UniqueViolation'));

      if (isUniqueViolation) {
        // update variable which already exists
        url = `${this.baseURL}/variables/name/${encodeURIComponent(
          variableObj.name
        )}`;
        const result = await axios.patch(url, variableOptions, options);
        console.log(successMsg);
        return variableObj.name;
      } else {
        console.error(
          `[${status}] Failed to create/update Prefect variable ${variableObj.name}!`,
          error.response?.data
        );
        throw error;
      }
    }
  }

  public async createBlockDocument(
    blockName: string,
    blockOptions: any,
    blockType: BlockType
  ): Promise<string> {
    const slugName = blockType;
    let url = `${this.baseURL}/block_documents/`;
    const successMsg = `Successfully created/updated Prefect ${blockType} block '${blockName}'!`;
    const blockTypeId = await this.getBlockTypeID(slugName);
    const blockSchemaId = await this.getBlockSchemaId(blockTypeId);

    let blockDocOptions = {
      name: blockName,
      data: blockOptions,
      block_schema_id: blockSchemaId,
      block_type_id: blockTypeId,
    };

    const options = await this.createOptions();

    try {
      const result = await axios.post(url, blockDocOptions, options);
      console.log(successMsg);
      return result.data.id;
    } catch (error) {
      // Handle 409 (Conflict) or 500 with UniqueViolation (database constraint error)
      const status = error.response?.status;
      const isUniqueViolation = status === 409 ||
        (status === 500 && error.response?.data?.detail?.includes?.('UniqueViolation'));

      if (isUniqueViolation) {
        // update block which already exists
        url = `${this.baseURL}/block_types/slug/${encodeURIComponent(
          slugName
        )}/block_documents/name/${encodeURIComponent(blockName)}`;
        const existingBlock = await axios.get(url, options);
        const existingBlockId = existingBlock.data.id;

        // Update block
        url = `${this.baseURL}/block_documents/${encodeURIComponent(
          existingBlockId
        )}`;
        const newBlockDocOptions = {
          block_schema_id: blockSchemaId,
          data: blockOptions,
          merge_existing_data: false,
        };
        const updatedBlockResult = await axios.patch(
          url,
          newBlockDocOptions,
          options
        );
        console.log(successMsg);
        return existingBlockId;
      } else {
        console.error(
          `[${status}] Failed to create/update Prefect ${blockType} block '${blockName}'!`,
          error.response?.data
        );
        throw error;
      }
    }
  }

  private async getBlockSchemaId(blockTypeId: string): Promise<string> {
    const url = `${this.baseURL}/block_schemas/filter`;
    const blockSchemaOptions = {
      block_schemas: {
        block_type_id: {
          any_: [blockTypeId],
        },
      },
    };
    const options = this.createOptions();
    try {
      const blockSchema = await axios.post(url, blockSchemaOptions, options);
      return blockSchema.data[0].id;
    } catch (error) {
      console.error(
        `[${error.response.status}] Error getting Prefect block schema ID for block type ID ${blockTypeId}!`,
        error.response.data
      );
      throw error;
    }
  }

  private async getBlockTypeID(blockType: string): Promise<string> {
    try {
      const url = `${this.baseURL}/block_types/slug/${encodeURIComponent(
        blockType
      )}`;
      const options = await this.createOptions();
      const result = await axios.get(url, options);
      return result.data.id;
    } catch (error) {
      console.error(
        `[${error.response.status}] Error getting Prefect block type ID for block type ${blockType}!`,
        error.response.data
      );
      throw error;
    }
  }

  public async updateWorkPool(
    workPoolName: string,
    workPoolTemplate: any
  ): Promise<string> {
    try {
      const url = `${this.baseURL}/work_pools/${encodeURIComponent(
        workPoolName
      )}`;
      const options = await this.createOptions();
      const workPoolOptions = {
        is_paused: false,
        base_job_template: workPoolTemplate,
      };
      const result = await axios.patch(url, workPoolOptions, options);
      console.log(`Successfully updated Prefect workpool '${workPoolName}'!`);
      return result.data.id;
    } catch (error) {
      console.error(
        `[${error.response.status}] Failed to update Prefect workpool '${workPoolName}'!`,
        error.response.data
      );
      throw error;
    }
  }
}
