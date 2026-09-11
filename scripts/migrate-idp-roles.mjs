#!/usr/bin/env node
//
// One-time migration from Logto-held roles to trex application roles.
//
// Two things move: usermgmt's users are re-keyed from the Logto subject id to
// the trex user id, and their group memberships are written into trex as
// application roles. Users are matched between the two stores because they
// share no identifier — which is the whole reason a migration is needed. The
// stores don't even agree on what they're matching: usermgmt has a username,
// trex has an email. See matchTrexUser for the matching rule.
//
// canonicalRoleNames, the ROLES/LOGTO_ROLES/LOGTO_ROLE_NAMES maps, and
// datasetResearcherScopes below are deliberate duplicates of the functions and
// constants of the same behaviour in
// plugins/functions/alp-usermgmt/src/services/UserGroupService.ts and
// plugins/functions/alp-usermgmt/src/const.ts. This script runs under plain
// Node; that package is Deno-only TypeScript (typedi, Deno.env, jsr: imports),
// so it cannot be imported from here. Keep the two copies in sync by hand —
// each is covered by its own tests pinning the same canonical strings.
//
// Dry run by default. --apply writes a rollback file before re-keying anyone
// (see rollbackFilePath), but the role assignments it makes in trex are not
// undone by it.

import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

// ROLES (the internal role constants) and LOGTO_ROLES / LOGTO_ROLE_NAMES (the
// canonical role-name strings) below are deliberate duplicates of
// plugins/functions/alp-usermgmt/src/const.ts. See the file header for why.
const ROLES = {
  ALP_USER_ADMIN: "ALP_USER_ADMIN",
  ALP_SYSTEM_ADMIN: "ALP_SYSTEM_ADMIN",
  ALP_DASHBOARD_VIEWER: "ALP_DASHBOARD_VIEWER",
  ETL_MAPPING_CONTRIBUTOR: "ETL_MAPPING_CONTRIBUTOR",
  TENANT_ADMIN: "TENANT_ADMIN",
  TENANT_VIEWER: "TENANT_VIEWER",
  STUDY_ADMIN: "STUDY_ADMIN",
  STUDY_RESEARCHER: "RESEARCHER",
  STUDY_WRITE_DQD_RESEARCHER: "STUDY_WRITE_DQD_RESEARCHER",
  STUDY_RESULTS_READ_RESEARCHER: "STUDY_RESULTS_READ_RESEARCHER",
  ALP_SHARED: "ALP_SHARED",
};

const LOGTO_ROLES = {
  USER_ADMIN: "role.useradmin",
  SYSTEM_ADMIN: "role.systemadmin",
  DASHBOARD_VIEWER: "role.dashboardviewer",
  TENANT_VIEWER: "role.viewer",
  RESEARCHER: "role.researcher",
  JOB_RUNNER: "role.jobrunner",
  STUDY_RESULTS_READER: "role.studyresultsreader",
  ETL_MAPPING_CONTRIBUTOR: "role.etlmappingcontributor",
};

// Internal ROLES.* -> canonical role.* name. Roles with no entry here
// (TENANT_ADMIN, STUDY_ADMIN, ALP_SHARED) fall back to their raw name, exactly
// as LOGTO_ROLE_NAMES[role] || role does in UserGroupService.ts.
const LOGTO_ROLE_NAMES = {
  [ROLES.ALP_USER_ADMIN]: LOGTO_ROLES.USER_ADMIN,
  [ROLES.ALP_SYSTEM_ADMIN]: LOGTO_ROLES.SYSTEM_ADMIN,
  [ROLES.ALP_DASHBOARD_VIEWER]: LOGTO_ROLES.DASHBOARD_VIEWER,
  [ROLES.TENANT_VIEWER]: LOGTO_ROLES.TENANT_VIEWER,
  [ROLES.STUDY_RESEARCHER]: LOGTO_ROLES.RESEARCHER,
  [ROLES.STUDY_WRITE_DQD_RESEARCHER]: LOGTO_ROLES.JOB_RUNNER,
  [ROLES.STUDY_RESULTS_READ_RESEARCHER]: LOGTO_ROLES.STUDY_RESULTS_READER,
  [ROLES.ETL_MAPPING_CONTRIBUTOR]: LOGTO_ROLES.ETL_MAPPING_CONTRIBUTOR,
};

// Kebab-case because Logto rejected spaces in scope names; trex stores the
// canonical sec_role names directly. Mirrors WEBAPI_RESEARCHER_SCOPES in
// plugins/functions/alp-usermgmt/src/const.ts.
const WEBAPI_RESEARCHER_SCOPES = ["cohort-reader", "cohort-creator", "concept-set-creator"];

