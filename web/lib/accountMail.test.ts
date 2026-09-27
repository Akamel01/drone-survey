import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { emailSignInEnabled, mailSink, resetMail, sendMail, verificationMail } from "./accountMail.ts";

const KEYS = ["RESEND_API_KEY", "EMAIL_FROM", "AUTH_TEST_MAIL_DIR", "VERCEL_ENV"] as const;

function withEnv(env: Partial<Record<(typeof KEYS)[number], string>>, fn: () => void | Promise<void>) {
  const saved = Object.fromEntries(KEYS.map((k) => [k, process.env[k]]));
  for (const k of KEYS) delete process.env[k];
  Object.assign(process.env, env);
  const restore = () => {
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  };
  try {
    const out = fn();
    if (out instanceof Promise) return out.finally(restore);
    restore();
  } catch (error) {
    restore();
    throw error;
  }
}

test("no sender, no email sign-in", () =>
  withEnv({}, () => {
    assert.equal(mailSink(), null);
    assert.equal(emailSignInEnabled(), false);
  }));

test("Resend needs both its key and a from address", () => {
  withEnv({ RESEND_API_KEY: "re_x" }, () => assert.equal(mailSink(), null));
  withEnv({ EMAIL_FROM: "Mission Control <a@b.c>" }, () => assert.equal(mailSink(), null));
  withEnv({ RESEND_API_KEY: "re_x", EMAIL_FROM: "Mission Control <a@b.c>" }, () => assert.equal(mailSink(), "resend"));
});

test("the test inbox works off Vercel and is ignored on it", () => {
  withEnv({ AUTH_TEST_MAIL_DIR: "/tmp/x" }, () => assert.equal(mailSink(), "test-dir"));
  withEnv({ AUTH_TEST_MAIL_DIR: "/tmp/x", VERCEL_ENV: "preview" }, () => assert.equal(mailSink(), null));
  withEnv({ AUTH_TEST_MAIL_DIR: "/tmp/x", VERCEL_ENV: "production" }, () => assert.equal(emailSignInEnabled(), false));
});

test("Resend wins over the test inbox when both are set", () =>
  withEnv({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.c", AUTH_TEST_MAIL_DIR: "/tmp/x" }, () =>
    assert.equal(mailSink(), "resend"),
  ));

test("the test inbox receives each mail as one JSON file", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "mail-"));
  try {
    await withEnv({ AUTH_TEST_MAIL_DIR: dir }, async () => {
      await sendMail(verificationMail("a@example.test", "http://x/verify?token=1"));
      await sendMail(resetMail("a@example.test", "http://x/reset/2"));
    });
    const files = readdirSync(dir).sort();
    assert.equal(files.length, 2);
    const first = JSON.parse(readFileSync(path.join(dir, files[0]), "utf8"));
    assert.equal(first.to, "a@example.test");
    assert.match(first.text, /http:\/\/x\/verify\?token=1/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("with nowhere to send, sending refuses", () =>
  withEnv({}, async () => {
    await assert.rejects(sendMail(verificationMail("a@example.test", "http://x")), /not set up/);
  }));
