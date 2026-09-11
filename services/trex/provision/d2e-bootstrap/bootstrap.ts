// d2e-bootstrap/bootstrap.ts
// Replaces the d2e `alp-minerva-pg-mgmt-init` container: provisions the login
// users, supabase roles, schemas and grants that d2e's services expect, using
// trex's superuser DATABASE_URL connection. Every statement is idempotent, so
// this re-runs harmlessly on every boot and against databases the retired
// container already provisioned.

export interface ManageConfig {
  databases: Record<string, { schemas?: Record<string, unknown> }>;
}

export interface ManageUsersEntry {
  manager?: string;
  managerPassword?: string;
  reader?: string;
  readerPassword?: string;
  writer?: string;
  writerPassword?: string;
  logtoManager?: string;
  logtoManagerPassword?: string;
}

export type ManageUsers = Record<string, ManageUsersEntry>;

export interface BootstrapConfig {
  manageConfig: ManageConfig;
  manageUsers: ManageUsers;
  grantRolesUsers: Record<string, string[]>;
}

const NAME_RE = /^[A-Za-z0-9_-]+$/;

/** Quote a Postgres identifier, rejecting anything not name-shaped. Config is
 *  operator-supplied, but a typo must fail loudly rather than splice SQL. */
export function quoteIdent(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(`Invalid SQL identifier: ${name}`);
  }
  return `"${name.replace(/"/g, '""')}"`;
}

/** Quote a Postgres string literal. Passwords cannot be bound as parameters in
 *  CREATE ROLE, so they are escaped here. */
export function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** Tag for the dollar-quoted DO bodies. Dollar quoting is lexical — a bare `$$`
 *  body ends at the FIRST `$$` in the text, single quotes notwithstanding, so a
 *  password containing `$$` would escape the body. A distinctive tag closes
 *  that hole; values containing the tag itself are rejected outright. */
export const DOLLAR_TAG = "$trex_bootstrap$";

function doBlock(body: string): string {
  return `DO ${DOLLAR_TAG} ${body} ${DOLLAR_TAG}`;
}

/** Reject a value that would terminate the dollar-quoted DO body early. */
function assertDollarSafe(what: string, value: string): void {
  if (value.includes(DOLLAR_TAG)) {
    throw new Error(`Invalid ${what}: must not contain ${DOLLAR_TAG}`);
  }
}

/** `+name` / `-name` prefixes mark create/drop intent in d2e's config. */
function stripMarker(name: string): string {
  return name.startsWith("+") || name.startsWith("-") ? name.slice(1) : name;
}

function createLoginRole(user: string, password: string, extra = ""): string {
  assertDollarSafe(`password for role ${user}`, password);
  const attrs = `NOSUPERUSER ${extra}LOGIN ENCRYPTED PASSWORD ${quoteLiteral(password)}`;
  return doBlock(
    `BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${
      quoteLiteral(user)
    }) THEN CREATE ROLE ${quoteIdent(user)} ${attrs}; END IF; END`,
  );
}

function createGroupRole(role: string, attrs: string): string {
  return doBlock(
    `BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ${
      quoteLiteral(role)
    }) THEN CREATE ROLE ${role} ${attrs}; END IF; END`,
  );
}

/** `FOR ROLE` clauses to emit for one ALTER DEFAULT PRIVILEGES grant.
 *  Bootstrap runs as the superuser, so the bare form only covers objects the
 *  superuser creates; the manage roles run the migrations that create the real
 *  tables, hence one clause per other manage role. */
function defaultPrivilegeOwners(creators: string[], self: string): string[] {
  const clauses = [""];
  for (const c of creators) {
    if (c && c !== self) clauses.push(` FOR ROLE ${quoteIdent(c)}`);
  }
  return clauses;
}

/** Mirrors PGUserDAO.grantManagePrivilegesForSchema in the retired
 *  alp-pg-management container: manage rights on the schema plus its current and
 *  future objects. `withGrantOption` is the container's flag — there it gates the
 *  schema-level grant only, the object-level grants always carry the option, and
 *  that is reproduced here so effective privileges are unchanged. */
