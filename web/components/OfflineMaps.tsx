"use client";

import { useEffect, useState } from "react";
import type { MissionRow } from "@/lib/missionRecords";
import type { MissionSpec } from "@/lib/spec";
import { formatBytes } from "@/lib/siteMap";
import {
  listSiteMaps,
  persistence,
  removeSiteMap,
  saveSiteMap,
  subscribeSiteMaps,
  type Persistence,
  type SiteMap,
} from "@/lib/offlineMap";
import styles from "./OfflineMaps.module.css";

const PERSISTENCE_TEXT: Record<Persistence, string> = {
  granted: "Persistent storage: granted. The browser keeps these maps until you remove them.",
  "not granted": "Persistent storage: not granted. The browser may clear these maps when space runs low.",
  unsupported: "Persistent storage: not supported by this browser. It may clear these maps when space runs low.",
};

/** The [lat, lon] points the Site's area is cut around: the corners (or orbit
 *  subject) of the Mission being edited and of every stored Mission at the Site. */
function sitePoints(spec: MissionSpec, missions: MissionRow[]): [number, number][] {
  const of = (s: MissionSpec): [number, number][] => (s.mission_type === "orbit" && s.orbit?.center ? [s.orbit.center] : s.aoi);
  return [spec, ...missions.filter((m) => m.site_id === spec.site_id).map((m) => m.spec)].flatMap(of);
}

/**
 * Offline map (PWA-2, #315): keep the street map around the Site being edited
 * on this device, see which Sites are kept and how big each is, remove one.
 * The map shows it in place of the basemap whenever the basemap cannot be
 * reached (MapPane).
 */
export default function OfflineMaps({ spec, missions, offline }: { spec: MissionSpec; missions: MissionRow[]; offline: boolean }) {
  const [maps, setMaps] = useState<SiteMap[] | null>(null);
  const [persisted, setPersisted] = useState<Persistence | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    const read = () => void listSiteMaps().then(setMaps);
    read();
    void persistence(false).then(setPersisted);
    return subscribeSiteMaps(read);
  }, []);

  const points = sitePoints(spec, missions);
  const here = maps?.find((m) => m.siteId === spec.site_id) ?? null;
  const siteName = spec.site.trim();
  const canKeep = !!spec.site_id && !!siteName && points.length > 0 && !offline && !busy;

  const keep = async () => {
    if (!spec.site_id) return;
    setBusy(true);
    setResult(null);
    const saved = await saveSiteMap({ siteId: spec.site_id, name: siteName }, points);
    setBusy(false);
    if (saved.ok) {
      setPersisted(saved.persistence);
      setResult(`Kept ${saved.map.name} offline: ${saved.map.tiles} tiles, ${formatBytes(saved.map.bytes)}.`);
    } else setResult(saved.text);
  };

  const remove = async (map: SiteMap) => {
    await removeSiteMap(map.siteId);
    setResult(`Removed ${map.name}: ${formatBytes(map.bytes)} freed.`);
    void persistence(false).then(setPersisted);
  };

  return (
    <section className={`${styles.section} glass-smoke`} aria-labelledby="offline-maps-title">
      <h2 id="offline-maps-title">Offline map</h2>
      <p className={styles.quiet}>
        {siteName
          ? here
            ? `${siteName}: kept, ${formatBytes(here.bytes)}.`
            : `${siteName}: not kept. Keep it while you have signal, and the map still shows it with none.`
          : "Choose a Site first."}
      </p>
      <button type="button" className="primary" disabled={!canKeep} onClick={() => void keep()}>
        {busy ? "Keeping…" : here ? "Update this Site's map" : "Keep this Site's map offline"}
      </button>
      <p className={styles.status} role="status">
        {result ?? ""}
      </p>
      {maps !== null && maps.length > 0 && (
        <ul className={styles.list} aria-label="Sites kept offline">
          {maps.map((map) => (
            <li key={map.siteId} className={styles.row}>
              <div className={styles.who}>
                <span className={styles.name}>{map.name}</span>
                <span className={styles.meta}>
                  {formatBytes(map.bytes)} · {map.tiles} tiles
                </span>
              </div>
              <button type="button" aria-label={`Remove ${map.name} from offline`} onClick={() => void remove(map)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={styles.status}>{persisted ? PERSISTENCE_TEXT[persisted] : ""}</p>
      <p className={styles.status}>Streets, buildings and water around the Site, from OpenStreetMap contributors (ODbL). Satellite imagery is not kept: its provider does not allow it.</p>
    </section>
  );
}
