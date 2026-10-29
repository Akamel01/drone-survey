// The planner's side of the map regions in B2 (PWA-2, #315): read the manifest
// the host writes, queue cuts for the host, remove a region. Reads use the
// read key, writes the write key, both confined to specs/ (see lib/b2.ts).

import { authorize, b2Env, b2ReadEnv, deleteFile, downloadFile, listFiles, uploadFile } from "./b2";
import { MANIFEST_KEY, REQUESTS_PREFIX, parseManifest, validRegionId, type CutRequest, type Manifest } from "./mapRegions";

export interface MapStore {
  manifest(): Promise<Manifest>;
  requests(): Promise<CutRequest[]>;
  queue(request: CutRequest): Promise<void>;
  /** Drops the region from the manifest, then deletes its archive; the answer
   *  says whether the archive could be deleted too. */
  remove(id: string): Promise<{ archiveDeleted: boolean } | null>;
}

const NOT_CONFIGURED = "This deployment has no storage credential, so it cannot reach the map regions.";

/** The real store, or null when the deployment has no B2 credential. */
export function b2MapStore(): MapStore | null {
  const read = b2ReadEnv();
  const write = b2Env();
  if (!read) return null;
  const writeOrThrow = () => {
    if (!write) throw new Error(NOT_CONFIGURED);
    return write;
  };

  const manifest = async () => {
    const text = await downloadFile(await authorize(read), read.bucket, MANIFEST_KEY);
    return parseManifest(text?.toString() ?? null);
  };

  return {
    manifest,
    async requests() {
      const session = await authorize(read);
      const out: CutRequest[] = [];
      for (const file of await listFiles(session, REQUESTS_PREFIX)) {
        const text = await downloadFile(session, read.bucket, file.fileName);
        try {
          const r = JSON.parse(text?.toString() ?? "") as CutRequest;
          if (validRegionId(r.id) && file.fileName === `${REQUESTS_PREFIX}${r.id}.json`) out.push(r);
        } catch {}
      }
      return out.sort((a, b) => a.requested_at.localeCompare(b.requested_at));
    },
    async queue(request) {
      const env = writeOrThrow();
      await uploadFile(await authorize(env), `${REQUESTS_PREFIX}${request.id}.json`, Buffer.from(JSON.stringify(request)));
    },
    async remove(id) {
      const env = writeOrThrow();
      const current = await manifest();
      const region = current.regions.find((r) => r.id === id);
      if (!region) return null;
      const session = await authorize(env);
      const next: Manifest = { regions: current.regions.filter((r) => r.id !== id) };
      await uploadFile(session, MANIFEST_KEY, Buffer.from(JSON.stringify(next)));
      try {
        for (const f of await listFiles(await authorize(read), region.key)) {
          if (f.fileName === region.key) await deleteFile(session, f.fileId, f.fileName);
        }
        return { archiveDeleted: true };
      } catch {
        return { archiveDeleted: false };
      }
    },
  };
}
