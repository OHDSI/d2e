// @ts-nocheck - Deno edge function (trex EdgeRuntime). Mirrors hades-api.
//
// Two server-side carve-outs for the notebook metadata store:
//   POST /cdm-connections/:id/password  — AES-encrypt a CDM password and persist
//                                          it (the only writer of the BYTEA secret).
//   POST /results/publish               — zip a hades run dir, upload it to storage,
//                                          and record an analysis_result row.
//
// SQL transport is isolated in sql.ts (the DuckDB→Postgres `_config` attach).
import { query, lit } from "./sql.ts";
import { encryptSecret } from "./crypto.ts";
import { gzipBytes, findResultsDb, putToUrl } from "./export.ts";
// `zip` is NOT present in the trexsql image (verified: command -v zip -> absent;
// only unzip/gzip/tar exist), so we zip in-process with the JSR zip-js lib instead
// of Deno.Command("zip", ...). Pure-Deno, no native binary needed.
import { BlobReader, BlobWriter, ZipWriter } from "jsr:@zip-js/zip-js@2.7.45";

const ENC_KEY = Deno.env.get("METADATA_ENC_KEY") ?? "";
const OUTPUT_BASE = Deno.env.get("HADES_OUTPUT_BASE_DIR") ?? "";
// d2e STORAGE REPOINT (port note): the upstream trex-notebook function reached the
// native Supabase Storage REST API via `${TREX_BASE_URL}/storage/v1/...`. d2e runs the
// `supabase-storage` service (docker-compose port 9000) which speaks that SAME native
// API, exposed to functions as the `supabaseStorage` SERVICE_ROUTE. We hit it directly
// through STORAGE_BASE_URL instead of going via TREX_BASE_URL. STORAGE_BASE_URL is the
// base you append `/bucket` and `/object/{bucket}/{key}` to — mirroring d2e's portal
// SupabaseStorageClient (plugins/functions/portal/src/supabase-storage), whose
// `services.supabaseStorage` base serves the storage REST API at the ROOT (NO
// `/storage/v1` prefix — it's `https://...-supabase-storage-1.<domain>:9000`) and is
// authed with a Bearer SUPABASE_STORAGE_JWT_TOKEN. The endpoint is TLS-only (nginx in
// the storage image terminates the internal cert); the trex runtime trusts the internal
// CA via DENO_TLS_CA_STORE=system, so plain `fetch` validates it.
const STORAGE_BASE_URL =
  Deno.env.get("STORAGE_BASE_URL") ?? "https://d2e-supabase-storage-1.d2e.local:9000";
const STORAGE_JWT = Deno.env.get("SUPABASE_STORAGE_JWT_TOKEN") ?? "";
const PREFIX = "/metadata-api";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  const userId = req.headers.get("x-user-id");
  if (!userId) return json({ error: "UNAUTHORIZED" }, 401);
  if (!ENC_KEY) return json({ error: "NOT_CONFIGURED" }, 503);

  const url = new URL(req.url);
  const idx = url.pathname.lastIndexOf(PREFIX);
  let path = idx === -1 ? url.pathname : url.pathname.slice(idx + PREFIX.length);
  if (!path.startsWith("/")) path = "/" + path;

  try {
    // POST /cdm-connections/:id/password  { password }
    const pw = path.match(/^\/cdm-connections\/([^/]+)\/password$/);
    if (pw && req.method === "POST") {
      const { password } = await req.json();
      if (!password) return json({ error: "BAD_REQUEST" }, 400);
      const enc = await encryptSecret(String(password), ENC_KEY);
      const id = decodeURIComponent(pw[1]);
      // Primary write path: through the DuckDB→Postgres `_config` attach, using
      // the `_config.notebook.<table>` qualifier and Postgres `decode(..,'base64')`
      // for the BYTEA column (see notes 2026-06-01-metadata-write-path.md).
      // FALLBACK (Task 7 E2E switch if a live worker write rejects either):
      //   (a) DuckDB rejecting Postgres `decode` on BYTEA -> use a postgres_query/
      //       pg_execute passthrough so Postgres evaluates `decode`, OR store the
      //       base64 text and decode on read.
      //   (b) `_config.notebook.*` unreachable from the worker -> use the postgres
      //       scanner form: UPDATE ... via postgres_query('_config', '...').
      await query(
        `UPDATE _config.notebook.cdm_connection SET password_encrypted = decode(${lit(enc)}, 'base64'), updated_at = now() WHERE id = ${lit(id)}`,
      );
      return json({ status: "ok" });
    }

    // POST /results/publish  { jobId, definitionId?, cdmConnectionId? }
    if (path === "/results/publish" && req.method === "POST") {
      const b = await req.json();
      if (!b.jobId) return json({ error: "BAD_REQUEST" }, 400);
      const runDir = `${OUTPUT_BASE}/${b.jobId}`;
      const bucket = "analysis-results";
      const key = `${b.definitionId ?? b.jobId}/${b.jobId}.zip`;
      const { bytes } = await zipDir(runDir);
      await ensureBucket(bucket);
      await uploadObject(bucket, key, bytes);
      // Primary write path: `_config.notebook.analysis_result` via the DuckDB
      // attach (same fallback options as above if the worker rejects it at E2E).
      await query(
        `INSERT INTO _config.notebook.analysis_result
           (definition_id, job_id, cdm_connection_id, status, storage_bucket, storage_key, size_bytes, created_by)
         VALUES (${b.definitionId ? lit(b.definitionId) : "NULL"}, ${lit(b.jobId)},
                 ${b.cdmConnectionId ? lit(b.cdmConnectionId) : "NULL"}, 'PUBLISHED',
                 ${lit(bucket)}, ${lit(key)}, ${bytes.length}, ${lit(userId)})`,
      );
      return json({ status: "ok", bucket, key, sizeBytes: bytes.length });
    }

    // POST /results/sign  { bucket, key, expiresIn? }
    // Mint a presigned download URL via the supabase-storage service. The browser
    // can't call storage directly (it holds the user bearer, not the storage
    // service JWT), so the jobs plugin's storageClient routes through here.
    if (path === "/results/sign" && req.method === "POST") {
      const b = await req.json();
      if (!b.bucket || !b.key) return json({ error: "BAD_REQUEST" }, 400);
      const signed = await signObject(String(b.bucket), String(b.key), b.expiresIn);
      return json(signed);
    }

    // POST /results/export-gz  { jobId, uploadUrl, dbFilename? }
    // Gzip the run's results DB and PUT it to a central presigned S3 URL.
    if (path === "/results/export-gz" && req.method === "POST") {
      const b = await req.json();
      if (!b.jobId || !b.uploadUrl) return json({ error: "BAD_REQUEST" }, 400);
      if (!OUTPUT_BASE) return json({ error: "NOT_CONFIGURED" }, 503);
      const runDir = `${OUTPUT_BASE}/${b.jobId}`;
      const dbPath = await findResultsDb(runDir, b.dbFilename);
      if (!dbPath) return json({ error: "RESULTS_DB_NOT_FOUND" }, 404);
      const raw = await Deno.readFile(dbPath);
      if (raw.byteLength === 0) return json({ error: "RESULTS_DB_EMPTY" }, 409);
      const gz = await gzipBytes(raw);
      const etag = await putToUrl(String(b.uploadUrl), gz);
      return json({ status: "ok", sizeBytes: gz.byteLength, etag });
    }

    return json({ error: "NOT_FOUND" }, 404);
  } catch (e) {
    // Log the cause here rather than returning it: an unhandled exception carries
    // stack frames, SQL and storage URLs that callers must not see.
    console.error("metadata-api: unhandled error", e);
    return json({ error: "METADATA_ERROR" }, 500);
  }
});

