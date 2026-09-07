import { Body, Controller, Middleware, Post } from "@danet/core";
import { RequestContextMiddleware } from "../common/request-context.middleware.ts";
import { AuditService } from "./audit.service.ts";

@Middleware(RequestContextMiddleware)
@Controller("system-portal/audit")
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Post("log")
  logDisclaimerResponse(@Body() body: { response: string }) {
    this.auditService.logDisclaimerResponse(body.response);
  }
}
