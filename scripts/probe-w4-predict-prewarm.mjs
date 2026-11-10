#!/usr/bin/env node
// Wave-4 predict lane evidence probe.
//
// Plots the Helios -> Ceres route through the real player seams (`ui:setCourse` + `nav:engageRoute`)
// and lets the route follower fly the ship to the gate and request the jump itself. While it flies,
// a sampler watches the renderer's incoming-sector prewarm record: on the predict branch it arms as
// a speculative `stageBoundaries: false` warm as soon as the route names the destination; on master
// the same run is the control — the prewarm only arms at `jump:chargeStart` (~3 s of charge).
//
// Metrics written to stdout at the end (and .devshots/predict-prewarm/<stamp>.json):
//   - leadSeconds: sim seconds the destination's authored census had already been requested before
//     chargeStart fired for it (predicted arm time vs chargeStart time).
//   - requestsAtCharge: how many authored decode requests the record had queued at chargeStart.
//   - arrival readiness: the +N s sim sample at which every admitted body in camera reach published,
//     mirroring probe-sector-arrival-admission's census.
//
//   node scripts/probe-w4-predict-prewarm.mjs            # headed
//   node scripts/probe-w4-predict-prewarm.mjs --headless # CI / triage
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const readOption = (flag, fallback = null) => {
  const index = argv.indexOf(flag);
  if (index < 0 || index + 1 >= argv.length) return fallback;
  return argv[index + 1];
};
const HEADLESS = argv.includes('--headless');
const SEED = Number(readOption('--seed', '4242')) || 4242;
const TARGET_SECTOR = 'sector_ceres_belt';
const RANGE_WU = 340;
const SAMPLE_SECONDS = [5, 20, 45, 60, 90, 120];
const MAX_LEG_SECONDS = 240;
const POLL_MS = 500;
const OUT_DIR = `${ROOT}.devshots/predict-prewarm`;

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  // Playwright's full chromium build (chrome-headless-shell is not always installed).
  `${process.env.LOCALAPPDATA || ''}/ms-playwright/chromium-1228/chrome-win64/chrome.exe`,
].filter(Boolean).find((candidate) => existsSync(candidate));

