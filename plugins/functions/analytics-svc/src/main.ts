// tslint:disable:no-console
import * as dotenv from "dotenv";
import {
    DBConnectionUtil as dbConnectionUtil,
    getUser,
    QueryObject,
    EnvVarUtils,
    healthCheckMiddleware,
    User,
    utils,
    Connection,
    translateHanaToDuckdb,
} from "@alp/alp-base-utils";
import * as pathx from "https://deno.land/std@0.188.0/path/mod.ts";

import express from "express";
import helmet from "helmet";
import path from "path";
import yaml from "npm:yaml";
import * as mri2 from "./mri/endpoint/analytics";
import * as xsenv from "@sap/xsenv";
import { Settings } from "./qe/settings/Settings";
//import * as swagger from "@alp/swagger-node-runner";
import MRIEndpointErrorHandler from "./utils/MRIEndpointErrorHandler";
import { controllers } from "./api/controllers/index.ts";
import noCacheMiddleware from "./middleware/NoCache";
import timerMiddleware from "./middleware/Timer";
import studyDbCredentialMiddleware from "./middleware/StudyDbCredential";
import { MriConfigConnection } from "@alp/alp-config-utils";
import { StudyDbMetadata, IMRIRequest, ANALYTICS_DB_DIALECTS } from "./types";
import PortalServerAPI from "./api/PortalServerAPI";
import { env } from "./env";
import addCorrelationIDToHeader from "./middleware/AddCorrelationId.ts";
import { parseValueForPrototypePollutingAssignment } from "./utils/utils";
import { getAuditUserIdFromRequest } from "./utils/AuditLogger.ts";
import {
    createCdmSqlAuditConnection,
    createCdmSqlAuditContext,
} from "./utils/CdmSqlAuditLogger.ts";
dotenv.config();
const log = console; //Logger.CreateLogger("analytics-log");
const mriConfigConnection = new MriConfigConnection(
    env.SERVICE_ROUTES?.paConfig
);
const envVarUtils = new EnvVarUtils(Deno.env.toObject());
/**
 * Declare Startup Functions
 */