// --- storage + zip helpers ---------------------------------------------------
// d2e STORAGE REPOINT: these two helpers keep the upstream native Supabase Storage
// REST shapes (`POST /bucket`, `POST /object/{bucket}/{key}`) UNCHANGED; only the base
// (STORAGE_BASE_URL) and auth (service-role Bearer JWT) are d2e-specific, matching the
// portal SupabaseStorageClient. The per-request `authorization`/`cookie` forwarding the
// upstream used to reach trex is replaced by the storage service-role token, since the
// supabase-storage service authenticates with its own JWT, not the caller's session.
async function ensureBucket(name: string) {
  const resp = await fetch(`${STORAGE_BASE_URL}/bucket`, {
    method: "POST",
    headers: storageHeaders("application/json"),
    body: JSON.stringify({ name, id: name }),
  });
  // 409 = bucket already exists, which is the success case here. Any other non-2xx
  // (e.g. 401/403 from bad storage auth) must fail loudly, not be swallowed and
  // resurface later as a confusing upload error.
  if (!resp.ok && resp.status !== 409) {
    throw new Error(`storage ensureBucket ${resp.status}: ${await resp.text()}`);
  }
}
async function uploadObject(bucket: string, key: string, bytes: Uint8Array) {
  const resp = await fetch(`${STORAGE_BASE_URL}/object/${bucket}/${key}`, {
    method: "POST",
    headers: storageHeaders("application/zip"),
    body: bytes,
  });
  if (!resp.ok) throw new Error(`storage upload ${resp.status}: ${await resp.text()}`);
}
// signObject(): ask the supabase-storage service to mint a presigned download URL
// for an existing object (native REST shape `POST /object/sign/{bucket}/{key}`),
// authed with the storage service-role Bearer JWT. Returns the service JSON, which
// contains `signedURL`.
async function signObject(
  bucket: string,
  key: string,
  expiresIn?: number,
): Promise<unknown> {
  const resp = await fetch(`${STORAGE_BASE_URL}/object/sign/${bucket}/${key}`, {
    method: "POST",
    headers: storageHeaders("application/json"),
    body: JSON.stringify({ expiresIn: expiresIn ?? 3600 }),
  });
  if (!resp.ok) throw new Error(`storage sign ${resp.status}: ${await resp.text()}`);
  return await resp.json();
}
function storageHeaders(contentType: string): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": contentType };
  if (STORAGE_JWT) h["Authorization"] = `Bearer ${STORAGE_JWT}`;
  return h;
}

// zipDir(): recursively zip every file under `dir` into an in-memory archive.
// Uses jsr:@zip-js/zip-js (no system `zip` binary in the trexsql image).
async function zipDir(dir: string): Promise<{ bytes: Uint8Array }> {
  const zipWriter = new ZipWriter(new BlobWriter("application/zip"));
  for await (const rel of walkFiles(dir, "")) {
    const data = await Deno.readFile(`${dir}/${rel}`);
    await zipWriter.add(rel, new BlobReader(new Blob([data])));
  }
  const blob = await zipWriter.close();
  return { bytes: new Uint8Array(await blob.arrayBuffer()) };
}

// walkFiles(): yield file paths relative to the original root, depth-first.
async function* walkFiles(dir: string, prefix: string): AsyncGenerator<string> {
  for await (const entry of Deno.readDir(dir)) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory) {
      yield* walkFiles(`${dir}/${entry.name}`, rel);
    } else if (entry.isFile) {
      yield rel;
    }
  }
}
