import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

import manifest from "../app/manifest.ts";
import { CACHE_PREFIX, serviceWorkerSource } from "./serviceWorker.ts";

// PWA-1 (#313): what Chrome's installability check reads, and what the worker
// will and will not touch.

const publicFile = (src: string) => readFileSync(new URL(`../public${src}`, import.meta.url));

test("manifest: standalone, start inside scope, colours from the theme", () => {
  const m = manifest();
  assert.equal(m.name, "Mission Control");
  assert.equal(m.display, "standalone");
  assert.ok(m.start_url && m.scope && m.start_url.startsWith(m.scope));
  assert.equal(m.theme_color, "#0A0E0F"); // --canopy-900
  assert.equal(m.background_color, "#0A0E0F");
});

test("manifest icons: 192 and 512 exist as PNGs of the size they claim, one maskable", () => {
  const icons = manifest().icons ?? [];
  for (const need of ["192x192", "512x512"]) {
    assert.ok(icons.some((i) => i.sizes === need && i.purpose === "any"), `${need} any`);
  }
  assert.ok(icons.some((i) => i.sizes === "512x512" && i.purpose === "maskable"));
  for (const icon of [...icons, { src: "/icons/apple-touch-icon.png", sizes: "180x180" }]) {
    const png = publicFile(icon.src);
    assert.equal(png.subarray(1, 4).toString("ascii"), "PNG", icon.src);
    assert.equal(`${png.readUInt32BE(16)}x${png.readUInt32BE(20)}`, icon.sizes, icon.src);
  }
});

// Runs the worker's own fetch handler against a fake request: did it answer?
function answers(version: string, url: string, init: { method?: string; mode?: string } = {}) {
  const listeners: Record<string, (e: unknown) => void> = {};
  const self = {
    location: new URL("https://planner.test/sw.js"),
    addEventListener: (type: string, fn: (e: unknown) => void) => (listeners[type] = fn),
  };
  // A cache holding one page, and a network that is down.
  const caches = { open: async () => ({ match: async () => new Response("cached") }) };
  const fetch = async () => Promise.reject(new Error("offline"));
  vm.runInNewContext(serviceWorkerSource(version), { self, caches, URL, Request, Response, fetch });
  let answered = false;
  listeners.fetch({
    request: { method: init.method ?? "GET", mode: init.mode ?? "no-cors", url },
    respondWith: () => (answered = true),
  });
  return answered;
}

test("worker answers the shell and build files only", () => {
  assert.ok(answers("v", "https://planner.test/plan", { mode: "navigate" }));
  assert.ok(answers("v", "https://planner.test/", { mode: "navigate" }));
  assert.ok(answers("v", "https://planner.test/_next/static/chunks/a.js"));
});

test("worker never touches API, sign-in pages, writes or other origins", () => {
  assert.ok(!answers("v", "https://planner.test/api/missions?archived=1"));
  assert.ok(!answers("v", "https://planner.test/api/auth/get-session"));
  assert.ok(!answers("v", "https://planner.test/api/auth/sign-in/email", { method: "POST" }));
  assert.ok(!answers("v", "https://planner.test/api/auth/callback/google", { mode: "navigate" }));
  assert.ok(!answers("v", "https://planner.test/reset-password", { mode: "navigate" }));
  assert.ok(!answers("v", "https://planner.test/d/anything"));
  assert.ok(!answers("v", "https://planner.test/hero/v1/hero-wide-1080p30-h264.mp4"));
  assert.ok(!answers("v", "https://tiles.test/_next/static/a.js"));
});

test("each build's worker has its own cache and deletes the older ones", () => {
  const a = serviceWorkerSource("aaa");
  const b = serviceWorkerSource("bbb");
  assert.notEqual(a, b);
  assert.ok(a.includes(JSON.stringify(`${CACHE_PREFIX}aaa`)));
  assert.match(a, /caches\.delete/);
  assert.ok(a.includes(`name.startsWith(${JSON.stringify(CACHE_PREFIX)}) && name !== CACHE`));
});
