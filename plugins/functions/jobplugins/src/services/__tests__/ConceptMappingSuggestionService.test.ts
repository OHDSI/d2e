import { describe, it, beforeEach } from "jsr:@std/testing@1.0.3/bdd";
import { assertEquals, assertRejects } from "jsr:@std/assert@1.0.6";

import {
  ConceptMappingSuggestionService,
  ConflictError,
} from "../ConceptMappingSuggestionService.ts";
import { ConceptMappingSuggestion } from "../../entities/ConceptMappingSuggestion.ts";
import { ConceptMappingRowFlag } from "../../entities/ConceptMappingRowFlag.ts";

// --- Minimal in-memory fake mirroring the subset of the TypeORM Repository
// API the service relies on (find/findOne/insert/update/delete). This
// mirrors the mocking pattern used by
// portal/src/webapi/webapi-source.service.test.ts (plain fake objects cast
// through the constructor), since jobplugins has no repo/DB test harness of
// its own yet and standing up a real Postgres instance for this unit test
// would be out of scope for this task.
function matches(item: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([k, v]) => item[k] === v);
}

class FakeRepository<T extends Record<string, any>> {
  items: T[] = [];

  constructor(private uniqueCheck?: (a: T, b: T) => boolean) {}

  // deno-lint-ignore no-explicit-any
  find({ where }: { where: Record<string, unknown> } = { where: {} }): Promise<T[]> {
    return Promise.resolve(this.items.filter((item) => matches(item, where)));
  }

  findOne({ where }: { where: Record<string, unknown> }): Promise<T | null> {
    return Promise.resolve(this.items.find((item) => matches(item, where)) ?? null);
  }

  insert(entity: T): Promise<void> {
    if (this.uniqueCheck && this.items.some((i) => this.uniqueCheck!(i, entity))) {
      const err = new Error("duplicate key value violates unique constraint") as Error & {
        code?: string;
      };
      err.code = "23505";
      throw err;
    }
    this.items.push({ ...entity });
    return Promise.resolve();
  }

  update(criteria: unknown, partial: Partial<T>): Promise<void> {
    const isWhereObject = typeof criteria === "object" && criteria !== null && !Array.isArray(criteria);
    const ids = Array.isArray(criteria) ? criteria : [criteria];
    for (const item of this.items) {
      if (isWhereObject) {
        if (matches(item, criteria as Record<string, unknown>)) Object.assign(item, partial);
      } else if (ids.includes(item.id)) {
        Object.assign(item, partial);
      }
    }
    return Promise.resolve();
  }

  delete(criteria: unknown): Promise<void> {
    if (Array.isArray(criteria)) {
      this.items = this.items.filter((i) => !criteria.includes(i.id));
    } else {
      // Object criteria must match ALL provided keys (not just some) - this
      // is what makes the "approve() only deletes siblings in its own row"
      // regression test below meaningful.
      this.items = this.items.filter((i) => !matches(i, criteria as Record<string, unknown>));
    }
    return Promise.resolve();
  }
}

// A transaction runner that snapshots every registered repo's rows before
// running the callback and restores them if the callback throws - modeling
// the rollback a real DB transaction gives us. This matters for
// `addSuggestion`: it reverts an existing approval and inserts the new
// suggestion inside one transaction specifically so a unique-violation on
// the insert rolls the revert back too. A fake that always committed
// regardless of the callback outcome (as this used to) would let a test
// assert that rollback happened even if the service code never actually
// wired up a real transaction - a false pass. Snapshotting+restoring here
// makes the rollback assertion in the "duplicate of an approved suggestion"
// test below meaningful.
class FakeTransactionRunner {
  constructor(private repoByEntity: Map<unknown, FakeRepository<any>>) {}

  async transaction<T>(work: (manager: { getRepository: (entity: unknown) => unknown }) => Promise<T>): Promise<T> {
    const snapshots = new Map<FakeRepository<any>, any[]>();
    for (const repo of this.repoByEntity.values()) {
      snapshots.set(repo, repo.items.map((item) => ({ ...item })));
    }

    try {
      return await work({
        getRepository: (entity: unknown) => this.repoByEntity.get(entity),
      });
    } catch (err) {
      for (const [repo, snapshot] of snapshots) {
        repo.items = snapshot;
      }
      throw err;
    }
  }
}

