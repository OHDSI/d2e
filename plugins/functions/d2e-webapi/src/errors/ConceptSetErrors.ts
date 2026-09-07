/**
 * Domain-specific error classes for concept set operations.
 * These typed errors enable route handlers to distinguish error types
 * and return appropriate HTTP status codes.
 */

/**
 * Thrown when attempting to delete a concept set that is currently
 * referenced by cohort definitions or bookmarks.
 */
export class ConceptSetInUseError extends Error {
  constructor(
    public readonly cohortDefinitions: Array<{ id: number; name: string }>,
    public readonly bookmarks: Array<{ id: string; name: string }>
  ) {
    super("Concept set is currently in use");
    this.name = "ConceptSetInUseError";
  }
}

/**
 * Thrown when WebAPI rejects a concept set name that is already taken.
 * WebAPI has no duplicate-name check of its own; the `uq_cs_name` unique
 * constraint on `webapi.concept_set` rejects the write and WebAPI reports it
 * as HTTP 409. Route handlers map this error back to a 409 so that the browser
 * can show a duplicate-name message instead of a generic failure.
 */
export class ConceptSetNameConflictError extends Error {
  constructor(public readonly conceptSetName: string) {
    super(`A concept set named "${conceptSetName}" already exists`);
    this.name = "ConceptSetNameConflictError";
  }
}

/**
 * Thrown when concept set validation fails (e.g., invalid ID format).
 */
export class ConceptSetValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConceptSetValidationError";
  }
}

/**
 * Thrown when fetching a concept set expression fails, typically due to
 * missing source configuration in WebAPI.
 */
export class ConceptSetExpressionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConceptSetExpressionError";
  }
}
