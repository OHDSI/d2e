import { HttpException, Injectable, SCOPE } from "@danet/core";
import { JwtPayload, decode } from "jsonwebtoken";
import { RequestContextService } from "../common/request-context.service.ts";

@Injectable({ scope: SCOPE.REQUEST })
export class AuditService {
  constructor(private readonly requestContextService: RequestContextService) {}

  logDisclaimerResponse(response: string) {
    if (!response) {
      throw new HttpException(400, "Log response is missing in the request body");
    }

    const idpUserId = this.resolveIdpUserId();

    try {
      console.info(
        `[Data2Evidence][AUDITLOG][${Date.now()}] Usage agreement ${response} by user: ${idpUserId}`,
      );
    } catch (error) {
      console.error(`[d2e-compat] /trex/log error: ${error}`);
      throw new HttpException(500, "Log write failed");
    }
  }

  // The request context middleware decoded the JWT and stashed the full claims.
  private resolveIdpUserId(): string | undefined {
    const payload = (this.requestContextService.getAuthToken() ?? {}) as JwtPayload &
      Record<string, unknown>;
    const subjectProp = Deno.env.get("GATEWAY__IDP_SUBJECT_PROP") ?? "sub";

    try {
      // Preferred: decode the nested Azure AD token and use its oid.
      const thirdPartyToken = payload["thirdPartyToken"] as string | undefined;
      if (!thirdPartyToken) throw new Error("no thirdPartyToken");
      const oid = (decode(thirdPartyToken) as JwtPayload | null)?.["oid"] as string | undefined;
      if (!oid) throw new Error("no oid in thirdPartyToken");
      return oid;
    } catch {
      // Fallback: GATEWAY__IDP_SUBJECT_PROP claim, then "oid", then the Logto subject.
      console.info(
        "[d2e-compat] /trex/log: third-party token not found or invalid, using Logto identity",
      );
      return (
        (payload[subjectProp] as string | undefined) ??
        (payload["oid"] as string | undefined) ??
        payload.sub
      );
    }
  }
}
