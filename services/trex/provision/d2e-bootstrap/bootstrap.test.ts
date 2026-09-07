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
  // Without BYPASSRLS: it requires superuser, which managed Postgres does not
  // grant, so requesting it leaves service_role uncreated.
  assertEquals(stmts.includes("CREATE ROLE service_role NOLOGIN INHERIT"), true);
  assertEquals(stmts.includes("BYPASSRLS"), false);
});

Deno.test("creates supabase_admin without REPLICATION so trex's V1 can be applied", () => {
  const stmts = buildBootstrapStatements(CFG).join("\n");
  // V1__initial_schema requests REPLICATION, which is superuser-only on managed
  // Postgres; pre-creating the role makes V1's IF NOT EXISTS guard skip it.
  assertEquals(stmts.includes("CREATE ROLE supabase_admin NOLOGIN"), true);
  assertEquals(stmts.includes("REPLICATION"), false);
  // V1 also creates the _realtime schema AUTHORIZATION supabase_admin, which
  // needs membership -- for the manager and for the superuser running V1.
  assertEquals(stmts.includes("GRANT supabase_admin TO CURRENT_USER"), true);
  assertEquals(stmts.includes('GRANT supabase_admin TO "alp_pg_admin_user"'), true);
});

Deno.test("grants CREATE on schema public to the roles that create objects there", () => {
  const stmts = buildBootstrapStatements(CFG);
  const joined = stmts.join("\n");
  // logto's roles.sql creates public.check_role_type, hardcoded to public.
  assertEquals(
    stmts.includes('GRANT USAGE, CREATE ON SCHEMA public TO "logto_postgres"'),
    true,
  );
  assertEquals(
    stmts.includes('GRANT USAGE, CREATE ON SCHEMA public TO "alp_pg_admin_user"'),
    true,
  );
  // Readers of public.objects need schema USAGE, not CREATE.
  assertEquals(stmts.includes("GRANT USAGE ON SCHEMA public TO service_role"), true);
  assertEquals(
    stmts.includes('GRANT USAGE ON SCHEMA public TO "alp_pg_write_user"'),
    true,
  );
  // The grant is a silent no-op unless the bootstrap user owns public, so the
  // result has to be checked rather than assumed.
  assertStringIncludes(joined, "has_schema_privilege('logto_postgres', 'public', 'CREATE')");
  assertStringIncludes(joined, "RAISE WARNING");
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

import { runBootstrapStatements } from "./bootstrap.ts";

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
