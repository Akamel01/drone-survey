// PWA-5 (#319): the words a phone is told, who is told, and the sending.

import { test } from "node:test";
import assert from "node:assert/strict";
import webpush from "web-push";

import { deliver, dispatchNotices, hostEvent, hostNotices, pushConfig, subscriptionOf, withdrawNotice } from "./push.ts";
import { standinDevice } from "./pushStandin.ts";

const MISSION = { id: "m1", name: "North half", site: "Fraser Field", date: "2026-10-11" };

test("Dispatched names the Cards; Superseded is told for each Mission it replaced", () => {
  const [d, s] = dispatchNotices({ mission: MISSION, cards: ["way finder 1"], superseded: ["m0"] });
  assert.equal(d.title, "Dispatched");
  assert.equal(d.body, "North half is Dispatched for Fraser Field 2026-10-11. way finder 1 is reserved for it.");
  assert.equal(d.tag, "mission-m1");
  assert.equal(s.title, "Superseded");
  assert.match(s.body, /^The earlier North half for Fraser Field 2026-10-11 was Superseded/);
  assert.equal(s.tag, "mission-m0");
  assert.equal(dispatchNotices({ mission: MISSION, cards: [], superseded: [] }).length, 1);
});

test("Withdrawn says which Cards are free", () => {
  assert.equal(withdrawNotice({ id: "m1", name: "North half", cards_released: ["way finder 2"] }).body, "North half was Withdrawn. way finder 2 is free.");
  assert.equal(withdrawNotice({ id: "m1", name: "North half", cards_released: [] }).body, "North half was Withdrawn. It held no Card.");
});

test("the host's events are checked, and nothing else is accepted", () => {
  assert.deepEqual(hostEvent({ event: "collected", keys: ["specs/a/b/c.json"] }), { event: "collected", keys: ["specs/a/b/c.json"] });
  assert.deepEqual(hostEvent({ event: "loaded", loads: [{ key: "k", cards: ["way finder 1"] }] }), {
    event: "loaded",
    loads: [{ key: "k", cards: ["way finder 1"] }],
  });
  assert.deepEqual(hostEvent({ event: "refused", keys: [], reason: " Locked. " }), { event: "refused", keys: [], reason: "Locked." });
  for (const bad of [
    null,
    {},
    { event: "flown", keys: ["k"] }, // Flown is never announced
    { event: "collected", keys: [] },
    { event: "collected", keys: [1] },
    { event: "refused", keys: ["k"] },
    { event: "loaded", loads: [{ key: "k" }] },
    { event: "loaded", loads: [] },
  ]) {
    assert.equal(hostEvent(bad), null, JSON.stringify(bad));
  }
});

test("Loaded names the Card to open, to the Workspace that owns the Mission", () => {
  const records = [{ id: "m1", name: "North half", dispatched_key: "specs/f/2026-10-11/a.json" }];
  const told = hostNotices(
    { event: "loaded", loads: [{ key: "specs/f/2026-10-11/a.json", cards: ["way finder 3", "way finder 4"] }] },
    records,
    new Map([["m1", "ws-alpha"]]),
  );
  assert.deepEqual(told, [
    {
      workspace: "ws-alpha",
      notice: { title: "Loaded", body: "North half is Loaded into way finder 3, way finder 4. Open way finder 3.", tag: "mission-m1" },
    },
  ]);
});

test("a Mission with no ownership row, or no Mission at all, is told to the operator; refusals always are", () => {
  const records = [{ id: "m1", name: "North half", dispatched_key: "k1" }];
  const collected = hostNotices({ event: "collected", keys: ["k1", "k-unknown"] }, records, new Map());
  assert.deepEqual(collected.map((t) => t.workspace), [null, null]);
  assert.equal(collected[0].notice.body, "North half is Collected. It will Load when the Controller is plugged in.");
  assert.match(collected[1].notice.body, /^k-unknown is Collected/);
  const refused = hostNotices({ event: "refused", keys: ["k1"], reason: "Load refused: 3 parts do not fit 2 Cards." }, records, new Map([["m1", "ws-alpha"]]));
  assert.deepEqual(refused, [{ workspace: null, notice: { title: "Load refused", body: "Load refused: 3 parts do not fit 2 Cards.", tag: "load-refused" } }]);
});

