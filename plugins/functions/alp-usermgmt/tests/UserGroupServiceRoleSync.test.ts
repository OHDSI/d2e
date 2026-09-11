import { assertEquals } from "jsr:@std/assert";
import { canonicalRoleNames, removableRoleNames, resolveRoleStore } from "../src/services/UserGroupService.ts";

Deno.test("the role store defaults to trex and is explicit about logto", () => {
  assertEquals(resolveRoleStore(undefined), "trex");
  assertEquals(resolveRoleStore(""), "trex");
  assertEquals(resolveRoleStore("trex"), "trex");
  assertEquals(resolveRoleStore("logto"), "logto");
  // An unrecognised value must not silently pick a store: a typo here would
  // send role writes somewhere nobody reads.
  assertEquals(resolveRoleStore("logtoo"), "trex");
});

Deno.test("an unscoped role is stored under its own name", () => {
  assertEquals(canonicalRoleNames("USER_ADMIN", ["USER_ADMIN"]), ["USER_ADMIN"]);
});

Deno.test("kebab scopes become the sec_role names they stood for", () => {
  // Logto rejected spaces in scope names, so d2e stored these hyphenated and a
  // JWT customizer expanded them. trex holds the real names, so they are
  // expanded here instead.
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
  // The role name is also the first scope, so a naive concat duplicates it.
  assertEquals(canonicalRoleNames("USER_ADMIN", ["USER_ADMIN", "USER_ADMIN"]), ["USER_ADMIN"]);
});

Deno.test("an unrecognised scope is passed through untouched", () => {
  // Better a name nothing maps than a silently dropped grant.
  assertEquals(canonicalRoleNames("X", ["X", "some-future-scope"]), ["X", "some-future-scope"]);
});

// --- LOGTO__ROLES_SCOPES fan-out (docker-compose.yml): under Logto these two
// roles also carried a webapi.sec_role name that is not a role/scope name of
// its own. That pairing lived only in Logto's configuration, so it must be
// reproduced here or the trex path silently drops it.

Deno.test("role.systemadmin also grants the WebAPI admin role", () => {
  const names = canonicalRoleNames("role.systemadmin", ["role.systemadmin"]);
  assertEquals(names, ["role.systemadmin", "admin"]);
});

Deno.test("role.viewer also grants the WebAPI anonymous role", () => {
  const names = canonicalRoleNames("role.viewer", ["role.viewer"]);
  assertEquals(names, ["role.viewer", "anonymous"]);
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

// Withdrawal must not revoke names another membership still grants. The WebAPI
// scopes are dataset-independent constants, so every researcher group expands to
// the same three names -- the case that made a naive removal wrong.
const researcher = (datasetId: string) => ({
  role: `role.researcher.ds-${datasetId}`,
  scopes: [
    `role.researcher.ds-${datasetId}`,
    `role.researcher.${datasetId}`,
    `source-user-${datasetId}`,
    'cohort-reader',
    'cohort-creator',
    'concept-set-creator'
  ]
})

Deno.test("removing one researcher group keeps the shared roles another still grants", () => {
  const names = removableRoleNames(researcher("a"), [researcher("b")])
  // Dataset A's own names go...
  assertEquals(names.includes("role.researcher.ds-a"), true)
  assertEquals(names.includes("Source user (a)"), true)
  // ...while the names dataset B still grants stay.
  assertEquals(names.includes("cohort reader"), false)
  assertEquals(names.includes("cohort creator"), false)
  assertEquals(names.includes("concept set creator"), false)
  // And B's own names are never touched by A's withdrawal.
  assertEquals(names.includes("role.researcher.ds-b"), false)
  assertEquals(names.includes("Source user (b)"), false)
})

Deno.test("removing the last researcher group does revoke the shared roles", () => {
  const names = removableRoleNames(researcher("a"), [])
  assertEquals(names.includes("cohort reader"), true)
  assertEquals(names.includes("cohort creator"), true)
  assertEquals(names.includes("concept set creator"), true)
  assertEquals(names.includes("role.researcher.ds-a"), true)
})

Deno.test("an unrelated remaining group does not retain researcher scopes", () => {
  // A viewer grants role.viewer and anonymous, neither of which a researcher
  // withdrawal should be blocked on.
  const names = removableRoleNames(researcher("a"), [
    { role: "role.viewer", scopes: ["role.viewer"] }
  ])
  assertEquals(names.includes("cohort reader"), true)
})

Deno.test("a remaining group holding the same implied role retains it", () => {
  // role.systemadmin implies admin. Dropping one systemadmin group while another
  // remains must not revoke the WebAPI admin role.
  const names = removableRoleNames(
    { role: "role.systemadmin", scopes: ["role.systemadmin"] },
    [{ role: "role.systemadmin", scopes: ["role.systemadmin"] }]
  )
  assertEquals(names, [])
})

Deno.test("withdrawing a group the user holds twice over leaves nothing to revoke", () => {
  assertEquals(removableRoleNames(researcher("a"), [researcher("a")]), [])
})