const initRoutes = async (app: express.Application) => {
    app.use(helmet());
    app.use(express.json({ strict: false, limit: "50mb" }));
    app.use(express.urlencoded({ extended: true, limit: "50mb" }));
    app.use(noCacheMiddleware);

    // set request correlation ID to logger (if available)
    app.use(addCorrelationIDToHeader);

    let analyticsCredentials;

    if (envVarUtils.isStageLocalDev()) {
        app.use(timerMiddleware());
    }

    analyticsCredentials = env.VCAP_SERVICES["mridb"]
        .filter((x) => x["tags"]?.indexOf("analytics") > -1)
        //.filterServices({ tag: "analytics" })
        .reduce((acc, item) => {
            // Reduce credentials so that key of object is databaseCode
            acc[item.credentials.code] = item.credentials;
            return acc;
        }, {});

    // Calls Alp-Portal for studies db metadata
    // Ignore Alp-Portal check for readiness probe check
    app.use(async (req: IMRIRequest, res, next) => {
        try {
            if (req.url !== "/check-readiness" && !utils.isClientCredReq(req)) {
                const publicEndpoint = "/analytics-svc/api/services/public";
                let studies: StudyDbMetadata[];
                // Checks if its public
                if (req.originalUrl.startsWith(publicEndpoint)) {
                    log.info("getting public studies metadata");
                    studies = await new PortalServerAPI().getPublicStudies();
                } else {
                    // Get Analytics Credential for study based on selected study
                    const timestamp = new Date().valueOf();
                    console.time(
                        `timer-analytics-svc-PortalServerAPI-getStudies-${timestamp}`
                    );
                    const portalServerAPI = new PortalServerAPI();
                    studies = await portalServerAPI.getStudies();
                    console.timeEnd(
                        `timer-analytics-svc-PortalServerAPI-getStudies-${timestamp}`
                    );
                }

                req.studiesDbMetadata = {
                    studies,
                };
            }

            req.dbCredentials = {
                ...req.dbCredentials,
                analyticsCredentials,
            };

            next();
        } catch (err) {
            log.error(err);
            res.status(500);
        }
    });

    // Get Analytics Credential for study based on selected study
    // Otherwise, default it to the first db connection and use default schema in the connection string
    await app.use(studyDbCredentialMiddleware);

    app.use(async (req: IMRIRequest, res, next) => {
        try {
            if (!utils.isHealthProbesReq(req)) {
                let userObj: User;
                try {
                    userObj = getUser(req);
                    // log.debug(
                    //     `req.headers: ${JSON.stringify(req.headers)}\n
                    //         currentUser: ${JSON.stringify(userObj)}\n
                    //         url is: ${req.url}`
                    // );
                } catch (err) {
                    log.debug(`No user found in request:${err.stack}`);
                }

                let credentials;
                // If request starts with "/analytics-svc/api/services/alpdb/schema/exists", as this request is seeking information where a dataset might not exist yet, get database credentials directly from incoming databaseCode
                if (
                    req.originalUrl.startsWith(
                        "/analytics-svc/api/services/alpdb/schema/exists"
                    )
                ) {
                    log.info(
                        "Getting credentials from analyticsCredentials for /alpdb/schema/exists requests"
                    );
                    const databaseCode =
                        parseValueForPrototypePollutingAssignment(
                            req.query.databaseCode as string
                        );
                    credentials =
                        req.dbCredentials.analyticsCredentials[databaseCode];
                    if (!credentials) {
                        throw new Error(
                            `Database code:${databaseCode} not found in analyticsCredentials`
                        );
                    }
                    // Set credentials.schema as undefined so that SET SCHEMA is skipped for this endpoint
                    // Check if schema exists endpoint does not require schema in the credentials, instead it uses schema from request parameters
                    credentials.schema = undefined;
                } else {
                    credentials = req.dbCredentials.studyAnalyticsCredential;
                }

                const dbConnections =
                    credentials.dialect === ANALYTICS_DB_DIALECTS.HANA
                        ? await getDBConnections({
                              analyticsCredentials: credentials,
                              userObj,
                              sessionVariables: {
                                  paConfigId: req.paConfigId,
                                  paConfigVersion: req.paConfigVersion,
                                  cdmConfigId: req.cdmConfigId,
                                  cdmConfigVersion: req.cdmConfigVersion,
                              },
                          })
                        : getTrexDbConnection({
                              analyticsCredentials: credentials,
                          });

                req.dbConnections = {
                    ...dbConnections,
                    analyticsConnection: createCdmSqlAuditConnection(
                        dbConnections.analyticsConnection,
                        createCdmSqlAuditContext({
                            request: req,
                            actorId:
                                userObj?.getUser() ??
                                getAuditUserIdFromRequest(req) ??
                                "unknown",
                            databaseCode: credentials.code,
                            databaseDialect: credentials.dialect,
                            databaseEngine:
                                credentials.dialect ===
                                ANALYTICS_DB_DIALECTS.HANA
                                    ? "hana"
                                    : "duckdb",
                            schemaName: credentials.schema,
                        })
                    ),
                };
            }

            next();
        } catch (err) {
            next(err);
        }
    });

    app.use((req: IMRIRequest, res, next) => {
        // Skip getting cleanupMiddleware if request starts with "/analytics-svc/api/services/alpdb/", as these requests are all in dbsvc.ts and has a separate implementation for database connection cleanups
        if (req.originalUrl.startsWith("/analytics-svc/api/services/alpdb/")) {
            log.info("Skipping cleanupMiddleware for /alpdb/* requests");
            return next();
        }

        if (!utils.isHealthProbesReq(req)) {
            dbConnectionUtil.DBConnectionUtil.cleanupMiddleware()(
                req as any,
                res,
                next
            );
        } else {
            next();
        }
    });

    app.use("/check-readiness", healthCheckMiddleware);

    app.use(
        "/analytics-svc/pa/services/sessionVars",
        (req: IMRIRequest, res, next) => {
            QueryObject.QueryObject.format(
                `select 
      SESSION_CONTEXT('XS_APPLICATIONUSER') as DB_USER_NAME, 
      SESSION_CONTEXT('APPLICATIONUSER') as APP_USER_NAME from dummy`
            ).executeQuery(
                req.dbConnections.analyticsConnection,
                (err, result) => {
                    if (err) {
                        log.error(err);
                        return next(err);
                    }
                    res.status(200).json(result);
                }
            );
        }
    );

    app.use(
        "/analytics-svc/pa/services/analytics.xsjs",
        async (req: IMRIRequest, res, next) => {
            console.log("ana.xsjs");
            // get user from request
            const user = getUser(req);
            const language = user.lang;
            let action = req.query.action
                ? req.query.action
                : req.method === "POST"
                  ? req.body.action
                  : "";
            let tmpbody =
                (req.query.data ? JSON.parse(<string>req.query.data) : null) ||
                req.body;
            let body;
            body = typeof tmpbody === "object" ? tmpbody : JSON.parse(tmpbody);
            body.language = language;
            const csvParam = req.query.csvparam
                ? JSON.parse(<string>req.query.csvparam)
                : req.body.csvParam;

            const { analyticsConnection } = req.dbConnections;

            let configResults;
            let datasetId;
            switch (action) {
                case "getMyConfig":
                case "getMyConfigList":
                case "getMyStudyConfigList":
                    datasetId =
                        typeof req.query?.datasetId === "string"
                            ? req.query.datasetId
                            : null;
                    let queryParams = {
                        action: "getMyConfig",
                        datasetId,
                        configId: req.paConfigId,
                    };

                    configResults = await mriConfigConnection.getMriConfig(
                        req,
                        queryParams
                    );

                    if (!configResults) {
                        res.status(500).send(
                            MRIEndpointErrorHandler({
                                err: {
                                    name: "mri-pa",
                                    message: `Error in getting the list of configs!`,
                                },
                                language,
                            })
                        );
                    } else {
                        // Handle error from mriConfigConnection.getMriConfig
                        if (configResults.statusCode) {
                            const statusCode = configResults.statusCode;
                            const message = configResults.message;
                            if (statusCode >= 400 && statusCode < 600) {
                                log.error(message);
                                res.status(statusCode).send(
                                    MRIEndpointErrorHandler({
                                        err: {
                                            name: "mri-pa",
                                            message: message,
                                        },
                                        language,
                                    })
                                );
                            }
                        } else {
                            res.status(200).json(configResults);
                        }
                    }
                    break;
                case "getFrontendConfig":
                case "setDefault":
                case "clearDefault":
                    datasetId =
                        typeof req.query?.datasetId === "string"
                            ? req.query.datasetId
                            : null;
                    let qParams = {
                        action: "getMyConfig",
                        datasetId,
                        configId: req.paConfigId,
                    };
                    configResults = await mriConfigConnection.getMriConfig(
                        req,
                        qParams
                    );
                    if (!configResults) {
                        res.status(500).send(
                            MRIEndpointErrorHandler({
                                err: {
                                    name: "mri-pa",
                                    message: `Error in clearing default config!`,
                                },
                                language,
                            })
                        );
                    } else {
                        // Handle error from mriConfigConnection.getMriConfig
                        if (configResults.statusCode) {
                            const statusCode = configResults.statusCode;
                            const message = configResults.message;
                            if (statusCode >= 400 && statusCode < 600) {
                                log.error(message);
                                res.status(statusCode).send(
                                    MRIEndpointErrorHandler({
                                        err: {
                                            name: "mri-pa",
                                            message: message,
                                        },
                                        language,
                                    })
                                );
                            }
                        }

                        res.status(200).json(configResults);
                    }
                    break;
                default:
                    try {
                        let configId = req.paConfigId;
                        let configVersion = req.paConfigVersion;

                        //Only for tests choose metadata from the request body
                        if (
                            envVarUtils.isTestEnv() ||
                            envVarUtils.isHttpTestRun()
                        ) {
                            let configData = Array.isArray(body)
                                ? body[0].configData
                                : body.configData;

                            if (
                                configData &&
                                (configData.length > 0 ||
                                    Object.keys(configData).length > 0)
                            ) {
                                configId = configData.configId;
                                configVersion = configData.configVersion;
                            } else {
                                throw new Error("Config metadata undefined!");
                            }
                        }

                        const datasetId = req.body.datasetId;
                        const mriConfig =
                            await mriConfigConnection.getStudyConfig(
                                {
                                    req,
                                    action: "getBackendConfig",
                                    configId,
                                    configVersion,
                                    lang: language,
                                    datasetId,
                                },
                                true
                            );
                        let userSpecificSettings =
                            new Settings().initAdvancedSettings(
                                mriConfig.config.advancedSettings
                            );
                        let placeholderMap =
                            userSpecificSettings.getPlaceholderMap();

                        if (
                            [
                                "aggquerycsv",
                                "boxplotcsv",
                                "kmquerycsv",
                                "patientdetailcsv",
                            ].indexOf(action) > -1
                        ) {
                            let sFilename;
                            switch (action) {
                                case "aggquerycsv":
                                    sFilename =
                                        req.query.name ||
                                        "PatientAnalytics_Bar-Chart_" +
                                            new Date().toISOString() +
                                            ".csv";
                                    break;
                                case "boxplotcsv":
                                    sFilename =
                                        req.query.name ||
                                        "PatientAnalytics_Boxplot-Chart_" +
                                            new Date().toISOString() +
                                            ".csv";
                                    break;
                                case "kmquerycsv":
                                    sFilename =
                                        req.query.name ||
                                        "PatientAnalytics_Kaplan-Meier_" +
                                            new Date().toISOString() +
                                            ".csv";
                                    break;
                                case "patientdetailcsv":
                                    sFilename =
                                        req.query.name ||
                                        "PatientAnalytics_Patient-List_" +
                                            new Date().toISOString() +
                                            ".csv";
                                    break;
                                default:
                                    break;
                            }
                            mri2.processRequestCsv(
                                action,
                                req,
                                configId,
                                configVersion,
                                datasetId,
                                body,
                                language,
                                analyticsConnection,
                                csvParam,
                                (err, result) => {
                                    if (err) {
                                        return res.status(500).send(
                                            MRIEndpointErrorHandler({
                                                err,
                                                language,
                                            })
                                        );
                                    }
                                    res.set({
                                        "content-disposition":
                                            "attachment; filename=" + sFilename,
                                        "content-Type": "text/csv",
                                    });
                                    res.status(200).send(result);
                                }
                            );
                        } else {
                            mri2.processRequest(
                                req,
                                action,
                                configId,
                                configVersion,
                                datasetId,
                                body,
                                language,
                                mriConfig.config,
                                analyticsConnection,
                                (err, result) => {
                                    if (err) {
                                        return res.status(500).send(
                                            MRIEndpointErrorHandler({
                                                err,
                                                language,
                                            })
                                        );
                                    }
                                    res.status(200).json(result);
                                }
                            );
                        }
                    } catch (err) {
                        return res
                            .status(500)
                            .send(MRIEndpointErrorHandler({ err, language }));
                    }
                    break;
            }
        }
    );

    /**Access rights: End User */

    log.info("Initialized express routes..");
    Promise.resolve();
};