// A repository whose `insert` simulates losing a find-then-insert race: the
// first call throws a unique-violation (as Postgres would when a concurrent
// request's insert lands first) while also landing that concurrent row into
// `items`, so the subsequent calls behave like the real DB state after a
// lost race.
class RacyInsertRepository<T extends Record<string, any>> extends FakeRepository<T> {
  private triggered = false;

  override insert(entity: T): Promise<void> {
    if (!this.triggered) {
      this.triggered = true;
      this.items.push({ ...entity, flagged: !entity.flagged } as T);
      const err = new Error("duplicate key value violates unique constraint") as Error & {
        code?: string;
      };
      err.code = "23505";
      throw err;
    }
    return super.insert(entity);
  }
}

const DATAFLOW_ID = "dataflow-1";
const NODE_ID = "node-1";
const ROW_ID = "row-1";

const CONCEPT_A = {
  conceptId: 111,
  conceptName: "Aspirin",
  conceptCode: "1191",
  domainId: "Drug",
  vocabularyId: "RxNorm",
};

const CONCEPT_B = {
  conceptId: 222,
  conceptName: "Ibuprofen",
  conceptCode: "5640",
  domainId: "Drug",
  vocabularyId: "RxNorm",
};

let suggestionRepo: FakeRepository<ConceptMappingSuggestion>;
let flagRepo: FakeRepository<ConceptMappingRowFlag>;
let service: ConceptMappingSuggestionService;

beforeEach(() => {
  suggestionRepo = new FakeRepository<ConceptMappingSuggestion>(
    (a, b) =>
      a.dataflowId === b.dataflowId &&
      a.nodeId === b.nodeId &&
      a.sourceRowId === b.sourceRowId &&
      a.targetConceptId === b.targetConceptId,
  );
  flagRepo = new FakeRepository<ConceptMappingRowFlag>();
  const transactionRunner = new FakeTransactionRunner(
    // deno-lint-ignore no-explicit-any
    new Map<unknown, FakeRepository<any>>([
      [ConceptMappingSuggestion, suggestionRepo],
      [ConceptMappingRowFlag, flagRepo],
    ]),
  );
  service = new ConceptMappingSuggestionService(
    // deno-lint-ignore no-explicit-any
    suggestionRepo as any,
    // deno-lint-ignore no-explicit-any
    flagRepo as any,
    // deno-lint-ignore no-explicit-any
    transactionRunner as any,
  );
});

describe("ConceptMappingSuggestionService.addSuggestion", () => {
  it("inserts a suggestion with suggestedBy set to the acting user", async () => {
    const dto = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
    );

    assertEquals(dto.conceptId, CONCEPT_A.conceptId);
    assertEquals(dto.suggestedBy, "user-a");
    assertEquals(dto.isApproved, false);
    assertEquals(suggestionRepo.items.length, 1);
    assertEquals(suggestionRepo.items[0].suggestedBy, "user-a");
  });

  it("records the acting user's username so the table can show who checked the row", async () => {
    const dto = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
      "alice",
    );

    assertEquals(dto.suggestedByName, "alice");
    assertEquals(suggestionRepo.items[0].suggestedByName, "alice");
  });

  it("rejects a duplicate suggestion (same targetConceptId for the row) with a ConflictError", async () => {
    await service.addSuggestion(DATAFLOW_ID, NODE_ID, ROW_ID, CONCEPT_A, "user-a");

    await assertRejects(
      () => service.addSuggestion(DATAFLOW_ID, NODE_ID, ROW_ID, CONCEPT_A, "user-b"),
      ConflictError,
    );
    assertEquals(suggestionRepo.items.length, 1);
  });

  it("reverts an existing approval on the row before inserting the new suggestion", async () => {
    const approved = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
    );
    await service.approve(approved.id, "user-a");
    assertEquals(suggestionRepo.items[0].isApproved, true);

    await service.addSuggestion(DATAFLOW_ID, NODE_ID, ROW_ID, CONCEPT_B, "user-b");

    const previouslyApproved = suggestionRepo.items.find((s) => s.id === approved.id)!;
    assertEquals(previouslyApproved.isApproved, false);
    assertEquals(suggestionRepo.items.length, 2);
  });

  it("rejects re-suggesting the row's already-approved concept and leaves that approval untouched", async () => {
    const approved = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
    );
    await service.approve(approved.id, "user-a");
    assertEquals(suggestionRepo.items[0].isApproved, true);

    // Re-suggesting the SAME concept that is already approved on this row:
    // addSuggestion's revert-then-insert transaction finds its own target
    // row (itself, since it's already approved) and would unapprove it
    // before the insert hits the unique constraint and fails. Both steps
    // ran inside one transaction, so the revert must roll back with the
    // failed insert, leaving the pre-existing approval exactly as it was.
    await assertRejects(
      () => service.addSuggestion(DATAFLOW_ID, NODE_ID, ROW_ID, CONCEPT_A, "user-b"),
      ConflictError,
    );

    assertEquals(suggestionRepo.items.length, 1);
    assertEquals(suggestionRepo.items[0].id, approved.id);
    assertEquals(suggestionRepo.items[0].isApproved, true);
  });
});

