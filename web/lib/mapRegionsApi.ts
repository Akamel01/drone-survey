// What /api/maps/regions does, apart from who may ask (the route) and where
// the regions live (the MapStore): so it is testable with a fake store.

import { cutRequestFor, validRegionId, type CutRequest, type Region } from "./mapRegions";
import type { MapStore } from "./mapStore";

/** What the Developer section shows: the archives that exist, and the cuts waiting. */
export interface RegionsView {
  regions: Region[];
  requests: CutRequest[];
}

type Answer = { status: number; body: RegionsView | { error: string } };

export async function regionsView(store: MapStore): Promise<RegionsView> {
  const [manifest, requests] = await Promise.all([store.manifest(), store.requests()]);
  return { regions: manifest.regions, requests };
}

/** { action: "add", id } queues a cut of a catalogue region; { action: "remove",
 *  id } deletes a region. Answers with the view as it now is. */
export async function regionsAction(store: MapStore, body: unknown, by: string): Promise<Answer> {
  const { action, id } = (body ?? {}) as { action?: unknown; id?: unknown };
  if (action === "add") {
    const request = cutRequestFor(id, by);
    if (!request) return { status: 400, body: { error: "That is not a region in the catalogue." } };
    await store.queue(request);
  } else if (action === "remove") {
    if (!validRegionId(id)) return { status: 400, body: { error: "That is not a region id." } };
    const removed = await store.remove(id);
    if (!removed) return { status: 404, body: { error: "That region is not in the manifest. Reload the regions." } };
  } else {
    return { status: 400, body: { error: 'The action is "add" or "remove".' } };
  }
  return { status: 200, body: await regionsView(store) };
}
