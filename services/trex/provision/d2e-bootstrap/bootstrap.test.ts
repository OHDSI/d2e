import { assertEquals, assertStringIncludes, assertThrows } from "jsr:@std/assert";
import {
  type BootstrapConfig,
  buildBootstrapStatements,
  DOLLAR_TAG,
  parseBootstrapConfigFromEnv,
  quoteIdent,
  quoteLiteral,
} from "./bootstrap.ts";

const CFG: BootstrapConfig = {
  manageConfig: {
    databases: { "+alp": { schemas: { "+portal": {}, "+usermgmt": {} } } },
  },
  manageUsers: {
    alp: {
      manager: "alp_pg_admin_user",
      managerPassword: "m-pass",
      reader: "alp_pg_read_user",
      readerPassword: "r-pass",
      writer: "alp_pg_write_user",
      writerPassword: "w-pass",
      logtoManager: "logto_postgres",
      logtoManagerPassword: "l-pass",
    },
  },
  grantRolesUsers: {},
};

Deno.test("quoteIdent double-quotes and escapes embedded quotes", () => {
  assertEquals(quoteIdent("alp_pg_admin_user"), '"alp_pg_admin_user"');
});

Deno.test("quoteLiteral single-quotes and escapes embedded quotes", () => {
  assertEquals(quoteLiteral("p'ass"), "'p''ass'");
});

Deno.test("quoteIdent rejects identifiers that are not name-shaped", () => {
  assertThrows(() => quoteIdent("bad; DROP DATABASE alp"));
});

Deno.test("every generated statement is idempotent", () => {
  for (const sql of buildBootstrapStatements(CFG)) {
    const idempotent = sql.includes("IF NOT EXISTS") ||
      sql.startsWith("GRANT ") ||
      sql.startsWith("ALTER DEFAULT PRIVILEGES") ||
      sql.startsWith(`DO ${DOLLAR_TAG}`);
    assertEquals(idempotent, true, `not idempotent: ${sql}`);
  }
});

Deno.test("creates each configured schema exactly once", () => {
  const stmts = buildBootstrapStatements(CFG);
  const created = stmts.filter((s) => s.startsWith("CREATE SCHEMA IF NOT EXISTS"));
  assertEquals(created.length, 2);
  assertEquals(created[0], 'CREATE SCHEMA IF NOT EXISTS "portal"');
  assertEquals(created[1], 'CREATE SCHEMA IF NOT EXISTS "usermgmt"');
});

Deno.test("creates login roles guarded on pg_roles", () => {
  const stmts = buildBootstrapStatements(CFG).join("\n");
  for (const u of ["alp_pg_admin_user", "alp_pg_read_user", "alp_pg_write_user"]) {
    assertEquals(stmts.includes(`WHERE rolname = '${u}'`), true, `missing guard for ${u}`);
  }
  // logtoManager needs CREATEROLE; the others must not have it.
  assertEquals(stmts.includes("CREATEROLE LOGIN ENCRYPTED PASSWORD 'l-pass'"), true);
});

Deno.test("creates the three supabase roles with the documented attributes", () => {
  const stmts = buildBootstrapStatements(CFG).join("\n");
  assertEquals(stmts.includes("CREATE ROLE anon NOLOGIN INHERIT"), true);
  assertEquals(stmts.includes("CREATE ROLE authenticated NOLOGIN INHERIT"), true);
  assertEquals(stmts.includes("CREATE ROLE service_role NOLOGIN INHERIT BYPASSRLS"), true);
});

Deno.test("grants per-schema privileges and default privileges to reader and writer", () => {
  const stmts = buildBootstrapStatements(CFG);
  assertEquals(
    stmts.includes(
      'GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA "portal" TO "alp_pg_write_user"',
    ),
    true,
  );
  assertEquals(
    stmts.includes(
      'ALTER DEFAULT PRIVILEGES FOR ROLE "alp_pg_admin_user" IN SCHEMA "portal" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO "alp_pg_write_user"',
    ),
    true,
  );
  assertEquals(stmts.includes('GRANT USAGE ON SCHEMA "portal" TO "alp_pg_read_user"'), true);
});