// Mirrors sourceUserScopeName in plugins/functions/alp-usermgmt/src/const.ts.
function sourceUserScopeName(datasetId) {
  return `source-user-${datasetId}`;
}

// Mirrors datasetResearcherScopes in plugins/functions/alp-usermgmt/src/const.ts.
function datasetResearcherScopes(roleName, datasetId, type) {
  const scopes = [roleName, `role.researcher.${datasetId}`];
  if (type === "webapi") {
    scopes.push(sourceUserScopeName(datasetId), ...WEBAPI_RESEARCHER_SCOPES);
  }
  return scopes;
}

// LOGTO__ROLES_SCOPES (docker-compose.yml) paired these Logto roles with extra
// scopes that are webapi.sec_role names in their own right, not Logto/trex
// role names. That pairing lived only in Logto's configuration, so it has to
// be reproduced here for those names to keep reaching WebAPI. Mirrors
// IMPLIED_CANONICAL_ROLES in
// plugins/functions/alp-usermgmt/src/services/UserGroupService.ts.
const IMPLIED_CANONICAL_ROLES = {
  "role.systemadmin": ["admin"],
  "role.viewer": ["anonymous"],
};

/**
 * The canonical names one group grants, from its role and scope pair.
 *
 * Mirrors canonicalRoleNames in
 * plugins/functions/alp-usermgmt/src/services/UserGroupService.ts. See the
 * file header for why this is a duplicate rather than a shared import.
 */
export function canonicalRoleNames(role, scopes) {
  const sourceUser = /^source-user-(.+)$/;
  const kebab = {
    "cohort-reader": "cohort reader",
    "cohort-creator": "cohort creator",
    "concept-set-creator": "concept set creator",
  };

  const expand = (name) => {
    const match = sourceUser.exec(name);
    if (match) return `Source user (${match[1]})`;
    // Unknown scopes pass through: a name nothing maps is recoverable, a
    // dropped grant is not.
    return kebab[name] ?? name;
  };

  const input = [role, ...scopes];
  const implied = input.flatMap((name) => IMPLIED_CANONICAL_ROLES[name] ?? []);

  return [...new Set([...input, ...implied].map(expand))];
}

/**
 * Reconstructs the {role, scopes} pair buildLogtoRoleName (UserGroupService.ts)
 * derives per group, for a group row read from usermgmt.user_group /
 * usermgmt.b2c_group. usermgmt.user_group has no scopes column — scopes are
 * computed here from the dataset a RESEARCHER group is scoped to, exactly as
 * buildLogtoRoleName does via a dataset lookup, rather than read from a column
 * that does not exist.
 *
 * The role name itself goes through LOGTO_ROLE_NAMES first, same as
 * buildLogtoRoleName: a dataset-scoped researcher group is
 * "role.researcher.<tokenDatasetCode>", not "RESEARCHER.<tokenDatasetCode>" —
 * ROLES.STUDY_RESEARCHER is the internal value stored in b2c_group.role, but
 * LOGTO_ROLES.RESEARCHER ("role.researcher") is the name trex actually stores.
 *
 * Returns null when a RESEARCHER group's dataset cannot be resolved, matching
 * buildLogtoRoleName's own skip-and-warn behaviour — such a group contributes
 * no role assignment rather than one built from missing data.
 */
export function buildGroupRoleAndScopes(group, datasetsById) {
  const logtoRole = LOGTO_ROLE_NAMES[group.role] || group.role;

  if (group.role === ROLES.STUDY_RESEARCHER && group.studyId) {
    const dataset = datasetsById.get(group.studyId);
    if (!dataset?.tokenDatasetCode) {
      return null;
    }
    const role = `${logtoRole}.${dataset.tokenDatasetCode}`;
    return { role, scopes: datasetResearcherScopes(role, group.studyId, dataset.type) };
  }
  return { role: logtoRole, scopes: [logtoRole] };
}

function normalize(value) {
  return String(value ?? "").trim().toLowerCase();
}

function localPart(email) {
  const s = normalize(email);
  const at = s.indexOf("@");
  return at === -1 ? s : s.slice(0, at);
}

