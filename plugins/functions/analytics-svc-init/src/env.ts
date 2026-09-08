import { z } from "zod";

/**
 * Environment contract for this init function. Parsed once at module load, so
 * importing `env` anywhere guarantees the values below were validated first.
 *
 * Required vars are the ones the code dereferences without a guard; anything
 * with a fallback at the point of use stays optional.
 */
const Env = z.object({
  NODE_ENV: z.string().optional(),
  PG__HOST: z.string(),
  PG__DB_NAME: z.string(),
  PG_USER: z.string(),
  PG_PASSWORD: z.string(),
  PG_ADMIN_USER: z.string(),
  PG_ADMIN_PASSWORD: z.string(),
  PG_SCHEMA: z.string(),
  PG__SSL: z.string(),
  // Two spellings are read today: knexfile.ts uses PG_CA_ROOT_CERT and
  // knexfile-admin.ts uses PG__CA_ROOT_CERT.
  PG_CA_ROOT_CERT: z.string().optional(),
  PG__CA_ROOT_CERT: z.string().optional(),
  PG__PORT: z
    .string()
    .refine((val) => !isNaN(parseInt(val)))
    .transform(Number),
  PG__MIN_POOL: z
    .string()
    .refine((val) => !isNaN(parseInt(val)))
    .transform(Number),
  PG__MAX_POOL: z
    .string()
    .refine((val) => !isNaN(parseInt(val)))
    .transform(Number),
  PG__IDLE_TIMEOUT_IN_MS: z
    .string()
    .refine((val) => !isNaN(parseInt(val)))
    .transform(Number),
  PG__DEBUG: z.string().transform((val) => val === "1" || /true/i.test(val)),
  TREX_FUNCTION_PATH: z.string().optional(),
  COHORT_CACHE_MAX_AGE_DAYS: z
    .string()
    .refine((val) => Number(val) > 0)
    .transform(Number),
});

const _env = Deno.env.toObject();
const result = Env.safeParse(_env);

let env = _env as unknown as z.infer<typeof Env>;

if (result.success) {
  env = result.data;
} else {
  console.error(`Failed to load Envs! ${JSON.stringify(result)}`);
  throw new Error(`Failed to load Envs! ${JSON.stringify(result)}`);
}
export { env };