Deno.test("grants the manager manage privileges on every schema", () => {
  const stmts = buildBootstrapStatements(CFG);
  for (const schema of ["portal", "usermgmt"]) {
    assertEquals(
      stmts.includes(`GRANT CREATE, USAGE ON SCHEMA "${schema}" TO "alp_pg_admin_user"`),
      true,
      `missing manager schema grant for ${schema}`,
    );
    assertEquals(
      stmts.includes(
        `GRANT ALL ON ALL TABLES IN SCHEMA "${schema}" TO "alp_pg_admin_user" WITH GRANT OPTION`,
      ),
      true,
    );
    assertEquals(
      stmts.includes(
        `ALTER DEFAULT PRIVILEGES FOR ROLE "logto_postgres" IN SCHEMA "${schema}" GRANT ALL ON TABLES TO "alp_pg_admin_user" WITH GRANT OPTION`,
      ),
      true,
    );
  }
});

Deno.test("grants the logtoManager manage privileges with grant option", () => {
  const stmts = buildBootstrapStatements(CFG);
  // Without CREATE/USAGE here alp-logto cannot migrate its own schema.
  assertEquals(
    stmts.includes(
      'GRANT CREATE, USAGE ON SCHEMA "portal" TO "logto_postgres" WITH GRANT OPTION',
    ),
    true,
  );
  assertEquals(
    stmts.includes(
      'GRANT ALL ON ALL SEQUENCES IN SCHEMA "portal" TO "logto_postgres" WITH GRANT OPTION',
    ),
    true,
  );
  assertEquals(
    stmts.includes(
      'ALTER DEFAULT PRIVILEGES FOR ROLE "alp_pg_admin_user" IN SCHEMA "portal" GRANT ALL ON FUNCTIONS TO "logto_postgres" WITH GRANT OPTION',
    ),
    true,
  );
});

Deno.test("grants database-level CREATE before the schema grants land", () => {
  const stmts = buildBootstrapStatements(CFG);
  // alp-logto's seed opens with `create schema if not exists logto`, and
  // Postgres checks CREATE on the database before the IF NOT EXISTS.
  for (const user of ["alp_pg_admin_user", "logto_postgres"]) {
    const grant = `GRANT CREATE ON DATABASE "alp" TO "${user}"`;
    assertEquals(stmts.includes(grant), true, `missing database grant for ${user}`);
    // Downstream services gate on the schema grant, so the database grant has
    // to be in place by the time that one lands.
    assertEquals(
      stmts.indexOf(grant) <
        stmts.findIndex((s) => s.startsWith("CREATE SCHEMA IF NOT EXISTS")),
      true,
    );
  }
});

Deno.test("grants database-level CREATE once when manager and logtoManager are the same role", () => {
  const cfg = structuredClone(CFG);
  cfg.manageUsers.alp.logtoManager = cfg.manageUsers.alp.manager;
  const grants = buildBootstrapStatements(cfg).filter((s) =>
    s.startsWith("GRANT CREATE ON DATABASE")
  );
  assertEquals(grants, ['GRANT CREATE ON DATABASE "alp" TO "alp_pg_admin_user"']);
});

Deno.test("emits no logtoManager grants when it is not configured", () => {
  const cfg = structuredClone(CFG);
  delete cfg.manageUsers.alp.logtoManager;
  delete cfg.manageUsers.alp.logtoManagerPassword;
  const stmts = buildBootstrapStatements(cfg).join("\n");
  assertEquals(stmts.includes("logto_postgres"), false);
});

