import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

import { downloadRange } from "./b2.ts";
import { MANIFEST_KEY } from "./mapRegions.ts";
import { b2MapStore } from "./mapStore.ts";

// PWA-2 (#315): the planner's side of the regions in B2, against an in-memory
// bucket behind a stubbed fetch.

const sha1 = (b: Buffer) => createHash("sha1").update(b).digest("hex");
const REGION = { id: "bc", name: "British Columbia", bbox: [-139, 48.3, -114, 60], maxzoom: 15, key: "specs/_maps/bc-20261003.pmtiles", bytes: 12, cut_at: "2026-10-03T00:00:00Z", build: "20261003" };

/** A bucket: file name -> bytes, behind just the B2 calls lib/b2.ts makes. */
function fakeB2(files: Map<string, Buffer>, opts: { failDelete?: boolean } = {}) {
  const real = globalThis.fetch;
  const ranges: string[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (o: unknown) => new Response(JSON.stringify(o), { status: 200 });
    if (url.endsWith("b2_authorize_account")) return json({ apiUrl: "https://api.x", downloadUrl: "https://dl.x", authorizationToken: "t", allowed: { bucketId: "bid" } });
    if (url.endsWith("b2_get_upload_url")) return json({ uploadUrl: "https://up.x", authorizationToken: "u" });
    if (url === "https://up.x") {
      const name = decodeURIComponent((init!.headers as Record<string, string>)["X-Bz-File-Name"]);
      files.set(name, Buffer.from(init!.body as Uint8Array));
      return json({});
    }
    if (url.endsWith("b2_list_file_names")) {
      const { prefix } = JSON.parse(String(init!.body));
      return json({ files: [...files.keys()].filter((k) => k.startsWith(prefix)).map((k) => ({ fileName: k, fileId: `id:${k}` })) });
    }
    if (url.endsWith("b2_delete_file_version")) {
      if (opts.failDelete) return new Response("no", { status: 403 });
      files.delete(JSON.parse(String(init!.body)).fileName);
      return json({});
    }
    if (url.startsWith("https://dl.x/file/bkt/")) {
      const name = decodeURIComponent(url.slice("https://dl.x/file/bkt/".length));
      const body = files.get(name);
      if (!body) return new Response("", { status: 404 });
      const range = /^bytes=(\d+)-(\d+)$/.exec((init!.headers as Record<string, string>).Range ?? "");
      if (range) {
        ranges.push(range[0]);
        return new Response(new Uint8Array(body.subarray(Number(range[1]), Number(range[2]) + 1)), { status: 206 });
      }
      return new Response(new Uint8Array(body), { status: 200, headers: { "X-Bz-Content-Sha1": sha1(body) } });
    }
    return new Response("", { status: 500 });
  }) as typeof fetch;
  return { ranges, done: () => (globalThis.fetch = real) };
}

function withEnv<T>(run: () => Promise<T>) {
  const saved = { ...process.env };
  Object.assign(process.env, { B2_BUCKET: "bkt", B2_KEY_ID: "map-w", B2_APP_KEY: "x", B2_READ_KEY_ID: "map-r", B2_READ_APP_KEY: "x" });
  return run().finally(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });
}

test("a range read returns just those bytes of the archive", async () => {
  const files = new Map([["specs/_maps/a.pmtiles", Buffer.from("0123456789")]]);
  const b2 = fakeB2(files);
  try {
    const got = await downloadRange({ apiUrl: "https://api.x", downloadUrl: "https://dl.x", token: "t", bucketId: "bid" }, "bkt", "specs/_maps/a.pmtiles", 2, 4);
    assert.equal(Buffer.from(got.data).toString(), "2345");
    assert.deepEqual(b2.ranges, ["bytes=2-5"]);
  } finally {
    b2.done();
  }
});

test("the manifest and the queued cuts are read from specs/_maps", () =>
  withEnv(async () => {
    const files = new Map<string, Buffer>([
      [MANIFEST_KEY, Buffer.from(JSON.stringify({ regions: [REGION] }))],
      ["specs/_maps/requests/ab.json", Buffer.from(JSON.stringify({ id: "ab", name: "Alberta", bbox: [-120, 49, -110, 60], maxzoom: 15, requested_at: "2026-10-03T00:00:00Z", requested_by: "o@x", status: "failed", message: "no space" }))],
      ["specs/_maps/requests/zz.json", Buffer.from("not json")],
    ]);
    const b2 = fakeB2(files);
    try {
      const store = b2MapStore()!;
      assert.deepEqual((await store.manifest()).regions.map((r) => r.id), ["bc"]);
      const requests = await store.requests();
      assert.deepEqual(requests.map((r) => [r.id, r.status, r.message]), [["ab", "failed", "no space"]]);
    } finally {
      b2.done();
    }
  }));

test("queueing writes one file per region id, under requests/", () =>
  withEnv(async () => {
    const files = new Map<string, Buffer>();
    const b2 = fakeB2(files);
    try {
      await b2MapStore()!.queue({ id: "ab", name: "Alberta", bbox: [-120, 49, -110, 60], maxzoom: 15, requested_at: "t", requested_by: "o@x", status: "queued" });
      assert.deepEqual([...files.keys()], ["specs/_maps/requests/ab.json"]);
      assert.equal(JSON.parse(files.get("specs/_maps/requests/ab.json")!.toString()).status, "queued");
    } finally {
      b2.done();
    }
  }));

test("removing a region rewrites the manifest without it, then deletes the archive", () =>
  withEnv(async () => {
    const files = new Map<string, Buffer>([
      [MANIFEST_KEY, Buffer.from(JSON.stringify({ regions: [REGION] }))],
      [REGION.key, Buffer.from("archive")],
    ]);
    const b2 = fakeB2(files);
    try {
      const store = b2MapStore()!;
      assert.deepEqual(await store.remove("bc"), { archiveDeleted: true });
      assert.deepEqual(JSON.parse(files.get(MANIFEST_KEY)!.toString()), { regions: [] });
      assert.ok(!files.has(REGION.key));
      assert.equal(await store.remove("bc"), null, "already gone");
    } finally {
      b2.done();
    }
  }));

test("a key that cannot delete still removes the region, and says the archive is left", () =>
  withEnv(async () => {
    const files = new Map<string, Buffer>([
      [MANIFEST_KEY, Buffer.from(JSON.stringify({ regions: [REGION] }))],
      [REGION.key, Buffer.from("archive")],
    ]);
    const b2 = fakeB2(files, { failDelete: true });
    try {
      assert.deepEqual(await b2MapStore()!.remove("bc"), { archiveDeleted: false });
      assert.deepEqual(JSON.parse(files.get(MANIFEST_KEY)!.toString()), { regions: [] });
      assert.ok(files.has(REGION.key));
    } finally {
      b2.done();
    }
  }));

test("no storage credential, no store", async () => {
  const saved = { ...process.env };
  delete process.env.B2_BUCKET;
  try {
    assert.equal(b2MapStore(), null);
  } finally {
    Object.assign(process.env, saved);
  }
});
