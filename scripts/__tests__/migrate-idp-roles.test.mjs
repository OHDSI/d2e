import { assertEquals, assertMatch } from "jsr:@std/assert";
import {
  buildGroupRoleAndScopes,
  canonicalRoleNames,
  matchTrexUser,
  planMigration,
  rollbackRows,
} from "../migrate-idp-roles.mjs";

Deno.test("matches users by email and plans a re-key plus role assignments", () => {
  const plan = planMigration(
    [{ id: "um-1", email: "a@x.test", idpUserId: "logto-a" }],
    [{ id: "trex-a", email: "a@x.test" }],
    [{ userId: "um-1", role: "USER_ADMIN" }],
  );
  assertEquals(plan.rekey, [{ id: "um-1", email: "a@x.test", from: "logto-a", to: "trex-a" }]);
  assertEquals(plan.assign, [{ email: "a@x.test", userId: "trex-a", role: "USER_ADMIN" }]);
  assertEquals(plan.unmatched, []);
});

Deno.test("a user with no trex account is reported, never guessed at", () => {
  const plan = planMigration(
    [{ id: "um-1", email: "gone@x.test", idpUserId: "logto-a" }],
    [],
    [{ userId: "um-1", role: "USER_ADMIN" }],
  );
  assertEquals(plan.unmatched, ["gone@x.test"]);
  assertEquals(plan.rekey, []);
  assertEquals(plan.assign, []);
});

Deno.test("email matching ignores case, which the two stores disagree on", () => {
  const plan = planMigration(
    [{ id: "um-1", email: "A@X.test", idpUserId: "logto-a" }],
    [{ id: "trex-a", email: "a@x.TEST" }],
    [],
  );
  assertEquals(plan.rekey.length, 1);
});

Deno.test("a user already re-keyed is left alone, so the run is repeatable", () => {
  const plan = planMigration(
    [{ id: "um-1", email: "a@x.test", idpUserId: "trex-a" }],
    [{ id: "trex-a", email: "a@x.test" }],
    [],
  );
  assertEquals(plan.rekey, []);
});

// --- canonicalRoleNames: this file's own copy, must behave like the one in
// UserGroupService.ts (pinned there by that package's own tests).

Deno.test("an unscoped role is stored under its own name", () => {
  assertEquals(canonicalRoleNames("USER_ADMIN", ["USER_ADMIN"]), ["USER_ADMIN"]);
});

Deno.test("kebab scopes become the sec_role names they stood for", () => {
  const names = canonicalRoleNames("RESEARCHER.Demo", [
    "RESEARCHER.Demo",
    "role.researcher.7dffaaeb-c3cd-434c-bd2c-08cb34267acc",
    "source-user-7dffaaeb-c3cd-434c-bd2c-08cb34267acc",
    "cohort-reader",
    "cohort-creator",
    "concept-set-creator",
  ]);
  assertEquals(names, [
    "RESEARCHER.Demo",
    "role.researcher.7dffaaeb-c3cd-434c-bd2c-08cb34267acc",
    "Source user (7dffaaeb-c3cd-434c-bd2c-08cb34267acc)",
    "cohort reader",
    "cohort creator",
    "concept set creator",
  ]);
});

Deno.test("names are unique and keep their order", () => {
  assertEquals(canonicalRoleNames("USER_ADMIN", ["USER_ADMIN", "USER_ADMIN"]), ["USER_ADMIN"]);
});

Deno.test("an unrecognised scope is passed through untouched", () => {
  assertEquals(canonicalRoleNames("X", ["X", "some-future-scope"]), ["X", "some-future-scope"]);
});

// --- LOGTO__ROLES_SCOPES fan-out: this file's own copy, must behave like the
// one in UserGroupService.ts (pinned there by that package's own tests).

Deno.test("role.systemadmin also grants the WebAPI admin role", () => {
  assertEquals(canonicalRoleNames("role.systemadmin", ["role.systemadmin"]), [
    "role.systemadmin",
    "admin",
  ]);
});

Deno.test("role.viewer also grants the WebAPI anonymous role", () => {
  assertEquals(canonicalRoleNames("role.viewer", ["role.viewer"]), [
    "role.viewer",
    "anonymous",
  ]);
});

Deno.test("the researcher expansion is unaffected by the fan-out and still yields its full six names", () => {
  const names = canonicalRoleNames("RESEARCHER.Demo", [
    "RESEARCHER.Demo",
    "role.researcher.7dffaaeb-c3cd-434c-bd2c-08cb34267acc",
    "source-user-7dffaaeb-c3cd-434c-bd2c-08cb34267acc",
    "cohort-reader",
    "cohort-creator",
    "concept-set-creator",
  ]);
  assertEquals(names, [
    "RESEARCHER.Demo",
    "role.researcher.7dffaaeb-c3cd-434c-bd2c-08cb34267acc",
    "Source user (7dffaaeb-c3cd-434c-bd2c-08cb34267acc)",
    "cohort reader",
    "cohort creator",
    "concept set creator",
  ]);
});