Deno.test("grants the reader read privileges, not just schema usage", () => {
  const stmts = buildBootstrapStatements(CFG);
  assertEquals(stmts.includes('GRANT SELECT ON ALL TABLES IN SCHEMA "portal" TO "alp_pg_read_user"'), true);
  assertEquals(
    stmts.includes('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA "portal" TO "alp_pg_read_user"'),
    true,
  );
  assertEquals(
    stmts.includes('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA "portal" TO "alp_pg_read_user"'),
    true,
  );
  assertEquals(
    stmts.includes(
      'ALTER DEFAULT PRIVILEGES FOR ROLE "alp_pg_admin_user" IN SCHEMA "portal" GRANT SELECT ON TABLES TO "alp_pg_read_user"',
    ),
    true,
  );
});

Deno.test("a password containing $$ stays inside the dollar-quoted body", () => {
  const cfg = structuredClone(CFG);
  cfg.manageUsers.alp.managerPassword = "pa$$w'ord$$";
  const create = buildBootstrapStatements(cfg).find((s) =>
    s.includes("alp_pg_admin_user") && s.includes("CREATE ROLE")
  );
  assertStringIncludes(create!, "ENCRYPTED PASSWORD 'pa$$w''ord$$'");
  // Exactly the opening and closing tag — the password cannot terminate the body.
  assertEquals(create!.split(DOLLAR_TAG).length - 1, 2);
});

Deno.test("a password containing the dollar-quote tag is rejected", () => {
  const cfg = structuredClone(CFG);
  cfg.manageUsers.alp.managerPassword = `x${DOLLAR_TAG}y`;
  assertThrows(
    () => buildBootstrapStatements(cfg),
    Error,
    DOLLAR_TAG,
  );
});

Deno.test("parseBootstrapConfigFromEnv returns null when config is absent", () => {
  assertEquals(parseBootstrapConfigFromEnv({}), null);
});

Deno.test("parseBootstrapConfigFromEnv reads the three d2e env vars", () => {
  const cfg = parseBootstrapConfigFromEnv({
    POSTGRES_MANAGE_CONFIG: JSON.stringify(CFG.manageConfig),
    POSTGRES_MANAGE_USERS: JSON.stringify(CFG.manageUsers),
    POSTGRES_MANAGE_ROLES_USERS: "{}",
  });
  assertEquals(cfg?.manageUsers.alp.manager, "alp_pg_admin_user");
});

Deno.test("ALTER DEFAULT PRIVILEGES falls back to no-FOR-ROLE when manager is absent", () => {
  const cfgNoManager = {
    manageConfig: {
      databases: { "+alp": { schemas: { "+portal": {} } } },
    },
    manageUsers: {
      alp: {
        reader: "alp_pg_read_user",
        readerPassword: "r-pass",
        writer: "alp_pg_write_user",
        writerPassword: "w-pass",
      },
    },
    grantRolesUsers: {},
  };
  const stmts = buildBootstrapStatements(cfgNoManager);
  assertEquals(
    stmts.includes(
      'ALTER DEFAULT PRIVILEGES IN SCHEMA "portal" GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO "alp_pg_write_user"',
    ),
    true,
  );
});

import { isConcurrentCatalogUpdate, redactStatement, runBootstrapStatements } from "./bootstrap.ts";

Deno.test("runBootstrapStatements executes every statement in order", async () => {
  const seen: string[] = [];
  const count = await runBootstrapStatements(async (sql) => {
    seen.push(sql);
    return await Promise.resolve(null);
  }, CFG);
  assertEquals(count, seen.length);
  assertEquals(seen[0].includes("CREATE ROLE anon"), true);
});

Deno.test("runBootstrapStatements propagates failures (bootstrap is fatal)", async () => {
  let threw = false;
  try {
    await runBootstrapStatements(() => Promise.reject(new Error("boom")), CFG);
  } catch (e) {
    threw = true;
    assertEquals((e as Error).message.includes("boom"), true);
  }
  assertEquals(threw, true);
});

// ── Concurrent catalog update retry ───────────────────────────────────────
// Shape copied from the real failure: node-postgres surfaces the server's
// SQLSTATE on `.code`, and simple_heap_update's message is the discriminator.
function concurrentUpdateError(): Error & { code: string } {
  return Object.assign(new Error("tuple concurrently updated"), { code: "XX000" });
}