const initSwaggerRoutes = async (app: express.Application) => {
    log.info("initSwaggerRoutes: Starting route registration...");
    // Calculate base path for file resolution in Trex worker context
    const trexFunctionPath = Deno.env.get("TREX_FUNCTION_PATH") || "";
    log.info(`initSwaggerRoutes: TREX_FUNCTION_PATH = ${trexFunctionPath}`);

    const srcBasePath = path
        .dirname(pathx.fromFileUrl(import.meta.url))
        .replace(
            /\/var\/tmp\/sb-compile-trex/,
            trexFunctionPath.replace(/\/[^\/]*\/?$/, "")
        );
    log.info(`initSwaggerRoutes: srcBasePath = ${srcBasePath}`);
    const swaggerFilePath =
        srcBasePath.slice(0, -3) + "api/swagger/swagger.yaml";
    log.info(`initSwaggerRoutes: Loading swagger from ${swaggerFilePath}`);
    const swaggerFile = yaml.parse(await Deno.readTextFile(swaggerFilePath));
    const basePath = swaggerFile["basePath"];
    log.info(`initSwaggerRoutes: basePath = ${basePath}`);
    for (const [swaggerPath, value] of Object.entries(swaggerFile["paths"])) {
        // Skip swagger route
        if (swaggerPath === "/swagger") {
            log.info(
                "Skipping '/swagger' route as it is not linked to a x-swagger-router-controller file"
            );
            continue;
        }

        const controllerFile = value["x-swagger-router-controller"];
        try {
            const controller = controllers[controllerFile];
            if (!controller) {
                log.error(
                    `Controller not found in registry: ${controllerFile}`
                );
                continue;
            }
            log.info(
                `initSwaggerRoutes: Loaded ${controllerFile} from registry`
            );
            const url = `${basePath}${swaggerPath.slice(1)}`
                .replace(/\{(.+?)\}/g, ":$1")
                .replace(/\/$/, ""); // Remove trailing slash for consistent matching
            for (const [k, v] of Object.entries(value)) {
                switch (k) {
                    case "get":
                        app.get(url, controller[v["operationId"]]);
                        log.info(
                            `Registered GET ${url} -> ${v["operationId"]}`
                        );
                        break;
                    case "post":
                        app.post(url, controller[v["operationId"]]);
                        log.info(
                            `Registered POST ${url} -> ${v["operationId"]}`
                        );
                        break;
                    case "put":
                        app.put(url, controller[v["operationId"]]);
                        log.info(
                            `Registered PUT ${url} -> ${v["operationId"]}`
                        );
                        break;
                    case "delete":
                        app.delete(url, controller[v["operationId"]]);
                        log.info(
                            `Registered DELETE ${url} -> ${v["operationId"]}`
                        );
                        break;
                    default:
                        if (k != "x-swagger-router-controller")
                            log.warn(`Unknown HTTP method: ${k}`);
                }
            }
        } catch (e) {
            log.error(`Failed to register controller ${controllerFile}: ${e}`);
        }
    }

    /*swagger.create(config, (err, swaggerRunner) => {
        if (err) {
            return Promise.reject(err);
        }
        try {
            let swaggerExpress = swaggerRunner.expressMiddleware();
            swaggerExpress.register(app); // install middleware
            log.info("Swagger routes Initialized..");
            Promise.resolve();
        } catch (err) {
            log.error("Error initializing swagger routes: " + err);
            Promise.reject(err);
        }
    });*/
};

