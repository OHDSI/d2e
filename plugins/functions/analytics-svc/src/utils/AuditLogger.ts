import { getUser } from "@alp/alp-base-utils";
import type { CDMConfigMetaDataType } from "../types";
import { env } from "../env";
import {
    createPatientAccessAuditTransport,
    type AuditTransport,
} from "./AuditEventWriter.ts";
export const AUDITLOG_REQ_CHUNK_SIZE = 10;
export const AUDIT_CHANNELS = {
    PATIENT_LIST: "D2E Pt Ls",
    PATIENT_LIST_EXPORT: "D2E Pt Ls Export",
    PATIENT_LIST_STREAM: "D2E Pt Ls Stream",
    PATIENT_SUMMARY: "D2E Pt Summary",
} as const;

type AuditAttachment = { id: string; name: string };
type AuditLogResult = QueryObjectResult | "auditlog disabled" | null;
type AuditCredentials = { logToConsole?: boolean };
type AuditRow = Record<string, unknown>;
type AuditSelectedAttribute = { id: string };
type AuditConfigMetaData = { id: string; version: string };
type AuditConfigs = {
    cohortBuilder?: AuditConfigMetaData;
    cdm?: AuditConfigMetaData;
};
type AuditLoggerCreateOptionsBase = {
    auditTransport?: AuditTransport;
    auditCredentials?: AuditCredentials;
    cohortBuilderConfigMetaData?: AuditConfigMetaData;
    cdmConfigMetaData?: CDMConfigMetaDataType;
    ip?: string;
};
type AuditLoggerCreateOptions =
    | (AuditLoggerCreateOptionsBase & {
          request: unknown;
          user?: string;
      })
    | (AuditLoggerCreateOptionsBase & {
          request?: unknown;
          user: string;
      });
type AuditDataAccessMessage = {
    action: "read";
    occurredAt: string;
    personId: string;
    accessChannel: string;
    successful: boolean;
    configs?: AuditConfigs;
    attachment?: AuditAttachment;
    attributes: string[];
};
type AuditLoggerConstructorOptions = {
    auditTransport: AuditTransport;
    auditCredentials?: AuditCredentials;
    cohortBuilderConfigMetaData?: AuditConfigMetaData;
    cdmConfigMetaData?: CDMConfigMetaDataType;
    ip?: string;
    request?: unknown;
    user?: string;
};

type QueryObjectResult = {
    sql: string;
    data: unknown[];
    measures: unknown[];
    categories: unknown[];
    totalPatientCount: number;
    messageKey?: string;
    messageLevel?: "Warning";
};

type WriteLogResult = {
    attributesToLog: AuditSelectedAttribute[];
    attributeExistsForLog: boolean;
};

const emptyResult: QueryObjectResult = {
    sql: "",
    data: [],
    measures: [],
    categories: [],
    totalPatientCount: 0,
};

function getRequestHeaders(req?: unknown): Record<string, unknown> | undefined {
    if (!req || typeof req !== "object" || !("headers" in req)) {
        return undefined;
    }

    const headers = (req as { headers?: unknown }).headers;
    if (!headers || typeof headers !== "object") {
        return undefined;
    }

    return headers as Record<string, unknown>;
}

export function getAuditUserIdFromRequest(req?: unknown): string | undefined {
    const headers = getRequestHeaders(req);
    if (!headers?.authorization) {
        return undefined;
    }

    try {
        return getUser({ headers } as never).getUser();
    } catch (_err) {
        return undefined;
    }
}

export class AuditLogger {
    private _auditTransport: AuditTransport;
    private _cohortBuilderConfigMetaData?: AuditConfigMetaData;
    private _cdmConfigMetaData?: CDMConfigMetaDataType;
    private _ip?: string;
    private _user: string;

    private constructor({
        auditTransport,
        auditCredentials,
        cohortBuilderConfigMetaData,
        cdmConfigMetaData,
        ip,
        request,
        user,
    }: AuditLoggerConstructorOptions) {
        const auditUser = user ?? getAuditUserIdFromRequest(request);
        if (!auditUser) {
            throw new Error(
                "AuditLogger requires a user or a request with a valid authorization header"
            );
        }

        this._auditTransport = auditTransport;
        this._cohortBuilderConfigMetaData = cohortBuilderConfigMetaData;
        this._cdmConfigMetaData = cdmConfigMetaData;
        this._ip = ip;
        this._user = auditUser;
    }

    public static isEnabled() {
        return env.IS_AUDIT_LOG_ENABLED?.toLowerCase() === "true";
    }

    private _isEnabled() {
        return AuditLogger.isEnabled();
    }

    /**
     * Chunks the given data into small chunks and ensures data in each chunk gets logged synchronously.
     *
     * @param objectIdAttribute Name of the Id attribute
     * @param channel Denotes the usecase
     * @param data Actual data
     * @param excludeAttributes List of attributes to be excluded
     * @param selectedAttributes List of attributes displayed, which will be logged. Only used by Extension usecase.
     */
    public async log(
        objectIdAttribute: string,
        channel: string,
        data: AuditRow[],
        excludeAttributes?: string[],
        selectedAttributes?: AuditSelectedAttribute[],
        attachment?: AuditAttachment
    ): Promise<AuditLogResult> {
        // let st = new Date().getTime();
        // console.log(`# of patients: ${data.length}`);
        // console.log(`Splitting data...`);
        return await this._logChunks(
            objectIdAttribute,
            channel,
            data,
            excludeAttributes,
            selectedAttributes,
            attachment
        );
    }

