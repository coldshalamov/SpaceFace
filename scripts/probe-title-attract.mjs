#!/usr/bin/env node
// probe-title-attract.mjs — the LIVE TITLE on the real route, not the bench.
//
// build_map.md §25 "Zero to hero" Phase 5.2: after 12 idle seconds the title swaps its
// uiStage request from the authored `title-field` still to `title-attract`, the baked
// deterministic Crucible replay, played through the game's own renderer behind the menu
// DOM. The bench cannot show this — it has no renderer and its manager is a stub — so
// this probe boots the dev screen route and asks the same questions a player would:
//
//   1. The still is the picture at arrival (`title-field`, live, plate gone).
//   2. After the idle window the stage is `title-attract`, `live: true`, ONE context —
//      and the frame actually moves (two captures differ beyond noise).
//   3. Picking a menu verb tears the fight down (stage released, not live).
//
// Output: .devshots/title-attract/*.png + a console verdict. Exit 1 on any failed gate.

import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { startFreshServer } from './capture-ui-matrix.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = path.join(ROOT, '.devshots', 'title-attract');
const IDLE_WAIT_MS = 14_000;   // ATTRACT_IDLE_MS is 12_000; give the arming frame room.
const ARM_TIMEOUT_MS = 90_000; // tape decode + GLB loads + pipeline compile on SwiftShader.
const TEARDOWN_TIMEOUT_MS = 30_000;

// Browser test servers must never mount the real shared save drawer (§ AGENTS.md).
process.env.SPACEFACE_PLAYER_STORE_DIR = '';

const failures = [];
function check(name, ok, detail = '') {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
}

