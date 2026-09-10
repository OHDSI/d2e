import express, { Request, Response, Router } from "express";
import { getUser } from "@alp/alp-base-utils";
import { env } from "./env.ts";

const logger = console;

interface SqlQueryTemplate {
  id: string;
  name: string;
  description?: string;
  sqlText: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: string;
}

interface DatasetMetadata {
  id: string;
  databaseCode: string;
  cacheId?: string;
  schemaName: string;
  vocabSchemaName: string;
  resultsSchemaName: string;
}

function isValidUUID(str: unknown): str is string {
  return (
    typeof str === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)
  );
}

function isValidCohortId(val: unknown): val is number {
  return typeof val === "number" && Number.isInteger(val) && val > 0;
}

function isValidTemplateId(str: unknown): str is string {
  return typeof str === "string" && /^[a-zA-Z0-9_-]+$/.test(str);
}

function isAxiosError(
  error: unknown,
): error is { response?: { status?: number } } {
  return typeof error === "object" && error !== null && "response" in error;
}

function validateSqlTemplate(sql: string): boolean {
  const forbidden =
    /;\s*(DROP|DELETE|TRUNCATE|ALTER|CREATE|INSERT|UPDATE|GRANT|REVOKE)/i;
  return !forbidden.test(sql);
}

function isValidSqlIdentifier(str: unknown): str is string {
  return (
    typeof str === "string" &&
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(str) &&
    str.length <= 128
  );
}