function manageGrantsForSchema(
  s: string,
  user: string,
  creators: string[],
  withGrantOption: boolean,
): string[] {
  const u = quoteIdent(user);
  const wgo = withGrantOption ? " WITH GRANT OPTION" : "";
  const out = [
    `GRANT CREATE, USAGE ON SCHEMA ${s} TO ${u}${wgo}`,
    `GRANT ALL ON ALL TABLES IN SCHEMA ${s} TO ${u} WITH GRANT OPTION`,
    `GRANT ALL ON ALL FUNCTIONS IN SCHEMA ${s} TO ${u} WITH GRANT OPTION`,
    `GRANT ALL ON ALL SEQUENCES IN SCHEMA ${s} TO ${u} WITH GRANT OPTION`,
  ];
  for (const forRole of defaultPrivilegeOwners(creators, user)) {
    out.push(
      `ALTER DEFAULT PRIVILEGES${forRole} IN SCHEMA ${s} GRANT ALL ON TABLES TO ${u} WITH GRANT OPTION`,
      `ALTER DEFAULT PRIVILEGES${forRole} IN SCHEMA ${s} GRANT ALL ON SEQUENCES TO ${u} WITH GRANT OPTION`,
      `ALTER DEFAULT PRIVILEGES${forRole} IN SCHEMA ${s} GRANT ALL ON FUNCTIONS TO ${u} WITH GRANT OPTION`,
    );
  }
  return out;
}

/** Mirrors PGUserDAO.grantReadPrivilegesForSchema: SELECT on tables, EXECUTE on
 *  functions and sequence read access, for current and future objects. */
function readGrantsForSchema(s: string, user: string, forRole: string): string[] {
  const r = quoteIdent(user);
  return [
    `GRANT USAGE ON SCHEMA ${s} TO ${r}`,
    `GRANT SELECT ON ALL TABLES IN SCHEMA ${s} TO ${r}`,
    `GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${s} TO ${r}`,
    `GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO ${r}`,
    `ALTER DEFAULT PRIVILEGES${forRole} IN SCHEMA ${s} GRANT SELECT ON TABLES TO ${r}`,
    `ALTER DEFAULT PRIVILEGES${forRole} IN SCHEMA ${s} GRANT USAGE, SELECT ON SEQUENCES TO ${r}`,
    `ALTER DEFAULT PRIVILEGES${forRole} IN SCHEMA ${s} GRANT EXECUTE ON FUNCTIONS TO ${r}`,
  ];
}

export function parseBootstrapConfigFromEnv(
  env: Record<string, string | undefined>,
): BootstrapConfig | null {
  const rawConfig = env.POSTGRES_MANAGE_CONFIG;
  const rawUsers = env.POSTGRES_MANAGE_USERS;
  if (!rawConfig || !rawUsers) return null;
  return {
    manageConfig: JSON.parse(rawConfig) as ManageConfig,
    manageUsers: JSON.parse(rawUsers) as ManageUsers,
    grantRolesUsers: JSON.parse(env.POSTGRES_MANAGE_ROLES_USERS || "{}"),
  };
}

