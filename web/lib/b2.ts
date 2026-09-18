import { createHash } from "node:crypto";

// Server-side B2 access over fetch: authorize, list, download, upload, delete.
// One copy of each call, shared by the dispatch, drafts, and status routes —
// the route that grew its own inline copy is the one that drifts (it did).

const B2_AUTH = "https://api.backblazeb2.com/b2api/v2/b2_authorize_account";

export interface B2Env {
  keyId: string;
  appKey: string;
  bucket: string;
}

/** Null when the storage credential is missing (caller returns 503). */
export function b2Env(): B2Env | null {
  const keyId = process.env.B2_KEY_ID;
  const appKey = process.env.B2_APP_KEY;
  const bucket = process.env.B2_BUCKET;
  return keyId && appKey && bucket ? { keyId, appKey, bucket } : null;
}

/** The list-and-read pair. The write key cannot list, so reads go through
 *  this key; when absent the write pair is tried, preserving single-key setups. */
export function b2ReadEnv(): B2Env | null {
  const bucket = process.env.B2_BUCKET;
  if (!bucket) return null;
  const keyId = process.env.B2_READ_KEY_ID;
  const appKey = process.env.B2_READ_APP_KEY;
  if (keyId && appKey) return { keyId, appKey, bucket };
  return b2Env();
}

export interface B2Session {
  apiUrl: string;
  downloadUrl: string;
  token: string;
  bucketId: string;
}

// b2_authorize_account is itself a Class C transaction, and its token is good
// for 24 hours. Re-authorizing on every request was most of what exhausted the
// daily Class C cap: the status page polling every 30s spent 2,880 a day on
// authorize alone. One session per key id, renewed well inside the token's life.
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const sessions = new Map<string, { session: B2Session; expires: number }>();

export async function authorize(env: B2Env): Promise<B2Session> {
  const cached = sessions.get(env.keyId);
  if (cached && cached.expires > Date.now()) return cached.session;
  const res = await fetch(B2_AUTH, {
    headers: { Authorization: "Basic " + Buffer.from(`${env.keyId}:${env.appKey}`).toString("base64") },
  });
  if (!res.ok) throw new Error(`authorize failed: ${res.status}`);
  const { apiUrl, downloadUrl, authorizationToken, allowed } = await res.json();
  const session = { apiUrl, downloadUrl, token: authorizationToken, bucketId: allowed.bucketId };
  sessions.set(env.keyId, { session, expires: Date.now() + SESSION_TTL_MS });
  return session;
}

export interface B2File {
  fileName: string;
  fileId: string;
}

/** Every file name under prefix, following pages until B2 stops. */
export async function listFiles(s: B2Session, prefix: string): Promise<B2File[]> {
  const out: B2File[] = [];
  let start: string | undefined;
  while (true) {
    const body: Record<string, unknown> = { bucketId: s.bucketId, prefix, maxFileCount: 1000 };
    if (start) body.startFileName = start;
    const res = await fetch(`${s.apiUrl}/b2api/v2/b2_list_file_names`, {
      method: "POST",
      headers: { Authorization: s.token, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`list failed: ${res.status}`);
    const page = await res.json();
    for (const f of page.files) out.push({ fileName: f.fileName, fileId: f.fileId });
    start = page.nextFileName;
    if (!start) return out;
  }
}

/** Null when the key does not exist; anything else throws. */
export async function downloadFile(s: B2Session, bucket: string, key: string): Promise<Buffer | null> {
  const res = await fetch(`${s.downloadUrl}/file/${bucket}/${encodeURIComponent(key).replace(/%2F/g, "/")}`, {
    headers: { Authorization: s.token },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`download failed: ${res.status}`);

  // Read payload first so we can verify checksum header if provided.
  const data = Buffer.from(await res.arrayBuffer());

  // Validate content against B2's provided SHA1 header. This header is required
  // for the web storage path to avoid silently accepting corrupted data.
  const headerValue = res.headers.get("X-Bz-Content-Sha1") || res.headers.get("x-bz-content-sha1");
  if (!headerValue) {
    throw new Error("download checksum missing: X-Bz-Content-Sha1 header is required");
  }

  const computed = createHash("sha1").update(data).digest("hex");
  if (computed !== headerValue) {
    throw new Error(`download checksum mismatch: expected ${headerValue}, got ${computed}`);
  }

  return data;
}

export async function uploadFile(s: B2Session, key: string, body: Buffer): Promise<void> {
  const up = await fetch(`${s.apiUrl}/b2api/v2/b2_get_upload_url`, {
    method: "POST",
    headers: { Authorization: s.token, "Content-Type": "application/json" },
    body: JSON.stringify({ bucketId: s.bucketId }),
  });
  if (!up.ok) throw new Error(`upload url failed: ${up.status}`);
  const { uploadUrl, authorizationToken: uploadToken } = await up.json();
  const put = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      Authorization: uploadToken,
      "X-Bz-File-Name": encodeURIComponent(key),
      "Content-Type": "application/json",
      "X-Bz-Content-Sha1": createHash("sha1").update(body).digest("hex"),
    },
    body: new Uint8Array(body),
  });
  if (!put.ok) throw new Error(`upload failed: ${put.status}`);
}

export async function deleteFile(s: B2Session, fileId: string, fileName: string): Promise<void> {
  const res = await fetch(`${s.apiUrl}/b2api/v2/b2_delete_file_version`, {
    method: "POST",
    headers: { Authorization: s.token, "Content-Type": "application/json" },
    body: JSON.stringify({ fileId, fileName }),
  });
  if (!res.ok) throw new Error(`delete failed: ${res.status}`);
}
