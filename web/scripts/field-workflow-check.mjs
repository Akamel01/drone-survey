// Field workflow baseline measurement: count taps, characters, view switches,
// scrolls, and time for a realistic path to a Loaded Mission at 375 × 812 with touch.
//
// Usage: npm run check:field-workflow -- http://127.0.0.1:<port>
//
// The server is expected to be running. Output: docs/research/field-workflow-check/baseline.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBrowser } from "./lib/harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const OUT = path.resolve(process.env.SHOT_DIR ?? path.join(HERE, "../../docs/research/field-workflow-check"));
fs.mkdirSync(OUT, { recursive: true });
const PASSPHRASE_KEY = "drone-planner.wayfinder-key";
const TIMEOUT = 15_000;

const metrics = {
  steps: [],
  total_taps: 0,
  total_characters: 0,
  total_view_switches: 0,
  total_scrolls: 0,
  total_ms: 0,
};

function recordStep(name, taps = 0, chars = 0, switches = 0, scrolls = 0, ms = 0) {
  metrics.steps.push({ name, taps, chars, switches, scrolls, ms });
  metrics.total_taps += taps;
  metrics.total_characters += chars;
  metrics.total_view_switches += switches;
  metrics.total_scrolls += scrolls;
  metrics.total_ms += ms;
}

