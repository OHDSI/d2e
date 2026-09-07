import { Logger } from "@alp/alp-base-utils";
import { ANALYTICS_DB_DIALECTS } from "../../types";
import * as dbUtils from "../../utils/DBSvcDBUtils";
import { DBDAO } from "../../dao/DBDAO";
import PortalServerAPI from "../PortalServerAPI";
import { env } from "../../env";

const logger = Logger.CreateLogger("analytics-log");

export async function getCDMVersion(req, res, next) {
    const datasetId = req.query.datasetId;
    const { dialect, schemaName, databaseCode, cacheId } =
        await new PortalServerAPI().getStudy(datasetId);

    try {
        const { analyticsConnection } = req.dbConnections;
        let dbDao = new DBDAO(analyticsConnection);
        const trexAlias = cacheId ?? databaseCode;
        const cdmVersion = await dbDao.getCDMVersion(
            trexAlias,
            schemaName,
            dialect
        );
        logger.info(
            `CDM version retrieved for dataset ${datasetId} with schema name ${schemaName} with dialect ${dialect} is ${JSON.stringify(cdmVersion)}`
        );
        let hanaKey = "CDM_VERSION";
        let cdmVersionKey =
            dialect === ANALYTICS_DB_DIALECTS.HANA
                ? hanaKey
                : dbUtils.convertNameToPg(hanaKey);
        // Result-set key casing varies by source dialect: the trex query layer surfaces the
        // column as written in the DAO's `SELECT CDM_VERSION` literal (UPPERCASE) for a
        // Snowflake-sourced cache, whereas postgres/hana fold to the convertNameToPg key.
        // Resolve the key case-insensitively so the version is found regardless of dialect.
        const cdmRow = cdmVersion[0] ?? {};
        const matchedKey = Object.keys(cdmRow).find(
            (k) => k.toLowerCase() === cdmVersionKey.toLowerCase()
        );
        let cdmVersionValue = matchedKey ? cdmRow[matchedKey] : undefined;
        if (cdmVersionValue) {
            //Cater to scenarios if vx.x is stored in the CDM schema
            cdmVersionValue = cdmVersionValue.toUpperCase().startsWith("V")
                ? cdmVersionValue.slice(1)
                : cdmVersionValue;
        } else if (cdmVersion.length === 0) {
            // DQD and DC both read the CDM version before they can create a flow
            // run, so an empty CDM_SOURCE stopped them with an error that named
            // neither the table nor the schema it had looked in.
            throw new Error(
                `No rows in ${schemaName}.CDM_SOURCE for dataset ${datasetId} ` +
                    `(database '${trexAlias}', dialect '${dialect}'). DQD and data ` +
                    `characterization read the CDM version from this table; populate ` +
                    `it in the source schema so every cache build inherits it.`
            );
        } else {
            throw new Error(
                `${schemaName}.CDM_SOURCE for dataset ${datasetId} has no usable ` +
                    `'${cdmVersionKey}' value (columns returned: ` +
                    `${Object.keys(cdmRow).join(", ") || "none"}).`
            );
        }
        logger.info(
            `CDM version returned for dataset ${datasetId} with schema name ${schemaName} with dialect ${dialect} is ${cdmVersionValue}`
        );
        res.status(200).json(cdmVersionValue);
    } catch (err) {
        logger.error(`Error retrieving CDM version: ${err}`);
        const httpResponse = {
            status: 500,
            message: "Something went wrong when retrieving data",
            data: [],
        };
        res.status(500).json(httpResponse);
    }
}

export async function checkIfSchemaExists(req, res, next) {
    const dialect: string = req.query.dialect;
    const databaseCode: string = req.query.databaseCode;
    const schemaName: string = req.query.schemaName;

    try {
        const { analyticsConnection } = req.dbConnections;
        const dbDao = new DBDAO(analyticsConnection);
        const schemaExists = await dbDao.checkIfSchemaExists(
            databaseCode,
            schemaName,
            dialect
        );
        res.status(200).send(schemaExists);
    } catch (err) {
        logger.error(`Error checking if schema exists: ${err}`);
        const httpResponse = {
            status: 500,
            message: "Something went wrong when checking if schema exists",
            data: [],
        };
        res.status(500).json(httpResponse);
    }
}

export async function getSnapshotSchemaMetadata(req, res, next) {
    const { schema: schemaName, code: databaseName } =
        req.dbCredentials.studyAnalyticsCredential;

    try {
        const { analyticsConnection } = req.dbConnections;
        const dbDao = new DBDAO(analyticsConnection);
        const results = await dbDao.getSnapshotSchemaMetadata(
            databaseName,
            schemaName
        );
        res.status(200).json(results);
    } catch (err: any) {
        logger.error("Error while getting schema snapshot metadata");
        return next(err);
    }
}
