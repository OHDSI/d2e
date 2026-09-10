import { Repository } from "typeorm";
import { v4 as uuidv4 } from "uuid";

import dataSource from "../db/datasource.ts";
import { ConceptMappingRowFlag } from "../entities/ConceptMappingRowFlag.ts";
import { ConceptMappingSuggestion } from "../entities/ConceptMappingSuggestion.ts";

const UNIQUE_VIOLATION_CODE = "23505";

// Typed conflict error. jobplugins otherwise reports HTTP errors by throwing
// a plain Error with a `.statusCode` property set on it (see
// DataTransformationService.validateTemplateData /
// DataTransformationController), so this exposes the same `.statusCode`
// field for controllers that already know that convention, while still
// being `instanceof`-checkable for callers/tests that want a typed error.
export class ConflictError extends Error {
  statusCode = 409;

  constructor(message: string) {
    super(message);
    this.name = "ConflictError";
  }
}

export interface ConceptInput {
  conceptId: number;
  conceptName?: string;
  conceptCode?: string;
  domainId?: string;
  vocabularyId?: string;
}

export interface SuggestionDto {
  id: string;
  conceptId: number;
  conceptName: string;
  conceptCode: string;
  domainId: string;
  vocabularyId: string;
  suggestedBy: string;
  // Display names for the UI's "Checked by" column: who suggested this concept, and - once
  // approved - who approved it. Null on suggestions written before these were recorded.
  suggestedByName: string | null;
  approvedByName: string | null;
  createdAt: Date;
  isApproved: boolean;
}

export interface NodeSuggestionsRow {
  sourceRowId: string;
  flagged: boolean;
  suggestions: SuggestionDto[];
}