test("a subscription must be https with browser-shaped keys", () => {
  const ok = standinDevice("https://push.example/abc").subscription;
  assert.deepEqual(subscriptionOf(ok), { endpoint: ok.endpoint, p256dh: ok.keys.p256dh, auth: ok.keys.auth });
  assert.equal(subscriptionOf({ ...ok, endpoint: "http://192.168.1.1/x" }), null);
  assert.equal(subscriptionOf({ ...ok, endpoint: "file:///etc/passwd" }), null);
  assert.equal(subscriptionOf({ endpoint: ok.endpoint, keys: { p256dh: "a b", auth: ok.keys.auth } }), null);
  assert.equal(subscriptionOf(null), null);
});

test("pushConfig: Web Push only with all three VAPID values; ntfy.sh by default", () => {
  assert.equal(pushConfig({ VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "k" }).vapid, null);
  const c = pushConfig({ VAPID_SUBJECT: "mailto:o@example.com", VAPID_PUBLIC_KEY: "p", VAPID_PRIVATE_KEY: "k", NTFY_URL: "https://ntfy.example/" });
  assert.deepEqual(c.vapid, { subject: "mailto:o@example.com", publicKey: "p", privateKey: "k" });
  assert.equal(c.ntfyUrl, "https://ntfy.example");
  assert.equal(pushConfig({}).ntfyUrl, "https://ntfy.sh");
});

test("deliver: the phone reads the notice, ntfy gets plain text, a gone device is reported", async () => {
  const keys = webpush.generateVAPIDKeys();
  const config = { vapid: { subject: "mailto:o@example.com", ...keys }, ntfyUrl: "https://ntfy.example" };
  const phone = standinDevice("https://push.example/phone");
  const gonePhone = standinDevice("https://push.example/gone");
  const seen: { url: string; headers: Record<string, string>; body: Buffer }[] = [];
  const send = (async (url: string, init: RequestInit) => {
    seen.push({ url, headers: init.headers as Record<string, string>, body: Buffer.from(init.body as Uint8Array | string) });
    return new Response(null, { status: url.endsWith("/gone") ? 410 : 201 });
  }) as typeof fetch;
  const notice = { title: "Loaded", body: "North half is Loaded into way finder 1. Open way finder 1.", tag: "mission-m1" };
  const to = [
    { endpoint: phone.subscription.endpoint, p256dh: phone.subscription.keys.p256dh, auth: phone.subscription.keys.auth },
    { endpoint: gonePhone.subscription.endpoint, p256dh: gonePhone.subscription.keys.p256dh, auth: gonePhone.subscription.keys.auth },
    { endpoint: "ntfy:mission-control-topic", p256dh: null, auth: null },
  ];
  const result = await deliver(to, notice, config, send);
  assert.deepEqual(result, { sent: 2, gone: ["https://push.example/gone"] });

  const toPhone = seen.find((s) => s.url === "https://push.example/phone")!;
  assert.deepEqual(phone.read(toPhone.body), { ...notice, url: "/plan" });
  assert.match(toPhone.headers.Authorization, /^vapid t=.+, k=/);
  assert.equal(toPhone.headers.Urgency, "high");

  const toNtfy = seen.find((s) => s.url === "https://ntfy.example/mission-control-topic")!;
  assert.equal(toNtfy.body.toString(), notice.body);
  assert.equal(toNtfy.headers.Title, "Loaded");
});

test("deliver: without VAPID keys only ntfy is sent; a failing service never throws", async () => {
  let calls = 0;
  const send = (async () => {
    calls++;
    throw new Error("unreachable");
  }) as typeof fetch;
  const phone = standinDevice("https://push.example/phone").subscription;
  const result = await deliver(
    [
      { endpoint: phone.endpoint, p256dh: phone.keys.p256dh, auth: phone.keys.auth },
      { endpoint: "ntfy:t", p256dh: null, auth: null },
    ],
    { title: "t", body: "b", tag: "x" },
    { vapid: null, ntfyUrl: "https://ntfy.example" },
    send,
  );
  assert.deepEqual(result, { sent: 0, gone: [] });
  assert.equal(calls, 1);
});
