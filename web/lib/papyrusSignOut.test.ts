import assert from "node:assert/strict";
import { test } from "node:test";
import { signOutDestination } from "./papyrusSignOut.ts";

test("Papyrus mode signs out through papyrus-ai.net and returns to Mission Control", () => {
  assert.equal(
    signOutDestination(true, "https://missions.papyrus-ai.net"),
    "https://papyrus-ai.net/sign-out?next=https://missions.papyrus-ai.net/",
  );
});

test("legacy mode goes home", () => {
  assert.equal(signOutDestination(false, "https://missions.papyrus-ai.net"), "/");
});
