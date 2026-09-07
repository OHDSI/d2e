import { Request, Response, Router } from "express";
import { JwtPayload, decode } from "jsonwebtoken";
import {
  ConceptInput,
  ConceptMappingSuggestionService,
} from "../services/ConceptMappingSuggestionService.ts";

// Error shape thrown by the service layer for expected failure cases (e.g.
// ConflictError has statusCode=409). Mirrors the convention used across
// jobplugins controllers (see DataTransformationController.createCanvasFromTemplate).
interface HttpError extends Error {
  statusCode?: number;
}

function httpError(message: string, statusCode: number): HttpError {
  const error = new Error(message) as HttpError;
  error.statusCode = statusCode;
  return error;
}

export class ConceptMappingSuggestionController {
  public router = Router();
  private service = new ConceptMappingSuggestionService();

  constructor() {
    this.registerRoutes();
  }

  // Extracts the authenticated user's `sub` claim from the bearer token,
  // same idiom as AnalysisController: decode(token.replace(/bearer /i, "")).
  // The display name that goes with it is `req.username`, resolved once per
  // request by the `extractUsernameFromJwt` middleware jobplugins applies to
  // every route (see index.ts) - no extra lookup needed here.
  private getSub(req: Request): string {
    const authHeader = req.headers["authorization"];
    if (!authHeader) {
      throw httpError("Authorization header is required", 401);
    }

    const token = decode(authHeader.replace(/bearer /i, "")) as JwtPayload;
    if (!token?.sub) {
      throw httpError("Invalid token: missing sub claim", 401);
    }
    return token.sub;
  }

  private handleError(error: unknown, res: Response) {
    const err = error as HttpError;
    const status = typeof err?.statusCode === "number" ? err.statusCode : 500;
    console.error("Error in ConceptMappingSuggestionController: ", err);
    return res.status(status).send({ message: err?.message ?? "Internal Server Error" });
  }

  private async listByNode(req: Request, res: Response) {
    try {
      const { dataflowId, nodeId } = req.query;
      if (!dataflowId || !nodeId) {
        return res
          .status(400)
          .send({ message: "dataflowId and nodeId query parameters are required" });
      }

      const result = await this.service.listByNode(dataflowId as string, nodeId as string);
      return res.status(200).send(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private async addSuggestion(req: Request, res: Response) {
    try {
      const { dataflowId, nodeId, sourceRowId, concept } = req.body ?? {};
      if (!dataflowId || !nodeId || !sourceRowId || !concept) {
        return res.status(400).send({
          message: "dataflowId, nodeId, sourceRowId and concept are required",
        });
      }
      const { conceptId, conceptName, conceptCode, domainId, vocabularyId } =
        concept as ConceptInput;
      // conceptName/conceptCode/domainId/vocabularyId are nullable on the
      // entity (a client-only concept - e.g. one typed in before a
      // Recommend/StandardConcepts lookup resolves it - may not have them
      // yet), so only conceptId is required here.
      if (typeof conceptId !== "number" || !Number.isInteger(conceptId)) {
        return res.status(400).send({
          message: "concept must include an integer conceptId",
        });
      }

      const sub = this.getSub(req);
      const result = await this.service.addSuggestion(
        dataflowId,
        nodeId,
        sourceRowId,
        { conceptId, conceptName, conceptCode, domainId, vocabularyId },
        sub,
        req.username,
      );
      return res.status(201).send(result);
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private async approve(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sub = this.getSub(req);
      await this.service.approve(id, sub, req.username);
      return res.status(204).send();
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private async unapprove(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const sub = this.getSub(req);
      await this.service.unapprove(id, sub);
      return res.status(204).send();
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private async setRowFlag(req: Request, res: Response) {
    try {
      const { dataflowId, nodeId, sourceRowId, flagged } = req.body ?? {};
      if (!dataflowId || !nodeId || !sourceRowId || typeof flagged !== "boolean") {
        return res.status(400).send({
          message: "dataflowId, nodeId, sourceRowId and flagged (boolean) are required",
        });
      }

      const sub = this.getSub(req);
      await this.service.setRowFlag(dataflowId, nodeId, sourceRowId, flagged, sub);
      return res.status(204).send();
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private async clearNode(req: Request, res: Response) {
    try {
      const { dataflowId, nodeId } = req.query;
      if (!dataflowId || !nodeId) {
        return res
          .status(400)
          .send({ message: "dataflowId and nodeId query parameters are required" });
      }

      await this.service.clearNode(dataflowId as string, nodeId as string);
      return res.status(204).send();
    } catch (error) {
      return this.handleError(error, res);
    }
  }

  private registerRoutes() {
    this.router.get("/", this.listByNode.bind(this));
    this.router.post("/", this.addSuggestion.bind(this));
    this.router.post("/:id/approve", this.approve.bind(this));
    this.router.post("/:id/unapprove", this.unapprove.bind(this));
    this.router.put("/row-flag", this.setRowFlag.bind(this));
    this.router.delete("/", this.clearNode.bind(this));
  }
}
