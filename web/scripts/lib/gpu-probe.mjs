// GPU probe for web/scripts/remote-check.sh: launch Chromium with the
// CHECK_CHROMIUM_JSON launch options, read the WebGL renderer and fail closed
// unless it is the NVIDIA card the checks were validated against.
//
// Usage: node scripts/lib/gpu-probe.mjs
//
// Prints exactly one `gpu renderer: <string>` line. Exits 0 only when the
// string names NVIDIA and none of the software rasterisers. On failure it
// also prints the launch options it tried, nvidia-smi, `id` and /dev/dri,
// then exits 1.

import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { chromium } from "playwright-core";
import { chromiumLaunchOptions } from "./harness.mjs";

const options = chromiumLaunchOptions();
let browser;
let renderer = "";
let error = null;
try {
  browser = await chromium.launch(options);
  const page = await browser.newPage();
  await page.goto("about:blank");
  renderer = String(
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
      if (!gl) return "";
      const info = gl.getExtension("WEBGL_debug_renderer_info");
      return info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    }),
  );
} catch (cause) {
  error = cause;
} finally {
  await browser?.close();
}

const pass = !error && /NVIDIA/i.test(renderer) && !/SwiftShader|llvmpipe|software/i.test(renderer);
console.log(`gpu renderer: ${renderer || "(unavailable)"}`);
if (!pass) {
  if (error) console.log(`launch failed: ${String(error.message).split("\n")[0]}`);
  console.log(`launch options: ${JSON.stringify(options)}`);
  for (const [label, command, args] of [
    ["nvidia-smi", "nvidia-smi", ["--query-gpu=name", "--format=csv,noheader"]],
    ["id", "id", []],
  ]) {
    try {
      console.log(`${label}: ${execFileSync(command, args, { encoding: "utf8" }).trim()}`);
    } catch (cause) {
      console.log(`${label}: unavailable (${cause.code ?? cause.message})`);
    }
  }
  try {
    console.log(`/dev/dri: ${readdirSync("/dev/dri").join(" ")}`);
  } catch (cause) {
    console.log(`/dev/dri: unavailable (${cause.code ?? cause.message})`);
  }
}
process.exit(pass ? 0 : 1);
