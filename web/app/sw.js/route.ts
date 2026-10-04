import { serviceWorkerSource } from "@/lib/serviceWorker";

// Rendered once, at build time, so the version below is that build's: a deploy
// changes the worker's bytes, and the browser installs the new one.
export const dynamic = "force-static";

const VERSION = Date.now().toString(36);

export function GET() {
  return new Response(serviceWorkerSource(VERSION), {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      // Always revalidated: a worker held by the HTTP cache would be the stale app forever.
      "Cache-Control": "no-cache",
    },
  });
}
