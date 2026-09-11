import { assertEquals, assertRejects } from "jsr:@std/assert";
import { TrexIdpAPI, resolveServiceRoleKey } from "../src/api/TrexIdpAPI.ts";

const stubFetch = (calls: Array<{ url: string; body: unknown }>, status = 204) =>
  ((url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(String(init.body)) });
    return Promise.resolve(new Response(null, { status }));
  }) as unknown as typeof fetch;

Deno.test("assign posts one request per role name", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const api = new TrexIdpAPI("http://trex/admin/roles", "key", stubFetch(calls));
  await api.assignRolesToUser("user-1", ["RESEARCHER.Demo", "cohort reader"]);
  assertEquals(calls.length, 2);
  assertEquals(calls[0].url, "http://trex/admin/roles/assign");
  assertEquals(calls[0].body, { userId: "user-1", role: "RESEARCHER.Demo" });
  assertEquals(calls[1].body, { userId: "user-1", role: "cohort reader" });
});

Deno.test("remove posts to the remove endpoint", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const api = new TrexIdpAPI("http://trex/admin/roles", "key", stubFetch(calls));
  await api.removeRolesFromUser("user-1", ["USER_ADMIN"]);
  assertEquals(calls[0].url, "http://trex/admin/roles/remove");
});

Deno.test("an empty list makes no request at all", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const api = new TrexIdpAPI("http://trex/admin/roles", "key", stubFetch(calls));
  await api.assignRolesToUser("user-1", []);
  assertEquals(calls.length, 0);
});

Deno.test("a failed call raises rather than reporting success", async () => {
  // The caller records a sync outcome; swallowing this would record a role as
  // stored when it is not.
  const api = new TrexIdpAPI("http://trex/admin/roles", "key", stubFetch([], 500));
  await assertRejects(() => api.assignRolesToUser("user-1", ["USER_ADMIN"]));
});

Deno.test("an explicit TREX__SERVICE_ROLE_KEY wins over the injected supabase key", () => {
  assertEquals(resolveServiceRoleKey("explicit-key", "injected-key"), "explicit-key");
});

Deno.test("the supabase-injected key is used when no override is set", () => {
  assertEquals(resolveServiceRoleKey(undefined, "injected-key"), "injected-key");
});

Deno.test("neither variable set resolves empty rather than throwing", () => {
  // Construction must not fail: this class is a constructor dependency of
  // UserGroupService, and an IDP__ROLE_STORE=logto deployment has neither
  // variable and never calls trex. Throwing here would take usermgmt down at
  // DI time over a credential it never uses.
  assertEquals(resolveServiceRoleKey(undefined, undefined), "");
  assertEquals(resolveServiceRoleKey("", ""), "");
});

Deno.test("constructing with neither variable set does not throw", () => {
  const api = new TrexIdpAPI("http://trex/admin/roles", resolveServiceRoleKey(undefined, undefined));
  assertEquals(typeof api.assignRolesToUser, "function");
});

Deno.test("assigning with no service role key raises naming both variables", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const api = new TrexIdpAPI("http://trex/admin/roles", "", stubFetch(calls));
  await assertRejects(
    () => api.assignRolesToUser("user-1", ["USER_ADMIN"]),
    Error,
    "TREX__SERVICE_ROLE_KEY",
  );
  await assertRejects(
    () => api.assignRolesToUser("user-1", ["USER_ADMIN"]),
    Error,
    "SUPABASE_SERVICE_ROLE_KEY",
  );
  // Never an empty bearer on the wire.
  assertEquals(calls.length, 0);
});

Deno.test("removing with no service role key also raises before any request", async () => {
  const calls: Array<{ url: string; body: unknown }> = [];
  const api = new TrexIdpAPI("http://trex/admin/roles", "", stubFetch(calls));
  await assertRejects(() => api.removeRolesFromUser("user-1", ["USER_ADMIN"]), Error);
  assertEquals(calls.length, 0);
});
