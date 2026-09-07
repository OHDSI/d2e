import {
  createWizardBookmark,
  materializeWizardBookmark,
  type CreateWizardBookmarkResult,
  type CreateWizardBookmarkInput,
  type MaterializeWizardBookmarkInput,
  type MaterializeWizardBookmarkResult,
} from "../api/wizardCohortApi";
import type { MriBookmark } from "../utils/mriQuery";
import { buildMriMaterializationQuery } from "../utils/mriMaterializationQuery";
import {
  findWizardBookmarkById,
  selectBestWizardBookmark,
  type WizardBookmarkCandidate,
  type WizardBookmarkScope,
} from "../utils/wizardBookmarkCache";
import type { WizardDashboardResult, WizardDashboardStatus } from "./wizardDashboardState";

type FlowStage = Exclude<WizardDashboardStatus, "idle" | "ready" | "error">;

export interface PendingWizardBookmark {
  bmkId: string;
  bookmarkName: string;
}

export interface RunWizardDashboardFlowInput {
  datasetId: string;
  username: string;
  paConfigId: string;
  cdmConfigId: string;
  cdmConfigVersion: string;
  bookmark: MriBookmark;
  wizardConfig: Record<string, unknown>;
  pendingBookmark?: PendingWizardBookmark | null;
  signal?: AbortSignal;
}

export interface WizardDashboardFlowDependencies {
  ensureCache: () => Promise<unknown>;
  refreshCache: () => Promise<unknown>;
  createBookmark?: (input: CreateWizardBookmarkInput) => Promise<CreateWizardBookmarkResult>;
  materializeBookmark?: (input: MaterializeWizardBookmarkInput) => Promise<MaterializeWizardBookmarkResult>;
  now?: () => number;
  onStage?: (stage: FlowStage) => void;
  onBookmarkCreated?: (bookmark: PendingWizardBookmark) => void;
}

export function createWizardBookmarkName(now = Date.now()): string {
  if (!Number.isInteger(now) || String(now).length !== 13) {
    throw new Error("Unable to create Wizard bookmark name");
  }
  return `wizards-${now}`;
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Wizard dashboard flow was cancelled", "AbortError");
}

export async function runWizardDashboardFlow(
  input: RunWizardDashboardFlowInput,
  dependencies: WizardDashboardFlowDependencies,
): Promise<WizardDashboardResult> {
  const scope: WizardBookmarkScope = {
    datasetId: input.datasetId,
    username: input.username,
    paConfigId: input.paConfigId,
  };
  const createBookmark = dependencies.createBookmark ?? createWizardBookmark;
  const materializeBookmark = dependencies.materializeBookmark ?? materializeWizardBookmark;
  const stage = dependencies.onStage ?? (() => undefined);

  throwIfAborted(input.signal);
  stage("applying-filters");
  let items = await dependencies.ensureCache();
  throwIfAborted(input.signal);

  let candidate: WizardBookmarkCandidate | null = null;
  if (input.pendingBookmark) {
    candidate = findWizardBookmarkById(items, scope, input.pendingBookmark.bmkId);
  }
  candidate ??= selectBestWizardBookmark(items, scope, input.bookmark);

  if (!candidate && !input.pendingBookmark) {
    items = await dependencies.refreshCache();
    throwIfAborted(input.signal);
    candidate ??= selectBestWizardBookmark(items, scope, input.bookmark);
  }

  const cacheOutcome = candidate
    ? candidate.cohortDefinitionId === undefined
      ? "hit-unmaterialized"
      : "hit-ready"
    : "miss";

  let bookmarkId = candidate?.bmkId ?? input.pendingBookmark?.bmkId;
  let bookmarkName = candidate?.bookmarkname ?? input.pendingBookmark?.bookmarkName;
  let cohortDefinitionId = candidate?.cohortDefinitionId;

  if (!candidate) {
    if (!bookmarkId || !bookmarkName) {
      bookmarkName = createWizardBookmarkName((dependencies.now ?? Date.now)());
      const created = await createBookmark({
        datasetId: input.datasetId,
        bookmarkname: bookmarkName,
        bookmark: input.bookmark,
        paConfigId: input.paConfigId,
        cdmConfigId: input.cdmConfigId,
        cdmConfigVersion: input.cdmConfigVersion,
      });
      bookmarkId = created.bmkId;
      dependencies.onBookmarkCreated?.({ bmkId: bookmarkId, bookmarkName });
      throwIfAborted(input.signal);
    }
  }
  if (!bookmarkId || !bookmarkName) {
    throw new Error("The Wizard bookmark did not include an id and name");
  }

  const mriQuery = buildMriMaterializationQuery(input.bookmark, input.datasetId);
  if (cohortDefinitionId === undefined) {
    stage("materializing");
    const materialized = await materializeBookmark({
      datasetId: input.datasetId,
      bookmarkId,
      bookmarkName,
      mriQuery,
    });
    throwIfAborted(input.signal);
    cohortDefinitionId = materialized.cohortDefinitionId;
    void dependencies.refreshCache().catch(() => undefined);
  }

  stage("opening-dashboard");
  return {
    bookmarkId,
    bookmarkName,
    cohortId: cohortDefinitionId,
    wizardConfig: input.wizardConfig,
    mriquery: JSON.stringify(mriQuery),
    cacheOutcome,
  };
}
