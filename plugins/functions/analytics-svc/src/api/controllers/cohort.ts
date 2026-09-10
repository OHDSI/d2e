import { Response } from "express";
import { promisify } from "node:util";
import { MriConfigConnection } from "@alp/alp-config-utils";
import {
    IMRIRequest,
    CohortType,
    CohortDefinitionTableType,
    StudyDbMetadata,
} from "../../types";
import MRIEndpointErrorHandler from "../../utils/MRIEndpointErrorHandler";
import { Logger, getUser, User } from "@alp/alp-base-utils";
import CreateLogger = Logger.CreateLogger;
let logger = CreateLogger("analytics-log");
import { CohortEndpoint } from "../../mri/endpoint/CohortEndpoint";
import { generateQuery } from "../../utils/QueryGenSvcProxy";
import { createEndpointFromRequest } from "../../mri/endpoint/CreatePluginEndpoint";
import PortalServerAPI from "../PortalServerAPI";
import { convertIFRToExtCohort } from "../../ifr-to-extcohort/main";
import { dataflowRequest } from "../../utils/DataflowMgmtProxy";
import { env } from "../../env";
import { createCdmSqlAuditContext } from "../../utils/CdmSqlAuditLogger.ts";
import {
    evictCohortCacheEntry,
    readCohortDefinitionSyntax,
    refreshCohortCacheEntry,
    updateCohortCacheEntryMetadata,
} from "../../utils/cohortCacheMaintenance.ts";

const language = "en";

const mriConfigConnection = new MriConfigConnection(
    env.SERVICE_ROUTES?.paConfig
);

/*
Returns cache results schema name and source results schema name
*/
const _getResultsSchemaNames = async (
    studyDbMetadata: StudyDbMetadata
): Promise<[string, string]> => {
    if (studyDbMetadata.type === "webapi") {
        return [studyDbMetadata.resultsSchemaName, ""];
    } else {
        const sourceDatasetResultsSchema =
            await _getSourceDatasetResultsSchemaName(
                studyDbMetadata.sourceStudyId
            );
        return [studyDbMetadata.resultsSchemaName, sourceDatasetResultsSchema];
    }
};

const _getSourceDatasetResultsSchemaName = async (
    sourceDatasetId: string | null
): Promise<string> => {
    if (!sourceDatasetId) {
        return "";
    }
    const portalServerAPI = new PortalServerAPI();
    const sourceDataset = await portalServerAPI.getStudy(sourceDatasetId);

    return sourceDataset.resultsSchemaName;
};

export function getCohortAnalyticsConnection(req: IMRIRequest) {
    const { analyticsConnection } = req.dbConnections;
    return analyticsConnection;
}