Deno.test("isConcurrentCatalogUpdate matches only the concurrent-GRANT error", () => {
  assertEquals(isConcurrentCatalogUpdate(concurrentUpdateError()), true);
  // Same SQLSTATE, different failure — XX000 is internal_error generally.
  assertEquals(
    isConcurrentCatalogUpdate(Object.assign(new Error("could not read block"), { code: "XX000" })),
    false,
  );
  // Same message, different SQLSTATE.
  assertEquals(
    isConcurrentCatalogUpdate(
      Object.assign(new Error("tuple concurrently updated"), { code: "40001" }),
    ),
    false,
  );
  assertEquals(isConcurrentCatalogUpdate(new Error("tuple concurrently updated")), false);
  assertEquals(isConcurrentCatalogUpdate(null), false);
  assertEquals(isConcurrentCatalogUpdate("tuple concurrently updated"), false);
});

Deno.test("runBootstrapStatements retries a concurrent catalog update and continues", async () => {
  const seen: string[] = [];
  const slept: number[] = [];
  let failures = 2;
  const count = await runBootstrapStatements(
    (sql) => {
      seen.push(sql);
      if (seen.length === 1 && failures > 0) {
        failures--;
        seen.pop();
        return Promise.reject(concurrentUpdateError());
      }
      return Promise.resolve(null);
    },
    CFG,
    { sleep: (ms) => { slept.push(ms); return Promise.resolve(); } },
  );
  // Every statement still applied exactly once, in order.
  assertEquals(count, seen.length);
  assertStringIncludes(seen[0], "CREATE ROLE anon");
  // Backoff doubled between the two retries.
  assertEquals(slept, [100, 200]);
});

Deno.test("runBootstrapStatements gives up after the bounded attempts", async () => {
  let calls = 0;
  let threw: unknown = null;
  try {
    await runBootstrapStatements(
      () => { calls++; return Promise.reject(concurrentUpdateError()); },
      CFG,
      { sleep: () => Promise.resolve() },
    );
  } catch (e) {
    threw = e;
  }
  assertEquals(calls, 5);
  assertEquals(isConcurrentCatalogUpdate(threw), true);
});

Deno.test("runBootstrapStatements does not retry any other error", async () => {
  let calls = 0;
  let threw = false;
  try {
    await runBootstrapStatements(
      () => { calls++; return Promise.reject(Object.assign(new Error("boom"), { code: "42501" })); },
      CFG,
      { sleep: () => Promise.resolve() },
    );
  } catch (_e) {
    threw = true;
  }
  assertEquals(calls, 1);
  assertEquals(threw, true);
});

Deno.test("redactStatement keeps passwords out of the retry log", () => {
  const stmt = buildBootstrapStatements(CFG).find((s) => /\bPASSWORD\b/i.test(s));
  if (!stmt) throw new Error("expected a password-bearing statement in the fixture");
  const redacted = redactStatement(stmt);
  assertEquals(redacted.toUpperCase().includes("PASSWORD"), false);
  assertEquals(redacted.includes("m-pass"), false);
  assertStringIncludes(redacted, "alp_pg_admin_user");
  // Redaction never lengthens the statement, and every password-bearing
  // statement in the fixture is covered, not just the first.
  for (const sql of buildBootstrapStatements(CFG).filter((s) => /\bPASSWORD\b/i.test(s))) {
    const r = redactStatement(sql);
    assertEquals(r.toUpperCase().includes("PASSWORD"), false);
    for (const secret of ["m-pass", "r-pass", "w-pass", "l-pass"]) {
      assertEquals(r.includes(secret), false);
    }
  }
  // Short, password-free statements survive intact.
  assertEquals(redactStatement('GRANT ALL ON SCHEMA "portal" TO "x"'), 'GRANT ALL ON SCHEMA "portal" TO "x"');
});
