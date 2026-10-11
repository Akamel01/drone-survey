"use client";

import { useEffect, useState } from "react";
import styles from "./OfflineMaps.module.css";

// Notifications (PWA-5, #319): this device is told when a Mission changes, or
// not; and the ntfy.sh fallback for the Account. A Settings section beside
// Offline map, on the same smoke glass.

type Server = { publicKey: string | null; ntfy: { topic: string; url: string } | null };
type Device =
  | "checking"
  | "on"
  | "off"
  | "blocked" // the person said no; only the device's Settings can undo it
  | "needs-install" // iPhone/iPad in a Safari tab
  | "unsupported";

/** The VAPID public key as the bytes PushManager.subscribe wants (Safari
 *  will not take the base64url string). */
function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const b64 = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

const isAppleMobile = () =>
  /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const installed = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

async function registration(): Promise<ServiceWorkerRegistration | undefined> {
  return "serviceWorker" in navigator ? navigator.serviceWorker.getRegistration() : undefined;
}

async function send(method: "POST" | "DELETE", body: unknown): Promise<Response> {
  return fetch("/api/push", { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

const TOLD =
  "You are told when a Mission is Dispatched, Withdrawn, Superseded, Collected or Loaded — Loaded says which Card to open — and when a Load is refused. Flown is never announced: it stays your own mark.";

export default function Notifications() {
  const [server, setServer] = useState<Server | null>(null);
  const [device, setDevice] = useState<Device>("checking");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const read = await fetch("/api/push").then((r) => (r.ok ? (r.json() as Promise<Server>) : null)).catch(() => null);
      if (cancelled) return;
      setServer(read);
      if (!("PushManager" in window) || !("Notification" in window) || !("serviceWorker" in navigator)) {
        setDevice(isAppleMobile() && !installed() ? "needs-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") return setDevice("blocked");
      const sub = await (await registration())?.pushManager.getSubscription();
      if (cancelled) return;
      setDevice(sub ? "on" : "off");
      // Every start re-sends this device's subscription, so a phone the
      // planner lost track of (reinstalled, rotated) heals itself.
      if (sub) void send("POST", { subscription: sub.toJSON() }).catch(() => {});
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const turnOn = async () => {
    if (!server?.publicKey) return;
    setBusy(true);
    setResult(null);
    try {
      // Asked straight from the tap: iOS refuses a prompt that is not.
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setDevice(permission === "denied" ? "blocked" : "off");
        return;
      }
      const reg = await registration();
      if (!reg) {
        setResult("Notifications need the installed app. Open Mission Control from its icon and try again.");
        return;
      }
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(server.publicKey) }));
      const saved = await send("POST", { subscription: sub.toJSON() });
      if (!saved.ok) throw new Error(((await saved.json().catch(() => ({}))) as { error?: string }).error ?? `${saved.status}`);
      setDevice("on");
      setResult("Notifications are on for this device.");
    } catch (error) {
      setResult(`Notifications could not be turned on: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    setResult(null);
    try {
      const sub = await (await registration())?.pushManager.getSubscription();
      if (sub) {
        await send("DELETE", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      setDevice("off");
      setResult("Notifications are off for this device.");
    } catch (error) {
      setResult(`Notifications could not be turned off: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  const ntfy = async (on: boolean) => {
    setBusy(true);
    setResult(null);
    try {
      const r = await send("POST", { ntfy: on });
      if (!r.ok) throw new Error(`${r.status}`);
      setServer((await r.json()) as Server);
    } catch (error) {
      setResult(`The ntfy backup could not be changed: ${error instanceof Error ? error.message : error}`);
    } finally {
      setBusy(false);
    }
  };

  const line: Record<Device, string> = {
    checking: "",
    on: `On for this device. ${TOLD}`,
    off: "Off for this device.",
    blocked:
      "Notifications are blocked for Mission Control on this device. Allow them in the device's Settings (on iPhone: Settings, Notifications, Mission Control), then come back here.",
    "needs-install":
      "On iPhone and iPad, notifications only work in the installed app, not in a Safari tab. In Safari tap Share, then Add to Home Screen, open Mission Control from that icon, and turn notifications on there.",
    unsupported: "This browser cannot show notifications from Mission Control. The ntfy backup below still works.",
  };

  return (
    <section className={`${styles.section} glass-smoke`} aria-labelledby="notifications-title">
      <h2 id="notifications-title">Notifications</h2>
      <p className={styles.quiet}>
        {server && !server.publicKey && (device === "on" || device === "off")
          ? "Notifications are not set up on this planner yet: the operator has not added its keys."
          : line[device]}
      </p>
      {device === "on" && (
        <button type="button" disabled={busy} onClick={() => void turnOff()}>
          Turn off on this device
        </button>
      )}
      {device === "off" && (
        <button type="button" className="primary" disabled={busy || !server?.publicKey} onClick={() => void turnOn()}>
          Turn on for this device
        </button>
      )}
      <p className={styles.status} role="status">
        {result ?? ""}
      </p>
      <p className={styles.status}>
        iPhone and iPad need iOS 16.4 or later, and Mission Control added to the Home Screen. Each device is turned on by itself.
      </p>

      <h2 className={styles.subhead}>Backup through ntfy</h2>
      <p className={styles.quiet}>
        {server?.ntfy
          ? "On. Install the free ntfy app, add a subscription, and enter this topic. Keep it private: anyone who knows it can read these notices."
          : "If notifications do not arrive, the same notices can also go to the free ntfy app."}
      </p>
      {server?.ntfy && (
        <p className={`${styles.name} mono`} aria-label="ntfy topic">
          {server.ntfy.topic}
        </p>
      )}
      <button type="button" disabled={busy || !server} onClick={() => void ntfy(!server?.ntfy)}>
        {server?.ntfy ? "Turn off the ntfy backup" : "Turn on the ntfy backup"}
      </button>
    </section>
  );
}