/**
 * Matches one usermgmt user against the trex users, by usermgmt's username
 * (misleadingly carried in the `email` field — see planMigration's doc) since
 * the two stores share no identifier and don't even agree on what they're
 * matching: usermgmt has a username, trex has an email.
 *
 * 1. Exact, case-insensitive match of the username against a trex email.
 * 2. Failing that, case-insensitive match of the username against the local
 *    part of a trex email (before the @) — covers 'admin' matching
 *    'admin@trex.local'.
 * 3. If step 2 yields more than one candidate, this is not a match: returns
 *    { ambiguous: [...candidate emails] } rather than guessing. Assigning one
 *    person's roles to another is worse than assigning nobody's.
 *
 * Returns { trexUser } | { ambiguous: string[] } | null (no match at all).
 */
export function matchTrexUser(username, byEmail, byLocalPart) {
  const key = normalize(username);

  const exact = byEmail.get(key);
  if (exact) return { trexUser: exact };

  const candidates = byLocalPart.get(key) ?? [];
  if (candidates.length === 1) return { trexUser: candidates[0] };
  if (candidates.length > 1) {
    return { ambiguous: candidates.map((u) => u.email) };
  }
  return null;
}

function indexTrexUsers(trexUsers) {
  const byEmail = new Map(trexUsers.map((u) => [normalize(u.email), u]));
  const byLocalPart = new Map();
  for (const u of trexUsers) {
    const key = localPart(u.email);
    if (!key) continue;
    if (!byLocalPart.has(key)) byLocalPart.set(key, []);
    byLocalPart.get(key).push(u);
  }
  return { byEmail, byLocalPart };
}

/**
 * Plans the migration: which usermgmt users need re-keying to their trex user
 * id, which role assignments their existing groups translate to, which
 * usermgmt users have no matching trex account at all, and which usermgmt
 * users matched more than one trex account and were migrated for neither.
 *
 * usermgmtUsers: [{ id, email, idpUserId }] — `email` here is usermgmt's
 *   username column; it is named `email` for continuity with earlier drafts
 *   of this planner and because the exact-match path treats it as one. See
 *   matchTrexUser for the actual matching rule.
 * trexUsers: [{ id, email }]
 * groups: [{ userId, role, scopes? }] — one entry per usermgmt.user_group row,
 *   userId is the usermgmt user id, scopes already resolved (see
 *   buildGroupRoleAndScopes).
 */
export function planMigration(usermgmtUsers, trexUsers, groups) {
  const { byEmail, byLocalPart } = indexTrexUsers(trexUsers);

  const rekey = [];
  const assign = [];
  const unmatched = [];
  const ambiguous = [];

  for (const user of usermgmtUsers) {
    const match = matchTrexUser(user.email, byEmail, byLocalPart);

    if (!match) {
      unmatched.push(user.email);
      continue;
    }
    if (match.ambiguous) {
      ambiguous.push({ email: user.email, candidates: match.ambiguous });
      continue;
    }

    const trexUser = match.trexUser;

    // Skip users already pointing at trex so the command can be re-run after a
    // partial failure without producing spurious changes.
    if (user.idpUserId !== trexUser.id) {
      rekey.push({ id: user.id, email: user.email, from: user.idpUserId, to: trexUser.id });
    }

    for (const group of groups.filter((g) => g.userId === user.id)) {
      // Every name the group granted, not just its role: the scopes carried
      // authorization too, and are what webapi.sec_external_role_map matches.
      for (const role of canonicalRoleNames(group.role, group.scopes ?? [])) {
        assign.push({ email: user.email, userId: trexUser.id, role });
      }
    }
  }

  return { rekey, assign, unmatched, ambiguous };
}

// Thrown for a failure this script cannot fix by itself — the stack isn't
// reachable, or trex rejected a call because of that. Caught at the top level
// and reported as a short message, never a raw stack trace: an operator
// running a tool that rewrites identity keys should never have to read
// execFileSync internals to find out docker isn't running.
class EnvironmentError extends Error {}