describe("ConceptMappingSuggestionService.approve", () => {
  it("marks the suggestion approved and deletes the other suggestions for that row", async () => {
    const first = await service.addSuggestion(DATAFLOW_ID, NODE_ID, ROW_ID, CONCEPT_A, "user-a");
    await service.addSuggestion(DATAFLOW_ID, NODE_ID, ROW_ID, CONCEPT_B, "user-b");
    assertEquals(suggestionRepo.items.length, 2);

    await service.approve(first.id, "user-a");

    assertEquals(suggestionRepo.items.length, 1);
    assertEquals(suggestionRepo.items[0].id, first.id);
    assertEquals(suggestionRepo.items[0].isApproved, true);
  });

  it("only deletes competitors within the same row, leaving other rows in the same node untouched", async () => {
    const rowASuggestion = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      "row-A",
      CONCEPT_A,
      "user-a",
    );
    await service.addSuggestion(DATAFLOW_ID, NODE_ID, "row-A", CONCEPT_B, "user-b");
    const rowBSuggestion1 = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      "row-B",
      CONCEPT_A,
      "user-a",
    );
    const rowBSuggestion2 = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      "row-B",
      CONCEPT_B,
      "user-b",
    );
    const rowBSnapshotBefore = suggestionRepo.items
      .filter((s) => s.sourceRowId === "row-B")
      .map((s) => ({ ...s }))
      .sort((a, b) => a.id.localeCompare(b.id));

    await service.approve(rowASuggestion.id, "user-a");

    // row-A collapsed to just the approved suggestion.
    const rowARemaining = suggestionRepo.items.filter((s) => s.sourceRowId === "row-A");
    assertEquals(rowARemaining.length, 1);
    assertEquals(rowARemaining[0].id, rowASuggestion.id);

    // row-B (same dataflow/node, different sourceRowId) must be completely
    // unaffected: this fails if approve()'s sibling-delete query were ever
    // widened to (dataflowId, nodeId) only, dropping the sourceRowId filter.
    const rowBRemaining = suggestionRepo.items
      .filter((s) => s.sourceRowId === "row-B")
      .sort((a, b) => a.id.localeCompare(b.id));
    const expectedRowBIds = [rowBSuggestion1.id, rowBSuggestion2.id].sort();
    assertEquals(rowBRemaining.map((s) => s.id), expectedRowBIds);
    assertEquals(rowBRemaining, rowBSnapshotBefore);
  });
});

describe("ConceptMappingSuggestionService.approve - approver identity", () => {
  it("records the approver's username, which can differ from the suggester's", async () => {
    const suggestion = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
      "alice",
    );

    await service.approve(suggestion.id, "user-b", "bob");

    assertEquals(suggestionRepo.items[0].approvedByName, "bob");
    assertEquals(suggestionRepo.items[0].suggestedByName, "alice");
  });
});

describe("ConceptMappingSuggestionService.unapprove", () => {
  it("clears the approver's username along with the approval", async () => {
    const suggestion = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
      "alice",
    );
    await service.approve(suggestion.id, "user-b", "bob");

    await service.unapprove(suggestion.id, "user-b");

    assertEquals(suggestionRepo.items[0].approvedByName, null);
  });


  it("clears isApproved on the suggestion", async () => {
    const suggestion = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
    );
    await service.approve(suggestion.id, "user-a");
    assertEquals(suggestionRepo.items[0].isApproved, true);

    await service.unapprove(suggestion.id, "user-a");

    assertEquals(suggestionRepo.items[0].isApproved, false);
  });
});