// --- buildGroupRoleAndScopes: reconstructs the {role, scopes} pair that
// usermgmt.user_group cannot store directly, since it has no scopes column.
// The role name goes through the same LOGTO_ROLE_NAMES map buildLogtoRoleName
// (UserGroupService.ts) uses — trex stores "role.useradmin", not "ALP_USER_ADMIN".

Deno.test("an unscoped group maps to its LOGTO_ROLE_NAMES entry", () => {
  const built = buildGroupRoleAndScopes({ role: "ALP_USER_ADMIN", studyId: null }, new Map());
  assertEquals(built, { role: "role.useradmin", scopes: ["role.useradmin"] });
});

Deno.test("a role with no LOGTO_ROLE_NAMES entry falls back to its raw name", () => {
  // TENANT_ADMIN, STUDY_ADMIN and ALP_SHARED are not in the map, same as
  // LOGTO_ROLE_NAMES[role] || role in UserGroupService.ts.
  const built = buildGroupRoleAndScopes({ role: "STUDY_ADMIN", studyId: null }, new Map());
  assertEquals(built, { role: "STUDY_ADMIN", scopes: ["STUDY_ADMIN"] });
});

Deno.test("a dataset-scoped researcher group expands to the full scope set for a webapi dataset", () => {
  const datasetsById = new Map([
    ["ds-1", { id: "ds-1", tokenDatasetCode: "Demo", type: "webapi" }],
  ]);
  const built = buildGroupRoleAndScopes({ role: "RESEARCHER", studyId: "ds-1" }, datasetsById);
  // "role.researcher.<code>", not "RESEARCHER.<code>": LOGTO_ROLES.RESEARCHER
  // is the canonical name trex stores, ROLES.STUDY_RESEARCHER ("RESEARCHER")
  // is only the internal value in b2c_group.role.
  assertEquals(built.role, "role.researcher.Demo");
  assertEquals(built.scopes, [
    "role.researcher.Demo",
    "role.researcher.ds-1",
    "source-user-ds-1",
    "cohort-reader",
    "cohort-creator",
    "concept-set-creator",
  ]);
});

Deno.test("a non-webapi dataset gets the base researcher scopes only", () => {
  const datasetsById = new Map([
    ["ds-1", { id: "ds-1", tokenDatasetCode: "Demo", type: "hana" }],
  ]);
  const built = buildGroupRoleAndScopes({ role: "RESEARCHER", studyId: "ds-1" }, datasetsById);
  assertEquals(built.scopes, ["role.researcher.Demo", "role.researcher.ds-1"]);
});

Deno.test("a researcher group whose dataset cannot be resolved is skipped, not guessed at", () => {
  assertEquals(buildGroupRoleAndScopes({ role: "RESEARCHER", studyId: "missing" }, new Map()), null);
  assertEquals(
    buildGroupRoleAndScopes(
      { role: "RESEARCHER", studyId: "ds-1" },
      new Map([["ds-1", { id: "ds-1", tokenDatasetCode: null, type: "webapi" }]]),
    ),
    null,
  );
});

// --- End-to-end: a researcher group's full scope set must all reach assign(),
// not just the group's own role — this is the failure the migration exists to
// prevent.

Deno.test("a researcher group contributes every canonical name it grants, not just its role", () => {
  const datasetsById = new Map([
    ["ds-1", { id: "ds-1", tokenDatasetCode: "Demo", type: "webapi" }],
  ]);
  const built = buildGroupRoleAndScopes({ role: "RESEARCHER", studyId: "ds-1" }, datasetsById);
  const plan = planMigration(
    [{ id: "um-1", email: "a@x.test", idpUserId: "logto-a" }],
    [{ id: "trex-a", email: "a@x.test" }],
    [{ userId: "um-1", role: built.role, scopes: built.scopes }],
  );
  assertEquals(
    plan.assign.map((a) => a.role),
    [
      "role.researcher.Demo",
      "role.researcher.ds-1",
      "Source user (ds-1)",
      "cohort reader",
      "cohort creator",
      "concept set creator",
    ],
  );
});

// --- rollbackRows: the content written to the rollback file before the
// re-key. Written out-of-band because usermgmt owns its own table's schema —
// this CLI must not add a column to it to hold the previous idp_user_id.

Deno.test("rollback rows carry username/id/from/to for every re-keyed user, nothing else", () => {
  const rows = rollbackRows([
    { id: "um-1", email: "a@x.test", from: "logto-a", to: "trex-a" },
    { id: "um-2", email: "b@x.test", from: null, to: "trex-b" },
  ]);
  assertEquals(rows, [
    { username: "a@x.test", id: "um-1", from: "logto-a", to: "trex-a" },
    { username: "b@x.test", id: "um-2", from: null, to: "trex-b" },
  ]);
});

Deno.test("an empty rekey plan produces an empty rollback file, not one entry per usermgmt user", () => {
  assertEquals(rollbackRows([]), []);
});