function escapeSqlLiteral(value) {
  return String(value).replace(/'/g, "''");
}

function psqlContainer() {
  return `${process.env.PROJECT_NAME || "d2e"}-minerva-postgres-1`;
}

function psqlArgs(extra) {
  const database = process.env.PG_DB_NAME || "alp";
  const user = process.env.PG_SUPER_USER || "postgres";
  return ["exec", psqlContainer(), "psql", "-h", "localhost", "-U", user, "-d", database, ...extra];
}

function dbEnvironmentError(cause) {
  const container = psqlContainer();
  const detail = String(cause?.stderr ?? cause?.message ?? "").trim();
  return new EnvironmentError(
    `Could not reach the Postgres container "${container}". ` +
      `Make sure the d2e stack is running and that PROJECT_NAME matches it ` +
      `(currently "${process.env.PROJECT_NAME || "d2e"}").` +
      (detail ? `\n(${detail})` : ""),
  );
}

// Runs a read-only query and returns its rows as parsed JSON. Wraps the query
// so a single psql invocation always yields exactly one JSON array, empty rows
// included, regardless of the underlying result shape.
function queryJson(sql) {
  const wrapped = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (${sql}) t;`;
  try {
    const out = execFileSync("docker", psqlArgs(["-tAc", wrapped]), { encoding: "utf-8" });
    return JSON.parse(out.trim() || "[]");
  } catch (err) {
    throw dbEnvironmentError(err);
  }
}

function execSql(sql) {
  try {
    execFileSync("docker", psqlArgs(["-c", sql]), { stdio: "inherit" });
  } catch (err) {
    throw dbEnvironmentError(err);
  }
}

/**
 * Provision a d2e user into trex.
 *
 * The password is random and is never reported: it exists only so the account
 * row is complete. These users authenticate through whatever flow the
 * deployment configures, and must reset before any password login works --
 * migrating Logto's hashes is not possible, they use a different scheme.
 */
async function createTrexUser(email) {
  const baseUrl = process.env.TREX__ADMIN_URL;
  if (!baseUrl) {
    throw new EnvironmentError("TREX__ADMIN_URL is not set; cannot create users in trex.");
  }
  // .../trex/admin/roles -> .../trex/auth/v1/admin/users
  const usersUrl = baseUrl.replace(/\/admin\/roles\/?$/, "/auth/v1/admin/users");
  const password = `${crypto.randomUUID()}${crypto.randomUUID().toUpperCase()}!1`;

  let res;
  try {
    res = await fetch(usersUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TREX__SERVICE_ROLE_KEY ?? ""}`,
      },
      body: JSON.stringify({ email, password, data: { provisionedFrom: "d2e-usermgmt" } }),
    });
  } catch (err) {
    throw new EnvironmentError(
      `Could not reach trex at ${usersUrl}.\n(${err?.message ?? err})`,
    );
  }
  if (!res.ok) {
    throw new EnvironmentError(
      `trex rejected user creation for "${email}": HTTP ${res.status} ${await res.text()}`,
    );
  }
  const body = await res.json().catch(() => null);
  if (!body?.id) {
    throw new EnvironmentError(`trex created "${email}" but returned no id`);
  }
  return body.id;
}

