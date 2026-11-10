#!/usr/bin/env node
// End to end, on the real default route: boot the game in Chromium, fit a hull-burst module, spawn three hostile
// Wasps ahead, fly at them with the REAL keyboard (W + Shift), press the REAL burst key (Backslash), and report what
// happened. Proves module -> derived stat -> key edge -> system -> field pill -> wedge visual -> throw in the game a
// player actually runs. Writes PNGs and a JSON report to .devshots/e2e-burst/.
//
//   node scripts/probe-hull-burst-e2e.mjs [mod_gravity_bumper_s | mod_fire_lance_s | mod_grip_bumper_s]
//
// Needs Chromium (the same one flight-look.mjs uses). Boot on SwiftShader takes a few minutes; run it in the
// background. Never mounts the shared save drawer (SPACEFACE_PLAYER_STORE_DIR is set empty on purpose).
// Reference run (2026-09-30, gravity): activated 1, pill "GRAVITY BUMPER - LIVE 6s", wedge drawn, 3 of 3 hostiles
// thrown at dv 417 / 416 / 429 WU/s, closing ~290 WU/s, no page errors (one unrelated 404 for a missing resource).
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = ROOT + '.devshots/e2e-burst/';
mkdirSync(OUT, { recursive: true });
process.env.SPACEFACE_PLAYER_STORE_DIR = '';
const require = createRequire(ROOT + 'scripts/x.mjs');
const { createGameServer } = require(ROOT + 'scripts/lib/gameServer.cjs');
const { loadPlaywright } = await import(pathToFileURL(ROOT + 'scripts/lib/load-playwright.mjs').href);

const MODULE = process.argv[2] || 'mod_gravity_bumper_s';
const KIND = { mod_gravity_bumper_s: 'gravity', mod_fire_lance_s: 'lance', mod_grip_bumper_s: 'grip' }[MODULE];
if (!KIND) { console.error('unknown module ' + MODULE); process.exit(2); }
const report = { module: MODULE, steps: [], errors: [] };
const log = (step, data) => { report.steps.push({ step, ...data }); console.log(step, JSON.stringify(data).slice(0, 400)); };

const server = createGameServer({ root: ROOT });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.SF_CHROMIUM || undefined,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-timer-throttling'],
});

async function clickButton(page, label) {
  return page.evaluate((wanted) => {
    const buttons = [...document.querySelectorAll('button')].filter((b) => b.getClientRects().length && !b.disabled);
    const match = buttons.find((b) => b.textContent.trim() === wanted) || buttons.find((b) => b.textContent.includes(wanted));
    if (!match) return false;
    match.click();
    return true;
  }, label);
}

