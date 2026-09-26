import { test } from "node:test";
import assert from "node:assert/strict";
import { readPassphrase, writePassphrase, subscribePassphrase, PASSPHRASE_KEY } from "./passphrase.ts";

/** A minimal, working `localStorage`, backed by a plain object -- enough for
 *  `safeStorage()` to accept it and for `getItem`/`setItem` to round-trip. */
function fakeStorage(): Storage {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
  } as Storage;
}

function withStorage(storage: Storage | undefined, fn: () => void): void {
  const had = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  if (storage) {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: storage });
  } else {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new DOMException("The operation is insecure.", "SecurityError");
      },
    });
  }
  try {
    fn();
  } finally {
    if (had) Object.defineProperty(globalThis, "localStorage", had);
    else delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

test("nothing stored yet reads as empty, not null", () => {
  withStorage(fakeStorage(), () => {
    assert.equal(readPassphrase(), "");
  });
});

test("a written value round-trips under the shared key", () => {
  withStorage(fakeStorage(), () => {
    writePassphrase("open sesame");
    assert.equal(readPassphrase(), "open sesame");
  });
});

test("storage blocked outright reads as null, not empty (#152)", () => {
  withStorage(undefined, () => {
    assert.equal(readPassphrase(), null);
  });
});

test("a write reaches every subscriber, in this tab, without a storage event", () => {
  const seenA: string[] = [];
  const seenB: string[] = [];
  const stopA = subscribePassphrase((v) => seenA.push(v));
  const stopB = subscribePassphrase((v) => seenB.push(v));
  try {
    withStorage(fakeStorage(), () => {
      writePassphrase("first");
      stopA();
      writePassphrase("second");
    });
    assert.deepEqual(seenA, ["first"], "unsubscribed after the first write");
    assert.deepEqual(seenB, ["first", "second"], "still subscribed for both");
  } finally {
    stopB();
  }
});

test("the key is the one the rest of the app already reads and writes under", () => {
  assert.equal(PASSPHRASE_KEY, "drone-planner.wayfinder-key");
});