function toDto(suggestion: ConceptMappingSuggestion): SuggestionDto {
  return {
    id: suggestion.id,
    conceptId: suggestion.targetConceptId,
    conceptName: suggestion.conceptName,
    conceptCode: suggestion.conceptCode,
    domainId: suggestion.domainId,
    vocabularyId: suggestion.vocabularyId,
    suggestedBy: suggestion.suggestedBy,
    suggestedByName: suggestion.suggestedByName ?? null,
    approvedByName: suggestion.approvedByName ?? null,
    createdAt: suggestion.createdDate,
    isApproved: suggestion.isApproved,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as { code?: string; driverError?: { code?: string } };
  return anyErr.code === UNIQUE_VIOLATION_CODE || anyErr.driverError?.code === UNIQUE_VIOLATION_CODE;
}

// Minimal shape of a transactional entity manager: just enough to fetch a
// repository bound to the transaction. `DataSource` and TypeORM's
// `EntityManager` both satisfy this structurally.
interface TransactionalManager {
  getRepository(entity: typeof ConceptMappingSuggestion): Repository<ConceptMappingSuggestion>;
  getRepository(entity: typeof ConceptMappingRowFlag): Repository<ConceptMappingRowFlag>;
}

interface TransactionRunner {
  transaction<T>(work: (manager: TransactionalManager) => Promise<T>): Promise<T>;
}

export class ConceptMappingSuggestionService {
  private suggestionRepo: Repository<ConceptMappingSuggestion>;
  private flagRepo: Repository<ConceptMappingRowFlag>;
  private transactionRunner: TransactionRunner;

  constructor(
    suggestionRepo?: Repository<ConceptMappingSuggestion>,
    flagRepo?: Repository<ConceptMappingRowFlag>,
    transactionRunner?: TransactionRunner,
  ) {
    this.suggestionRepo = suggestionRepo ?? dataSource.getRepository(ConceptMappingSuggestion);
    this.flagRepo = flagRepo ?? dataSource.getRepository(ConceptMappingRowFlag);
    this.transactionRunner = transactionRunner ?? (dataSource as unknown as TransactionRunner);
  }

  async listByNode(dataflowId: string, nodeId: string): Promise<NodeSuggestionsRow[]> {
    const [suggestions, flags] = await Promise.all([
      this.suggestionRepo.find({ where: { dataflowId, nodeId } }),
      this.flagRepo.find({ where: { dataflowId, nodeId } }),
    ]);

    const flaggedByRow = new Map(flags.map((flag) => [flag.sourceRowId, flag.flagged]));
    const suggestionsByRow = new Map<string, ConceptMappingSuggestion[]>();
    for (const suggestion of suggestions) {
      const rowSuggestions = suggestionsByRow.get(suggestion.sourceRowId) ?? [];
      rowSuggestions.push(suggestion);
      suggestionsByRow.set(suggestion.sourceRowId, rowSuggestions);
    }

    // A row has "activity" if it has a suggestion and/or a flag record.
    const rowIds = new Set<string>([...suggestionsByRow.keys(), ...flaggedByRow.keys()]);

    return Array.from(rowIds).map((sourceRowId) => ({
      sourceRowId,
      flagged: flaggedByRow.get(sourceRowId) ?? false,
      suggestions: (suggestionsByRow.get(sourceRowId) ?? []).map(toDto),
    }));
  }

  // Reverting any existing approval and inserting the new suggestion must be
  // atomic: without a transaction, a unique-violation on the insert (e.g. the
  // user re-suggests the very concept that was already approved on this row)
  // would leave the revert committed but the new row missing - silently
  // dropping the row's only approved suggestion. Wrapping both steps the same
  // way `approve` does means the revert rolls back together with the failed
  // insert, leaving the pre-existing approval untouched.
  async addSuggestion(
    dataflowId: string,
    nodeId: string,
    sourceRowId: string,
    concept: ConceptInput,
    userSub: string,
    username?: string,
  ): Promise<SuggestionDto> {
    const entity = {
      id: uuidv4(),
      dataflowId,
      nodeId,
      sourceRowId,
      targetConceptId: concept.conceptId,
      conceptName: concept.conceptName,
      conceptCode: concept.conceptCode,
      domainId: concept.domainId,
      vocabularyId: concept.vocabularyId,
      suggestedBy: userSub,
      suggestedByName: username ?? null,
      isApproved: false,
      createdBy: userSub,
      modifiedBy: userSub,
    } as ConceptMappingSuggestion;

    try {
      await this.transactionRunner.transaction(async (manager) => {
        const repo = manager.getRepository(ConceptMappingSuggestion);

        const rowSuggestions = await repo.find({ where: { dataflowId, nodeId, sourceRowId } });
        const approved = rowSuggestions.find((s) => s.isApproved);
        if (approved) {
          await repo.update(approved.id, { isApproved: false, modifiedBy: userSub });
        }

        await repo.insert(entity);
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError(
          `A suggestion for concept ${concept.conceptId} already exists on row ${sourceRowId}`,
        );
      }
      throw err;
    }

    // Re-fetch the persisted row so the returned DTO reflects DB-populated
    // audit columns (e.g. createdAt) rather than the pre-insert in-memory
    // object, which never has createdDate set.
    const persisted = await this.suggestionRepo.findOne({ where: { id: entity.id } });
    return toDto(persisted ?? entity);
  }

  // Marking a suggestion approved and clearing out its competitors must be
  // atomic: a failure between the two steps would otherwise leave the row
  // with more than one suggestion (violating the "an approved row has
  // exactly one suggestion" invariant the frontend relies on), or with none
  // approved at all.
  async approve(id: string, userSub: string, username?: string): Promise<void> {
    const suggestion = await this.suggestionRepo.findOne({ where: { id } });
    if (!suggestion) {
      throw new Error(`Suggestion ${id} not found`);
    }
    const { dataflowId, nodeId, sourceRowId } = suggestion;

    await this.transactionRunner.transaction(async (manager) => {
      const repo = manager.getRepository(ConceptMappingSuggestion);

      const siblings = await repo.find({ where: { dataflowId, nodeId, sourceRowId } });
      const otherIds = siblings.map((s) => s.id).filter((siblingId) => siblingId !== id);

      await repo.update(id, {
        isApproved: true,
        approvedByName: username ?? null,
        modifiedBy: userSub,
      });
      if (otherIds.length > 0) {
        await repo.delete(otherIds);
      }
    });
  }

  async unapprove(id: string, userSub: string): Promise<void> {
    await this.suggestionRepo.update(id, {
      isApproved: false,
      approvedByName: null,
      modifiedBy: userSub,
    });
  }

  async setRowFlag(
    dataflowId: string,
    nodeId: string,
    sourceRowId: string,
    flagged: boolean,
    userSub: string,
  ): Promise<void> {
    const existing = await this.flagRepo.findOne({ where: { dataflowId, nodeId, sourceRowId } });
    if (existing) {
      await this.flagRepo.update({ dataflowId, nodeId, sourceRowId }, {
        flagged,
        modifiedBy: userSub,
      });
      return;
    }

    try {
      await this.flagRepo.insert({
        dataflowId,
        nodeId,
        sourceRowId,
        flagged,
        createdBy: userSub,
        modifiedBy: userSub,
      } as ConceptMappingRowFlag);
    } catch (err) {
      if (isUniqueViolation(err)) {
        // Lost the find-then-insert race to a concurrent first flag on this
        // row: fall back to updating the row a competing request just
        // created instead of surfacing a raw PK-violation error.
        await this.flagRepo.update({ dataflowId, nodeId, sourceRowId }, {
          flagged,
          modifiedBy: userSub,
        });
        return;
      }
      throw err;
    }
  }

  // Deleting suggestions and flags for a node must be atomic: without a
  // transaction, a failure between the two deletes could leave suggestions
  // cleared but flags intact (or vice versa) for the same node.
  async clearNode(dataflowId: string, nodeId: string): Promise<void> {
    await this.transactionRunner.transaction(async (manager) => {
      const suggestionRepo = manager.getRepository(ConceptMappingSuggestion);
      const flagRepo = manager.getRepository(ConceptMappingRowFlag);

      await suggestionRepo.delete({ dataflowId, nodeId });
      await flagRepo.delete({ dataflowId, nodeId });
    });
  }
}