async function assignRole(userId, role) {
  const baseUrl = process.env.TREX__ADMIN_URL;
  if (!baseUrl) {
    throw new EnvironmentError("TREX__ADMIN_URL is not set; cannot assign roles in trex.");
  }
  let res;
  try {
    res = await fetch(`${baseUrl}/assign`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.TREX__SERVICE_ROLE_KEY ?? ""}`,
      },
      body: JSON.stringify({ userId, role }),
    });
  } catch (err) {
    throw new EnvironmentError(
      `Could not reach trex at ${baseUrl}. Make sure the d2e stack is running and ` +
        `TREX__ADMIN_URL is correct.\n(${err?.message ?? err})`,
    );
  }
  if (!res.ok) {
    throw new EnvironmentError(
      `trex rejected role assignment for user ${userId}, role "${role}": HTTP ${res.status}`,
    );
  }
}

function printPlan(plan) {
  console.log(`\nRe-key (${plan.rekey.length}):`);
  for (const r of plan.rekey) {
    console.log(`  ${r.email}: ${r.from ?? "(none)"} -> ${r.to}`);
  }
  console.log(`\nRole assignments (${plan.assign.length}):`);
  for (const a of plan.assign) {
    console.log(`  ${a.email} (${a.userId}): ${a.role}`);
  }
  console.log(`\nUnmatched usermgmt users, no trex account found (${plan.unmatched.length}):`);
  for (const email of plan.unmatched) {
    console.log(`  ${email}`);
  }
  console.log(
    `\nAmbiguous usermgmt users, more than one candidate trex account and migrated for none (${plan.ambiguous.length}):`,
  );
  for (const a of plan.ambiguous) {
    console.log(`  ${a.email}: candidates ${a.candidates.join(", ")}`);
  }
  if (plan.rekey.length > 0) {
    console.log(
      `\n--apply will write a rollback file (idp-rekey-<timestamp>.json) recording ` +
        `{ username, from, to } for every user above before re-keying any of them.`,
    );
  }
}

// One JSON array of { username, from, to } per re-keyed user, named with the
// UTC time the run started so repeated runs never collide. Written before the
// first UPDATE — an admin who needs to reverse the re-key later has the old
// idp_user_id for every affected user, without usermgmt owning a metadata
// column purely to hold it.
function rollbackFilePath() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  return resolve(process.cwd(), `idp-rekey-${timestamp}.json`);
}

export function rollbackRows(rekey) {
  return rekey.map((r) => ({ username: r.email, id: r.id, from: r.from, to: r.to }));
}

function writeRollbackFile(filePath, rekey) {
  writeFileSync(filePath, JSON.stringify(rollbackRows(rekey), null, 2));
}

async function runMigrationUnsafe({ apply, createMissing }) {
  const usermgmtUsers = queryJson(
    `SELECT id, username AS email, idp_user_id AS "idpUserId" FROM usermgmt."user"`,
  );
  const trexUsers = queryJson(`SELECT id, email FROM trexdb."user"`);
  const groupRows = queryJson(`
    SELECT ug.user_id AS "userId", bg.role AS role, bg.study_id AS "studyId"
    FROM usermgmt.user_group ug
    JOIN usermgmt.b2c_group bg ON bg.id = ug.b2c_group_id
    WHERE bg.role IS NOT NULL
  `);
  const datasetRows = queryJson(
    `SELECT id, token_dataset_code AS "tokenDatasetCode", type FROM portal.dataset`,
  );
  const datasetsById = new Map(datasetRows.map((d) => [d.id, d]));

  const groups = [];
  for (const group of groupRows) {
    const built = buildGroupRoleAndScopes(group, datasetsById);
    if (!built) {
      console.warn(
        `Skipping group for usermgmt user ${group.userId}: role "${group.role}" has no resolvable dataset (studyId=${group.studyId})`,
      );
      continue;
    }
    groups.push({ userId: group.userId, role: built.role, scopes: built.scopes });
  }

  let plan = planMigration(usermgmtUsers, trexUsers, groups);
  printPlan(plan);

  if (!apply) {
    console.log("\nDry run only. Re-run with --apply to perform these changes.");
    return plan;
  }

  if (createMissing && plan.unmatched.length > 0) {
    // Creating accounts is opt-in: it grants people access to a system they
    // could not reach before, which is not something a role migration should do
    // silently. Re-plan afterwards so the new users pick up their re-key and
    // roles in this same run.
    console.log(`\nCreating ${plan.unmatched.length} trex account(s)...`);
    for (const email of plan.unmatched) {
      const id = await createTrexUser(email);
      console.log(`  created ${email} -> ${id}`);
      trexUsers.push({ id, email });
    }
    plan = planMigration(usermgmtUsers, trexUsers, groups);
    console.log("\nRe-planned after provisioning:");
    printPlan(plan);
  }

  console.log(`\nApplying ${plan.assign.length} role assignment(s)...`);
  for (const a of plan.assign) {
    await assignRole(a.userId, a.role);
  }

  console.log(`Applying ${plan.rekey.length} re-key(s)...`);
  let rollbackPath = null;
  if (plan.rekey.length > 0) {
    // Written before the first UPDATE: usermgmt owns its own table's schema
    // (migrations, ORM) and this CLI must not alter it, so the previous
    // idp_user_id is preserved out-of-band instead of in a new column.
    rollbackPath = rollbackFilePath();
    writeRollbackFile(rollbackPath, plan.rekey);
  }
  for (const r of plan.rekey) {
    execSql(`
      UPDATE usermgmt."user"
         SET idp_user_id = '${escapeSqlLiteral(r.to)}'
       WHERE id = '${escapeSqlLiteral(r.id)}'
    `);
  }
  if (rollbackPath) {
    console.log(`\nWrote rollback file: ${rollbackPath}`);
  }

  console.log("\nMigration complete.");
  return plan;
}

/**
 * Reads the current state of usermgmt and trex, plans the migration, prints
 * it, and — only with apply: true — performs it: role assignments first, then
 * the re-key, so a run that fails partway leaves affected users still on
 * Logto with some roles already copied (recoverable by re-running) rather than
 * on trex with none (locked out).
 *
 * An environmental failure (docker/postgres unreachable, trex unreachable or
 * rejecting the call) is reported as a short message and exits the process
 * with status 1 — not a raw stack trace — regardless of whether this was
 * invoked from the CLI or run standalone.
 */
export async function runMigration({ apply = false, createMissing = false } = {}) {
  try {
    return await runMigrationUnsafe({ apply, createMissing });
  } catch (err) {
    if (err instanceof EnvironmentError) {
      console.error(`\n${err.message}`);
      process.exit(1);
    }
    throw err;
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1]}`;
if (isMainModule) {
  const apply = process.argv.slice(2).includes("--apply");
  const createMissing = process.argv.slice(2).includes("--create-missing-users");
  runMigration({ apply, createMissing }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
