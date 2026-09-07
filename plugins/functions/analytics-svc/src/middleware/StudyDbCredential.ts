import { Logger, utils } from "@alp/alp-base-utils";
import {
    ANALYTICS_DB_DIALECTS,
    IMRIRequest,
    PABackendConfigResponse,
    StudyAnalyticsCredential,
    StudyDbMetadata,
} from "../types";
import { convertZlibBase64ToJson } from "@alp/alp-base-utils";
import PortalServerAPI from "../api/PortalServerAPI";
import { env } from "../env";
const log = Logger.CreateLogger("analytics-log");

export default async (req: IMRIRequest, res, next) => {
    log.addRequestCorrelationID(req);
    const getDatasetIdFromMriquery = (): string => {
        const base64EncodedMriQuery = req.query.mriquery;
        const base64DecodedMriQueryJson = base64EncodedMriQuery
            ? convertZlibBase64ToJson(base64EncodedMriQuery.toString())
            : "";
        return base64DecodedMriQueryJson
            ? base64DecodedMriQueryJson.datasetId
            : "";
    };

    const getDatasetIdFromRequest = (): string => {
        if (req.query.datasetId) {
            return req.query.datasetId.toString();
        } else if (req.body.datasetId) {
            return req.body.datasetId.toString();
        }
        // URL-encoded JSON path segment (e.g. /cohort/SYNTAX/%7B"datasetId":"..."%7D).
        // Bounded indexOf-based extraction avoids ReDoS from a polynomial regex.
        const url = req.url;
        const pathEnd = url.search(/[?#]/);
        const path = pathEnd === -1 ? url : url.slice(0, pathEnd);
        const start = path.indexOf("%7B");
        if (start !== -1) {
            const end = path.indexOf("%7D", start + 3);
            if (end !== -1) {
                const segment = path.slice(start, end + 3);
                if (segment.length <= 4096) {
                    try {
                        const decoded = JSON.parse(decodeURIComponent(segment));
                        if (decoded?.datasetId)
                            return String(decoded.datasetId);
                    } catch {
                        // not JSON, ignore
                    }
                }
            }
        }
        return "";
    };

    const addConfigMetadataToReq = async (datasetId: string): Promise<void> => {
        if (!datasetId) {
            log.info(`Skip PA/CDM metadata injection for path ${req.url}`);
            return;
        }

        try {
            const portalServerAPI = new PortalServerAPI();
            const paBackendConfigResponse: PABackendConfigResponse =
                await portalServerAPI.getPABackendConfig(datasetId);
            const responseMeta = paBackendConfigResponse?.meta;

            if (!responseMeta) {
                log.info(`Skip PA/CDM metadata injection for path ${req.url}`);
                return;
            }

            req.paConfigId = responseMeta.configId;
            req.paConfigVersion = responseMeta.configVersion;
            req.cdmConfigId = responseMeta.dependentConfig.configId;
            req.cdmConfigVersion = responseMeta.dependentConfig.configVersion;
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : "unknown error";
            log.info(
                `PA/CDM metadata fetch failed for datasetId ${datasetId}: ${errorMessage}`
            );
        }
    };

    const getDefaultDbConnection = (): any => {
        const studyAnalyticsCredential: StudyAnalyticsCredential = {
            ...analyticsCredentials[Object.keys(analyticsCredentials)[0]],
        };

        // The first credential is an arbitrary pick, so it may well be one
        // registered without a schema -- a bare database connection. Uppercasing
        // it unconditionally threw "Cannot read properties of undefined (reading
        // 'toUpperCase')", which surfaced as a 500 on
        // /alpdb/schema/exists and blocked adding any dataset on a HANA
        // database: that route has no dataset to look up yet, so it always lands
        // on this default path. The schema is not needed here -- main.ts
        // re-resolves the credential from the request's databaseCode for that
        // route, and callers pass schemaName explicitly.
        if (
            studyAnalyticsCredential.dialect === ANALYTICS_DB_DIALECTS.HANA &&
            studyAnalyticsCredential.schema
        ) {
            studyAnalyticsCredential.schema =
                studyAnalyticsCredential.schema.toUpperCase();
        }
        req.dbCredentials = {
            ...req.dbCredentials,
            studyAnalyticsCredential,
        };
    };

    const getDbConnectionByStudyMetadata = (
        studyMetadata: StudyDbMetadata
    ): any => {
        // Use default db connection credentials if studyMetadata is undefined
        if (studyMetadata == null) {
            getDefaultDbConnection();
            return;
        }
        // Throw error if studyMetadata.databaseName or studyMetadata.schemaName is undefined
        if (studyMetadata.databaseName == null) {
            throw new Error("studyMetadata.databaseName is empty");
        }
        if (studyMetadata.schemaName == null) {
            throw new Error("studyMetadata.schemaName is empty");
        }
        const studyDatabaseName: string = studyMetadata.databaseName;
        const studySchemaName: string = studyMetadata.schemaName;
        const studyVocabSchemaName: string = studyMetadata.vocabSchemaName;
        const studyResultsSchemaName: string = studyMetadata.resultsSchemaName;

        log.info(`studyDatabaseName ${studyDatabaseName}`);

        // analyticsCredentials may be keyed by cacheId, databaseCode or databaseName
        // depending on how the credential was registered. Try each in order so that
        // datasets registered under the new cache_id scheme still resolve.
        const credentialLookupKey =
            studyMetadata.cacheId && analyticsCredentials[studyMetadata.cacheId]
                ? studyMetadata.cacheId
                : studyMetadata.databaseCode &&
                    analyticsCredentials[studyMetadata.databaseCode]
                  ? studyMetadata.databaseCode
                  : studyDatabaseName;
        const resolvedCredential = analyticsCredentials[credentialLookupKey];
        if (!resolvedCredential) {
            throw new Error(
                `No analytics credential found for dataset (cacheId=${studyMetadata.cacheId ?? "n/a"}, databaseCode=${studyMetadata.databaseCode ?? "n/a"}, databaseName=${studyDatabaseName})`
            );
        }
        const studyAnalyticsCredential: StudyAnalyticsCredential = {
            ...resolvedCredential,
        };

        studyAnalyticsCredential.schema = studySchemaName
            ? studySchemaName
            : studyAnalyticsCredential.probeSchema;
        studyAnalyticsCredential.vocabSchema = studyVocabSchemaName
            ? studyVocabSchemaName
            : null;
        studyAnalyticsCredential.resultsSchemaName = studyResultsSchemaName
            ? studyResultsSchemaName
            : studyAnalyticsCredential.schema;

        if (studyAnalyticsCredential.dialect === ANALYTICS_DB_DIALECTS.HANA) {
            studyAnalyticsCredential.schema =
                studyAnalyticsCredential.schema.toUpperCase();
            studyAnalyticsCredential.vocabSchema =
                studyAnalyticsCredential.vocabSchema.toUpperCase();
        }

        // Add dialect and databaseCode to credentials for BIGQUERY datasets as BIGQUERY credentials are not generated in envConverter
        if (studyMetadata.dialect === ANALYTICS_DB_DIALECTS.BIGQUERY) {
            studyAnalyticsCredential.dialect = studyMetadata.dialect;
            studyAnalyticsCredential.code = studyMetadata.databaseCode;
        }

        // `code` is the credential lookup key (databaseCode); `cacheId` is the
        // DuckDB ATTACH alias used at `getConnection(<alias>, ...)`.
        studyAnalyticsCredential.cacheId =
            studyMetadata.cacheId ?? studyMetadata.databaseCode;

        // Add database pool related configs to studyAnalyticsCredential
        studyAnalyticsCredential.max = env.PG__MAX_POOL;
        studyAnalyticsCredential.min = env.PG__MIN_POOL;
        studyAnalyticsCredential.idleTimeoutMillis = env.PG__IDLE_TIMEOUT_IN_MS;

        req.dbCredentials = {
            ...req.dbCredentials,
            studyAnalyticsCredential,
        };
    };

    const analyticsCredentials = req.dbCredentials.analyticsCredentials;

    try {
        if (req.url === "/check-readiness") {
            getDefaultDbConnection();
        } else if (utils.isClientCredReq(req)) {
            if (req.query.datasetId) {
                const datasetId: string = String(req.query.datasetId);
                log.info(`Selected study ID ${datasetId}`);

                const portalServerAPI = new PortalServerAPI();
                const studies = await portalServerAPI.getStudies();

                const studyMetadata: StudyDbMetadata = studies.find(
                    (o) => o.tokenStudyCode === datasetId
                );
                log.info(
                    `Selected studyMetadata ${JSON.stringify(studyMetadata)}`
                );
                // Set req.selectedstudyDbMetadata if it does not already exist
                if (!req.selectedstudyDbMetadata) {
                    req.selectedstudyDbMetadata = studyMetadata;
                }
                getDbConnectionByStudyMetadata(studyMetadata);
                await addConfigMetadataToReq(datasetId);
            } else {
                getDefaultDbConnection();
            }
        } else {
            // TODO: throw exact error for missing db metadata later on once mri sends in selected study entity value
            // TODO: check for selected study is in user jwt token for authorisation
            let datasetId: string = getDatasetIdFromMriquery();
            // If datasetId is not found from mriquery, try and find datasetId from request query or body
            if (!datasetId) {
                datasetId = getDatasetIdFromRequest();
            }
            const studyMetadata: StudyDbMetadata =
                req.studiesDbMetadata.studies.find(
                    (o) => o.id === datasetId || o.tokenStudyCode === datasetId
                );
            // Set req.selectedstudyDbMetadata if it does not already exist
            if (!req.selectedstudyDbMetadata) {
                req.selectedstudyDbMetadata = studyMetadata;
            }
            getDbConnectionByStudyMetadata(studyMetadata);
            await addConfigMetadataToReq(datasetId);
        }
        next();
    } catch (err) {
        log.enrichErrorWithRequestCorrelationID(err, req);
        log.error(err);
        next(err);
    }
};
