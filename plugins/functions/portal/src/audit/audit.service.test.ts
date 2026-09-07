import { assertEquals, assertMatch, assertThrows } from "@std/assert";
import { HttpException } from "@danet/core";
import { JwtPayload } from "jsonwebtoken";
import { RequestContextService } from "../common/request-context.service.ts";
import { AuditService } from "./audit.service.ts";

const SUBJECT_PROP_ENV = "GATEWAY__IDP_SUBJECT_PROP";

function serviceWithClaims(payload?: Record<string, unknown>) {
  const requestContextService = new RequestContextService();
  if (payload) {
    requestContextService.setAuthToken(payload as JwtPayload);
  }
  return new AuditService(requestContextService);
}

/** Build an unsigned but well-formed JWT so `decode` can read its claims. */
function tokenWithClaims(claims: Record<string, unknown>): string {
  const encode = (value: unknown) =>
    btoa(JSON.stringify(value)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${encode({ alg: "none", typ: "JWT" })}.${encode(claims)}.signature`;
}

function captureInfo(run: () => void): string[] {
  const lines: string[] = [];
  const original = console.info;
  console.info = (...args: unknown[]) => {
    lines.push(args.map((arg) => String(arg)).join(" "));
  };
  try {
    run();
  } finally {
    console.info = original;
  }
  return lines;
}

/** The audit line, ignoring the informational fallback notice. */
function auditLine(lines: string[]): string | undefined {
  return lines.find((line) => line.includes("AUDITLOG"));
}

function withSubjectProp<T>(value: string | undefined, run: () => T): T {
  const previous = Deno.env.get(SUBJECT_PROP_ENV);
  if (value === undefined) {
    Deno.env.delete(SUBJECT_PROP_ENV);
  } else {
    Deno.env.set(SUBJECT_PROP_ENV, value);
  }
  try {
    return run();
  } finally {
    if (previous === undefined) {
      Deno.env.delete(SUBJECT_PROP_ENV);
    } else {
      Deno.env.set(SUBJECT_PROP_ENV, previous);
    }
  }
}

function logResponseFor(payload: Record<string, unknown> | undefined, response = "ACCEPTED") {
  return auditLine(captureInfo(() => serviceWithClaims(payload).logDisclaimerResponse(response)));
}

Deno.test("logs the usage agreement in the Data2Evidence AUDITLOG format", () => {
  const line = withSubjectProp("sub", () => logResponseFor({ sub: "user-123" }));

  assertMatch(
    line ?? "",
    /^\[Data2Evidence\]\[AUDITLOG\]\[\d+\] Usage agreement ACCEPTED by user: user-123$/,
  );
});

Deno.test("logs the response verbatim so a decline is distinguishable", () => {
  const line = withSubjectProp("sub", () => logResponseFor({ sub: "user-123" }, "DECLINED"));

  assertMatch(line ?? "", /Usage agreement DECLINED by user: user-123$/);
});

Deno.test("prefers the oid from the nested third-party token", () => {
  const line = withSubjectProp("sub", () =>
    logResponseFor({
      sub: "logto-subject",
      oid: "top-level-oid",
      thirdPartyToken: tokenWithClaims({ oid: "azure-ad-oid" }),
    }),
  );

  assertMatch(line ?? "", /by user: azure-ad-oid$/);
});

Deno.test("falls back to the configured subject prop when there is no third-party token", () => {
  const line = withSubjectProp("custom_id", () =>
    logResponseFor({ custom_id: "claim-identity", oid: "top-level-oid", sub: "logto-subject" }),
  );

  assertMatch(line ?? "", /by user: claim-identity$/);
});

Deno.test("falls back to the oid claim when the configured subject prop is absent", () => {
  const line = withSubjectProp("custom_id", () =>
    logResponseFor({ oid: "top-level-oid", sub: "logto-subject" }),
  );

  assertMatch(line ?? "", /by user: top-level-oid$/);
});

Deno.test("falls back to the Logto subject when no other identity claim is present", () => {
  const line = withSubjectProp("custom_id", () => logResponseFor({ sub: "logto-subject" }));

  assertMatch(line ?? "", /by user: logto-subject$/);
});

Deno.test("falls back to the Logto identity when the third-party token is malformed", () => {
  const line = withSubjectProp("sub", () =>
    logResponseFor({ sub: "logto-subject", thirdPartyToken: "not-a-jwt" }),
  );

  assertMatch(line ?? "", /by user: logto-subject$/);
});

Deno.test("falls back to the Logto identity when the third-party token carries no oid", () => {
  const line = withSubjectProp("sub", () =>
    logResponseFor({ sub: "logto-subject", thirdPartyToken: tokenWithClaims({ upn: "no-oid-here" }) }),
  );

  assertMatch(line ?? "", /by user: logto-subject$/);
});

Deno.test("defaults the subject prop to sub when the env var is unset", () => {
  const line = withSubjectProp(undefined, () => logResponseFor({ sub: "logto-subject" }));

  assertMatch(line ?? "", /by user: logto-subject$/);
});

Deno.test("announces that it fell back to the Logto identity", () => {
  const lines = withSubjectProp("sub", () =>
    captureInfo(() => serviceWithClaims({ sub: "user-123" }).logDisclaimerResponse("ACCEPTED")),
  );

  assertEquals(
    lines.some((line) => line.includes("third-party token not found or invalid")),
    true,
  );
});

Deno.test("rejects a missing response with a 400 instead of logging", () => {
  const error = assertThrows(
    () => serviceWithClaims({ sub: "user-123" }).logDisclaimerResponse(""),
    HttpException,
  ) as HttpException;

  assertEquals(error.status, 400);
  assertMatch(error.message, /Log response is missing in the request body/);
});

Deno.test("does not log an audit line when the response is missing", () => {
  const lines = captureInfo(() => {
    try {
      serviceWithClaims({ sub: "user-123" }).logDisclaimerResponse("");
    } catch {
      // asserted in the test above; here we only care that nothing was logged
    }
  });

  assertEquals(auditLine(lines), undefined);
});

Deno.test("still logs when the request carries no auth claims at all", () => {
  const line = withSubjectProp("sub", () => logResponseFor(undefined));

  assertMatch(line ?? "", /Usage agreement ACCEPTED by user: undefined$/);
});

