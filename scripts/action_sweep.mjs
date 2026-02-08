#!/usr/bin/env node
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright-core";

const ROOT = process.cwd();
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}/index.html`;
const OUT_DIR = path.join(ROOT, "tmp", "runtime-check");
const HERO_ACTIONS = [
  { id: "potty", durationMs: 11600 },
  { id: "egg-hatch", durationMs: 7800 },
  { id: "jetpack", durationMs: 13200 },
  { id: "fireworks", durationMs: 5200 },
  { id: "disco", durationMs: 8000 },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getChromeExecutable() {
  const candidates = [
    process.env.CHROME_PATH,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
  ].filter(Boolean);
  return candidates[0];
}

async function waitForServer(url, timeoutMs = 15000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ok = await new Promise((resolve) => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve((res.statusCode || 500) < 500);
      });
      req.on("error", () => resolve(false));
      req.setTimeout(800, () => {
        req.destroy();
        resolve(false);
      });
    });
    if (ok) return;
    await sleep(180);
  }
  throw new Error(`Server did not start within ${timeoutMs}ms`);
}

async function readFrameTelemetry(page, actionId) {
  return page.evaluate((id) => {
    const g = window.chickenGame;
    const action = g?.activeActions?.find((candidate) => candidate.id === id) || null;
    return {
      time: g?.time ?? 0,
      actionState: action?.state ?? null,
      eggVisible: !!action?.eggVisible,
      waterTint: typeof action?.waterTint === "number" ? action.waterTint : null,
      rainOrigins: Array.isArray(action?.drops)
        ? action.drops.slice(0, 18).map((drop) => (typeof drop.originY === "number" ? drop.originY : drop.y))
        : [],
      skyBandMaxY: typeof action?.skyBandMaxY === "number" ? action.skyBandMaxY : null,
      nightBlend: g?.cinematic?.state?.nightBlend ?? 0,
      chickenX: g?.chicken?.x ?? 0,
      chickenGroundY: g?.chicken?.groundY ?? 0,
      activeActions: (g?.activeActions || []).map((candidate) => candidate.id),
    };
  }, actionId);
}

async function clearActions(page) {
  await page.evaluate(() => {
    const g = window.chickenGame;
    if (!g) return;
    for (let i = g.activeActions.length - 1; i >= 0; i -= 1) {
      const action = g.activeActions[i];
      action.cancel(g);
      g.activeActions.splice(i, 1);
    }
  });
}

async function runActionStoryboard(page, actionId, durationMs, frames = 10) {
  await clearActions(page);
  await page.evaluate((id) => {
    window.chickenGame.triggerRandomAction(id);
  }, actionId);
  await page.waitForTimeout(120);

  const telemetry = [];
  const interval = Math.max(120, Math.floor(durationMs / Math.max(1, frames - 1)));
  for (let i = 0; i < frames; i += 1) {
    telemetry.push(await readFrameTelemetry(page, actionId));
    const shotPath = path.join(OUT_DIR, `${actionId}-${String(i + 1).padStart(2, "0")}.png`);
    await page.screenshot({ path: shotPath });
    if (i < frames - 1) {
      await page.waitForTimeout(interval);
    }
  }

  await clearActions(page);
  await page.waitForTimeout(100);
  return telemetry;
}

function range(values) {
  if (!values.length) return 0;
  return Math.max(...values) - Math.min(...values);
}

function evaluateInvariants(results, idleTelemetry, pageErrors, consoleErrors) {
  const eggTelemetry = results["egg-hatch"] || [];
  const eggStateIndex = eggTelemetry.findIndex((entry) =>
    ["lay", "drop", "wobble", "hatch", "done"].includes(entry.actionState || ""),
  );
  const eggVisibleIndex = eggTelemetry.findIndex((entry) => entry.eggVisible);
  const eggVisibleBeforeLay = eggStateIndex > 0 && eggTelemetry.slice(0, eggStateIndex).some((entry) => entry.eggVisible);

  const pottyTelemetry = results.potty || [];
  const hopIndex = pottyTelemetry.findIndex((entry) => ["hop", "reveal"].includes(entry.actionState || ""));
  const pottyTintAtHop = hopIndex >= 0 ? pottyTelemetry[hopIndex].waterTint ?? 0 : 0;

  const rainTelemetry = results["rainbow-rain"] || [];
  const allRainOrigins = rainTelemetry.flatMap((entry) => entry.rainOrigins || []);
  const skyBandMax = rainTelemetry.reduce((max, entry) => Math.max(max, entry.skyBandMaxY || 0), 0);

  const fireworksTelemetry = results.fireworks || [];
  const maxNightBlend = fireworksTelemetry.reduce((max, entry) => Math.max(max, entry.nightBlend || 0), 0);

  const discoTelemetry = results.disco || [];
  const discoMaxNightBlend = discoTelemetry.reduce((max, entry) => Math.max(max, entry.nightBlend || 0), 0);

  const idleXRange = range(idleTelemetry.map((entry) => entry.chickenX));
  const idleYRange = range(idleTelemetry.map((entry) => entry.chickenGroundY));

  return {
    noRuntimeErrors: {
      pass: pageErrors.length === 0 && consoleErrors.length === 0,
      details: { pageErrors, consoleErrors },
    },
    eggLaidBeforeAppears: {
      pass: eggStateIndex >= 0 && eggVisibleIndex >= eggStateIndex && !eggVisibleBeforeLay,
      details: { eggStateIndex, eggVisibleIndex, eggVisibleBeforeLay },
    },
    pottyDirtyBeforeStand: {
      pass: hopIndex >= 0 && pottyTintAtHop >= 0.85,
      details: { hopIndex, pottyTintAtHop },
    },
    rainOriginFromSkyBand: {
      pass: allRainOrigins.length > 0 && allRainOrigins.every((y) => y <= skyBandMax + 1),
      details: {
        sampleCount: allRainOrigins.length,
        maxOriginY: allRainOrigins.length ? Math.max(...allRainOrigins) : null,
        skyBandMax,
      },
    },
    fireworksNightBlend: {
      pass: maxNightBlend >= 0.72,
      details: { maxNightBlend },
    },
    discoNightBlend: {
      pass: discoMaxNightBlend >= 0.7,
      details: { discoMaxNightBlend },
    },
    idleMovementXY: {
      pass: idleXRange >= 45 && idleYRange >= 10,
      details: { idleXRange, idleYRange },
    },
  };
}

async function main() {
  await fs.rm(OUT_DIR, { recursive: true, force: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  const server = spawn("python3", ["-m", "http.server", String(PORT), "--bind", "127.0.0.1"], {
    cwd: ROOT,
    stdio: ["ignore", "ignore", "ignore"],
  });

  const pageErrors = [];
  const consoleErrors = [];

  let browser;
  try {
    await waitForServer(BASE_URL);

    const executablePath = getChromeExecutable();
    if (!executablePath) {
      throw new Error("No Chrome executable found. Set CHROME_PATH to continue.");
    }

    browser = await chromium.launch({
      headless: true,
      executablePath,
      args: ["--disable-dev-shm-usage", "--mute-audio"],
    });

    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    page.on("pageerror", (error) => pageErrors.push(String(error)));
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.addInitScript(() => {
      let seed = 123456789;
      Math.random = () => {
        seed = (1664525 * seed + 1013904223) >>> 0;
        return seed / 4294967296;
      };
    });

    await page.goto(BASE_URL, { waitUntil: "networkidle" });
    await page.waitForFunction(
      () => window.chickenGame && document.getElementById("loading")?.classList.contains("hidden"),
      undefined,
      { timeout: 20000 },
    );

    const runs = {};

    // Idle strut check (no active action).
    const idleTelemetry = [];
    await clearActions(page);
    for (let i = 0; i < 32; i += 1) {
      idleTelemetry.push(await readFrameTelemetry(page, ""));
      await page.waitForTimeout(170);
    }

    for (const hero of HERO_ACTIONS) {
      const frames = hero.id === "jetpack" ? 12 : 10;
      runs[hero.id] = await runActionStoryboard(page, hero.id, hero.durationMs, frames);
    }
    runs["rainbow-rain"] = await runActionStoryboard(page, "rainbow-rain", 6400, 10);

    const invariants = evaluateInvariants(runs, idleTelemetry, pageErrors, consoleErrors);
    const allPass = Object.values(invariants).every((entry) => entry.pass);

    const report = {
      generatedAt: new Date().toISOString(),
      invariants,
      allPass,
      storyboards: Object.keys(runs).reduce((acc, actionId) => {
        const frames = actionId === "jetpack" ? 12 : 10;
        acc[actionId] = Array.from({ length: frames }, (_, i) => `${actionId}-${String(i + 1).padStart(2, "0")}.png`);
        return acc;
      }, {}),
    };

    await fs.writeFile(path.join(OUT_DIR, "report.json"), JSON.stringify(report, null, 2));

    const summaryLines = [
      `overall: ${allPass ? "PASS" : "FAIL"}`,
      ...Object.entries(invariants).map(([name, value]) => `${name}: ${value.pass ? "PASS" : "FAIL"} ${JSON.stringify(value.details)}`),
    ];
    await fs.writeFile(path.join(OUT_DIR, "summary.txt"), `${summaryLines.join("\n")}\n`);

    console.log(summaryLines.join("\n"));
    if (!allPass) {
      process.exitCode = 1;
    }
  } finally {
    if (browser) await browser.close();
    server.kill("SIGTERM");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
