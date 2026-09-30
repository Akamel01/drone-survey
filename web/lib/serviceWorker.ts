// The service worker that lets the planner open with no signal (PWA-1, #313).
//
// It keeps the app shell (the /plan page and the versioned files it loads) and
// nothing else. The Missions themselves are the browser's own last read
// (`cachedRead` in missionView.ts), so the worker never sees data: it does not
// touch /api (which carries the sign-in and the passphrase-checked Mission
// routes), /d, other pages or anything cross-origin, and it only answers GET.
//
// A deploy ships a new worker (the version below changes with every build), the
// new worker installs and takes over at once, and it deletes every older cache.
// The shell page is fetched from the network first, so a visit with signal
// always brings the newest page and refreshes its cached copy; the cache is
// only what a visit without signal falls back to.
//
// Served as text from app/sw.js/route.ts rather than as a file under public/,
// because the version has to be baked in at build time.

/** Cache names start with this, so a worker deletes only its own kind. */
export const CACHE_PREFIX = "mission-control-";

export function serviceWorkerSource(version: string): string {
  return `"use strict";
const CACHE = ${JSON.stringify(CACHE_PREFIX + version)};
const SHELL = "/plan";

// Files that never change under their URL: build output and the hero's images.
// (Not the hero's videos: range requests, and megabytes each.)
function kept(url) {
  return url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") || /^\\/(hero\\/v1|icons)\\/[^/]+\\.(jpg|webp|png)$/.test(url.pathname));
}

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(SHELL, { cache: "reload" }));
    await cache.add("/icons/icon-192.png");
    // Every build file the page names, so the first start with no signal works
    // without waiting on the page to report what it loaded (see "message").
    const html = await (await cache.match(SHELL)).text();
    const files = new Set(html.match(/\\/_next\\/static\\/[^"'\\\\\\s<>)]+/g) || []);
    await Promise.all([...files].map((file) => cache.add(file).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(${JSON.stringify(CACHE_PREFIX)}) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});

// The page lists what it has loaded, so the files fetched before this worker
// took control are kept too and the very next start can be offline.
self.addEventListener("message", (event) => {
  const urls = event.data && event.data.type === "keep" && Array.isArray(event.data.urls) ? event.data.urls : [];
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const href of urls) {
      try {
        const url = new URL(href, self.location.href);
        if (kept(url) && !(await cache.match(url.href))) await cache.add(url.href);
      } catch {}
    }
  })());
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === "navigate" && (url.pathname === "/" || url.pathname === SHELL)) {
    event.respondWith(shell(request, url));
  } else if (kept(url)) {
    event.respondWith(fromCache(request));
  }
});

// "/" is the sign-in page online (dynamic, per person: never cached); with no
// signal it sends on to the planner, which is where an approved account lands
// anyway.
async function shell(request, url) {
  const cache = await caches.open(CACHE);
  try {
    const response = await fetch(request);
    if (response.status < 500) {
      if (url.pathname === SHELL && response.ok && !response.redirected) await cache.put(SHELL, response.clone());
      return response;
    }
  } catch {}
  const page = await cache.match(SHELL);
  if (!page) return fetch(request);
  return url.pathname === SHELL ? page : Response.redirect(new URL(SHELL, self.location.origin).href, 302);
}

async function fromCache(request) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}
`;
}
