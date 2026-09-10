import { object, z } from "zod";

const parseJsonTransform = (str, ctx): z.infer<ReturnType<typeof object>> => {
                try {
                    return JSON.parse(str);
                } catch (e) {
                    ctx.addIssue({ code: "custom", message: "Invalid JSON" });
                    return z.never();
                }
            }

const Env = z
    .object({
        ALP_GATEWAY_OAUTH__URL: z.string(),
        ALP__SYSTEM_ID: z.string(),
        ANALYTICS_SVC__PORT: z
            .string()
            .refine((val) => !isNaN(parseInt(val)))
            .transform(Number),
        IDP__ALP_SVC__CLIENT_ID: z.string(),
        IDP__ALP_SVC__CLIENT_SECRET: z.string(),
        USE_EXTENSION_FOR_COHORT_CREATION: z.string(),

        PG__HOST: z.string().optional(),
        PG__PORT: z.string().optional(),
        PG__DB_NAME: z.string().optional(),
        PG__SSL: z.string().optional(),
        PG_USER: z.string().optional(),
        PG_PASSWORD: z.string().optional(),
        PG_SCHEMA: z.string().optional(),
        PG_CA_ROOT_CERT: z.string().optional(),
        PG__IDLE_TIMEOUT_IN_MS: z
            .string()
            .refine((val) => !isNaN(parseInt(val)))
            .transform(Number),
        PG__MAX_POOL: z
            .string()
            .refine((val) => !isNaN(parseInt(val)))
            .transform(Number),
        PG__MIN_POOL: z
            .string()
            .refine((val) => !isNaN(parseInt(val)))
            .transform(Number),

        PROJECT_NAME: z.string(),

        LOCAL_DEBUG: z.string(),
        SQL_RETURN_ON: z.string(),
        isHttpTestRun: z.string().optional(),
        isTestEnv: z.string().optional(),
        HTTPTEST_DB_DIALECT: z.string().optional(),
        TESTSCHEMA: z.string().optional(),
        local: z.string(),

        TLS__INTERNAL__KEY: z.string().optional(),
        TLS__INTERNAL__CRT: z.string().optional(),
        TLS__INTERNAL__CA_CRT: z.string().optional(),
        NODE_ENV: z.string().optional(),
        ENV_MOUNT_PATH: z.string().optional(),
        TREX_CURRENT_USER_FUNCTION_NAME: z.string().optional(),
        //DATABASE_CREDENTIALS: z.array().optional(),
        MINIO__ENDPOINT: z.string().optional(),
        MINIO__PORT: z
            .string()
            .refine((val) => !isNaN(parseInt(val)))
            .transform(Number),
        MINIO__SSL: z.string(),
        MINIO__ACCESS_KEY: z.string(),
        MINIO__SECRET_KEY: z.string(),
        MINIO__REGION: z.string(),
        DB_SVC__LOG_LEVEL: z.string().optional(),
        INTEGRATION_TEST__HANA__TENANT_CONFIGS: z.string().optional(),
        PG__READ_ROLE: z.string().optional(),
        ANALYTICS_PATIENT_LIST_BATCH_SIZE: z.string(),
        COHORT_CACHE_TTL_HOURS: z
            .string()
            .refine((val) => Number(val) > 0)
            .transform(Number),
        // PG__TENANT_CONFIGS: z.string().optional(),
        HANA__READ_ROLE: z.string().optional(),
        //HANA__TENANT_CONFIGS: z.string().optional(),
        DB_SVC__IDP_SUBJECT_PROP: z.string().optional(),
        DB_SVC__PATH: z.string().optional(),
        DB_SVC__PORT: z.string().optional(),
        IS_AUDIT_LOG_ENABLED: z.string().optional(),
        IS_CDM_SQL_AUDIT_LOG_ENABLED: z.string().optional(),
        AUDIT_LOG_TO_CONSOLE: z.string().optional(),
        ANALYTICS_HANA_STREAMING_ENABLED: z.string(),
        ANALYTICS_STREAMING_CHUNK_SIZE_BY_DIALECT: z
            .string()
            .transform((str, ctx) => parseJsonTransform(str, ctx)),
        SERVICE_ROUTES: z
            .string()
            .transform((str, ctx) => parseJsonTransform(str, ctx)),

        // TODO: Add types for database credentials
        DATABASE_CREDENTIALS: z.unknown(),
        PG__TENANT_CONFIGS: z.unknown(),
        HANA__TENANT_CONFIGS: z.unknown(),
        VCAP_SERVICES: z.unknown(),
    })
    .superRefine(
        (
            { LOCAL_DEBUG, isHttpTestRun, isTestEnv, TESTSCHEMA },
            refinementContext
        ) => {
            //Validate for non-prod scenarios
            if (LOCAL_DEBUG.toLowerCase() === "true") {
                const addError = (env) => {
                    refinementContext.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: `No value for ${env}`,
                        path: [env],
                    });
                };

                if (!isHttpTestRun) addError("isHttpTestRun");
                if (!isTestEnv) addError("isTestEnv");
                if (
                    !TESTSCHEMA &&
                    isTestEnv &&
                    isTestEnv.toLowerCase() === "true"
                )
                    addError("TESTSCHEMA");
            }
        }
    );
type EnvType = z.infer<typeof Env>;
let env: EnvType = {};

function initEnv(__env) {
    const _env = Object.assign({}, Deno.env.toObject(), __env);

    const result = Env.safeParse(_env);
    env = _env;
    if (result.success) {
        env = result.data;
        env["DATABASE_CREDENTIALS"] = _env["DATABASE_CREDENTIALS"];
        env["PG__TENANT_CONFIGS"] = _env["PG__TENANT_CONFIGS"];
        env["HANA__TENANT_CONFIGS"] = _env["HANA__TENANT_CONFIGS"];
        env["VCAP_SERVICES"] = _env["VCAP_SERVICES"];
    } else {
        console.error(`Service Failed to Start!! ${JSON.stringify(result)}`);
        throw new Error("ZOD parse failed");
    }
    return env;
}

export { env, initEnv };
