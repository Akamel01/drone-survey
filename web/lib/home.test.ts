import { test } from "node:test";
import assert from "node:assert/strict";

import {
  HOME_ENTRANCE_KEY,
  accountLabel,
  homeState,
  markHomeEntrancePlayed,
  shouldPlayHomeEntrance,
  type HomeState,
} from "./home.ts";

const STATES: HomeState[] = ["unconfigured", "signedout", "pending", "approved"];

test("homeState: the four states from configured + account", () => {
  assert.equal(homeState({ configured: false, account: null }), "unconfigured");
  assert.equal(homeState({ configured: false, account: { approved: true } }), "unconfigured");
  assert.equal(homeState({ configured: true, account: null }), "signedout");
  assert.equal(homeState({ configured: true, account: { approved: false } }), "pending");
  assert.equal(homeState({ configured: true, account: { approved: true } }), "approved");
});

test("accountLabel: trimmed name, then email, then empty", () => {
  assert.equal(accountLabel("  Owner Example  ", "owner@example.com"), "Owner Example");
  assert.equal(accountLabel("   ", "owner@example.com"), "owner@example.com");
  assert.equal(accountLabel(null, "owner@example.com"), "owner@example.com");
  assert.equal(accountLabel(undefined, "owner@example.com"), "owner@example.com");
  assert.equal(accountLabel("Owner", null), "Owner");
  assert.equal(accountLabel(null, null), "");
});

function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
  };
}

const throwingStorage = {
  getItem(): string | null {
    throw new Error("storage is blocked");
  },
  setItem(): void {
    throw new Error("storage is blocked");
  },
};

test("shouldPlayHomeEntrance: fresh storage plays for every non-approved state", () => {
  for (const state of STATES.filter((state) => state !== "approved")) {
    assert.equal(shouldPlayHomeEntrance(state, fakeStorage()), true, state);
  }
});

test("shouldPlayHomeEntrance: approved never plays, fresh storage or none", () => {
  assert.equal(shouldPlayHomeEntrance("approved", fakeStorage()), false);
  assert.equal(shouldPlayHomeEntrance("approved", null), false);
});

test("shouldPlayHomeEntrance: a marked tab does not replay", () => {
  const storage = fakeStorage();
  storage.setItem(HOME_ENTRANCE_KEY, "1");
  assert.equal(shouldPlayHomeEntrance("signedout", storage), false);
  assert.equal(shouldPlayHomeEntrance("pending", storage), false);
});

test("shouldPlayHomeEntrance: storage that throws or is absent plays anyway", () => {
  assert.equal(shouldPlayHomeEntrance("signedout", throwingStorage), true);
  assert.equal(shouldPlayHomeEntrance("pending", null), true);
});

test("markHomeEntrancePlayed: marks the tab, and a throw is swallowed", () => {
  const storage = fakeStorage();
  markHomeEntrancePlayed(storage);
  assert.equal(storage.getItem(HOME_ENTRANCE_KEY), "1");
  assert.equal(shouldPlayHomeEntrance("signedout", storage), false);
  assert.doesNotThrow(() => markHomeEntrancePlayed(throwingStorage));
  assert.doesNotThrow(() => markHomeEntrancePlayed(null));
});