export function buildBootstrapStatements(cfg: BootstrapConfig): string[] {
  const out: string[] = [];

  // ── Supabase roles (PostGraphile connects as authenticator and SET ROLEs) ──
  out.push(createGroupRole("anon", "NOLOGIN INHERIT"));
  out.push(createGroupRole("authenticated", "NOLOGIN INHERIT"));
  out.push(createGroupRole("service_role", "NOLOGIN INHERIT BYPASSRLS"));

  for (const dbKey of Object.keys(cfg.manageConfig.databases)) {
    if (!dbKey.startsWith("+")) continue; // only creation scenarios
    const dbName = stripMarker(dbKey).toLowerCase();
    const users = cfg.manageUsers[dbName];
    if (!users) continue;

    // ── Login roles ──────────────────────────────────────────────────────────
    const logins: Array<[string | undefined, string | undefined, string]> = [
      [users.manager, users.managerPassword, ""],
      [users.reader, users.readerPassword, ""],
      [users.writer, users.writerPassword, ""],
      [users.logtoManager, users.logtoManagerPassword, "CREATEROLE "],
    ];
    const seen = new Set<string>();
    for (const [user, password, extra] of logins) {
      if (!user || password === undefined || seen.has(user)) continue;
      seen.add(user);
      out.push(createLoginRole(user, password, extra));
    }

    // ── Role membership: manager gets service_role, reader anon, writer authenticated ──
    if (users.manager) out.push(`GRANT service_role TO ${quoteIdent(users.manager)}`);
    if (users.reader) out.push(`GRANT anon TO ${quoteIdent(users.reader)}`);
    if (users.writer) out.push(`GRANT authenticated TO ${quoteIdent(users.writer)}`);

    // ── Database-level CREATE ────────────────────────────────────────────────
    // `CREATE SCHEMA IF NOT EXISTS` checks CREATE on the database before it
    // checks whether the schema exists, so a service that opens with that
    // statement (alp-logto's seed does) fails even when trex already created
    // the schema for it.
    const db = quoteIdent(dbName);
    for (const user of new Set([users.manager, users.logtoManager])) {
      if (user) out.push(`GRANT CREATE ON DATABASE ${db} TO ${quoteIdent(user)}`);
    }

    // ── Schemas + grants ─────────────────────────────────────────────────────
    const schemas = cfg.manageConfig.databases[dbKey].schemas || {};
    // Roles that create objects in these schemas (they run the migrations).
    const creators = [users.manager, users.logtoManager].filter(
      (u): u is string => Boolean(u),
    );
    for (const schemaKey of Object.keys(schemas)) {
      if (!schemaKey.startsWith("+")) continue;
      const schema = stripMarker(schemaKey).toLowerCase();
      const s = quoteIdent(schema);
      out.push(`CREATE SCHEMA IF NOT EXISTS ${s}`);

      // The manage roles first: without CREATE/USAGE here, a service that owns
      // its own migrations (alp-logto) cannot provision its schema on a fresh
      // database — the schema is owned by the bootstrap superuser.
      if (users.manager) {
        out.push(...manageGrantsForSchema(s, users.manager, creators, false));
      }
      if (users.logtoManager && users.logtoManager !== users.manager) {
        out.push(...manageGrantsForSchema(s, users.logtoManager, creators, true));
      }

      if (users.writer) {
        const w = quoteIdent(users.writer);
        out.push(`GRANT USAGE ON SCHEMA ${s} TO ${w}`);
        out.push(`GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON ALL TABLES IN SCHEMA ${s} TO ${w}`);
        out.push(`GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ${s} TO ${w}`);
        out.push(`GRANT USAGE, UPDATE, SELECT ON ALL SEQUENCES IN SCHEMA ${s} TO ${w}`);
        if (users.manager) {
          const m = quoteIdent(users.manager);
          out.push(`ALTER DEFAULT PRIVILEGES FOR ROLE ${m} IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO ${w}`);
          out.push(`ALTER DEFAULT PRIVILEGES FOR ROLE ${m} IN SCHEMA ${s} GRANT USAGE, UPDATE, SELECT ON SEQUENCES TO ${w}`);
          out.push(`ALTER DEFAULT PRIVILEGES FOR ROLE ${m} IN SCHEMA ${s} GRANT EXECUTE ON FUNCTIONS TO ${w}`);
        } else {
          out.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT SELECT, INSERT, UPDATE, DELETE, TRUNCATE ON TABLES TO ${w}`);
          out.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT USAGE, UPDATE, SELECT ON SEQUENCES TO ${w}`);
          out.push(`ALTER DEFAULT PRIVILEGES IN SCHEMA ${s} GRANT EXECUTE ON FUNCTIONS TO ${w}`);
        }
      }
      if (users.reader && users.reader !== users.writer) {
        const forRole = users.manager ? ` FOR ROLE ${quoteIdent(users.manager)}` : "";
        out.push(...readGrantsForSchema(s, users.reader, forRole));
      }
    }
  }

  // ── Extra role→user grants from POSTGRES_MANAGE_ROLES_USERS ───────────────
  for (const [role, targets] of Object.entries(cfg.grantRolesUsers)) {
    for (const target of targets) {
      out.push(`GRANT ${quoteIdent(role)} TO ${quoteIdent(target)}`);
    }
  }

  return out;
}