try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  page.on('pageerror', (e) => report.errors.push('pageerror: ' + e.message.slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') report.errors.push('console: ' + m.text().slice(0, 300)); });
  await page.goto(`http://127.0.0.1:${server.address().port}/`, { waitUntil: 'commit', timeout: 180000 });
  await page.waitForFunction(() => window.SF?.state && window.SF?.bus, null, { timeout: 240000 });
  await page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.textContent.includes('New Game')), null, { timeout: 120000 });
  await clickButton(page, 'New Game');
  await page.waitForTimeout(600);
  await clickButton(page, 'Launch');
  await page.waitForFunction(() => {
    const s = window.SF?.state;
    return s?.mode === 'flight' && !!s.entities?.get(s.playerId) && !document.body.classList.contains('ui-modal-open');
  }, null, { timeout: 300000 });
  await page.evaluate(async () => {
    const lib = await import('/src/render/partsLibrary.js');
    lib.resumeAuthoredUpgradeQueueAfterOpening(window.SF.state.render.scene);
  });
  log('boot', { ok: true });

  // Fit the module. ships.fitModule needs a docked shipworks counter, so the fitting is written where the game keeps it
  // (the owned ship) and the ships system re-derives: the same state a completed fit leaves behind.
  const fit = await page.evaluate(async (moduleId) => {
    const SF = window.SF; const state = SF.state;
    const ships = SF.registry.get('ships');
    const shipsMod = await import('/src/systems/ships.js');
    const { SHIPS } = await import('/src/data/ships.js');
    const owned = state.player.ownedShips[state.player.activeShipIndex || 0];
    const slots = shipsMod.buildSlotList(SHIPS.find((s) => s.id === owned.defId));
    const slot = slots.findIndex((s) => s.type === 'utility');
    owned.fittings[slot] = moduleId;
    for (const n of ['recomputeActiveShip', 'recomputeDerived']) {
      if (typeof ships[n] === 'function') { try { ships[n](); } catch (_) { /* try the next */ } }
    }
    const player = state.entities.get(state.playerId);
    return { ship: owned.defId, slot, derivedKind: player?.data?.derived?.hullBurstKind || null };
  }, MODULE);
  log('fit', fit);

  const world = await page.evaluate(async () => {
    const SF = window.SF; const state = SF.state;
    const player = state.entities.get(state.playerId);
    const { makeEnemySpawnSpec } = await import('/src/systems/combat.js');
    const fx = Math.cos(player.rot), fz = Math.sin(player.rot);
    const ids = [];
    for (const off of [-40, 0, 40]) {
      const x = player.pos.x + fx * 320 + -fz * off;
      const z = player.pos.z + fz * 320 + fx * off;
      const spec = makeEnemySpawnSpec('wasp_swarmer', 1, { x, z }, { motive: 'e2e', engagementTrigger: 'authorized_hostile_spawn', zoneId: 'e2e' });
      spec.rot = player.rot + Math.PI;
      spec.data = spec.data || {}; spec.data.ai = spec.data.ai || {};
      Object.assign(spec.data.ai, { roe: 'hold_fire', passive: false, huntPlayer: false, forcePlayerTarget: false, spawnContext: 'zone_hostile' });
      const e = SF.helpers.spawnEntity(spec);
      if (e) ids.push(e.id);
    }
    window.__e2e = { hits: [], activated: 0, ended: [], ids };
    SF.bus.on('hullBurst:hit', (p) => window.__e2e.hits.push({ t: state.tick, id: p.targetId, dv: Math.round(p.deltaV || p.damage || 0), closing: Math.round(p.closing || 0) }));
    SF.bus.on('hullBurst:activated', () => { window.__e2e.activated++; });
    SF.bus.on('hullBurst:ended', (p) => window.__e2e.ended.push(p.reason));
    return { hostiles: ids.length };
  });
  log('spawn', world);
  await page.waitForTimeout(1200);

  await page.keyboard.down('KeyW');
  await page.keyboard.down('ShiftLeft');
  let pressed = false;
  for (let i = 0; i < 60 && !pressed; i++) {
    await page.waitForTimeout(100);
    const info = await page.evaluate(() => {
      const s = window.SF.state; const p = s.entities.get(s.playerId);
      const list = window.__e2e.ids.map((id) => s.entities.get(id)).filter(Boolean);
      const d = list.length ? Math.min(...list.map((e) => Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z))) : 1e9;
      return { speed: Math.hypot(p.vel.x, p.vel.z), d };
    });
    if (info.d < 230) { await page.keyboard.press('Backslash'); pressed = true; log('press', info); }
  }
  for (const [n, wait] of [[1, 250], [2, 450], [3, 900]]) {
    await page.waitForTimeout(wait);
    try { await page.screenshot({ path: OUT + `${KIND}-${n}-after.png`, timeout: 60000 }); } catch (e) { report.errors.push('screenshot: ' + String(e.message).slice(0, 120)); }
    const snap = await page.evaluate(() => {
      const s = window.SF.state;
      const pill = document.querySelector('.sf-field-pill');
      const vfx = window.SF.registry.get('vfx');
      return {
        phase: s.hullBurst && s.hullBurst.phase, hits: s.hullBurst && s.hullBurst.hits,
        pill: pill ? pill.textContent : null, pillDisplay: pill ? getComputedStyle(pill).display : null,
        e2e: { hits: window.__e2e.hits.slice(0, 6), activated: window.__e2e.activated, ended: window.__e2e.ended },
        wedgeSlots: vfx && vfx._fieldGeom && vfx._fieldGeom.stats ? vfx._fieldGeom.stats.active : null,
      };
    });
    log(`after-${n}`, snap);
  }
  await page.keyboard.up('KeyW');
  await page.keyboard.up('ShiftLeft');
  log('errors', { count: report.errors.length });
} catch (e) {
  report.errors.push('script: ' + String((e && e.stack) || e).slice(0, 600));
  console.log('SCRIPT ERROR', String((e && e.stack) || e).slice(0, 800));
} finally {
  writeFileSync(OUT + `${KIND}-report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  server.close();
}
