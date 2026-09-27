// The shared browser/app harness: a free port, child processes with captured
// output, chromium launch with the local-cache fallback, and the `next start`
// lifecycle (SIGTERM -> 5 s -> SIGKILL).
//
// Moved from scripts/home-evidence.mjs:105-178 (the ponytail note there asked
// for exactly this once a third consumer landed; the e2e suite is it). Only
// the bodies moved verbatim -- the `webRoot` here is one directory deeper, so
// it resolves "../.." instead of "..". Nothing below reads env, the OAuth
// stand-in, the rate limit or the database: the caller owns those.

import { spawn } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

/** <repo>/web: the cwd for run() and spawnServer(), and what .next is read from. */
export const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export function freePort() {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

export async function run(command, args, env) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: webRoot, env, stdio: ["ignore", "pipe", "pipe"] });
    const lines = [];
    child.stdout.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
    child.stderr.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
    child.once("error", reject);
    child.once("exit", (code) => (code === 0 ? resolve(lines) : reject(new Error(`${command} exited ${code}:\n${lines.join("\n")}`))));
  });
}

/** playwright-core resolves its own cache; on this machine that is fine, but a
 *  mismatch must not send anyone downloading browsers. */
export async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (error) {
    const cache = path.join(os.homedir(), "Library/Caches/ms-playwright");
    if (!existsSync(cache)) throw error;
    for (const relative of readdirSync(cache, { recursive: true })) {
      const name = path.basename(String(relative));
      if (name === "Google Chrome for Testing" || name === "chrome-headless-shell") {
        const executablePath = path.join(cache, String(relative));
        console.log(`playwright default launch failed; using cached chromium at ${executablePath}`);
        return chromium.launch({ executablePath });
      }
    }
    throw error;
  }
}

export function spawnServer(env, port) {
  const lines = [];
  // Its own process group: `npm run start` is a wrapper, and on Linux the
  // Next.js server it starts outlives a signal sent to npm alone, holding this
  // process's pipes open so the test run never exits (CI, #242).
  const proc = spawn("npm", ["run", "start", "--", "-p", String(port)], {
    cwd: webRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: true,
  });
  proc.stdout.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
  proc.stderr.on("data", (chunk) => lines.push(...String(chunk).split("\n").filter(Boolean)));
  const exit = new Promise((resolve) => proc.once("exit", resolve));
  return { proc, lines, exit };
}

export async function waitReady(server, url, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (server.proc.exitCode !== null) throw new Error(`${label} exited early:\n${server.lines.join("\n")}`);
    try {
      const probe = await fetch(url);
      if (probe.status === 200) return;
    } catch {}
    if (Date.now() > deadline) throw new Error(`${label} did not answer on ${url}:\n${server.lines.join("\n")}`);
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
}

export async function stopServer(server) {
  if (!server) return;
  const group = (signal) => {
    try {
      process.kill(-server.proc.pid, signal); // the whole group: npm and the server it started
    } catch {}
  };
  group("SIGTERM");
  await Promise.race([server.exit, new Promise((resolve) => setTimeout(resolve, 5_000))]);
  group("SIGKILL");
  server.proc.stdout?.destroy();
  server.proc.stderr?.destroy();
}