function isValidParamValue(str: unknown): str is string {
  if (typeof str !== "string") return false;
  if (str.length > 1000) return false;
  if (/[;'"\\]|--|\/\*|\*\//.test(str)) return false;
  return true;
}

function isValidYear(str: string): boolean {
  // Accepts 4-digit years between 1000 and 2999
  return (
    typeof str === "string" &&
    /^\d{4}$/.test(str) &&
    +str >= 1000 &&
    +str <= 2999
  );
}

function isValidConceptCode(str: string): boolean {
  return typeof str === "string" && /^[a-zA-Z0-9.\-]+$/.test(str);
}

function isValidWildcardFlag(val: string): boolean {
  return Number(val) === 1 || Number(val) === 0;
}

function isValidConceptIdArray(arr: unknown): arr is number[] {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  return arr.every(
    (item) => typeof item === "number" && Number.isInteger(item) && item >= 0,
  );
}

function sanitizeParamValue(value: string): string {
  return value.replace(/'/g, "''");
}

function extractPlaceholders(sql: string): string[] {
  const matches = sql.match(/\{\{([A-Z][A-Z0-9_]*)\}\}/g) || [];
  return [...new Set(matches.map((m) => m.slice(2, -2)))];
}

const RESERVED_PLACEHOLDERS = new Set([
  "COHORT_ID",
  "SCHEMA",
  "VOCAB_SCHEMA",
  "RESULTS_SCHEMA",
  "STARTYEAR",
  "ENDYEAR",
  "CONCEPT_CODE1",
  "CONCEPT_CODE2",
  "CONCEPT_CODE3",
  "CONCEPT_CODE4",
  "CONCEPT_CODE5",
  "WILDCARD_FLAG1",
  "WILDCARD_FLAG2",
  "WILDCARD_FLAG3",
  "WILDCARD_FLAG4",
  "WILDCARD_FLAG5",
  "CONCEPT_IDS",
]);

function substituteTemplateParams(
  sqlTemplate: string,
  params: {
    cohortId?: number;
    schema: string;
    vocabSchema: string;
    resultsSchema: string;
  },
  additionalParams: Record<string, string>,
  conceptIds?: number[],
): string {
  if (!isValidSqlIdentifier(params.schema)) {
    throw new Error("Invalid schema name");
  }
  if (params.vocabSchema && !isValidSqlIdentifier(params.vocabSchema)) {
    throw new Error("Invalid vocab schema name");
  }
  if (params.resultsSchema && !isValidSqlIdentifier(params.resultsSchema)) {
    throw new Error("Invalid results schema name");
  }
  if (additionalParams.STARTYEAR && !isValidYear(additionalParams.STARTYEAR)) {
    throw new Error("Invalid STARTYEAR");
  }
  if (additionalParams.ENDYEAR && !isValidYear(additionalParams.ENDYEAR)) {
    throw new Error("Invalid ENDYEAR");
  }
  for (let i = 1; i <= 5; i++) {
    const conceptCodeKey = `CONCEPT_CODE${i}`;
    const wildcardFlagKey = `WILDCARD_FLAG${i}`;
    if (
      conceptCodeKey in additionalParams &&
      additionalParams[conceptCodeKey] !== ""
    ) {
      if (!isValidConceptCode(additionalParams[conceptCodeKey])) {
        throw new Error(`Invalid ${conceptCodeKey}`);
      }
    }
    if (
      wildcardFlagKey in additionalParams &&
      additionalParams[wildcardFlagKey] !== ""
    ) {
      if (!isValidWildcardFlag(additionalParams[wildcardFlagKey])) {
        throw new Error(`Invalid ${wildcardFlagKey}`);
      }
    }
  }

  let result = sqlTemplate
    .replace(
      /\{\{COHORT_ID\}\}/g,
      params.cohortId !== undefined ? String(params.cohortId) : "",
    )
    .replace(/\{\{SCHEMA\}\}/g, params.schema)
    .replace(/\{\{VOCAB_SCHEMA\}\}/g, params.vocabSchema || "")
    .replace(/\{\{RESULTS_SCHEMA\}\}/g, params.resultsSchema || "")
    .replace(/\{\{STARTYEAR\}\}/g, additionalParams["STARTYEAR"] || "")
    .replace(/\{\{ENDYEAR\}\}/g, additionalParams["ENDYEAR"] || "")
    .replace(
      /\{\{CONCEPT_CODE1\}\}/g,
      additionalParams["CONCEPT_CODE1"]
        ? `${sanitizeParamValue(additionalParams["CONCEPT_CODE1"])}`
        : "",
    )
    .replace(
      /\{\{CONCEPT_CODE2\}\}/g,
      additionalParams["CONCEPT_CODE2"]
        ? `${sanitizeParamValue(additionalParams["CONCEPT_CODE2"])}`
        : "",
    )
    .replace(
      /\{\{CONCEPT_CODE3\}\}/g,
      additionalParams["CONCEPT_CODE3"]
        ? `${sanitizeParamValue(additionalParams["CONCEPT_CODE3"])}`
        : "",
    )
    .replace(
      /\{\{CONCEPT_CODE4\}\}/g,
      additionalParams["CONCEPT_CODE4"]
        ? `${sanitizeParamValue(additionalParams["CONCEPT_CODE4"])}`
        : "",
    )
    .replace(
      /\{\{CONCEPT_CODE5\}\}/g,
      additionalParams["CONCEPT_CODE5"]
        ? `${sanitizeParamValue(additionalParams["CONCEPT_CODE5"])}`
        : "",
    )
    .replace(
      /\{\{WILDCARD_FLAG1\}\}/g,
      additionalParams["WILDCARD_FLAG1"] || "",
    )
    .replace(
      /\{\{WILDCARD_FLAG2\}\}/g,
      additionalParams["WILDCARD_FLAG2"] || "",
    )
    .replace(
      /\{\{WILDCARD_FLAG3\}\}/g,
      additionalParams["WILDCARD_FLAG3"] || "",
    )
    .replace(
      /\{\{WILDCARD_FLAG4\}\}/g,
      additionalParams["WILDCARD_FLAG4"] || "",
    )
    .replace(
      /\{\{WILDCARD_FLAG5\}\}/g,
      additionalParams["WILDCARD_FLAG5"] || "",
    )
    .replace(/\{\{CONCEPT_IDS\}\}/g, conceptIds ? conceptIds.join(",") : "");

  const remainingPlaceholders = extractPlaceholders(result);
  const missingParams: string[] = [];
  for (const placeholder of remainingPlaceholders) {
    if (
      !RESERVED_PLACEHOLDERS.has(placeholder) &&
      !(placeholder in additionalParams)
    ) {
      missingParams.push(placeholder);
    }
  }

  if (missingParams.length > 0) {
    throw new Error(`Missing required parameters: ${missingParams.join(", ")}`);
  }

  for (const placeholder of remainingPlaceholders) {
    if (!RESERVED_PLACEHOLDERS.has(placeholder)) {
      const value = additionalParams[placeholder];
      if (!isValidParamValue(value)) {
        throw new Error(`Invalid value for parameter: ${placeholder}`);
      }
      const sanitized = sanitizeParamValue(value);
      result = result.replace(
        new RegExp(`\\{\\{${placeholder}\\}\\}`, "g"),
        sanitized,
      );
    }
  }

  // Remove any ; in the final SQL to prevent multiple statements
  result = result.replace(/;/g, "");
  return result;
}

async function resolveTemplate(
  templateId: string,
  datasetId: string,
  type: string,
  name: string,
  token: string,
): Promise<SqlQueryTemplate> {
  const envTemplates = env.SQL_QUERY_TEMPLATES;
  if (envTemplates) {
    console.log(
      `Using SQL_QUERY_TEMPLATES from environment for templateId: ${templateId}`,
    );
    const sqlText = envTemplates[templateId];
    if (sqlText) {
      return {
        id: templateId,
        name: templateId,
        sqlText,
        createdAt: "",
        updatedAt: "",
      };
    }
    throw new Error(`Template not found: ${templateId}`);
  }

  console.log(
    `Resolving template from portal service for templateId: ${templateId}`,
  );
  const serviceRoutes = env.SERVICE_ROUTES || {};
  const baseUrl =
    serviceRoutes.portalServer || serviceRoutes["portal-server"] || "";
  if (!baseUrl) {
    throw new Error(
      "Portal Server URL not configured and SQL_QUERY_TEMPLATES not set",
    );
  }

  // @ts-ignore Trex global
  const channel = Trex.tokioChannel("d2e-functions/portal");
  const url =
    `${baseUrl}/dataset/dashboard-code-query?` +
    `datasetId=${encodeURIComponent(datasetId)}` +
    `&type=${encodeURIComponent(type)}` +
    `&name=${encodeURIComponent(name)}` +
    `&queryName=${encodeURIComponent(templateId)}`;

  console.log(
    `datasetId: ${datasetId}, type: ${type}, name: ${name}, templateId: ${templateId}`,
  );

  console.log(
    `Resolving template from portal service: ${url} with token: ${token}`,
  );

  try {
    const result = await channel.get(url, {
      headers: { Authorization: token },
      timeout: 20000,
    });
    const data = result.data as { sql?: unknown; queryName?: unknown };
    if (
      typeof data.sql !== "string" ||
      data.sql.trim() === "" ||
      typeof data.queryName !== "string" ||
      data.queryName.trim() === ""
    ) {
      logger.error("Invalid portal service response for SQL template", {
        templateId,
        datasetId,
        type,
        name,
      });
      throw new Error("Invalid portal service response");
    }
    return {
      id: data.queryName,
      name: data.queryName,
      sqlText: data.sql,
      createdAt: "",
      updatedAt: "",
    };
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      throw new Error(`Template not found: ${templateId}`);
    }
    throw new Error("Portal service unavailable");
  }
}

function buildSetSessionVariableSql(name: string, value: string): string {
  const escapedName = name.replace(/'/g, "''");
  const escapedValue = String(value).replace(/'/g, "''");
  return `SET '${escapedName}' = '${escapedValue}'`;
}

// Set on the connection's pinned HANA session, so every later statement on it
// carries the attribution.
async function applySessionVariables(
  // deno-lint-ignore no-explicit-any
  conn: any,
  variables: Record<string, string | undefined>,
): Promise<void> {
  for (const [name, value] of Object.entries(variables)) {
    if (!value) {
      continue;
    }
    await new Promise<void>((resolve, reject) => {
      conn.executeUpdate(
        buildSetSessionVariableSql(name, value),
        [],
        (err: Error | null) => (err ? reject(err) : resolve()),
      );
    });
  }
}

async function resolveDataset(
  datasetId: string,
  token: string,
): Promise<DatasetMetadata> {
  const serviceRoutes = env.SERVICE_ROUTES || {};
  const baseUrl =
    serviceRoutes.portalServer || serviceRoutes["portal-server"] || "";
  if (!baseUrl) {
    throw new Error("Portal Server URL not configured in SERVICE_ROUTES");
  }

  // @ts-ignore Trex global
  const channel = Trex.tokioChannel("d2e-functions/portal");
  const url = `${baseUrl}/dataset?datasetId=${encodeURIComponent(datasetId)}`;

  try {
    const result = await channel.get(url, {
      headers: { Authorization: token },
      timeout: 20000,
    });
    return result.data as DatasetMetadata;
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      throw new Error(`Dataset not found: ${datasetId}`);
    }
    throw new Error("Portal service unavailable");
  }
}

const app = express();
app.use(express.json());

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const requestId = crypto.randomUUID();
  let tempFilePath: string | null = null;

  try {
    const token = req.headers.authorization || "";
    const datasetId = req.body.datasetId as string | undefined;
    const cohortId = req.body.cohortId as number | undefined;
    const templateId = req.body.templateId as string | undefined;
    const name = req.body.name as string | undefined;
    const type =
      (req.body.type as string | undefined) || env.DEFAULT_QUERY_TYPE;

    if (!datasetId || !templateId) {
      return res.status(400).json({
        error: "Missing required parameters",
        message: "datasetId and templateId are required",
      });
    }

    if (!name) {
      return res.status(400).json({
        error: "Missing required parameter",
        message: "name is required",
      });
    }

    if (!isValidUUID(datasetId)) {
      return res.status(400).json({
        error: "Invalid parameter",
        message: "datasetId must be a valid UUID",
      });
    }
    if (!isValidTemplateId(templateId)) {
      return res.status(400).json({
        error: "Invalid parameter",
        message:
          "templateId must contain only letters, numbers, underscores, or hyphens",
      });
    }
    if (!isValidTemplateId(name)) {
      return res.status(400).json({
        error: "Invalid parameter",
        message:
          "name must contain only letters, numbers, underscores, or hyphens",
      });
    }
    if (!isValidTemplateId(type)) {
      return res.status(400).json({
        error: "Invalid parameter",
        message:
          "type must contain only letters, numbers, underscores, or hyphens",
      });
    }

    let template: SqlQueryTemplate;

    try {
      template = await resolveTemplate(
        templateId,
        datasetId,
        type,
        name,
        token,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) {
        return res
          .status(404)
          .json({ error: "Template not found", message: msg });
      }
      return res.status(503).json({
        error: "Template service unavailable",
        message: "Please try again later",
      });
    }

    let dataset: DatasetMetadata;
    try {
      dataset = await resolveDataset(datasetId, token);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes("not found")) {
        return res
          .status(404)
          .json({ error: "Dataset not found", message: msg });
      }
      return res.status(503).json({
        error: "Portal service unavailable",
        message: "Please try again later",
      });
    }

    const format =
      (req.body.format as string | undefined)?.toLowerCase() || "parquet";
    if (format !== "parquet" && format !== "json") {
      return res.status(400).json({
        error: "Invalid parameter",
        message: "format must be 'parquet' or 'json'",
      });
    }

    // Check if template requires COHORT_ID
    if (template.sqlText.includes("{{COHORT_ID}}")) {
      if (!isValidCohortId(cohortId)) {
        return res.status(400).json({
          error: "Missing or invalid parameter",
          message: "cohortId is required and must be a positive integer",
        });
      }

      if (!isValidSqlIdentifier(dataset.resultsSchemaName)) {
        return res.status(400).json({
          error: "Invalid dataset configuration",
          message: "resultsSchema is not a valid identifier",
        });
      }

      // @ts-ignore Trex global
      const cohortCheckDbm = Trex.databaseManager();
      const cohortCheckConn = cohortCheckDbm.getConnection(
        dataset.cacheId ?? dataset.databaseCode,
        dataset.schemaName,
        dataset.vocabSchemaName,
        dataset.resultsSchemaName,
        { duckdb: (e: unknown) => e, hana: (e: unknown) => e },
      );

      try {
        if (cohortCheckConn.dialect === "hana") {
          const userObj = getUser(req);
          await applySessionVariables(cohortCheckConn, {
            APPLICATION: `${env.PROJECT_NAME}-WIZARD_${type}_${name}_${templateId}`,
            APPLICATIONUSER:
              userObj.getEmail() ||
              userObj.userObject.name ||
              userObj.getUser(),
          });
        }

        const cohortCheckSql =
          `select count(distinct subject_id) as patient_count from ` +
          `${dataset.resultsSchemaName}.cohort where cohort_definition_id = ${cohortId}`;
        const cohortRows = await new Promise<Record<string, unknown>[]>(
          (resolve, reject) => {
            cohortCheckConn.execute(
              cohortCheckSql,
              [],
              (err: Error | null, result: Record<string, unknown>[]) => {
                err ? reject(err) : resolve(result);
              },
            );
          },
        );
        const patientCount = Number(Object.values(cohortRows[0] ?? {})[0] ?? 0);
        if (!patientCount) {
          return res.status(400).json({
            error: "Empty cohort",
            message: "No patients found for the specified cohortId",
          });
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.error(`[${requestId}] Cohort validation query failed: ${msg}`);
        return res.status(500).json({
          error: "Query execution failed",
          message: "Failed to validate cohort",
        });
      } finally {
        cohortCheckConn.close();
      }
    }

    const conceptIds = req.body.conceptIds as unknown | undefined;
    // Check if template requires CONCEPT_IDS
    if (template.sqlText.includes("{{CONCEPT_IDS}}")) {
      if (!isValidConceptIdArray(conceptIds)) {
        return res.status(400).json({
          error: "Missing or invalid parameter",
          message: "conceptIds must be a non-empty array of positive integers",
        });
      }
    }

    const reservedBodyParams = new Set([
      "datasetId",
      "cohortId",
      "templateId",
      "format",
      "name",
      "type",
      "yearRange",
      "conditions",
      "conceptIds",
      "visitConcept",
      "followUpDays",
      "conceptCodes",
    ]);

    const additionalParams: Record<string, string> = {};
    // Handle 'yearRange' object in body for STARTYEAR and ENDYEAR
    if (req.body.yearRange && typeof req.body.yearRange === "object") {
      const { from, to } = req.body.yearRange;
      if (typeof from === "string") {
        additionalParams["STARTYEAR"] = from;
      }
      if (typeof to === "string") {
        additionalParams["ENDYEAR"] = to;
      }
    }

    // Handle array of concept codes and wildcard flags
    if (Array.isArray(req.body.conditions)) {
      req.body.conditions.forEach((obj) => {
        if (typeof obj === "object" && obj !== null) {
          Object.entries(obj).forEach(([key, value]) => {
            if (RESERVED_PLACEHOLDERS.has(key)) {
              additionalParams[key.toUpperCase()] = String(value);
            }
          });
        }
      });
    }
    if (typeof req.body.visitConcept === "string") {
      additionalParams["VISIT_CONCEPT"] = req.body.visitConcept;
    }

    if (typeof req.body.followUpDays === "string") {
      additionalParams["FOLLOWUP_DAYS"] = req.body.followUpDays;
    }
    if (typeof req.body.conceptCodes === "string") {
      additionalParams["CONCEPT_CODES"] = req.body.conceptCodes;
    }

    let substitutedSql: string;
    try {
      substitutedSql = substituteTemplateParams(
        template.sqlText,
        {
          cohortId: cohortId,
          schema: dataset.schemaName,
          vocabSchema: dataset.vocabSchemaName,
          resultsSchema: dataset.resultsSchemaName,
        },
        additionalParams,
        conceptIds,
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      return res.status(400).json({ error: "Invalid parameter", message: msg });
    }

    if (!validateSqlTemplate(substitutedSql)) {
      return res.status(400).json({
        error: "Invalid template",
        message: "Template contains forbidden SQL statements",
      });
    }

    // @ts-ignore Trex global
    const dbm = Trex.databaseManager();
    const conn = dbm.getConnection(
      dataset.cacheId ?? dataset.databaseCode,
      dataset.schemaName,
      dataset.vocabSchemaName,
      dataset.resultsSchemaName,
      { duckdb: (e: unknown) => e, hana: (e: unknown) => e },
    );

    try {
      if (conn.dialect === "hana") {
        const userObj = getUser(req);
        await applySessionVariables(conn, {
          APPLICATION: `${env.PROJECT_NAME}-WIZARD_${type}_${name}_${templateId}`,
          APPLICATIONUSER:
            userObj.getEmail() || userObj.userObject.name || userObj.getUser(),
        });
      }

      if (format === "json") {
        const rows = await new Promise<unknown[]>((resolve, reject) => {
          conn.execute(
            substitutedSql,
            [],
            (err: Error | null, result: unknown[]) => {
              err ? reject(err) : resolve(result);
            },
          );
        });

        if (!rows || rows.length === 0) {
          return res.status(404).json({
            error: "No data",
            message: "No data returned for this query",
            parameters: {
              cdmSchema: dataset.schemaName,
              vocabSchema: dataset.vocabSchemaName,
              resultsSchema: dataset.resultsSchemaName,
              cohortId: {
                requiredByTemplate: template.sqlText.includes("{{COHORT_ID}}"),
                value: cohortId ?? null,
              },
              conceptIds: {
                requiredByTemplate: template.sqlText.includes(
                  "{{CONCEPT_IDS}}",
                ),
                value: conceptIds ?? null,
              },
              ...additionalParams,
            },
          });
        }

        res.setHeader("Content-Type", "application/json");
        res.setHeader(
          "Content-Disposition",
          `attachment; filename=export-${Date.now()}.json`,
        );
        return res.json(rows);
      }

      const tempDir = Deno.env.get("TMPDIR") || "/tmp";
      tempFilePath = `${tempDir}/export-${requestId}.parquet`;
      const copyQuery = `COPY (${substitutedSql}) TO '${tempFilePath}' (FORMAT PARQUET)`;

      await new Promise((resolve, reject) => {
        conn.execute(copyQuery, [], (err: Error | null, result: unknown) => {
          err ? reject(err) : resolve(result);
        });
      });

      const parquetBuffer = await Deno.readFile(tempFilePath);

      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=export-${Date.now()}.parquet`,
      );
      return res.end(Buffer.from(parquetBuffer));
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error(`[${requestId}] Query failed: ${msg}`);
      return res.status(500).json({
        error: "Query execution failed",
        message: "An error occurred",
      });
    } finally {
      conn.close();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[${requestId}] Error: ${msg}`);
    return res.status(500).json({
      error: "Internal server error",
      message: "An unexpected error occurred",
    });
  } finally {
    if (tempFilePath) {
      try {
        await Deno.remove(tempFilePath);
      } catch {
        logger.error(
          `[${requestId}] Failed to cleanup temp file: ${tempFilePath}`,
        );
      }
    }
  }
});

app.use("/parquet-export", router);
app.listen(8000);