// ── Concurrent catalog writers ────────────────────────────────────────────
//
// Postgres offers no lock that serialises two sessions granting on the same
// catalog row. `GRANT ... ON ALL TABLES IN SCHEMA x` rewrites pg_class.relacl
// for every table in the schema, so when a second client touches the same
// tables at the same instant one of the two loses the race and gets
// `XX000 tuple concurrently updated` out of simple_heap_update.
//
// That is not hypothetical: alp-logto's entrypoint runs
// `node packages/core/d2e-grants.mjs`, which grants on all tables in schema
// `logto` to its logto_tenant_* roles, while this bootstrap grants on the same
// tables to alp_pg_admin_user. On a first boot the logto entrypoint waits for
// this bootstrap to create the schema and privileges it polls for, so the two
// are ordered by accident; on a restart those privileges already exist, the
// poll passes immediately and the two run concurrently.
//
// Every statement built above is idempotent, so replaying the loser is safe,
// and retry is the only remedy Postgres offers. Deliberately scoped to exactly
// this error: any other failure still aborts on the first attempt, because a
// half-provisioned database must never reach trex's server.listen.
const CONCURRENT_UPDATE_ATTEMPTS = 5;
const CONCURRENT_UPDATE_BACKOFF_MS = 100;

/** True only for Postgres' `XX000 tuple concurrently updated`. The executor
 *  trex hands us is node-postgres' `pool.query`, which carries the server's
 *  SQLSTATE on `.code`; both halves must match so a different XX000
 *  (internal_error covers more than this) is never retried. */
export function isConcurrentCatalogUpdate(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const { code, message } = err as { code?: unknown; message?: unknown };
  return code === "XX000" && typeof message === "string" &&
    message.includes("tuple concurrently updated");
}

/** Statement text for the retry warning. Role statements carry
 *  `ENCRYPTED PASSWORD <literal>`, so everything from the keyword on is
 *  dropped rather than written to stdout, and the rest is capped — the log
 *  only has to say which statement lost the race. */
export function redactStatement(sql: string): string {
  const cut = sql.search(/\bPASSWORD\b/i);
  const head = cut === -1 ? sql : sql.slice(0, cut);
  const capped = head.slice(0, 120);
  return capped.length < sql.length ? `${capped.trimEnd()} ...` : capped;
}

export interface RunBootstrapOptions {
  /** Total attempts per statement, including the first. */
  attempts?: number;
  /** Delay before the first retry; doubled for each further attempt. */
  backoffMs?: number;
  /** Injectable for tests so they do not pay the real backoff. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Execute the built statements in order. Rejects on the first failure — the
 *  caller treats a bootstrap failure as fatal — except for a concurrent
 *  catalog update, which is retried a bounded number of times first. */
export async function runBootstrapStatements(
  exec: (sql: string) => Promise<unknown>,
  cfg: BootstrapConfig,
  opts: RunBootstrapOptions = {},
): Promise<number> {
  const attempts = opts.attempts ?? CONCURRENT_UPDATE_ATTEMPTS;
  const backoffMs = opts.backoffMs ?? CONCURRENT_UPDATE_BACKOFF_MS;
  const sleep = opts.sleep ?? defaultSleep;
  const statements = buildBootstrapStatements(cfg);
  for (const sql of statements) {
    for (let attempt = 1;; attempt++) {
      try {
        await exec(sql);
        break;
      } catch (err) {
        if (attempt >= attempts || !isConcurrentCatalogUpdate(err)) throw err;
        // Logged, not swallowed: a bootstrap that quietly races another writer
        // on every restart is worth seeing in the boot log.
        console.warn(
          `[d2e-bootstrap] concurrent catalog update on attempt ${attempt}/${attempts}, retrying: ${
            redactStatement(sql)
          }`,
        );
        await sleep(backoffMs * 2 ** (attempt - 1));
      }
    }
  }
  return statements.length;
}