describe("ConceptMappingSuggestionService.setRowFlag", () => {
  it("upserts: inserts a flag row when none exists, then updates it on the next call", async () => {
    await service.setRowFlag(DATAFLOW_ID, NODE_ID, ROW_ID, true, "user-a");
    assertEquals(flagRepo.items.length, 1);
    assertEquals(flagRepo.items[0].flagged, true);

    await service.setRowFlag(DATAFLOW_ID, NODE_ID, ROW_ID, false, "user-b");
    assertEquals(flagRepo.items.length, 1);
    assertEquals(flagRepo.items[0].flagged, false);
    assertEquals(flagRepo.items[0].modifiedBy, "user-b");
  });

  it("falls back to update instead of throwing when a concurrent request wins the first-flag race", async () => {
    const racyFlagRepo = new RacyInsertRepository<ConceptMappingRowFlag>();
    const racyService = new ConceptMappingSuggestionService(
      // deno-lint-ignore no-explicit-any
      suggestionRepo as any,
      // deno-lint-ignore no-explicit-any
      racyFlagRepo as any,
    );

    // racyFlagRepo.insert() throws a simulated unique-violation on its first
    // call (as if another request's insert for the same row landed first);
    // setRowFlag must not let that raw error escape.
    await racyService.setRowFlag(DATAFLOW_ID, NODE_ID, ROW_ID, true, "user-a");

    assertEquals(racyFlagRepo.items.length, 1);
    assertEquals(racyFlagRepo.items[0].flagged, true);
    assertEquals(racyFlagRepo.items[0].modifiedBy, "user-a");
  });
});

describe("ConceptMappingSuggestionService.clearNode", () => {
  it("deletes all suggestions and flags for the node", async () => {
    await service.addSuggestion(DATAFLOW_ID, NODE_ID, ROW_ID, CONCEPT_A, "user-a");
    await service.setRowFlag(DATAFLOW_ID, NODE_ID, ROW_ID, true, "user-a");
    assertEquals(suggestionRepo.items.length, 1);
    assertEquals(flagRepo.items.length, 1);

    await service.clearNode(DATAFLOW_ID, NODE_ID);

    assertEquals(suggestionRepo.items.length, 0);
    assertEquals(flagRepo.items.length, 0);
  });
});

describe("ConceptMappingSuggestionService.listByNode", () => {
  it("exposes suggestedByName and approvedByName on each suggestion", async () => {
    const suggestion = await service.addSuggestion(
      DATAFLOW_ID,
      NODE_ID,
      ROW_ID,
      CONCEPT_A,
      "user-a",
      "alice",
    );
    await service.approve(suggestion.id, "user-b", "bob");

    const rows = await service.listByNode(DATAFLOW_ID, NODE_ID);

    assertEquals(rows[0].suggestions[0].suggestedByName, "alice");
    assertEquals(rows[0].suggestions[0].approvedByName, "bob");
  });

  it("groups suggestions by sourceRowId and attaches the row's flagged state", async () => {
    await service.addSuggestion(DATAFLOW_ID, NODE_ID, "row-1", CONCEPT_A, "user-a");
    await service.addSuggestion(DATAFLOW_ID, NODE_ID, "row-1", CONCEPT_B, "user-b");
    await service.addSuggestion(DATAFLOW_ID, NODE_ID, "row-2", CONCEPT_A, "user-a");
    await service.setRowFlag(DATAFLOW_ID, NODE_ID, "row-1", true, "user-a");

    const rows = await service.listByNode(DATAFLOW_ID, NODE_ID);

    const row1 = rows.find((r) => r.sourceRowId === "row-1")!;
    const row2 = rows.find((r) => r.sourceRowId === "row-2")!;

    assertEquals(row1.flagged, true);
    assertEquals(row1.suggestions.length, 2);
    assertEquals(row2.flagged, false);
    assertEquals(row2.suggestions.length, 1);
  });
});
