import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// A Class C transaction is what the daily cap counts, so the number of calls
// this module makes is behaviour worth pinning, not an implementation detail.

test("authorize reuses one session per key id instead of re-authorizing per request", async () => {
  const real = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return new Response(
      JSON.stringify({ apiUrl: "https://api.example", downloadUrl: "https://dl.example", authorizationToken: "tok", allowed: { bucketId: "bucket" } }),
      { status: 200 },
    );
  }) as typeof fetch;
  try {
    const { authorize } = await import("./b2.ts");
    const env = { keyId: "key-1", appKey: "secret", bucket: "b" };
    const first = await authorize(env);
    const second = await authorize(env);
    const third = await authorize({ ...env, appKey: "other" });
    assert.equal(calls, 1, "three authorizations for one key must cost one transaction");
    assert.equal(first.token, "tok");
    assert.equal(second.bucketId, "bucket");
    assert.equal(third.token, "tok");
    // A different key is a different session: it must not reuse the first.
    await authorize({ keyId: "key-2", appKey: "secret", bucket: "b" });
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = real;
  }
});

// Every read goes through downloadFile, and the host verifies the checksum its
// provider returns. The web did not, so a truncated status record parsed as a
// real one. sha1 is what the provider sends: not a security choice, a protocol one.

async function withFetch(
  handler: (url: string) => Response,
  run: () => Promise<void>,
): Promise<void> {
  const real = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL) => handler(String(input))) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = real;
  }
}

const session = { apiUrl: "https://api.example", downloadUrl: "https://dl.example", token: "tok", bucketId: "bucket" };
const sha1 = (b: Buffer) => createHash("sha1").update(b).digest("hex");

test("downloadFile returns the payload when the provider's checksum matches", async () => {
  const body = Buffer.from('{"rows":[]}');
  await withFetch(
    () => new Response(body, { status: 200, headers: { "X-Bz-Content-Sha1": sha1(body) } }),
    async () => {
      const { downloadFile } = await import("./b2.ts");
      const got = await downloadFile(session, "bucket", "specs/_status/missions.json");
      assert.deepEqual(got, body);
    },
  );
});

test("downloadFile refuses a payload the provider's checksum does not match", async () => {
  const body = Buffer.from('{"rows":[]}');
  await withFetch(
    () => new Response(body, { status: 200, headers: { "X-Bz-Content-Sha1": sha1(Buffer.from("other")) } }),
    async () => {
      const { downloadFile } = await import("./b2.ts");
      await assert.rejects(
        () => downloadFile(session, "bucket", "specs/f/2026-09-17/20260917T000000Z.json"),
        /checksum/i,
      );
    },
  );
});

test("downloadFile refuses a response with no checksum at all, and still treats 404 as absent", async () => {
  await withFetch(
    () => new Response(Buffer.from("{}"), { status: 200 }),
    async () => {
      const { downloadFile } = await import("./b2.ts");
      await assert.rejects(() => downloadFile(session, "bucket", "specs/x"), /checksum/i);
    },
  );
  await withFetch(
    () => new Response("gone", { status: 404 }),
    async () => {
      const { downloadFile } = await import("./b2.ts");
      assert.equal(await downloadFile(session, "bucket", "specs/x"), null);
    },
  );
});

test("downloadFile still throws on any other failure", async () => {
  await withFetch(
    () => new Response("nope", { status: 403 }),
    async () => {
      const { downloadFile } = await import("./b2.ts");
      await assert.rejects(() => downloadFile(session, "bucket", "specs/x"), /download failed: 403/);
    },
  );
});