let initSettingsFromEnvVars = () => {
    EnvVarUtils.loadDevSettings();
};

const getTrexDbConnection = ({
    analyticsCredentials,
}): {
    analyticsConnection: Connection.ConnectionInterface;
} => {
    try {
        const dbm = Trex.databaseManager();
        const trex_publication = dbm.getFirstPublication(
            analyticsCredentials.code
        );
        let direct_connection_suffix;
        switch (analyticsCredentials.dialect) {
            case ANALYTICS_DB_DIALECTS.POSTGRES:
                direct_connection_suffix = "__srcdb";
                break;
            case ANALYTICS_DB_DIALECTS.BIGQUERY:
                // For bigquery, do not execute any queries on sourcedb
                direct_connection_suffix = "";
                break;
            case ANALYTICS_DB_DIALECTS.SNOWFLAKE:
                // Snowflake reads target the materialized DuckDB cache. No source (__srcdb) suffix.
                direct_connection_suffix = "";
                break;

            default:
                throw new Error(
                    `Dialect:${analyticsCredentials.dialect} is not supported for Trex Sql Connection`
                );
        }
        const trex_direct_connection_alias = `${trex_publication}${direct_connection_suffix}`;

        const parseSql = (
            temp: string,
            schemaName: string,
            vocabSchemaName: string,
            resultsSchemaName: string,
            parameters: any
        ): string => {
            // $$$$SCHEMA$$$$ is the replacement, but will appear in the string as $$SCHEMA$$
            temp = temp.replace(
                /\$\$SCHEMA_DIRECT_CONN\$\$./g,
                `${trex_direct_connection_alias}.$$$$SCHEMA$$$$.`
            );
            return translateHanaToDuckdb(
                temp,
                schemaName,
                vocabSchemaName,
                resultsSchemaName,
                parameters
            );
        };
        // `code` (databaseCode) is the credential lookup key — used by
        // `getFirstPublication` above. `cacheId` is the DuckDB ATTACH alias
        // queries should target.
        const trexAlias =
            analyticsCredentials.cacheId ?? analyticsCredentials.code;
        const conn = dbm.getConnection(
            trexAlias,
            analyticsCredentials.schema,
            analyticsCredentials.vocabSchema,
            analyticsCredentials.resultsSchemaName,
            { duckdb: parseSql }
        );

        return { analyticsConnection: conn };
    } catch (error) {
        console.log("Error getting trex connection, ", error);
        throw error;
    }
};

