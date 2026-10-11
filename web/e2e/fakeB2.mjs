// Preloaded into `next start` (NODE_OPTIONS=--import) by workspaces.test.mjs:
// the B2 store becomes lib/fakeStore.ts's in-memory one, inside the server,
// so the deployed Mission routes run unmodified over a store a test can seed.
// Every other request (the OAuth stand-in, the database) goes out as usual.
//
// E2E_B2_SEED: JSON { key: value } written into the store before the first
// request.

import { installFakeStore } from "../lib/fakeStore.ts";

const real = globalThis.fetch;
const store = installFakeStore();
const fake = globalThis.fetch;
for (const [key, value] of Object.entries(JSON.parse(process.env.E2E_B2_SEED ?? "{}"))) store.put(key, value);

globalThis.fetch = (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  return /^https:\/\/(api\.backblazeb2\.com|[a-z]+\.fake\.test)\//.test(url) ? fake(input, init) : real(input, init);
};
