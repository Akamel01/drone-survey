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

export async function authorize(env: B2Env): Promise<B2Session> {
  const res = await fetch(B2_AUTH, {
    headers: { Authorization: "Basic " + Buffer.from(`${env.keyId}:${env.appKey}`).toString("base64") },
  });
  if (!res.ok) throw new Error(`authorize failed: ${res.status}`);
  const { apiUrl, downloadUrl, authorizationToken, allowed } = await res.json();
  return { apiUrl, downloadUrl, token: authorizationToken, bucketId: allowed.bucketId };
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
  return Buffer.from(await res.arrayBuffer());
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