export async function getAllCohorts(req: IMRIRequest, res: Response) {
    try {
        const analyticsConnection = getCohortAnalyticsConnection(req);
        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        const cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );

        const offset = req.query.offset;
        const limit = req.query.limit;
        const excludePatientIds = req.query.excludePatientIds === "true";

        // Send empty object to query all cohorts
        const result = await cohortEndpoint.queryCohorts(
            {},
            offset,
            limit,
            excludePatientIds
        );
        // Get count of all cohort definitions for pagination
        const cohortDefinitionCount =
            await cohortEndpoint.queryCohortDefinitionCount({});

        res.status(200).send({ data: result, cohortDefinitionCount });
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function getFilteredCohorts(req: IMRIRequest, res: Response) {
    try {
        const analyticsConnection = getCohortAnalyticsConnection(req);
        const filterColumn = req.params.filterColumn;
        const filterValue = req.params.filterValue;
        const offset = req.query.offset;
        const limit = req.query.limit;
        const excludePatientIds = req.query.excludePatientIds === "true";
        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        let cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );

        let result = await cohortEndpoint.queryCohorts(
            {
                [filterColumn]:
                    filterColumn === "SYNTAX"
                        ? JSON.parse(filterValue)
                        : filterValue,
            },
            offset,
            limit,
            excludePatientIds
        );

        let cohortDefinitionCount;
        if (limit && Number(limit) > 0) {
            // Get count of all cohort definitions based on filter column for pagination
            cohortDefinitionCount =
                await cohortEndpoint.queryCohortDefinitionCount({
                    [filterColumn]:
                        filterColumn === "SYNTAX"
                            ? JSON.parse(filterValue)
                            : filterValue,
                });
        } else {
            cohortDefinitionCount = result.length;
        }

        res.status(200).send({ data: result, cohortDefinitionCount });
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function createCohort(req: IMRIRequest, res: Response) {
    try {
        const datasetId = req.body.datasetId;
        const token = req.headers.authorization;
        const { bookmarkId } = JSON.parse(req.body.syntax);
        const analyticsConnection = getCohortAnalyticsConnection(req);
        const { schemaName, databaseCode, vocabSchemaName } =
            req.selectedstudyDbMetadata;
        const language = getUser(req).lang;
        const requestQuery: string[] | undefined = req.body?.query?.split(",");
        // Remap mriquery for use in createEndpointFromRequest
        const { cohortDefinition } = await createEndpointFromRequest(req);

        const portalServerAPI = new PortalServerAPI();
        // Get bookmark
        const bookmark = await portalServerAPI.getBookmarkById(
            bookmarkId,
            datasetId
        );
        if (!bookmark) {
            throw `No bookmarks found with bookmark_id: ${bookmarkId}`;
        }

        if (env.USE_EXTENSION_FOR_COHORT_CREATION === "true") {
            const mriConfig = await mriConfigConnection.getStudyConfig(
                {
                    req,
                    action: "getBackendConfig",
                    configId: req.paConfigId,
                    configVersion: req.paConfigVersion,
                    lang: language,
                    datasetId,
                },
                true
            );
            const attributes = {
                filter: {
                    configMetadata: {
                        id: cohortDefinition.configData.configId,
                        version: cohortDefinition.configData.configVersion,
                    },
                    cards: cohortDefinition.cards,
                    sort: "",
                },
            };
            const ohdsiCohortDefinition = await convertIFRToExtCohort(
                attributes,
                mriConfig.config,
                req,
                datasetId
            );
            const now = new Date().toISOString().split("T")[0];
            await dataflowRequest(req, "POST", `cohort/flow-run`, {
                options: {
                    token,
                    datasetId,
                    cohortJson: {
                        id: 1, // Not used by us
                        name: bookmark.bookmark_name,
                        tags: [],
                        expression: {
                            datasetId, // required for cohort filtering
                            bookmarkId, // required for cohort filtering
                            ...ohdsiCohortDefinition,
                        },
                        createdDate: now,
                        modifiedDate: now,
                        expressionType: "SIMPLE_EXPRESSION",
                        hasWriteAccess: false,
                    },
                    description: req.body.description,
                    schemaName,
                    databaseCode,
                    vocabSchemaName,
                },
            });

            res.status(200).send();
            return;
        }

        //Currently streaming is only supported for Hana
        const stream =
            req.dbCredentials.studyAnalyticsCredential.dialect.toLowerCase() ===
                "hana" && env.ANALYTICS_HANA_STREAMING_ENABLED === "true";

        const querySvcParams = {
            queryParams: {
                configId: req.paConfigId,
                configVersion: req.paConfigVersion,
                datasetId,
                queryType: "plugin",
                ifrRequest: cohortDefinition,
                language,
                requestQuery,
                insert: false,
                stream,
            },
        };

        // Request query string from query-gen-svc for inserting the cohort patients.
        // In query-gen-svc, it uses the same logic used in patient list to deal with the filters
        const queryResponse = await generateQuery(
            req,
            querySvcParams,
            "cohort"
        );

        const cohort = await getCohortFromMriQuery(req, bookmark.bookmark_name);
        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        const cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );

        // Check if materialized cohort exists for current bookmark
        const existingMaterializedCohort = (
            await cohortEndpoint.queryCohorts(
                {
                    SYNTAX: { datasetId, bookmarkId: bookmarkId },
                },
                0,
                1,
                true
            )
        )[0];

        let cohortDefinitionId;
        if (existingMaterializedCohort) {
            // If there exists an existing materialized cohort
            // Update existing cohort definition and remove all existing records from cohort table before saving cohort to db
            cohortDefinitionId = existingMaterializedCohort.id;
            await cohortEndpoint.updateCohortDefinitionToDb({
                ...cohort,
                id: cohortDefinitionId,
            });

            // Remove existing records from cohort table before saving cohort to db
            await cohortEndpoint.deleteCohortFromDb(cohortDefinitionId);
        } else {
            // Else if there is no existing materialized cohort
            // Save cohort definition to db and query cohort definition id for newly created cohort definition
            // Save cohort to db
            await cohortEndpoint.saveCohortDefinitionToDb(cohort);

            // Get cohort definition id from cohort object
            cohortDefinitionId =
                await cohortEndpoint.queryCohortDefinitionId(cohort);
        }

        if (stream) {
            await cohortEndpoint.streamCohortToDb(
                cohortDefinitionId,
                cohort,
                queryResponse.queryObject,
                {
                    datasetId: req.selectedstudyDbMetadata.id,
                    token: req.headers.authorization,
                    dbCredential: req.dbCredentials.studyAnalyticsCredential,
                    auditContext: createCdmSqlAuditContext({
                        request: req,
                        actorId: getUser(req)?.getUser() ?? "unknown",
                        databaseCode:
                            req.dbCredentials.studyAnalyticsCredential.code,
                        databaseDialect:
                            req.dbCredentials.studyAnalyticsCredential.dialect,
                        databaseEngine: "hana",
                        schemaName:
                            req.dbCredentials.studyAnalyticsCredential.schema,
                    }),
                }
            );
        } else {
            await cohortEndpoint.saveCohortToDb(
                cohortDefinitionId,
                cohort,
                queryResponse.queryObject
            );
        }

        await refreshCohortCacheEntry({
            cohortEndpoint,
            cohortDefinitionId,
            bookmarkId,
            datasetId,
            paConfigId: req.paConfigId,
        });

        // Return the id so callers do not have to re-read it from the bookmark
        // list, where it is only derived once the materialized cohort is
        // visible to the reading connection.
        res.status(200).json({
            message: `Cohort successfully materialized`,
            // Coerced: the driver may hand the id back as a string, and
            // consumers reject anything that is not an integer.
            cohortDefinitionId: Number(cohortDefinitionId),
        });
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function generateCohortDefinition(
    req: IMRIRequest,
    res: Response
) {
    try {
        const datasetId = req.body.datasetId;
        const language = getUser(req).lang;
        // Remap mriquery for use in createEndpointFromRequest
        const { cohortDefinition } = await createEndpointFromRequest(req);
        const mriConfig = await mriConfigConnection.getStudyConfig(
            {
                req,
                action: "getBackendConfig",
                configId: req.paConfigId,
                configVersion: req.paConfigVersion,
                lang: language,
                datasetId,
            },
            true
        );
        const attributes = {
            filter: {
                configMetadata: {
                    id: cohortDefinition.configData.configId,
                    version: cohortDefinition.configData.configVersion,
                },
                cards: cohortDefinition.cards,
                sort: "",
            },
        };
        const ohdsiCohortDefinition = await convertIFRToExtCohort(
            attributes,
            mriConfig.config,
            req,
            datasetId
        );

        res.status(200).send(ohdsiCohortDefinition);
        return;
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function getCohortDefinition(req: IMRIRequest, res: Response) {
    try {
        const analyticsConnection = getCohortAnalyticsConnection(req);

        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        const cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );

        const result = await cohortEndpoint.getCohortDefinition(
            req.query.cohortDefinitionId
        );

        res.status(200).send(result);
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function createCohortDefinition(req: IMRIRequest, res: Response) {
    try {
        const analyticsConnection = getCohortAnalyticsConnection(req);

        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        let cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );

        const cohortDefiniton = <CohortDefinitionTableType>{
            name: req.body.name,
            description: req.body.description ?? "",
            creationTimestamp: new Date().toISOString().split("T")[0],
            definitionTypeConceptId: req.body.definitionTypeConceptId ?? 0,
            subjectConceptId: req.body.subjectConceptId ?? 0,
            syntax: req.body.syntax,
        };

        await cohortEndpoint.saveCohortDefinitionToDb(cohortDefiniton);

        // Get inserted cohort definition id from cohort definition
        const cohortDefinitionId =
            await cohortEndpoint.queryCohortDefinitionId(cohortDefiniton);

        res.status(200).send({
            data: cohortDefinitionId,
        });
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function updateCohortDefinition(req: IMRIRequest, res: Response) {
    try {
        const cohortDefinitionId = req.body.cohortDefinitionId;
        const name = req.body.name;
        const description = req.body.description;
        const definitionTypeConceptId = req.body.definitionTypeConceptId;
        const syntax = req.body.syntax;
        const subjectConceptId = req.body.subjectConceptId;

        const analyticsConnection = getCohortAnalyticsConnection(req);

        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        const cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );

        // Get existing cohort definition via cohort definition id
        const { data: cohortDefinitions } =
            await cohortEndpoint.getCohortDefinition(cohortDefinitionId);
        if (cohortDefinitions.length < 0) {
            throw `No cohort definition found for cohort definition id:${cohortDefinitionId}`;
        }
        const existingCohortDefinition = cohortDefinitions[0];

        // Create new cohort definition id object based on existing cohort definition and incoming parameters
        const newCohortDefinition: CohortDefinitionTableType = {
            id: cohortDefinitionId,
            name: name ?? existingCohortDefinition.COHORT_DEFINITION_NAME,
            description:
                description ??
                existingCohortDefinition.COHORT_DEFINITION_DESCRIPTION,
            creationTimestamp: existingCohortDefinition.COHORT_INITIATION_DATE,
            definitionTypeConceptId:
                definitionTypeConceptId ??
                existingCohortDefinition.DEFINITION_TYPE_CONCEPT_ID,
            subjectConceptId:
                subjectConceptId ?? existingCohortDefinition.SUBJECT_CONCEPT_ID,
            syntax: syntax ?? existingCohortDefinition.COHORT_DEFINITION_SYNTAX,
        };

        await cohortEndpoint.updateCohortDefinitionToDb(newCohortDefinition);

        // Fire-and-forget: a cache metadata update must not fail the response.
        updateCohortCacheEntryMetadata({
            syntax: newCohortDefinition.syntax,
            datasetId: req.body.datasetId ?? req.selectedstudyDbMetadata?.id,
            paConfigId: req.paConfigId,
            name: newCohortDefinition.name,
            description: newCohortDefinition.description,
        }).catch((err) =>
            logger.warn(`Cohort cache metadata update rejected: ${err}`)
        );

        res.status(200).send(newCohortDefinition);
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function deleteCohort(req: IMRIRequest, res: Response) {
    try {
        // Delete cohort from database
        const cohortId = req.query.cohortId;
        const analyticsConnection = getCohortAnalyticsConnection(req);

        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        let cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );
        const cohortDefinitionSyntax = await readCohortDefinitionSyntax(
            cohortEndpoint,
            cohortId
        );
        await evictCohortCacheEntry({
            syntax: cohortDefinitionSyntax,
            datasetId: req.selectedstudyDbMetadata?.id ?? req.query?.datasetId,
            paConfigId: req.paConfigId,
        });

        // Delete cohort definition from database
        const cohortDefinitionResult =
            await cohortEndpoint.deleteCohortDefinitionFromDb(cohortId);
        // Delete cohort from database
        const cohortResult = await cohortEndpoint.deleteCohortFromDb(cohortId);

        res.status(200).send(
            `Deleted ${cohortDefinitionResult.data} rows from COHORT_DEFINITION and ${cohortResult.data} rows from COHORT with ID: ${cohortId}`
        );
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function materializeCohort(req: IMRIRequest, res: Response) {
    try {
        const cohortDefinitionId = req.body.cohortDefinitionId;
        const datasetId = req.body.datasetId;
        const batchData = JSON.parse(req.body.batchData);
        const count = Number(req.body.count);
        console.log("Batch data length:", batchData.length);
        console.log("Requests count:", count);

        const analyticsConnection = getCohortAnalyticsConnection(req);

        const insertCohortQueryInBatches = `INSERT INTO cdmsynpuf.COHORT 
                                                            (COHORT_DEFINITION_ID, SUBJECT_ID, COHORT_START_DATE, COHORT_END_DATE) VALUES 
                                                            (6, ?, ?, ?)`;
        const bulkInsert = promisify(
            analyticsConnection.executeBulkInsert.bind(analyticsConnection)
        );
        let start = 0,
            end = batchData.length >= 5000 ? 5000 : batchData.length;
        let inserts = [];
        while (start < batchData.length) {
            inserts.push(
                bulkInsert(
                    insertCohortQueryInBatches,
                    batchData.slice(start, end)
                )
            );
            // inserts.push([start, end]);
            start = end;
            end =
                batchData.length >= end + 5000 ? end + 5000 : batchData.length;
        }

        if (start === end) {
            inserts.push(
                bulkInsert(
                    insertCohortQueryInBatches,
                    batchData.slice(start, end)
                )
            );
        }

        console.log(`Total batches to insert: ${inserts.length}`);

        await Promise.allSettled(inserts);

        analyticsConnection.close();

        res.status(200).send({ message: "Cohort materialized successfully" });
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

export async function checkIfSchemaCanMaterializeCohort(
    req: IMRIRequest,
    res: Response
) {
    try {
        const analyticsConnection = await getCohortAnalyticsConnection(req);

        const [cacheResultsSchemaName, sourceResultsSchemaName] =
            await _getResultsSchemaNames(req.selectedstudyDbMetadata);
        const cohortEndpoint = await CohortEndpoint.createCohortEndpoint(
            analyticsConnection,
            cacheResultsSchemaName,
            req.dbCredentials.studyAnalyticsCredential.dialect,
            req.dbCredentials.studyAnalyticsCredential.authentication_mode,
            req.dbCredentials.studyAnalyticsCredential.code,
            req.selectedstudyDbMetadata.type,
            sourceResultsSchemaName
        );

        const result = await cohortEndpoint.checkIfSchemaCanMaterializeCohort();
        res.status(200).send(result);
    } catch (err) {
        logger.error(err);
        res.status(500).send(MRIEndpointErrorHandler({ err, language }));
    }
}

// Form and return cohort object
async function getCohortFromMriQuery(
    req: IMRIRequest,
    cohortName: string
): Promise<CohortType> {
    try {
        const patientIds = [];

        // Add mriquery to cohort definition syntax
        const syntax = {
            mriquery: req.body.mriquery,
            ...JSON.parse(req.body.syntax),
        };

        // Create cohort object
        let cohort = <CohortType>{
            patientIds,
            name: cohortName,
            description: req.body.description,
            creationTimestamp: new Date().toISOString().split("T")[0],
            definitionTypeConceptId: req.body.definitionTypeConceptId ?? 0,
            subjectConceptId: req.body.subjectConceptId ?? 0,
            syntax: JSON.stringify(syntax),
        };

        return cohort;
    } catch (err) {
        throw err;
    }
}