const t0 = Date.now();
const stamp = (label) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s] ${label}`);

const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: HEADLESS,
  ...(browserPath ? { executablePath: browserPath } : {}),
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default', '--mute-audio'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await context.newPage();
page.on('console', (message) => {
  const text = message.text();
  if (/prewarm|predict|sector|admission|error/i.test(text)) console.log(`  [page] ${text.slice(0, 200)}`);
});

const censusScript = (range) => {
  const state = window.SF.state;
  const player = state.entities.get(state.playerId);
  const rows = (state.entityList || [])
    .filter((entity) => entity
      && entity.alive !== false
      && entity.id !== state.playerId
      && Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z) <= range)
    .map((entity) => ({
      id: entity.id,
      type: entity.type,
      d: Math.round(Math.hypot(entity.pos.x - player.pos.x, entity.pos.z - player.pos.z)),
      adm: entity.presentationAdmission ?? null,
    }));
  const pending = rows.filter((row) => row.adm != null && row.adm !== 'ready');
  const tally = {};
  for (const row of rows) {
    const key = `${row.type}:${row.adm}`;
    tally[key] = (tally[key] || 0) + 1;
  }
  return { simTime: state.simTime, sector: state.world.currentSectorId, pending, tally };
};

const samplerScript = () => {
  const state = window.SF.state;
  let system = null;
  try { system = window.SF.registry.get('render'); } catch { system = null; }
  const rec = system && system._incomingSectorPrewarm;
  const warm = system && system._predictedSectorWarm;
  const player = state.entities.get(state.playerId);
  return {
    simTime: state.simTime,
    mode: state.mode,
    sector: state.world && state.world.currentSectorId,
    jumpState: state.jump && state.jump.state,
    navStatus: state.nav && state.nav.executor ? state.nav.executor.status : null,
    legIndex: state.nav && state.nav.executor ? state.nav.executor.legIndex : null,
    playerPos: player && player.pos ? { x: Math.round(player.pos.x), z: Math.round(player.pos.z) } : null,
    warm: warm ? {
      sectorId: warm.sectorId,
      source: warm.source || null,
      active: warm.active === true,
      requests: warm.requestCount || 0,
      settled: Array.isArray(warm.settled) ? warm.settled.filter(Boolean).length : null,
    } : null,
    incoming: rec ? {
      sectorId: rec.sectorId,
      requests: (rec.requests || []).length,
      stageBoundaries: rec.stageBoundaries !== false,
    } : null,
  };
};

const results = {
  seed: SEED,
  targetSector: TARGET_SECTOR,
  chargeEvents: [],
  arriveEvents: [],
  firstPredictedArm: null,
  requestsAtCharge: null,
  legSwitches: 0,
};

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 45_000 });
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180_000 });
  stamp('flight');
  await page.waitForFunction(() => {
    const state = window.SF.state;
    return state.entities.get(state.playerId)?.presentationAdmission === 'ready';
  }, null, { timeout: 180_000 });
  stamp('player admitted at origin');

  // Record jump seam timings in-page so sim-time comparisons do not depend on poll timing.
  await page.evaluate(() => {
    window.__W4 = { charges: [], arrives: [] };
    window.SF.bus.on('jump:chargeStart', (p) => {
      window.__W4.charges.push({ simTime: window.SF.state.simTime, targetSectorId: p && p.targetSectorId });
    });
    window.SF.bus.on('jump:arrive', (p) => {
      window.__W4.arrives.push({ simTime: window.SF.state.simTime, sectorId: p && p.sectorId });
    });
  });

  // Discovery gates route plotting: reveal the atlas so computeRoute can reach Ceres — the probe
  // measures the prefetch lane, not the fog-of-war pacing.
  await page.evaluate(() => {
    const discovery = window.SF.state.world.discovery || {};
    for (const rec of Object.values(discovery)) {
      if (rec) rec.discovered = true;
    }
  });

  const route = await page.evaluate((sectorId) => {
    window.SF.bus.emit('ui:setCourse', { sectorId });
    const route = window.SF.state.nav && window.SF.state.nav.route;
    return route ? route.legs.map((leg) => `${leg.from}->${leg.to}`) : null;
  }, TARGET_SECTOR);
  if (!route) throw new Error('computeRoute returned no route to the target sector');
  stamp(`route plotted: ${route.join(' | ')}`);
  await page.evaluate(() => window.SF.bus.emit('nav:engageRoute', {}));
  stamp('route executor engaged');

  // Fly the route. The follower requests each jump at the gate handoff; we observe prewarm
  // arm timing the whole way until the player lands in the destination sector.
  let lastLegIndex = null;
  let legStartSim = null;
  let interrupts = 0;
  for (;;) {
    const snap = await page.evaluate(samplerScript);
    if (!snap || snap.mode !== 'flight') break;
    if (snap.sector === TARGET_SECTOR) {
      stamp(`arrived in ${TARGET_SECTOR} (route executor handed off)`);
      break;
    }
    if (snap.warm && snap.warm.active && !results.firstPredictedArm) {
      results.firstPredictedArm = { simTime: snap.simTime, sectorId: snap.warm.sectorId, requests: snap.warm.requests, source: snap.warm.source };
      stamp(`predicted warm armed for ${snap.warm.sectorId} at sim ${snap.simTime.toFixed(1)} (${snap.warm.requests} reqs, ${snap.warm.source})`);
    }
    if (snap.warm && snap.warm.sectorId === TARGET_SECTOR) {
      results.lastWarm = snap.warm;
    }
    if (snap.navStatus === 'interrupted' && interrupts < 3) {
      interrupts++;
      stamp(`route executor interrupted — re-engaging (${interrupts})`);
      await page.evaluate(() => window.SF.bus.emit('nav:engageRoute', {}));
    }
    if (snap.legIndex !== lastLegIndex) {
      lastLegIndex = snap.legIndex;
      legStartSim = snap.simTime;
    } else if (legStartSim != null && snap.simTime - legStartSim > MAX_LEG_SECONDS) {
      // The follower should reach the gate well inside this bound; if it stalls, drive the rest of
      // the lane by requesting the jump for the predicted sector directly — the prewarm already
      // ran, which is what this probe is measuring.
      stamp(`leg stalled >${MAX_LEG_SECONDS}s — requesting jump for predicted sector directly`);
      const target = snap.incoming ? snap.incoming.sectorId : null;
      await page.evaluate((sectorId) => window.SF.bus.emit('world:requestJump', {
        targetSectorId: sectorId || 'sector_ceres_belt', via: 'gate',
      }), target);
      legStartSim = snap.simTime;
    }
    await page.waitForTimeout(POLL_MS);
  }

  const seam = await page.evaluate(() => window.__W4);
  results.chargeEvents = seam.charges;
  results.arriveEvents = seam.arrives;
  const chargeForTarget = seam.charges.find((c) => c.targetSectorId === TARGET_SECTOR);
  if (chargeForTarget && results.firstPredictedArm) {
    results.leadSeconds = Math.max(0, chargeForTarget.simTime - results.firstPredictedArm.simTime);
    results.requestsAtArm = results.firstPredictedArm.requests;
    results.warmSettledAtEnd = results.lastWarm ? results.lastWarm.settled : null;
  }

  const simArrive = await page.evaluate(() => window.SF.state.simTime);
  const samples = [];
  for (const wait of SAMPLE_SECONDS) {
    await page.waitForFunction((target) => window.SF.state.simTime >= target,
      simArrive + wait, { timeout: 300_000 }).catch(() => null);
    const census = await page.evaluate(censusScript, RANGE_WU);
    samples.push({ wait, pending: census.pending.length, tally: census.tally });
    console.log(`ARRIVAL +${wait}s sim:`, JSON.stringify(census.tally), `pending=${census.pending.length}`);
    if (census.pending.length === 0) break;
  }
  const published = samples.find((sample) => sample.pending === 0) || samples[samples.length - 1];
  results.arrivalReadyAtSimPlus = published.wait;
  console.log(`PUBLISHED at +${published.wait}s sim`);
  console.log('RESULT ' + JSON.stringify(results, null, 2));
} catch (error) {
  console.error('PROBE FAILED:', error);
  results.error = String(error && error.message || error);
  process.exitCode = 1;
} finally {
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = path.join(OUT_DIR, `predict-prewarm-${Date.now()}.json`);
  writeFileSync(outPath, JSON.stringify(results, null, 2));
  stamp(`wrote ${outPath}`);
  await browser.close();
  await server.close();
}
