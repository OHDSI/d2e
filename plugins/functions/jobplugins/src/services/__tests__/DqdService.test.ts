import { afterEach, describe, it } from "jsr:@std/testing@1.0.3/bdd";
import { assertEquals } from "jsr:@std/assert@1.0.6";

Deno.env.set(
  "SERVICE_ROUTES",
  JSON.stringify({ prefect: "http://prefect.test" }),
);

const { PrefectAPI } = await import("../../api/PrefectAPI.ts");
const { DqdService } = await import("../DqdService.ts");

const originalPollFlowRunCompletion =
  PrefectAPI.prototype.pollFlowRunCompletion;
const originalGetFlowRunsArtifactsByFlowRunId =
  PrefectAPI.prototype.getFlowRunsArtifactsByFlowRunId;

afterEach(() => {
  PrefectAPI.prototype.pollFlowRunCompletion = originalPollFlowRunCompletion;
  PrefectAPI.prototype.getFlowRunsArtifactsByFlowRunId =
    originalGetFlowRunsArtifactsByFlowRunId;
});

describe("DqdService.getDataQualityOverview", () => {
  it("adds DQD run metadata to the existing overview response", async () => {
    PrefectAPI.prototype.pollFlowRunCompletion = () =>
      Promise.resolve({ flowRunId: "completed-flow-run" });
    PrefectAPI.prototype.getFlowRunsArtifactsByFlowRunId = () =>
      Promise.resolve([
        {
          data: JSON.stringify({
            startTimestamp: ["2026-08-18 01:02:03"],
            endTimestamp: ["2026-08-18 03:02:03"],
            executionTime: ["2 hours"],
            executionTimeSeconds: [7200],
            Metadata: [
              {
                cdmReleaseDate: "2026-08-01",
                dqdVersion: "2.8.0",
              },
            ],
            Overview: {},
            CheckResults: [],
          }),
        },
      ]);

    const result = await new DqdService().getDataQualityOverview(
      "requested-flow-run",
      "Bearer test-token",
    );

    assertEquals(result?.timing, {
      startTimestamp: "2026-08-18 01:02:03",
      endTimestamp: "2026-08-18 03:02:03",
      executionTime: "2 hours",
      executionTimeSeconds: 7200,
    });
    assertEquals(result?.dqdVersion, "2.8.0");
    assertEquals(Object.hasOwn(result!, "total"), true);
    assertEquals(Object.hasOwn(result!, "validation"), true);
    assertEquals(Object.hasOwn(result!, "verification"), true);
  });

  it("omits metadata keys when an older artifact does not contain them", async () => {
    PrefectAPI.prototype.pollFlowRunCompletion = () =>
      Promise.resolve({ flowRunId: "completed-flow-run" });
    PrefectAPI.prototype.getFlowRunsArtifactsByFlowRunId = () =>
      Promise.resolve([
        {
          data: JSON.stringify({
            Metadata: [{ cdmReleaseDate: "2026-08-01" }],
            Overview: {},
            CheckResults: [],
          }),
        },
      ]);

    const result = await new DqdService().getDataQualityOverview(
      "requested-flow-run",
      "Bearer test-token",
    );

    assertEquals(Object.keys(result!).sort(), [
      "total",
      "validation",
      "verification",
    ]);
  });
});
