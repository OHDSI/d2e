import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import {
  CohortDefinitionListResponseDto,
  CohortDefinitionSqlDto,
  CohortDefinitionSqlResponseDto,
  CohortDefinitionIdVersionResponseDto,
  CohortDefinitionIdInfoResponseDto,
  AtlasCohortDefinitionDto,
  CohortDefinitionCheckV2ResponseDto,
  WebAPICohortDefinitionResponseDto,
  GenerateCohortResponseDto,
  ICohortDefinitionIdInfoResponseDto,
} from "../dto/cohortdefinition.ts";
import {
  createCohortDefinition,
  updateCohortDefinition,
  generateCohort,
  getCohortDefinitionList,
  getCohortDefinition,
  deleteCohortDefinition,
  copyCohortDefinition,
  checkIfAtlasCohortDefinitionExists,
  checkV2,
} from "../services/cohortdefinition.service.ts";

// deno-lint-ignore require-await
export const cohortdefinition: FastifyPluginAsyncZod = async function (app) {
  app.get(
    "/",
    {
      schema: {
        description:
          "Returns metadata about all cohort definitions in the database",
        tags: ["cohortdefinition"],
        response: { 200: CohortDefinitionListResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
        querystring: z.object({
          // Accepted for backwards compatibility; the handler ignores it.
          source: z.string().optional(),
        }),
      },
    },
    async (req, res) => {
      const result = await getCohortDefinitionList(req.token, req.datasetId);
      res.send(result);
    },
  );

  app.post(
    "/",
    {
      schema: {
        description: "Creates a cohort definition in the database.",
        tags: ["cohortdefinition"],
        body: AtlasCohortDefinitionDto,
        response: { 200: WebAPICohortDefinitionResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const result = await createCohortDefinition(
        req.token,
        req.datasetId,
        req.body,
      );
      res.send(result);
    },
  );

  app.post(
    "/sql",
    {
      schema: {
        description: "Returns OHDSI template SQL for a given cohort definition",
        tags: ["cohortdefinition"],
        body: CohortDefinitionSqlDto,
        response: { 200: CohortDefinitionSqlResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    (_req, res) => {
      // TODO: ADD  LOGIC
      res.send({ templateSql: "dummy response" });
    },
  );

  app.get(
    "/:id",
    {
      schema: {
        description: "Returns the 'raw' cohort definition for the given id.",
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number() }),
        response: { 200: WebAPICohortDefinitionResponseDto },
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

      const result = await getCohortDefinition(req.token, req.datasetId, id);

      res.status(200).send(result);
    },
  );

  app.put(
    "/:id",
    {
      schema: {
        description: "Saves the cohort definition for the given id.",
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number() }),
        body: AtlasCohortDefinitionDto,
        response: { 200: WebAPICohortDefinitionResponseDto },
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

      const result = await updateCohortDefinition(
        req.token,
        req.datasetId,
        id,
        req.body,
      );

      res.status(200).send(result);
    },
  );

  app.delete(
    "/:id",
    {
      schema: {
        description: "Deletes the specified cohort definition",
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number() }),
        response: { 204: z.null() },
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

      await deleteCohortDefinition(req.token, req.datasetId, id);
      await res.status(204).send();
    },
  );

  app.get(
    "/:id/copy",
    {
      schema: {
        description: "Copies the specified cohort definition.",
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number() }),
        response: {
          200: WebAPICohortDefinitionResponseDto,
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

      const result = await copyCohortDefinition(req.token, req.datasetId, id);
      res.status(200).send(result);
    },
  );

  app.get(
    "/:id/info",
    {
      schema: {
        description: "Returns a list of cohort generation info objects.",
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number() }),
        response: { 200: CohortDefinitionIdInfoResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    (_req, res) => {
      // TODO: ADD  LOGIC
      const dummyresponse: ICohortDefinitionIdInfoResponseDto = [
        {
          id: {
            cohortDefinitionId: 1791707,
            sourceId: 6,
          },
          startTime: 1737611966883,
          executionDuration: 2246,
          status: "COMPLETE",
          isValid: true,
          isCanceled: false,
          failMessage: null,
          personCount: 0,
          recordCount: 0,
          createdBy: null,
        },
        {
          id: {
            cohortDefinitionId: 1791707,
            sourceId: 7,
          },
          startTime: 1737138508761,
          executionDuration: 622,
          status: "COMPLETE",
          isValid: false,
          isCanceled: false,
          failMessage:
            "org.springframework.jdbc.BadSqlGrammarException: StatementCallback; bad SQL grammar [DELETE FROM synpuf5pct_results.cohort_inclusion WHERE cohort_definition_id = 1791707]; nested exception is org.postgresql.util.PSQLException: ERROR: permission denied for table cohort_inclusion",
          personCount: null,
          recordCount: null,
          createdBy: null,
        },
      ];
      res.status(200).send(dummyresponse);
    },
  );

  app.get(
    "/:id/version",
    {
      schema: {
        description: "Get list of versions of Cohort Definition",
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number() }),
        response: { 200: CohortDefinitionIdVersionResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    (_req, res) => {
      // TODO: ADD  LOGIC
      const dummyresult = [
        {
          assetId: 1791707,
          version: 1,
          archived: false,
          createdDate: 1737488670477,
        },
      ];

      res.send(dummyresult);
    },
  );

  app.post(
    "/checkV2",
    {
      schema: {
        description: `Checks the cohort definition for logic issues. <br>
          This method runs a series of logical checks on a cohort definition and returns the set of warning, info and error messages. <br> 
          This method is similar to /check except this method accepts a ChortDTO which includes tags.`,
        tags: ["cohortdefinition"],
        body: AtlasCohortDefinitionDto,
        response: { 200: CohortDefinitionCheckV2ResponseDto },
        security: [
          {
            bearerAuth: [],
            datasetid: [],
          },
        ],
      },
    },
    async (req, res) => {
      const result = await checkV2(
        req.token,
        req.datasetId,
        req.body.expression,
      );

      res.send(result);
    },
  );

  app.get(
    "/:id/exists",
    {
      schema: {
        description: `Check that a cohort exists. <br>
                      This method checks to see if a cohort definition name exists. The id parameter is used to 'ignore' a cohort definition from checking. This is
                      used when you have an existing cohort definition which should be ignored
                      when checking if the name already exists.`,
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number() }),
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
      const result = await checkIfAtlasCohortDefinitionExists(
        req.token,
        req.datasetId,
        id,
        name,
      );

      res.send(result);
    },
  );

  app.get(
    "/:id/generate/:sourceKey",
    {
      schema: {
        description: `Queues up a generate cohort task for the specified cohort definition id.`,
        tags: ["cohortdefinition"],
        params: z.object({ id: z.coerce.number(), sourceKey: z.string() }),
        response: { 200: GenerateCohortResponseDto },
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
      const result = await generateCohort(req.token, req.datasetId, id);

      res.send(result);
    },
  );
};
