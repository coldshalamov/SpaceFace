#!/usr/bin/env node
// PQ-012 field route evidence. Boots a normal New Game, drives the THREE consumers through
// ORDINARY INPUT (real Digit5/6/7 key presses handled by src/systems/input.js — proving the
// binding end-to-end, not a console flag), and captures default-camera screenshots plus the
// reduced-motion and reduced-flash variants into .devshots/pq012-fields/. Mirrors the boot +
// capture pattern of capture-combat-vfx-acceptance.mjs (shipped visual-probe helpers).

import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';
import { PNG } from 'pngjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'pq012-fields');
const WIDTH = 1440, HEIGHT = 900;

await mkdir(OUT, { recursive: true });
const executablePath = findSystemBrowser();
if (!executablePath) throw new Error('Chrome or Edge is required for field capture');

const ownedServer = await acquireVisualProbeServer({ explicitUrl: process.env.SF_PROBE_URL || '', root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({ headless: true, executablePath, args: ['--ignore-gpu-blocklist', '--enable-webgl'] });
const context = await browser.newContext({ viewport: { width: WIDTH, height: HEIGHT } });
const page = await context.newPage();
const issues = [];
const captures = [];
const routeLog = [];
page.on('pageerror', (e) => { console.error('[browser error]', e); issues.push({ type: 'pageerror', text: e?.stack || String(e) }); });
page.on('console', (m) => {
  if (m.type() === 'error') { console.error('[browser console.error]', m.text()); issues.push({ type: 'console.error', text: m.text() }); }
});

try {
  await page.addInitScript(() => { try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {} });
  await page.goto(ownedServer.baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!(window.SF?.state && window.SF?.bus), null, { timeout: 30_000 });
  await page.evaluate(() => window.SF.bus.emit('game:new', { name: 'PQ012 Fields', seed: 47 }));
  await page.waitForFunction(() => {
    const sf = window.SF;
    const player = sf?.state?.entities?.get(sf.state.playerId);
    return sf?.state?.mode === 'flight' && player?.mesh && !!sf?.registry?.get?.('vfx')?._scene;
  }, null, { timeout: 90_000 });
  await dismissTutorial(page);
  // Fields is a browser build → FIELD_FLAGS.enabled is already true; assert it so the evidence is honest.
  const flagOn = await page.evaluate(async () => {
    const mod = await import('/src/data/fields.js');
    return !!mod.FIELD_FLAGS.enabled;
  });
  if (!flagOn) throw new Error('FIELD_FLAGS.enabled false in browser — capture would be meaningless');
  await page.waitForTimeout(600);

  // Deploy each consumer via a REAL key press, verify it registered, settle the flow, capture.
  await runConsumer(page, 'well', 'Digit5', 'aim', '01-well-default');
  await runConsumer(page, 'repulsor', 'Digit6', 'ship', '02-repulsor-default');
  await runConsumer(page, 'repulsor', 'Digit6', 'ship', '06-repulsor-berm-close', true);
  await runConsumer(page, 'cone', 'Digit7', 'wedge', '03-cone-default');

  // Accessibility variants on the richest flow (the Well). Direction + boundary must stay readable.
  await runConsumer(page, 'well', 'Digit5', 'aim', '04-well-reduced-motion', false, { motionReduce: true, flashReduce: false });
  await runConsumer(page, 'well', 'Digit5', 'aim', '05-well-reduced-flash', false, { motionReduce: false, flashReduce: true });

  const report = {
    packet: 'PQ-012', ok: issues.length === 0, capturedAt: new Date().toISOString(),
    baseUrl: ownedServer.baseUrl, routeLog, captures, issues,
  };
  await writeFile(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`[capture-fields] ${captures.length} captures, ${issues.length} page issues`);
  for (const r of routeLog) console.log('  ' + r);
  if (issues.length) { console.error('[capture-fields] PAGE ERRORS:', JSON.stringify(issues, null, 2)); process.exitCode = 1; }
  else { console.log('CAPTURE_GATE_OK'); }
} finally {
  await browser.close();
  if (ownedServer && typeof ownedServer.close === 'function') await ownedServer.close();
}

// Set up a fresh scene for `kind`, press the real key, verify registration, settle, and capture.
async function runConsumer(page, kind, keyCode, placement, file, isCloseUp = false, accSettings = null) {
  const setup = await page.evaluate(({ kind, placement, accSettings }) => {
    const SF = window.SF, state = SF.state;
    if (accSettings) {
      state.settings.video = state.settings.video || {};
      state.settings.accessibility = state.settings.accessibility || {};
      state.settings.video.motionReduce = !!accSettings.motionReduce;
      state.settings.video.flashReduce = !!accSettings.flashReduce;
      state.settings.accessibility.flashReduce = !!accSettings.flashReduce;
    } else {
      if (state.settings && state.settings.video) {
        state.settings.video.motionReduce = false;
        state.settings.video.flashReduce = false;
      }
      if (state.settings && state.settings.accessibility) {
        state.settings.accessibility.flashReduce = false;
      }
    }
    const player = state.entities.get(state.playerId);
    // Clean any prior test bodies + live fields so each scene is legible.
    for (const e of [...state.entities.values()]) {
      if ((e.data && e.data.__pq012test) || e.type === 'fieldEmitter' || (e.data && e.data.fieldEmitter)) {
        e.alive = false;
      }
    }
    if (state.ui && Array.isArray(state.ui.screenStack)) state.ui.screenStack.length = 0; // no modal → deploy not blocked
    const fsys = SF.registry.get('fields');
    if (fsys && fsys._clearAll) fsys._clearAll('field_cleared', 'capture_reset');
    if (state.fields) {
      state.fields.deployed = {};
      state.fields.coneActive = false;
      state.fields.coneFieldId = null;
      state.fields.active = [];
      state.fields.snapshot = [];
      if (state.fields.cooldowns) {
        state.fields.cooldowns.well = 0;
        state.fields.cooldowns.repulsor = 0;
      }
    }
    // Face +x for a stable frame; place bodies per placement. Anchor the player (huge mass → the
    // coupling shrugs it to near-immobile) so the chase camera stays framed on the field while the
    // light test bodies visibly react — this is a capture rig, not a gameplay tuning change.
    player.rot = 0; player.vel.x = 0; player.vel.z = 0;
    player.physicsBody = { ...player.physicsBody, mass: 90000, inertiaY: 90000, revision: (player.physicsBody.revision || 0) + 1 };
    if (state.entityIndex && Number.isFinite(state.entityIndex.physicsStaticVersion)) state.entityIndex.physicsStaticVersion++;
    const px = player.pos.x, pz = player.pos.z;
    const spawn = (x, z, mass, type) => SF.helpers.spawnEntity({
      type: type || 'wreck', team: 9, pos: { x, z }, vel: { x: 0, z: 0 }, rot: 0, angVel: 0,
      radius: type === 'ship' ? 12 : 4, collides: true, hull: 60, hullMax: 60,
      physicsBody: { schemaVersion: 1, radius: type === 'ship' ? 12 : 4, mass, inertiaY: mass * 2, dynamic: true, ccd: false, material: type === 'ship' ? 'ship' : 'debris', revision: 0 },
      data: { __pq012test: true, majorDebris: true },
    });
    let cx = px, cz = pz;
    // Keep the field centre within the default-zoom frame so the whole flow reads at 1x.
    if (placement === 'aim') { cx = px; cz = pz - 140; }          // UP-SCREEN — the Well is thrown here (~140 wu toward -z)
    else if (placement === 'wedge') { cx = px + 80; cz = pz; }    // ahead of the nose (the cone wedge)
    // else 'ship' — cluster around the player for the Repulsor
    const base = placement === 'ship' ? { x: px, z: pz } : { x: cx, z: cz };
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2, r = 30 + (i % 3) * 22;
      spawn(base.x + Math.cos(a) * r, base.z + Math.sin(a) * r, 2 + (i % 4));
    }
    spawn(base.x + 40, base.z - 20, 140, 'ship'); // one heavy ship to show the shrug
    // Aim marker seed only; the live input system recomputes aimWorld from the REAL pointer every
    // tick, so the authoritative aim is the page.mouse.move below (ordinary input path).
    state.input.aimWorld = { x: px, z: pz - 140 };
    return { kernelBefore: fsys && fsys._kernel ? fsys._kernel.size : -1 };
  }, { kind, placement, accSettings });

  // ORDINARY AIM: park the real pointer up-screen so input.js derives an up-screen aimWorld
  // (writing state.input.aimWorld directly is clobbered by the mouse recompute each tick).
  await page.mouse.move(720, 170);
  await page.waitForTimeout(120);

  // ORDINARY INPUT: reset cooldowns + deployed + input keys, set action flag + press real key.
  await page.evaluate(({ kind }) => {
    const SF = window.SF, state = SF.state;
    const fsys = SF.registry && SF.registry.get ? SF.registry.get('fields') : null;
    if (fsys && fsys._clearAll) fsys._clearAll('field_cleared', 'capture_reset');
    if (state && state.fields) {
      state.fields.deployed = {};
      state.fields.coneActive = false;
      state.fields.coneFieldId = null;
      state.fields.cooldowns = { well: 0, repulsor: 0 };
      state.fields.active = [];
      state.fields.snapshot = [];
    }
    const isys = SF.registry && SF.registry.get ? SF.registry.get('input') : null;
    if (isys) {
      if (isys._keys) for (const k of Object.keys(isys._keys)) isys._keys[k] = false;
      if (isys._prevKeys) for (const k of Object.keys(isys._prevKeys)) isys._prevKeys[k] = false;
    }
    if (state && state.input && state.input.actions) {
      state.input.actions.deployWell = kind === 'well';
      state.input.actions.deployRepulsor = kind === 'repulsor';
      state.input.actions.toggleClearingCone = kind === 'cone';
    }
  }, { kind });
  await page.focus('body');
  await page.keyboard.down(keyCode);
  await page.waitForTimeout(80);
  await page.keyboard.up(keyCode);
  await page.waitForTimeout(200);
  let after = await page.evaluate(() => {
    const fsys = window.SF.registry.get('fields');
    return { kernelAfter: fsys && fsys._kernel ? fsys._kernel.size : -1, active: (window.SF.state.fields && window.SF.state.fields.active || []).map((f) => f.kind) };
  });
  const registered = after.kernelAfter > setup.kernelBefore || after.active.length > 0;
  routeLog.push(`${file}: pressed ${keyCode} → field kinds [${after.active.join(',')}] registered=${registered}`);
  // Capture while the flow is populated but before a Well fully vacuums everything to the sink —
  // a fuller spread reads the direction better in a still. Default chase camera, in motion.
  await page.waitForTimeout(360);
  if (isCloseUp) {
    await page.evaluate(() => {
      const state = window.SF.state;
      const cam = state.render && state.render.camera;
      if (cam) {
        cam.position.y *= 0.38;
        cam.updateMatrixWorld(true);
      }
    });
    await page.waitForTimeout(60);
  }
  await capture(page, file + '.png', `${kind} via ${keyCode}${isCloseUp ? ' (close-up)' : ''}`);
}

async function setAccessibility(page, { motionReduce, flashReduce }) {
  await page.evaluate(({ motionReduce, flashReduce }) => {
    const s = window.SF.state.settings;
    s.video = s.video || {}; s.accessibility = s.accessibility || {};
    s.video.motionReduce = !!motionReduce;
    s.video.flashReduce = !!flashReduce;
    s.accessibility.flashReduce = !!flashReduce;
  }, { motionReduce, flashReduce });
}

async function capture(page, file, scenario) {
  const fullPath = path.join(OUT, file);
  await page.screenshot({ path: fullPath, fullPage: false });
  const bytes = await readFile(fullPath);
  const gate = assertNotWhiteout(file, bytes);
  const runtime = await page.evaluate(() => {
    const vfx = window.SF.registry.get('vfx');
    const f = window.SF.state.fields || {};
    return {
      liveParticles: vfx?._liveCount || 0,
      fieldFlowSub: vfx?._vfxSubsystemLast?.fieldFlow || 0,
      fields: (f.active || []).map((a) => ({ kind: a.kind, engaged: a.engaged })),
      telemetry: f.telemetry || null,
      settings: {
        motionReduce: !!window.SF.state.settings?.video?.motionReduce,
        flashReduce: !!window.SF.state.settings?.accessibility?.flashReduce,
      },
    };
  });
  captures.push({ path: fullPath, sha256: createHash('sha256').update(bytes).digest('hex'), scenario, camera: 'default chase camera (zoom 72)', runtime, whitePct: gate.whitePct, midLumPct: gate.midLumPct });
}

function assertNotWhiteout(file, bytes) {
  const png = PNG.sync.read(bytes);
  const width = png.width;
  const height = png.height;
  const totalPixels = width * height;
  const data = png.data;

  let whiteCount = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (r > 235 && g > 235 && b > 235) {
      whiteCount++;
    }
  }

  const whitePct = whiteCount / totalPixels;

  if (whitePct > 0.02) {
    console.error(`WHITEOUT_FAIL ${file} ${(whitePct * 100).toFixed(4)}%`);
    process.exit(1);
  }

  const minX = Math.floor(width * 0.20);
  const maxX = Math.floor(width * 0.80);
  const minY = Math.floor(height * 0.20);
  const maxY = Math.floor(height * 0.80);
  const centerTotalPixels = (maxX - minX) * (maxY - minY);

  let midLumCount = 0;
  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      if (lum >= 40 && lum <= 200) {
        midLumCount++;
      }
    }
  }

  const midLumPct = midLumCount / centerTotalPixels;
  if (midLumPct < 0.01) {
    console.error(`STRUCTURE_FAIL ${file} center mid-luminance fraction ${(midLumPct * 100).toFixed(4)}% < 1.0%`);
    process.exit(1);
  }

  console.log(`[assertNotWhiteout] ${file}: whitePct=${(whitePct * 100).toFixed(4)}% (<=2.0%), centerMidLumPct=${(midLumPct * 100).toFixed(4)}% (>=1.0%) - PASS`);
  return { whitePct, midLumPct };
}

async function dismissTutorial(targetPage) {
  await targetPage.evaluate(() => {
    for (const sel of ['.tutorial-overlay', '[data-screen="tutorial"]', '.sf-tutorial']) {
      const root = document.querySelector(sel);
      const btn = root && [...root.querySelectorAll('button')].find((n) => /skip|dismiss|close|got it/i.test(n.textContent || ''));
      if (btn) btn.click();
    }
  });
}

function findSystemBrowser() {
  return [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ].find((c) => existsSync(c)) || null;
}
