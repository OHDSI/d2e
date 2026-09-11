import "./_setup.ts";
import { assertEquals } from "@std/assert";
import { stub } from "@std/testing/mock";
import { createMockResponse } from "../../_shared/testing/http-doubles.ts";
import { findHandlerChain } from "../../_shared/testing/router-helpers.ts";
import { ConceptMappingSuggestionController } from "../src/controllers/ConceptMappingSuggestionController.ts";
import { ConceptMappingSuggestionService } from "../src/services/ConceptMappingSuggestionService.ts";

const SUGGESTION_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

// An unsigned JWT carrying only a `sub`; the controller uses jsonwebtoken's
// `decode` (no verification), matching how the other jobplugins controllers read
// the caller's identity.
function bearerFor(sub: string): string {
  const encode = (part: unknown) => btoa(JSON.stringify(part)).replace(/=+$/, "");
  return `Bearer ${encode({ alg: "none" })}.${encode({ sub })}.`;
}

/**
 * A request as the router sees it: `username` is put there by the
 * `extractUsernameFromJwt` middleware that jobplugins applies to every route
 * (see index.ts), so a controller can read it without a lookup of its own.
 */
function requestWith(
  init: { body?: Record<string, unknown>; params?: Record<string, unknown>; username?: string },
) {
  return {
    params: init.params ?? {},
    query: {},
    body: init.body ?? {},
    headers: { authorization: bearerFor("user-a") },
    username: init.username,
  } as never;
}

async function run(
  chain: Array<(req: unknown, res: unknown, next: unknown) => unknown>,
  req: unknown,
  res: unknown,
) {
  for (const middleware of chain) {
    await middleware(req, res, () => {});
  }
}

Deno.test("POST / passes the caller's username through to addSuggestion", async () => {
  const addSuggestion = stub(
    ConceptMappingSuggestionService.prototype,
    "addSuggestion",
    // deno-lint-ignore no-explicit-any
    () => Promise.resolve({ id: SUGGESTION_ID } as any),
  );
  try {
    const chain = findHandlerChain(new ConceptMappingSuggestionController().router, "post", "/");
    const { res } = createMockResponse();

    await run(
      chain,
      requestWith({
        body: {
          dataflowId: "df-1",
          nodeId: "node-1",
          sourceRowId: "row-1",
          concept: { conceptId: 42 },
        },
        username: "alice",
      }),
      res,
    );

    assertEquals(addSuggestion.calls[0].args[5], "alice");
  } finally {
    addSuggestion.restore();
  }
});

Deno.test("POST /:id/approve passes the caller's username through to approve", async () => {
  const approve = stub(
    ConceptMappingSuggestionService.prototype,
    "approve",
    () => Promise.resolve(),
  );
  try {
    const chain = findHandlerChain(
      new ConceptMappingSuggestionController().router,
      "post",
      "/:id/approve",
    );
    const { res } = createMockResponse();

    await run(chain, requestWith({ params: { id: SUGGESTION_ID }, username: "bob" }), res);

    assertEquals(approve.calls[0].args[2], "bob");
  } finally {
    approve.restore();
  }
});
