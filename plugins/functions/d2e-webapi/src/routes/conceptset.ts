import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  ConceptSetCheckDto,
  ConceptSetCheckResponseDto,
  ConceptSetListResponseDto,
  ConceptSetResponseDto,
  ConceptSetItemListDto,
  ConceptSetItemsResponseDto,
  ConceptSetCreateDto,
  ConceptSetInUseErrorDto,
  ConceptSetNameConflictErrorDto,
  IConceptSetCheckResponseDto,
  IncludedConceptsRequestDto,
  IncludedConceptsResponseDto,
} from "../dto/conceptset.ts";
import {
  ConceptSetInUseError,
  ConceptSetNameConflictError,
} from "../errors/ConceptSetErrors.ts";

import {
  getConceptSet,
  getConceptSets,
  checkIfConceptSetExists,
  createConceptSet,
  updateConceptSet,
  updateConceptSetItems,
  getConceptSetExpression,
  deleteConceptSet,
  getIncludedConcepts,
} from "../services/conceptset.service.ts";
import { ConceptSetIdParamSchema } from "../utils/conceptSetRef.ts";

// deno-lint-ignore require-await
export const conceptset: FastifyPluginAsyncZod = async function (app) {
  app.get(
    "/",
    {
      schema: {
        description: "Get the full list of concept sets in the database",
        tags: ["conceptset"],
        response: { 200: ConceptSetListResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const results = await getConceptSets(req.token, req.datasetId);
      res.send(results);
    }
  );

  app.post(
    "/",
    {
      schema: {
        description:
          "Save a new concept set to the database. Returns 409 if the name is already taken.",
        body: ConceptSetCreateDto,
        tags: ["conceptset"],
        response: {
          200: ConceptSetResponseDto,
          409: ConceptSetNameConflictErrorDto,
        },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      try {
        const results = await createConceptSet(
          req.token,
          req.datasetId,
          req.body
        );
        res.send(results);
      } catch (error) {
        if (error instanceof ConceptSetNameConflictError) {
          res.status(409).send({
            error: "CONCEPT_SET_NAME_EXISTS",
            message:
              `A concept set named "${error.conceptSetName}" already exists. Choose another name.`,
            conceptSetName: error.conceptSetName,
          });
          return;
        }
        throw error;
      }
    }
  );

  app.post(
    "/included-concepts",
    {
      schema: {
        description:
          "Resolve one or more concept sets to their included concepts. Accepts compound ids (legacy:N / webapi:N) and bare-numeric back-compat values.",
        tags: ["conceptset"],
        body: IncludedConceptsRequestDto,
        response: { 200: IncludedConceptsResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const result = await getIncludedConcepts(
        req.token,
        req.datasetId,
        req.body.conceptSetIds,
      );
      res.send(result);
    }
  );

  app.post(
    "/check",
    {
      schema: {
        description:
          "Checks a concept set for diagnostic problems. At this time, this appears to be an endpoint used to check to see which tags are applied to a concept set.",
        tags: ["conceptset"],
        body: ConceptSetCheckDto,
        response: { 200: ConceptSetCheckResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    (_req, res) => {
      // TODO: ADD LOGIC
      const dummyresponse: IConceptSetCheckResponseDto = { warnings: [] };
      res.send(dummyresponse);
    }
  );

  app.get(
    "/:id",
    {
      schema: {
        description: "Get the concept set based in the identifier",
        tags: ["conceptset"],
        params: z.object({ id: ConceptSetIdParamSchema }),
        response: { 200: ConceptSetResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const { id } = req.params;
      const results = await getConceptSet(req.token, req.datasetId, id);
      res.send(results);
    }
  );

  app.put(
    "/:id",
    {
      schema: {
        description:
          "Updates the concept set for the selected concept set. Returns 409 if the name is already taken.",
        tags: ["conceptset"],
        params: z.object({ id: ConceptSetIdParamSchema }),
        body: ConceptSetCreateDto,
        response: {
          200: z.boolean(),
          409: ConceptSetNameConflictErrorDto,
        },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const { id } = req.params;
      try {
        const results = await updateConceptSet(
          req.token,
          req.datasetId,
          id,
          req.body
        );
        res.send(results);
      } catch (error) {
        if (error instanceof ConceptSetNameConflictError) {
          res.status(409).send({
            error: "CONCEPT_SET_NAME_EXISTS",
            message:
              `A concept set named "${error.conceptSetName}" already exists. Choose another name.`,
            conceptSetName: error.conceptSetName,
          });
          return;
        }
        throw error;
      }
    }
  );

  app.get(
    "/:id/exists",
    {
      schema: {
        description:
          "Check whether a concept set with the same name exists in the legacy (terminology) store. This is the only store probed here; the WebAPI store enforces name uniqueness with the uq_cs_name constraint and reports a duplicate as HTTP 409. The selected concept set ID is excluded so that only that set may hold the name.",
        tags: ["conceptset"],
        params: z.object({ id: ConceptSetIdParamSchema }),
        querystring: z.object({ name: z.string() }),
        response: { 200: z.number() },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const { id } = req.params;
      const { name } = req.query;
      const result = await checkIfConceptSetExists(
        req.token,
        req.datasetId,
        id,
        name
      );
      res.send(result);
    }
  );

  app.get(
    "/:id/expression",
    {
      schema: {
        description: "Get the concept set expression by identifier",
        tags: ["conceptset"],
        params: z.object({ id: ConceptSetIdParamSchema }),
        response: { 200: ConceptSetItemsResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const result = await getConceptSetExpression(
        req.token,
        req.datasetId,
        req.params.id
      );
      res.send(result);
    }
  );

  app.put(
    "/:id/items",
    {
      schema: {
        description:
          "Update the concept set items for the selected concept set ID in the database.",
        tags: ["conceptset"],
        params: z.object({ id: ConceptSetIdParamSchema }),
        body: ConceptSetItemListDto,
        response: { 200: z.boolean() },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const result = await updateConceptSetItems(
        req.token,
        req.datasetId,
        req.params.id,
        req.body
      );
      res.send(result);
    }
  );

  app.delete(
    "/:id",
    {
      schema: {
        description:
          "Delete the concept set by identifier. Returns 409 if concept set is in use by cohort definitions or bookmarks.",
        tags: ["conceptset"],
        params: z.object({ id: ConceptSetIdParamSchema }),
        response: {
          204: z.null(),
          409: ConceptSetInUseErrorDto,
        },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const { id } = req.params;
      try {
        await deleteConceptSet(req.token, req.datasetId, id);
        res.status(204).send();
      } catch (error) {
        if (error instanceof ConceptSetInUseError) {
          const cohortCount = error.cohortDefinitions.length;
          const bookmarkCount = error.bookmarks.length;
          const parts = [];
          if (cohortCount > 0)
            parts.push(`${cohortCount} cohort definition(s)`);
          if (bookmarkCount > 0) parts.push(`${bookmarkCount} bookmark(s)`);

          res.status(409).send({
            error: "CONCEPT_SET_IN_USE",
            message: `Cannot delete concept set. Currently used by ${parts.join(
              " and "
            )}.`,
            cohortDefinitions: error.cohortDefinitions,
            bookmarks: error.bookmarks,
          });
          return;
        }
        throw error;
      }
    }
  );
};
