import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// The vendored brand tokens must equal the live file (#342). Offline or a
// non-200 is not drift: skip with a warning, fail only on a real diff.
test("app/brand/tokens.css matches https://papyrus-ai.net/brand/tokens.css", async (t) => {
  let live: string;
  try {
    const res = await fetch("https://papyrus-ai.net/brand/tokens.css", { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    live = await res.text();
  } catch (err) {
    console.warn(`brand tokens drift check skipped: ${err}`);
    t.skip("live tokens unreachable");
    return;
  }
  const vendored = readFileSync(new URL("../app/brand/tokens.css", import.meta.url), "utf8");
  assert.equal(vendored, live, "re-vendor: curl -o web/app/brand/tokens.css https://papyrus-ai.net/brand/tokens.css");
});
