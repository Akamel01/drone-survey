// The browser's one way to the map regions API (PWA-2, #315), in the shape of
// accountsClient: { ok: true, … } or { ok: false, text } with the sentence read.

import type { RegionsView } from "./mapRegionsApi";

export type RegionsResult = ({ ok: true } & RegionsView) | { ok: false; text: string };

async function call(init?: RequestInit): Promise<RegionsResult> {
  try {
    const response = await fetch("/api/maps/regions", { cache: "no-store", ...init });
    let body: Partial<RegionsView> & { error?: string } = {};
    try {
      body = await response.json();
    } catch {}
    if (response.ok && Array.isArray(body.regions) && Array.isArray(body.requests)) {
      return { ok: true, regions: body.regions, requests: body.requests };
    }
    return { ok: false, text: body.error ?? `The map regions could not be read (${response.status}).` };
  } catch {
    return { ok: false, text: "The map regions could not be reached. Check the connection and try again." };
  }
}

export const mapsClient = {
  list: () => call(),
  run: (action: "add" | "remove", id: string) =>
    call({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, id }) }),
};
