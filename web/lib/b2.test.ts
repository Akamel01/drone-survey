import { test } from "node:test";
import assert from "node:assert/strict";

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
