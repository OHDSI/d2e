import { Module } from "@danet/core";
import { RequestContextService } from "../common/request-context.service.ts";
import { AuditController } from "./audit.controller.ts";
import { AuditService } from "./audit.service.ts";

@Module({
  controllers: [AuditController],
  injectables: [RequestContextService, AuditService],
})
export class AuditModule {}