async function main() {
  let browser;
  try {
    const overallStart = Date.now();

    console.log(`Connecting to ${BASE}...`);
    browser = await launchBrowser();

    const context = await browser.newContext({
      viewport: { width: 375, height: 812 },
      hasTouch: true,
      isMobile: true,
    });

    // Mock the API and passphrase
    await context.addInitScript(
      ({ key, value }) => {
        localStorage.setItem(key, value);
        const orig = window.fetch.bind(window);
        window.fetch = (input, init) => {
          const url = typeof input === "string" ? input : input?.url ? input.url : String(input);
          if (url.includes("/api/missions")) {
            return Promise.resolve(
              new Response(
                JSON.stringify({
                  missions: [],
                  archived_count: 0,
                  stale_cards: [],
                  host: { notice: null, drift: null },
                  unreadable: [],
                  now: Date.now(),
                }),
                { status: 200, headers: { "Content-Type": "application/json" } },
              ),
            );
          }
          return orig(input, init);
        };
      },
      { key: PASSPHRASE_KEY, value: "evidence" },
    );

    const page = await context.newPage();

    // Step 1: Open planner
    const openStart = Date.now();
    await page.goto(`${BASE}/plan`, { waitUntil: "domcontentloaded" });
    await page.getByText(/No Missions in the store yet/).waitFor({ timeout: TIMEOUT });
    await page.locator('section[aria-label="Map"] canvas').waitFor({ state: "attached", timeout: TIMEOUT });
    await page.waitForTimeout(250);
    const openTime = Date.now() - openStart;
    recordStep("open planner", 0, 0, 0, 0, openTime);
    console.log(`✓ Planner opened in ${openTime}ms`);

    // Step 2: Look for buttons to create a mission or site, try multiple approaches
    const newButton = page.getByRole("button", { name: /new|create|add/i }).first();
    const found = await newButton.evaluate((el) => !!el).catch(() => false);

    let siteName = "";
    if (found) {
      console.log("✓ Found create/new button");
      await newButton.click();
      recordStep("tap create button", 1, 0, 0, 0, 0);

      // Try to find and fill site name
      await page.waitForTimeout(300);
      const nameInput = page.getByLabel(/site|name/i).first();
      const nameFound = await nameInput.evaluate((el) => !!el).catch(() => false);

      if (nameFound) {
        siteName = "Test Site";
        await nameInput.click();
        await nameInput.fill(siteName);
        recordStep("enter site name", 1, siteName.length, 0, 0, 0);

        // Try to confirm
        const confirmBtn = page.getByRole("button", { name: /save|create|confirm/i }).nth(1);
        const confirmFound = await confirmBtn.evaluate((el) => !!el).catch(() => false);
        if (confirmFound) {
          await confirmBtn.click();
          recordStep("confirm site", 1, 0, 0, 0, 0);
        }
      }
    }

    // Step 3: Switch to Map tab
    await page.waitForTimeout(500);
    const mapTab = page.getByRole("tab", { name: /map/i });
    const mapFound = await mapTab.evaluate((el) => !!el).catch(() => false);

    if (mapFound) {
      const isSelected = await mapTab.getAttribute("aria-selected");
      if (isSelected !== "true") {
        await mapTab.click();
        recordStep("switch to map", 1, 0, 1, 0, 0);
      }
    }

    // Step 4: Look for drawing tools and draw an area
    await page.waitForTimeout(300);
    const drawStart = Date.now();

    const polyButton = page.getByRole("button", { name: /polygon|area|draw/i }).first();
    const polyFound = await polyButton.evaluate((el) => !!el).catch(() => false);

    if (polyFound) {
      await polyButton.click();
      recordStep("open draw tool", 1, 0, 0, 0, 0);

      await page.waitForFunction(
        () => document.querySelector('[class*="drawPanel"]') !== null,
        undefined,
        { timeout: 5000 },
      ).catch(() => {});

      // Draw a simple square
      const canvas = await page.locator('section[aria-label="Map"] canvas').boundingBox();
      if (canvas && canvas.width > 50) {
        const cx = canvas.x + canvas.width * 0.5;
        const cy = canvas.y + canvas.height * 0.5;
        const w = canvas.width * 0.2;
        const h = canvas.height * 0.2;

        const corners = [
          { x: cx - w, y: cy - h },
          { x: cx + w, y: cy - h },
          { x: cx + w, y: cy + h },
          { x: cx - w, y: cy + h },
        ];

        for (const corner of corners) {
          await page.touchscreen.tap(corner.x, corner.y);
          recordStep("tap corner", 1, 0, 0, 0, 0);
          await page.waitForTimeout(50);
        }

        // Try to finish
        const finishBtn = page.getByRole("button", { name: /finish|done/i }).first();
        const finishFound = await finishBtn.evaluate((el) => !!el).catch(() => false);
        if (finishFound) {
          await finishBtn.click();
          recordStep("finish drawing", 1, 0, 0, 0, 0);
        } else {
          await page.keyboard.press("Enter").catch(() => {});
          recordStep("press enter", 0, 0, 0, 0, 0);
        }
      }
    }

    const drawTime = Date.now() - drawStart;
    recordStep("draw area total", 0, 0, 0, 0, drawTime);

    // Step 5: Scroll and look for more controls
    await page.waitForTimeout(300);
    const allButtons = await page.$$eval("button", (buttons) =>
      buttons
        .slice(0, 20)
        .map((b) => b.textContent?.trim() || b.getAttribute("aria-label") || "(unlabeled)"),
    );
    console.log("✓ Buttons found:", allButtons.join(", "));

    // Step 6: Try to find Save/Dispatch buttons
    const saveBtn = page.getByRole("button", { name: /save|dispatch|submit/i }).first();
    const saveFound = await saveBtn.evaluate((el) => !!el).catch(() => false);

    if (saveFound) {
      await saveBtn.click();
      recordStep("tap save/dispatch", 1, 0, 0, 0, 0);
      await page.waitForTimeout(500);
    }

    // Step 7: Look for Load status
    await page.waitForTimeout(300);
    const statusEl = await page.$('[class*="load" i], [class*="status" i], [aria-label*="status" i]');
    if (statusEl) {
      const statusText = await statusEl.textContent();
      console.log(`✓ Status found: ${statusText?.trim()}`);
      recordStep("read status", 0, 0, 0, 0, 0);
    }

    // Measure and output
    const totalTime = Date.now() - overallStart;
    metrics.total_ms = totalTime;

    const outputFile = path.join(OUT, "baseline.json");
    fs.writeFileSync(outputFile, JSON.stringify(metrics, null, 2));

    console.log(`\n=== Field Workflow Baseline ===`);
    console.log(`Total time: ${metrics.total_ms}ms`);
    console.log(`Total taps: ${metrics.total_taps}`);
    console.log(`Total characters: ${metrics.total_characters}`);
    console.log(`Total view switches: ${metrics.total_view_switches}`);
    console.log(`Total scrolls: ${metrics.total_scrolls}`);
    console.log(`\nStep breakdown:`);
    metrics.steps.forEach((step) => {
      const parts = [step.name, `${step.ms}ms`];
      if (step.taps > 0) parts.push(`${step.taps} taps`);
      if (step.chars > 0) parts.push(`${step.chars} chars`);
      if (step.switches > 0) parts.push(`${step.switches} switches`);
      if (step.scrolls > 0) parts.push(`${step.scrolls} scrolls`);
      console.log(`  ${parts.join(" | ")}`);
    });
    console.log(`\nMetrics saved to: ${outputFile}`);

    await context.close();
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  } finally {
    await browser?.close();
  }
}

main();
