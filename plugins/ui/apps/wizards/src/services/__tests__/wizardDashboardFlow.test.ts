import { describe, expect, it, vi } from "vitest";
import { buildMriBookmark } from "../../utils/mriQuery";
import { createWizardBookmarkName, runWizardDashboardFlow } from "../wizardDashboardFlow";

const datasetId = "dataset-1";
const bookmark = buildMriBookmark([], {}, { configId: "mri-config", configVersion: "2" }, datasetId).bookmark;
const baseInput = {
  datasetId,
  username: "researcher",
  paConfigId: "pa-config",
  cdmConfigId: "cdm-config",
  cdmConfigVersion: "3",
  bookmark,
  wizardConfig: { dashboardType: "incidence" },
};

describe("Wizard dashboard flow", () => {
  it("reuses a materialized match without any writes", async () => {
    const refreshCache = vi.fn();
    const createBookmark = vi.fn();
    const materializeBookmark = vi.fn();

    const result = await runWizardDashboardFlow(baseInput, {
      ensureCache: vi.fn().mockResolvedValue([bookmarkItem({ cohortDefinitionId: 42 })]),
      refreshCache,
      createBookmark,
      materializeBookmark,
    });

    expect(result).toMatchObject({ bookmarkId: "bookmark-1", cohortId: 42, cacheOutcome: "hit-ready" });
    expect(JSON.parse(result.mriquery)).toMatchObject({ datasetId: "dataset-1" });
    expect(refreshCache).not.toHaveBeenCalled();
    expect(createBookmark).not.toHaveBeenCalled();
    expect(materializeBookmark).not.toHaveBeenCalled();
  });

  it("uses the materialization response without waiting for the bookmark refresh", async () => {
    const createBookmark = vi.fn();
    const materializeBookmark = vi.fn().mockResolvedValue({ cohortDefinitionId: 42 });
    const refreshCache = vi.fn().mockImplementation(() => new Promise<unknown>(() => undefined));

    const result = await runWizardDashboardFlow(baseInput, {
      ensureCache: vi.fn().mockResolvedValue([bookmarkItem()]),
      refreshCache,
      createBookmark,
      materializeBookmark,
    });

    expect(createBookmark).not.toHaveBeenCalled();
    expect(materializeBookmark).toHaveBeenCalledTimes(1);
    expect(refreshCache).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ cohortId: 42, cacheOutcome: "hit-unmaterialized" });
  });

  it("uses the returned bookmark and cohort ids for a new analysis", async () => {
    const createBookmark = vi.fn().mockResolvedValue({ status: "success", bmkId: "created-bookmark" });
    const materializeBookmark = vi.fn().mockResolvedValue({ cohortDefinitionId: 42 });
    const refreshCache = vi.fn().mockResolvedValue([]);
    const onBookmarkCreated = vi.fn();
    const stages: string[] = [];

    const result = await runWizardDashboardFlow(baseInput, {
      ensureCache: vi.fn().mockResolvedValue([]),
      refreshCache,
      createBookmark,
      materializeBookmark,
      now: () => 1783670400000,
      onStage: (stage) => stages.push(stage),
      onBookmarkCreated,
    });

    expect(result).toMatchObject({ bookmarkId: "created-bookmark", cohortId: 42, cacheOutcome: "miss" });
    expect(createBookmark).toHaveBeenCalledTimes(1);
    expect(materializeBookmark).toHaveBeenCalledWith(expect.objectContaining({ bookmarkId: "created-bookmark" }));
    expect(refreshCache).toHaveBeenCalledTimes(2);
    expect(onBookmarkCreated).toHaveBeenCalledWith({
      bmkId: "created-bookmark",
      bookmarkName: "wizards-1783670400000",
    });
    expect(stages).toEqual(["applying-filters", "materializing", "opening-dashboard"]);
  });

  it("reuses a saved bookmark id on retry instead of saving again", async () => {
    const createBookmark = vi.fn();
    const materializeBookmark = vi.fn().mockResolvedValue({ cohortDefinitionId: 9 });
    const pendingBookmark = { bmkId: "created-bookmark", bookmarkName: "wizards-1783670400000" };

    const result = await runWizardDashboardFlow(
      { ...baseInput, pendingBookmark },
      {
        ensureCache: vi.fn().mockResolvedValue([]),
        refreshCache: vi.fn().mockResolvedValue([]),
        createBookmark,
        materializeBookmark,
      },
    );

    expect(result).toMatchObject({ bookmarkId: "created-bookmark", cohortId: 9 });
    expect(createBookmark).not.toHaveBeenCalled();
    expect(materializeBookmark).toHaveBeenCalledTimes(1);
  });

  it("stops before materialization when saving fails", async () => {
    const materializeBookmark = vi.fn();

    await expect(
      runWizardDashboardFlow(baseInput, {
        ensureCache: vi.fn().mockResolvedValue([]),
        refreshCache: vi.fn().mockResolvedValue([]),
        createBookmark: vi.fn().mockRejectedValue(new Error("save failed")),
        materializeBookmark,
        now: () => 1783670400000,
      }),
    ).rejects.toThrow("save failed");
    expect(materializeBookmark).not.toHaveBeenCalled();
  });

  it("generates only the strict timestamp bookmark format", () => {
    expect(createWizardBookmarkName(1783670400000)).toBe("wizards-1783670400000");
    expect(() => createWizardBookmarkName(123)).toThrow();
  });
});

function bookmarkItem(overrides: Record<string, unknown> = {}) {
  return {
    bmkId: "bookmark-1",
    bookmarkname: "wizards-1783670400000",
    bookmark: JSON.stringify(bookmark),
    modified: "2026-07-10T10:00:00.000Z",
    user_id: "researcher",
    shared: false,
    paConfigId: "pa-config",
    ...overrides,
  };
}