const getDBConnections = async ({
    analyticsCredentials,
    userObj,
    sessionVariables,
}): Promise<{
    analyticsConnection: Connection.ConnectionInterface;
}> => {
    // node hdb library checks for these to use TLS
    // TLS does not work with deno for self signed certs
    if (!analyticsCredentials.useTLS) {
        delete analyticsCredentials.key;
        delete analyticsCredentials.cert;
        delete analyticsCredentials.ca;
        delete analyticsCredentials.pfx;
    }

    if (analyticsCredentials.dialect === ANALYTICS_DB_DIALECTS.HANA) {
        analyticsCredentials["SESSIONVARIABLE:APPLICATION"] =
            `${env.PROJECT_NAME}-cohorts`;
        analyticsCredentials["SESSIONVARIABLE:APPLICATIONUSER"] =
            userObj.getEmail() || userObj.getUser();
        if (sessionVariables?.paConfigId) {
            analyticsCredentials["SESSIONVARIABLE:PA_CONFIG_ID"] =
                sessionVariables.paConfigId;
        }
        if (sessionVariables?.paConfigVersion) {
            analyticsCredentials["SESSIONVARIABLE:PA_CONFIG_VERSION"] =
                sessionVariables.paConfigVersion;
        }
        if (sessionVariables?.cdmConfigId) {
            analyticsCredentials["SESSIONVARIABLE:CDM_CONFIG_ID"] =
                sessionVariables.cdmConfigId;
        }
        if (sessionVariables?.cdmConfigVersion) {
            analyticsCredentials["SESSIONVARIABLE:CDM_CONFIG_VERSION"] =
                sessionVariables.cdmConfigVersion;
        }

        if (analyticsCredentials.authentication_mode === "JWT") {
            delete analyticsCredentials.user;
            delete analyticsCredentials.password;
            if (userObj.thirdPartyToken) {
                analyticsCredentials["token"] = userObj.thirdPartyToken;
            } else {
                throw new Error(
                    "Intermediary IDP token doesnt exist for HANA JWT Authentication!"
                );
            }
        }
    }

    const analyticsConnection =
        await dbConnectionUtil.DBConnectionUtil.getDBConnection({
            credentials: analyticsCredentials,
            schemaName: analyticsCredentials.schema,
            vocabSchemaName: analyticsCredentials.vocabSchema,
            resultsSchemaName: analyticsCredentials.resultsSchemaName,
            userObj,
        });

    return {
        analyticsConnection,
    };
};
const main = async () => {
    /**
     * Handle Environment Variables
     */
    const mountPath =
        env.NODE_ENV === "production" ? env.ENV_MOUNT_PATH : "../../";
    const envFile = `${mountPath}default-env.json`;
    xsenv.loadEnv(envVarUtils.getEnvFile(envFile));
    const port = env.ANALYTICS_SVC__PORT || 3000;

    //initialize Express
    const app = express();

    app.use("/check-liveness", healthCheckMiddleware);

    //Since browser triggers this request automatically, handling this else a JWT not found error would be returned.
    app.get("/favicon.ico", (req, res) => {
        res.sendStatus(204); //HTTP status no content
    });

    /**
     * Call Startup Functions
     */

    initSettingsFromEnvVars();
    await initRoutes(app);
    await initSwaggerRoutes(app);
    //utils.setupGlobalErrorHandling(app, log);

    /*const server = https.createServer(
        {
            key: env.TLS__INTERNAL__KEY?.replace(/\\n/g, "\n"),
            cert: env.TLS__INTERNAL__CRT?.replace(/\\n/g, "\n"),
            maxHeaderSize: 8192 * 10,
        },
        app
    );*/
    app.listen(port);
    log.info(
        `MRI Application started successfully. Server listening on port ${port}`
    );
};

main().catch((err) => {
    log.error(`
        MRI failed to start! Kindly fix the error and restart the application. ${err.message}
        ${err.stack}`);
});
