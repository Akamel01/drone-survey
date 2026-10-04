"use client";

import { useEffect } from "react";

// Registers the app-shell worker (lib/serviceWorker.ts), and once it is
// active hands it the list of files this page has loaded, so a start with no
// signal works straight after the first visit. Production only: in
// development a worker would serve stale hot-reload output.
export default function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    let cancelled = false;
    const start = async () => {
      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        await navigator.serviceWorker.ready;
        const urls = performance.getEntriesByType("resource").map((entry) => entry.name);
        if (!cancelled) (registration.active ?? navigator.serviceWorker.controller)?.postMessage({ type: "keep", urls });
      } catch {
        // No worker (private mode, an old browser): the planner works as it did, online only.
      }
    };
    if (document.readyState === "complete") void start();
    else window.addEventListener("load", start, { once: true });
    return () => {
      cancelled = true;
      window.removeEventListener("load", start);
    };
  }, []);
  return null;
}