const { chromium } = await loadPlaywright();
const server = await startFreshServer();
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`));
page.on('console', (msg) => {
  if (msg.type() !== 'error') return;
  const text = msg.text();
  if (text.includes('__spaceface_player_store')) return; // isolated store: expected 404
  // The same 404 surfaces as a bare "Failed to load resource" — the URL is on the location.
  const loc = msg.location && msg.location() ? String(msg.location().url || '') : '';
  if (loc.includes('__spaceface_player_store')) return;
  consoleErrors.push(text);
});
page.on('response', (response) => {
  if (response.status() < 400) return;
  const url = response.url();
  if (url.includes('spaceface-release-build.json') || url.endsWith('favicon.ico')) return;
  if (url.includes('__spaceface_player_store')) return; // isolated store: expected 404
  consoleErrors.push(`HTTP ${response.status()} ${url.replace(server.baseUrl, '/')}`);
});

const stageReport = () => page.evaluate(() => (globalThis.__SF_UI_STAGE__ ? globalThis.__SF_UI_STAGE__() : null));
const stageDataset = () => page.evaluate(() => {
  const el = document.querySelector('[data-screen="mainMenu"]');
  return el ? { kStage: el.dataset.kStage || null, kReady: el.dataset.kReady || null } : null;
});

try {
  // domcontentloaded waits on deferred module scripts — a cold server.js plus a busy disk can
  // push it past the default 30s on this machine even though the page is healthy.
  await page.goto(`${server.baseUrl}?dev=screen:mainMenu`, { waitUntil: 'domcontentloaded', timeout: 120_000 });

  // ---------------------------------------------------------------- arrival: the authored still
  // The idle window starts at mount — on a slow box the gap between mount and this script's
  // first poll can exceed 12s, which arms the attract before the still can be observed.
  // mousemove is one of the events that resets the idle timer, so jiggle from page load
  // (harmless before the screen exists) until the still's own stage has reported live.
  let keepJiggling = true;
  const jiggle = (async () => {
    let step = 0;
    while (keepJiggling) {
      step = (step + 1) % 4;
      await page.mouse.move(30 + step * 14, 34 + step * 9).catch(() => {});
      await page.waitForTimeout(2500);
    }
  })();

  await page.waitForSelector('[data-screen="mainMenu"]', { timeout: 60_000 });
  let arrival = null;
  const stillDeadline = Date.now() + 90_000;
  while (Date.now() < stillDeadline) {
    arrival = await stageReport();
    // If the attract beat the jiggle to the arm, the still phase is unobservable this run —
    // record it honestly rather than wait forever for a title-field that is gone.
    if (arrival && arrival.scene === 'title-attract') break;
    if (arrival && arrival.scene === 'title-field' && arrival.status === 'live') break;
    await page.waitForTimeout(500);
  }
  console.log('arrival stage:', JSON.stringify(arrival));
  const stillSeen = !!(arrival && arrival.scene === 'title-field' && arrival.status === 'live');
  check('still is the picture at arrival', stillSeen,
    stillSeen ? 'title-field live' : `saw ${arrival && arrival.scene} — the 12s idle elapsed before the first poll`);
  check('still stage is not live-content', !(arrival && arrival.live === true && arrival.scene === 'title-field'));
  if (stillSeen) {
    await page.screenshot({ path: path.join(OUT_DIR, 'still.png') });
  }
  keepJiggling = false;
  await jiggle.catch(() => {});

  // ------------------------------------------------------------- idle window: the fight arms
  // No input at all — anything we send (keys, pointer) re-arms the idle timer by design.
  const armStart = Date.now();
  await page.waitForTimeout(IDLE_WAIT_MS);
  let armed = null;
  while (Date.now() - armStart < ARM_TIMEOUT_MS) {
    armed = await stageReport();
    if (armed && armed.scene === 'title-attract' && armed.live === true && armed.status === 'live') break;
    await page.waitForTimeout(750);
  }
  const armedDs = await stageDataset();
  console.log('armed stage:', JSON.stringify(armed), 'dataset:', JSON.stringify(armedDs));
  check('idle window arms the live title', !!(armed && armed.scene === 'title-attract'));
  check('live content is actually running', !!(armed && armed.live === true && armed.status === 'live'));
  check('one WebGL context', !!(armed && armed.contexts === 1));
  check('plate yielded to the live scene', !!(armedDs && armedDs.kStage === 'live' && armedDs.kReady === '1'));

  const canvasCount = await page.evaluate(() => document.querySelectorAll('canvas').length);
  console.log(`  canvases in DOM: ${canvasCount}`);

  // ------------------------------------------------------------- motion proof: the frame moves
  // Two captures a beat apart must differ — a still image would prove the tape is not playing.
  await page.waitForTimeout(2500);
  const shotA = path.join(OUT_DIR, 'live-a.png');
  const shotB = path.join(OUT_DIR, 'live-b.png');
  await page.screenshot({ path: shotA });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: shotB });
  const motion = diffPngs(shotA, shotB);
  const richness = colorBuckets(shotA);
  console.log(`  frame diff: ${(motion * 100).toFixed(2)}% of pixels moved; ${richness} colour buckets`);
  check('the fight actually moves', motion > 0.005, `${(motion * 100).toFixed(2)}% pixels differ`);
  check('the frame is a real scene, not black', richness > 64, `${richness} quantized buckets`);

  // ------------------------------------------------------------- teardown: a verb ends the show
  await page.click('[data-action="settings"]', { timeout: 10_000 });
  let torn = null;
  const tearStart = Date.now();
  while (Date.now() - tearStart < TEARDOWN_TIMEOUT_MS) {
    torn = await stageReport();
    if (torn && torn.live !== true && torn.scene !== 'title-attract') break;
    await page.waitForTimeout(500);
  }
  console.log('after pick:', JSON.stringify(torn));
  check('picking a menu verb releases the fight', !!(torn && torn.live !== true && torn.scene !== 'title-attract'));
} finally {
  await browser.close().catch(() => {});
  server.kill();
}

if (consoleErrors.length) {
  console.log('\npage errors / failed requests:');
  for (const line of consoleErrors.slice(0, 20)) console.log(`  ${line}`);
}
check('no page errors during the live title', consoleErrors.length === 0);

console.log(failures.length ? `\nPROBE FAILED: ${failures.join('; ')}` : '\nprobe passed — live title verified on the real route');
process.exit(failures.length ? 1 : 0);

function readPng(file) {
  return PNG.sync.read(readFileSync(file));
}

function diffPngs(a, b) {
  const pa = readPng(a); const pb = readPng(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return 1;
  let moved = 0;
  const total = pa.width * pa.height;
  for (let i = 0; i < pa.data.length; i += 4) {
    const d = Math.abs(pa.data[i] - pb.data[i]) + Math.abs(pa.data[i + 1] - pb.data[i + 1]) + Math.abs(pa.data[i + 2] - pb.data[i + 2]);
    if (d > 24) moved++;
  }
  return moved / total;
}

function colorBuckets(file) {
  const png = readPng(file);
  const buckets = new Set();
  for (let i = 0; i < png.data.length; i += 16) { // sample every 4th pixel
    buckets.add((png.data[i] >> 4) << 8 | (png.data[i + 1] >> 4) << 4 | (png.data[i + 2] >> 4));
  }
  return buckets.size;
}
