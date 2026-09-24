// An in-memory stand-in for the B2 store, installed under `fetch`.
//
// The routes are exercised exactly as deployed -- same handlers, same B2
// client, same checksums -- with only the far side of the network replaced.
// It counts transactions by class, because the daily cap is a real limit this
// project has already hit, and it can fail any call on demand, because every
// failure in this project so far has been one nobody arranged to see.

import { createHash } from "node:crypto";

export interface FakeStore {
  files: Map<string, Buffer>;
  /** Transactions by B2 class: A is free, B is downloads, C is list and authorize. */
  calls: { A: number; B: number; C: number };
  /** Fail the next `times` requests whose URL (or, for uploads, key) matches. */
  fail(match: RegExp, status?: number, times?: number): void;
  /** Called before each download is served, so a test can act as a second writer. */
  beforeDownload: ((key: string) => void) | null;
  json(key: string): unknown;
  put(key: string, value: unknown): void;
  restore(): void;
}

const API = "https://api.fake.test";
const DL = "https://dl.fake.test";
const UP = "https://up.fake.test/upload";
export const FAKE_BUCKET = "fake-bucket";

export function installFakeStore(): FakeStore {
  const real = globalThis.fetch;
  const files = new Map<string, Buffer>();
  const faults: { match: RegExp; status: number; times: number }[] = [];
  const store: FakeStore = {
    files,
    calls: { A: 0, B: 0, C: 0 },
    fail(match, status = 500, times = 1) {
      faults.push({ match, status, times });
    },
    beforeDownload: null,
    json(key) {
      const raw = files.get(key);
      return raw ? JSON.parse(raw.toString()) : undefined;
    },
    put(key, value) {
      files.set(key, Buffer.from(typeof value === "string" ? value : JSON.stringify(value)));
    },
    restore() {
      globalThis.fetch = real;
    },
  };

  const reply = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const headers = new Headers(init?.headers);
    const target = url === UP ? decodeURIComponent(headers.get("X-Bz-File-Name") ?? "") : url;
    const fault = faults.find((f) => f.times > 0 && f.match.test(target));
    if (fault) {
      fault.times -= 1;
      return new Response("injected failure", { status: fault.status });
    }

    if (url.endsWith("/b2_authorize_account")) {
      store.calls.C += 1;
      return reply({
        apiUrl: API,
        downloadUrl: DL,
        authorizationToken: "token",
        allowed: { bucketId: "bucket-id", bucketName: FAKE_BUCKET },
      });
    }
    if (url === `${API}/b2api/v2/b2_list_file_names`) {
      store.calls.C += 1;
      const { prefix = "", startFileName } = JSON.parse(String(init?.body ?? "{}"));
      const names = [...files.keys()].filter((k) => k.startsWith(prefix) && (!startFileName || k >= startFileName)).sort();
      return reply({ files: names.map((fileName) => ({ fileName, fileId: `id:${fileName}` })), nextFileName: null });
    }
    if (url.startsWith(`${DL}/file/${FAKE_BUCKET}/`)) {
      store.calls.B += 1;
      const key = decodeURIComponent(url.slice(`${DL}/file/${FAKE_BUCKET}/`.length));
      store.beforeDownload?.(key);
      const data = files.get(key);
      if (!data) return new Response("not found", { status: 404 });
      return new Response(new Uint8Array(data), {
        headers: { "X-Bz-Content-Sha1": createHash("sha1").update(data).digest("hex") },
      });
    }
    if (url === `${API}/b2api/v2/b2_get_upload_url`) {
      store.calls.A += 1;
      return reply({ uploadUrl: UP, authorizationToken: "upload-token" });
    }
    if (url === UP) {
      store.calls.A += 1;
      const body = Buffer.from(new Uint8Array(await new Response(init?.body).arrayBuffer()));
      if (createHash("sha1").update(body).digest("hex") !== headers.get("X-Bz-Content-Sha1")) {
        return new Response("checksum", { status: 400 });
      }
      files.set(target, body);
      return reply({ fileId: `id:${target}`, fileName: target });
    }
    if (url === `${API}/b2api/v2/b2_delete_file_version`) {
      store.calls.A += 1;
      const { fileName } = JSON.parse(String(init?.body ?? "{}"));
      files.delete(fileName);
      return reply({ fileName });
    }
    throw new Error(`the fake store does not serve ${url}`);
  }) as typeof fetch;

  return store;
}
