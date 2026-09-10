import "./_setup.ts";
import { assertEquals } from "@std/assert";
import { PrefectAPI } from "../src/api/PrefectAPI.ts";
import { DqdService } from "../src/services/DqdService.ts";

const originalPollFlowRunCompletion =
  PrefectAPI.prototype.pollFlowRunCompletion;
const originalGetFlowRunsArtifactsByFlowRunId =
  PrefectAPI.prototype.getFlowRunsArtifactsByFlowRunId;

/**
 * DqdService constructs its own PrefectAPI rather than taking one, so the
 * doubles go on the prototype; restore them however the test ends.
 */
async function withArtifact(
  artifact: unknown,
  run: () => Promise<void>,
): Promise<void> {
  PrefectAPI.prototype.pollFlowRunCompletion = () =>
    Promise.resolve({ flowRunId: "completed-flow-run" });
  PrefectAPI.prototype.getFlowRunsArtifactsByFlowRunId = () =>
    Promise.resolve([{ data: JSON.stringify(artifact) }]);
  try {
    await run();
  } finally {
    PrefectAPI.prototype.pollFlowRunCompletion = originalPollFlowRunCompletion;
    PrefectAPI.prototype.getFlowRunsArtifactsByFlowRunId =
      originalGetFlowRunsArtifactsByFlowRunId;
  }
}

Deno.test("getDataQualityOverview adds DQD run metadata to the existing overview response", async () => {
  await withArtifact(
    {
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
    },
    async () => {
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
    },
  );
});

Deno.test("getDataQualityOverview omits metadata keys when an older artifact does not contain them", async () => {
  await withArtifact(
    {
      Metadata: [{ cdmReleaseDate: "2026-08-01" }],
      Overview: {},
      CheckResults: [],
    },
    async () => {
      const result = await new DqdService().getDataQualityOverview(
        "requested-flow-run",
        "Bearer test-token",
      );

      assertEquals(Object.keys(result!).sort(), [
        "total",
        "validation",
        "verification",
      ]);
    },
  );
});
