import dayjs from "dayjs";
import { decode } from "jsonwebtoken";
import { services } from "../env.ts";
import { FLOW_RUN_STATE_TYPES } from "../const.ts";
import { IFlowRunQueryDto, IPrefectFlowRunDto } from "../types.ts";

interface FlowRunParams {
  name: string;
  message: string;
  deploymentName: string;
  flowName: string;
  parameters: object;
  schedule?: string | null;
}
export class PrefectAPI {
  private readonly baseURL: string;
  private readonly token: string;
  private static readonly FLOW_RUN_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  constructor(token: string) {
    this.token = token;
    if (!token) {
      throw new Error("No token passed for Prefect API!");
    }
    if (services.prefect) {
      this.baseURL = services.prefect;
    } else {
      throw new Error("No url is set for Prefect API");
    }
  }

  async getFlowRun(flowRunId: string) {
    const errorMessage = "Error while getting prefect flow run by id";
    try {
      const url = `${this.baseURL}/flow_runs/filter`;
      const data = {
        flow_runs: {
          id: {
            any_: [flowRunId],
          },
        },
      };

      const options = this.createOptions("POST", data);
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`${errorMessage}: ${response.statusText}`);
      }

      const result = await response.json();
      return result[0];
    } catch (error) {
      console.error(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }

  async getFlowRunById(flowId: string) {
    const options = {
      method: "GET",
      headers: {
        Authorization: this.token,
        "Content-Type": "application/json",
      },
    };
    const url = `${this.baseURL}/flow_runs/${flowId}`;
    const result = await fetch(url, options);
    const jsonResponse = await result.json();
    return jsonResponse;
  }

  /**
   * The value of a Prefect variable, or undefined when it is not set.
   *
   * Used for operational switches that have to be changeable without a
   * redeploy. A missing variable is not an error -- callers fall back to their
   * own default.
   */
  async getVariableValue(name: string): Promise<string | undefined> {
    try {
      const options = {
        method: "GET",
        headers: {
          Authorization: this.token,
          "Content-Type": "application/json",
        },
      };
      const result = await fetch(
        `${this.baseURL}/variables/name/${encodeURIComponent(name)}`,
        options,
      );
      if (!result.ok) {
        // 404 simply means the switch was never set.
        return undefined;
      }
      const jsonResponse = await result.json();
      const value = jsonResponse?.value;
      return value === undefined || value === null ? undefined : String(value);
    } catch (error) {
      // An unreachable variables endpoint must not stop a flow run from being
      // created; the caller's default applies.
      console.error(`Error while reading prefect variable ${name}: ${error}`);
      return undefined;
    }
  }

  async getDeployment(deploymentName: string, flowName: string) {
    const errorMessage = "Error while getting prefect deployment";
    try {
      const options = this.createOptions("GET");
      const url = `${this.baseURL}/deployments/name/${encodeURIComponent(
        flowName,
      )}/${encodeURIComponent(deploymentName)}`;
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`${errorMessage}: ${response.statusText}`);
      }
      const result = await response.json();
      return {
        deploymentId: result.id,
        infrastructureDocId: result.infrastructure_document_id,
      };
    } catch (error) {
      console.error(
        `Error occurred while getting prefect deployment: ${error}`,
      );
      throw error;
    }
  }

  async getFlowRunsByDataset(
    databaseCode: string,
    dataset: string,
    tags: string[] = [],
    prefix: string,
  ) {
    const errorMessage = "Error while getting flow runs by dataset";
    try {
      const url = `${this.baseURL}/flow_runs/filter`;

      const data = {
        sort: "START_TIME_DESC",
        flow_runs: {
          operator: "and_",
          name: { any_: [`${prefix}_${databaseCode}.${dataset}`] },
          tags: { operator: "and_", all_: tags },
          state: { type: { not_any_: ["CANCELLED", "CANCELLING"] } },
        },
      };

      const options = this.createOptions("POST", data);
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`${errorMessage}: ${response.statusText}`);
      }

      const result = await response.json();
      return result;
    } catch (error) {
      console.error(`${errorMessage}: ${error}`);
      throw error;
    }
  }

  async getFlowRunsArtifacts(ids: string[]) {
    const errorMessage = `Error while getting prefect artifacts by flow run ids: ${ids}`;
    try {
      const data: Record<string, string | object> = {
        artifacts: {
          flow_run_id: {
            any_: ids,
          },
        },
      };
      const url = `${this.baseURL}/artifacts/filter`;
      const options = this.createOptions("POST", data);
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`Failed to fetch artifacts: ${response.statusText}`);
      }

      const result = await response.json();
      const filteredResult = result.filter(
        (item: { task_run_id: string | null }) => item.task_run_id !== null,
      ); // Keep only task runs with non-null taskRunId

      return filteredResult;
    } catch (error) {
      console.error(`${errorMessage}: ${error}`);
      throw error;
    }
  }

  async createFlowRun(
    name: string,
    deploymentName: string,
    flowName: string,
    parameters: object,
    schedule = null,
  ) {
    console.log(`Executing flow run ${name}...`);
    const message = `Flow run '${name}' has started from trex function`;
    return await this.executeFlowRun({
      name,
      message,
      deploymentName,
      flowName,
      parameters,
      schedule,
    });
  }

  private async executeFlowRun({
    name,
    message,
    deploymentName,
    flowName,
    parameters,
    schedule = null,
  }: FlowRunParams) {
    const errorMessage = "Error while executing flow run";
    const { deploymentId, infrastructureDocId } = await this.getDeployment(
      deploymentName,
      flowName,
    );
    const data = {
      state: {
        type: "SCHEDULED",
        message,
        ...(schedule ? { state_details: { scheduled_time: schedule } } : {}),
      },
      name,
      parameters,
      infrastructure_document_id: infrastructureDocId,
      empirical_policy: {
        retries: 0,
        retry_delay: 0,
        resuming: false,
      },
    };
    const options = this.createOptions("POST", data);
    const url = `${this.baseURL}/deployments/${deploymentId}/create_flow_run`;

    if (schedule && !dayjs(schedule).isValid()) {
      throw new Error(`Invalid schedule time`);
    }
    if (schedule && dayjs(schedule).isBefore(dayjs())) {
      throw new Error("Schedule time must be in the future");
    }
    const response = await fetch(url, options);
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`${errorMessage}: ${response.statusText} - ${body}`);
    }

    const result = await response.json();
    return result.id;
  }

  async getFlowRunsByDeploymentNames(
    deploymentNames: string[],
    extraFilter?: IFlowRunQueryDto,
  ) {
    const errorMessage =
      "Error while getting prefect flow runs by deployment names";
    try {
      const method = "POST";
      const url = `${this.baseURL}/flow_runs/filter`;

      const data: Record<string, string | object> = {
        sort: "START_TIME_DESC",
        ...this.getFilters({ ...extraFilter, deploymentNames }),
      };

      const options = this.createOptions(method, data);

      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`${errorMessage}: ${response.statusText}`);
      }

      const result = await response.json();

      return result;
    } catch (error) {
      console.error(`${errorMessage}: ${error}`);
      throw error;
    }
  }

  private getFilters(filter?: IFlowRunQueryDto) {
    if (filter == null) {
      return {};
    }

    const flowRuns: Record<string, string | object> = {};

    if (filter.startDate || filter.endDate) {
      flowRuns["expected_start_time"] = {
        after_: filter.startDate,
        before_: filter.endDate,
      };
    }

    if (filter.states) {
      flowRuns["state"] = {
        name: {
          any_: filter.states,
        },
      };
    }

    if (filter.tags) {
      flowRuns["tags"] = {
        all_: filter.tags,
      };
    }

    const flows: Record<string, string | object> = {};

    if (filter.flowIds) {
      flows["id"] = {
        any_: filter.flowIds,
      };
    }

    const deployments: Record<string, string | object> = {};

    if (filter.deploymentIds) {
      deployments["id"] = {
        any_: filter.deploymentIds,
      };
    }

    if (filter.deploymentNames) {
      deployments["name"] = {
        any_: filter.deploymentNames,
      };
    }

    const workPools: Record<string, string | object> = {};

    if (filter.workPools) {
      workPools["name"] = {
        any_: filter.workPools,
      };
    }

    return {
      flows,
      flow_runs: flowRuns,
      deployments,
      work_pools: workPools,
    };
  }

  private createOptions(method: string, data?: object): RequestInit {
    const headers: Record<string, string> = {
      Authorization: this.token,
    };

    // Only add Content-Type for requests that have a body (not for GET)
    if (method !== "GET" && data) {
      headers["Content-Type"] = "application/json";
    }

    return {
      method,
      headers,
      // Only include body for non-GET requests
      body: method !== "GET" && data ? JSON.stringify(data) : undefined,
    };
  }

  private sanitizeFlowRunId(flowrunId: string): string {
    const normalizedFlowrunId = flowrunId.trim().toLowerCase();
    if (!PrefectAPI.FLOW_RUN_ID_PATTERN.test(normalizedFlowrunId)) {
      throw new Error("Invalid flow run id format");
    }
    return normalizedFlowrunId;
  }

  async createInputAuthToken(flowrunId: string) {
    const retries = 3;
    const key = "authtoken"; // keyword "authtoken" must match the object name in Python flow
    const safeFlowrunId = this.sanitizeFlowRunId(flowrunId);

    const thirdPartyToken: string | undefined = decode(
      this.token.replace(/bearer /i, ""),
    )["thirdPartyToken"];
    const thirdPartyRefreshToken: string | undefined = decode(
      this.token.replace(/bearer /i, ""),
    )["thirdPartyRefreshToken"];

    const options = this.createOptions("POST", {
      key: key,
      value: JSON.stringify({
        token: this.token,
        thirdpartytoken: thirdPartyToken || "",
        thirdpartyrefreshtoken: thirdPartyRefreshToken || "",
      }), // 'value' must be a string always. Convert the json object to a string
    });
    const errorMessage =
      "Error occurred while passing user token to the flow run";
    const url = `${this.baseURL}/flow_runs/${encodeURIComponent(safeFlowrunId)}/input`;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return await response.json();
      } catch (error) {
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // wait 500ms before retrying
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(`${errorMessage}: ${message}`);
        }
      }
    }
  }

  async deleteInputAuthToken(flowrunId: string) {
    const retries = 3;
    const errorMessage =
      'Error occurred while deleting "authtoken" flowrun input';
    const key = "authtoken"; // keyword "authtoken" must match the object name in Python flow
    const safeFlowrunId = this.sanitizeFlowRunId(flowrunId);
    const options = this.createOptions("DELETE");
    const url = `${this.baseURL}/flow_runs/${encodeURIComponent(
      safeFlowrunId,
    )}/input/${key}`;

    for (let i = 0; i < retries; i++) {
      try {
        const response = await fetch(url, options);
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.status == 204;
      } catch (error) {
        if (i < retries - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000)); // wait 500ms before retrying
        } else {
          const message =
            error instanceof Error ? error.message : String(error);
          throw new Error(`${errorMessage}: ${message}`);
        }
      }
    }
  }

  async cancelFlowRun(id: string) {
    const errorMessage = `Error while cancelling flow run with id: ${id}`;
    try {
      const url = `${this.baseURL}/flow_runs/${encodeURIComponent(
        id,
      )}/set_state`;
      const data = { state: { type: "CANCELLED" } };
      const options = this.createOptions("POST", data);
      const r = await fetch(url, options);
      if (!r.ok) {
        throw new Error(`${r.statusText}`);
      }
      console.log(`cancelled prefect flowrun: ${id}`);
      return await r.json();
    } catch (error) {
      console.info(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }

  async getFlowRunState(id: string) {
    const errorMessage = "Error while getting prefect flow run states by id";
    try {
      const url = `${this.baseURL}/flow_runs/${encodeURIComponent(id)}`;
      const options = this.createOptions("GET");
      const r = await fetch(url, options);
      if (!r.ok) {
        throw new Error(`${r.statusText}`);
      }
      console.log(`fetched state of flowrun: ${id}`);
      return await r.json();
    } catch (error) {
      console.info(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }

  async getFlowRunsByParentFlowRunId(parentFlowRunId: string) {
    const errorMessage = `Error while getting prefect flow run by parent flow run id: ${parentFlowRunId}`;
    try {
      const url = `${this.baseURL}/flow_runs/filter`;
      const data: Record<string, string | object> = {
        flow_runs: {
          parent_flow_run_id: {
            any_: [parentFlowRunId],
          },
        },
      };
      const options = await this.createOptions("POST", data);
      const r = await fetch(url, options);
      if (!r.ok) {
        throw new Error(r.statusText);
      }
      return await r.json();
    } catch (error) {
      console.info(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }

  async pollFlowRunCompletion(flowRunId: string) {
    // Poll every 1 min up to 10 mins
    const POLL_INTERVAL_MS = 60000;
    const MAX_ATTEMPTS = 10;
    let attempts = 0;

    let flowRun = await this.getFlowRun(flowRunId);

    // If the flowRun is an array, get the first object
    if (Array.isArray(flowRun)) {
      flowRun = flowRun[0];
    }

    const pollingStates = [
      FLOW_RUN_STATE_TYPES.SCHEDULED,
      FLOW_RUN_STATE_TYPES.LATE,
      FLOW_RUN_STATE_TYPES.PENDING,
      FLOW_RUN_STATE_TYPES.RUNNING,
      FLOW_RUN_STATE_TYPES.RETRYING,
      FLOW_RUN_STATE_TYPES.AWAITING_RETRY,
    ];

    const failureStates = [
      FLOW_RUN_STATE_TYPES.FAILED,
      FLOW_RUN_STATE_TYPES.CRASHED,
      FLOW_RUN_STATE_TYPES.CANCELLING,
      FLOW_RUN_STATE_TYPES.CANCELLED,
      FLOW_RUN_STATE_TYPES.PAUSED,
      FLOW_RUN_STATE_TYPES.SUSPENDED,
      FLOW_RUN_STATE_TYPES.TIMED_OUT,
    ];

    while (
      pollingStates.includes(flowRun.state_type) &&
      attempts < MAX_ATTEMPTS
    ) {
      // Early exit if flowRun enters a failure state
      if (failureStates.includes(flowRun.state_type)) {
        throw new Error(
          `Flow run failed or was cancelled. Final state: ${flowRun.state_type}`,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      flowRun = await this.getFlowRun(flowRunId);
      if (Array.isArray(flowRun)) {
        flowRun = flowRun[0];
      }
      attempts++;
    }

    if (flowRun.state_type === FLOW_RUN_STATE_TYPES.COMPLETED) {
      return { flowRunId: flowRun.id };
    }
    throw new Error(
      `Flow run did not complete within the polling window. Final state: ${flowRun.state_type}`,
    );
  }

  async getFlowRunsArtifactsByFlowRunId(flowRunId: string) {
    const errorMessage = `Error while getting prefect flow run artifacts flow run id: ${flowRunId}`;
    try {
      const url = `${this.baseURL}/artifacts/filter`;
      const data: Record<string, string | object> = {
        flow_runs: {
          id: {
            any_: [flowRunId],
          },
        },
      };
      const options = await this.createOptions("POST", data);
      const res = await fetch(url, options);
      if (!res.ok) {
        throw new Error(res.statusText);
      }
      return await res.json();
    } catch (error) {
      console.info(`${errorMessage}: ${error}`);
      throw new Error(errorMessage);
    }
  }
}