Deno.test("rollback rows serialise to valid, re-parseable JSON", () => {
  const json = JSON.stringify(
    rollbackRows([{ id: "um-1", email: "a@x.test", from: "logto-a", to: "trex-a" }]),
    null,
    2,
  );
  assertMatch(json, /"username": "a@x\.test"/);
  assertEquals(JSON.parse(json), [
    { username: "a@x.test", id: "um-1", from: "logto-a", to: "trex-a" },
  ]);
});

// --- matchTrexUser: usermgmt keys users by username, trex keys them by
// email — the stores don't even agree on what they're matching, so this is
// tested directly, not just through planMigration.

function indexed(trexUsers) {
  const byEmail = new Map(trexUsers.map((u) => [u.email.toLowerCase(), u]));
  const byLocalPart = new Map();
  for (const u of trexUsers) {
    const key = u.email.toLowerCase().split("@")[0];
    if (!byLocalPart.has(key)) byLocalPart.set(key, []);
    byLocalPart.get(key).push(u);
  }
  return { byEmail, byLocalPart };
}

Deno.test("step 1: an exact, case-insensitive match against a trex email wins outright", () => {
  const { byEmail, byLocalPart } = indexed([{ id: "trex-a", email: "A@X.test" }]);
  assertEquals(matchTrexUser("a@x.test", byEmail, byLocalPart), {
    trexUser: { id: "trex-a", email: "A@X.test" },
  });
});

Deno.test("step 2: a username matches the local part of a trex email, live-data shape", () => {
  // The case this migration exists to handle: usermgmt username = 'admin',
  // trex email = 'admin@trex.local'. No exact match, but exactly one
  // local-part candidate.
  const { byEmail, byLocalPart } = indexed([{ id: "trex-a", email: "admin@trex.local" }]);
  assertEquals(matchTrexUser("admin", byEmail, byLocalPart), {
    trexUser: { id: "trex-a", email: "admin@trex.local" },
  });
});

Deno.test("step 3: two trex emails sharing a local part make the user ambiguous, not matched", () => {
  const { byEmail, byLocalPart } = indexed([
    { id: "trex-a", email: "admin@trex.local" },
    { id: "trex-b", email: "admin@other.test" },
  ]);
  assertEquals(matchTrexUser("admin", byEmail, byLocalPart), {
    ambiguous: ["admin@trex.local", "admin@other.test"],
  });
});

Deno.test("no exact match and no local-part match at all is unmatched, not ambiguous", () => {
  const { byEmail, byLocalPart } = indexed([{ id: "trex-a", email: "someone-else@trex.local" }]);
  assertEquals(matchTrexUser("admin", byEmail, byLocalPart), null);
});

Deno.test("an ambiguous user is migrated for nothing: no rekey, no assign, reported separately from unmatched", () => {
  const plan = planMigration(
    [{ id: "um-1", email: "admin", idpUserId: "logto-admin" }],
    [
      { id: "trex-a", email: "admin@trex.local" },
      { id: "trex-b", email: "admin@other.test" },
    ],
    [{ userId: "um-1", role: "USER_ADMIN" }],
  );
  assertEquals(plan.rekey, []);
  assertEquals(plan.assign, []);
  assertEquals(plan.unmatched, []);
  assertEquals(plan.ambiguous, [
    { email: "admin", candidates: ["admin@trex.local", "admin@other.test"] },
  ]);
});

Deno.test("a username resolved via local-part matching still plans a re-key and role assignments", () => {
  const plan = planMigration(
    [{ id: "um-1", email: "admin", idpUserId: "q9j5vjrmba9x" }],
    [{ id: "trex-a", email: "admin@trex.local" }],
    [{ userId: "um-1", role: "USER_ADMIN" }],
  );
  assertEquals(plan.rekey, [{ id: "um-1", email: "admin", from: "q9j5vjrmba9x", to: "trex-a" }]);
  assertEquals(plan.assign, [{ email: "admin", userId: "trex-a", role: "USER_ADMIN" }]);
});

Deno.test("two usermgmt users whose usernames differ only in case each keep their own rekey identity", () => {
  // The apply step used to re-resolve each rekey entry by re-normalising its
  // email and looking the usermgmt user up again — a map keyed by normalised
  // email, so "Admin" and "admin" collapsed to one entry and one of these two
  // users was re-keyed twice while the other kept its stale idp_user_id.
  // Carrying the usermgmt id on the entry itself avoids the re-resolution
  // (and the collision) entirely.
  const plan = planMigration(
    [
      { id: "um-1", email: "Admin", idpUserId: "logto-1" },
      { id: "um-2", email: "admin", idpUserId: "logto-2" },
    ],
    [{ id: "trex-a", email: "admin@trex.local" }],
    [],
  );
  assertEquals(plan.rekey, [
    { id: "um-1", email: "Admin", from: "logto-1", to: "trex-a" },
    { id: "um-2", email: "admin", from: "logto-2", to: "trex-a" },
  ]);
});