    private async _logChunks(
        objectIdAttribute: string,
        channel: string,
        data: AuditRow[],
        excludeAttributes?: string[],
        selectedAttributes?: AuditSelectedAttribute[],
        attachment?: AuditAttachment
    ): Promise<AuditLogResult> {
        const chunkArr = this._splitResultByChunkSize(data);
        for (const chunk of chunkArr) {
            await this._writeRows(
                objectIdAttribute,
                channel,
                chunk,
                excludeAttributes,
                selectedAttributes,
                attachment
            );
        }

        // let et = new Date().getTime();
        // console.log(`Audit logging completed. Time taken: ${(et - st) / 1000}s`);
        return null;
    }

    private async _writeRows(
        objectIdAttribute: string,
        channel: string,
        data: AuditRow[],
        excludeAttributes?: string[],
        selectedAttributes?: AuditSelectedAttribute[],
        attachment?: AuditAttachment
    ) {
        if (!this._isEnabled()) {
            return emptyResult;
        }

        let attributeExistsForLog = false;
        let attributesToLog = selectedAttributes;
        for (const row of data) {
            const logResult = await this._writeLog(
                objectIdAttribute,
                channel,
                row,
                excludeAttributes,
                attributesToLog,
                attachment,
                attributeExistsForLog
            );
            attributesToLog = logResult.attributesToLog;
            attributeExistsForLog = logResult.attributeExistsForLog;
        }

        return emptyResult;
    }

    private async _writeLog(
        objectIdAttribute: string,
        channel: string,
        data: AuditRow,
        excludeAttributes?: string[],
        selectedAttributes?: AuditSelectedAttribute[],
        attachment?: AuditAttachment,
        attributeExistsForLog: boolean = false
    ): Promise<WriteLogResult> {
        const object_id = (
            (data[objectIdAttribute] instanceof Array
                ? data[objectIdAttribute][0]
                : data[objectIdAttribute]) as { toString(): string }
        ).toString();
        const defaultSelectedAttributes: AuditSelectedAttribute[] = [];
        Object.keys(data).forEach((el) => {
            defaultSelectedAttributes.push({
                id: el,
            });
        });
        const attributesToLog =
            !selectedAttributes || selectedAttributes.length === 0
                ? defaultSelectedAttributes
                : selectedAttributes;
        const dataAccessMessage: AuditDataAccessMessage = {
            action: "read",
            occurredAt: new Date().toISOString(),
            personId: object_id,
            accessChannel: channel,
            successful: true,
            attributes: [],
        };
        const configs = this._getConfigs();
        if (Object.keys(configs).length > 0) {
            dataAccessMessage.configs = configs;
        }

        if (attachment) {
            //if it is a attachment download
            dataAccessMessage.attachment = attachment;
        }

        const logAttributes = attributesToLog.filter((attribute) => {
            return !(
                attribute.id === objectIdAttribute ||
                (excludeAttributes
                    ? excludeAttributes.indexOf(attribute.id) >= 0
                    : false)
            );
        });

        logAttributes.forEach((logAttribute) => {
            if (logAttribute) {
                dataAccessMessage.attributes.push(logAttribute.id);
                attributeExistsForLog = true;
            }
        });

        if (logAttributes.length > 0) {
            //only if a single patient attribute is present in the the data, then it makes sense to log else skip
            await this._auditTransport.audit(dataAccessMessage, this._user);
            return { attributesToLog, attributeExistsForLog };
        }

        return { attributesToLog, attributeExistsForLog };
    }

    private _getConfigs(): AuditConfigs {
        const configs: AuditConfigs = {};
        if (this._cohortBuilderConfigMetaData) {
            configs.cohortBuilder = this._cohortBuilderConfigMetaData;
        }
        if (this._cdmConfigMetaData) {
            configs.cdm = this._cdmConfigMetaData;
        }
        return configs;
    }

    public static create(options: AuditLoggerCreateOptions): AuditLogger {
        return new AuditLogger({
            ...options,
            auditTransport:
                options.auditTransport ?? createPatientAccessAuditTransport(),
        });
    }

    /**
     * Splits the large array into small chunks.
     * @param arr Input array
     * @returns Array of chunks
     */
    private _splitResultByChunkSize(arr: AuditRow[]): AuditRow[][] {
        const chunkArr = [];
        for (
            let i = 0, len = arr.length;
            i < len;
            i += AUDITLOG_REQ_CHUNK_SIZE
        ) {
            const tmp = arr.slice(i, i + AUDITLOG_REQ_CHUNK_SIZE);
            // console.log(`chunk[${i}] size: ${tmp.length}`);
            chunkArr.push(tmp);
        }
        // console.log(`chunkArr.length: ${chunkArr.length}`);
        return chunkArr;
    }
}
