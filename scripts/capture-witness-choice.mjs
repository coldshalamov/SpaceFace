#!/usr/bin/env node
// scripts/capture-witness-choice.mjs — PQ-138.00 THE FRAMES (the adventure-route driver).
//
// B10a is proven headless by `scripts/lib/bench/scenarios/world.reaction_trio.mjs` (seeds 4242 and
// 8008: three responders, one holder, two chasers, split at 1.2 s against a 10 s limit, exactly one
// `law:witnessChoice`). What the leaf still owed was a picture of the CHOICE: one patrol holding at
// the wreck while the others leave after the attacker, at the shipping chase camera.
//
// PQ-138.00-REPORT.md records why no tape existed: the strip harness has exactly one route driver,
// the Crucible, and `lawSecurity` returns early from both aftermath handlers for any craft tagged
// `runCohort === 'survival'` — which is every craft a wave materializes. No incident can open
// there, ever. This is the adventure-route driver the receipt asked for.
//
// WHAT IT DOES TO THE WORLD — the same one real thing the bench does, and nothing else:
//   1. Public new game at seed 4242 → flight, shipping renderer, default quality.
//   2. Spawns ONE civilian hauler in the live jurisdiction of the sector's own station, exactly as
//      `clausePatrolChoice` does, and stands the player where a chase camera can see it.
//   3. Kills it with the production damage payload, attributed to the player.
//   4. Photographs the shipping camera for the whole 10 s the bar allows, recording each dispatched
//      responder's role, distance to the wreck and speed on every frame, so the words written about
//      the pictures can be checked against what the world was doing when they were taken.
//
// Frames land in .devshots/ (gitignored) and are a process artifact: look, write the verdict in
// words, delete. `build_map.md` §1.3 law 2.
//
// Run: node scripts/capture-witness-choice.mjs [--headless]

import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlaywright } from './lib/load-playwright.mjs';
import { acquireVisualProbeServer } from './lib/visualProbeServer.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT = path.join(ROOT, '.devshots', 'witness-choice');
const SEED = 4242;
const HEADLESS = process.argv.includes('--headless');
// The bar's own window. Frames span it end to end so "within 10 s" is a thing the strip can show.
const WINDOW_S = 24;
const FRAME_EVERY_S = 1.5;
// Wide enough that a responder arriving from the station's protection volume is in frame before it
// gets to the wreck. The mouse wheel emits this exact event (src/ui/input.js:657).
const CAPTURE_ZOOM_WU = 320;
const PLAYER_STANDOFF_WU = 95;
// How far from the witnessing patrol the hauler is killed. Close enough that both the wreck and the
// patrol that saw it are in the same chase frame.
const VICTIM_OFFSET_WU = 120;

const browserPath = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(existsSync);
assert.ok(browserPath, 'Chrome or Edge is required');

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const server = await acquireVisualProbeServer({ root: ROOT });
const { chromium } = await loadPlaywright();
const browser = await chromium.launch({
  headless: HEADLESS,
  executablePath: browserPath,
  args: ['--ignore-gpu-blocklist', '--enable-webgl', '--use-angle=default'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error?.stack || error)));

const report = { schema: 'spaceface.witnessChoiceCapture.v1', seedRequested: SEED };

try {
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.waitForFunction(() => !!window.SF?.state, null, { timeout: 120_000 });

  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /^New Game$/i }).click({ timeout: 30_000 });
  await page.fill('#sf-ng-seed', String(SEED));
  await page.getByRole('button', { name: /^Launch$/i }).click({ timeout: 30_000 });
  await page.waitForFunction(() => window.SF.state.mode === 'flight', null, { timeout: 180_000 });
  await page.waitForFunction(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    return player?.presentationAdmission === 'ready';
  }, null, { timeout: 240_000 });
  report.seedUsed = await page.evaluate(() => window.SF.state.meta.seed);

  await page.addStyleTag({
    content: `
      #hud, .hud, [class*="hud"], [id*="hud"],
      .sf-leftstack, .sf-toast, .sf-pill, .sf-chip, .sf-panel,
      .contacts, .command-bar, .mission-log { visibility: hidden !important; }
    `,
  });
  await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    for (const el of Array.from(document.body.children)) {
      if (!el.contains(canvas)) el.style.visibility = 'hidden';
    }
  });

  // Let the sector settle: the station's patrol has to exist and be on its beat before there is a
  // witness to make a choice at all.
  {
    const t = await page.evaluate(() => window.SF.state.simTime);
    await page.waitForFunction((x) => window.SF.state.simTime >= x + 40, t, { timeout: 300_000 });
  }

  const staging = await page.evaluate(async (input) => {
    const SF = window.SF;
    const state = SF.state;
    const world = SF.registry.get('world');
    const { makeShipEntitySpec } = await import('/src/systems/ships.js');

    const live = () => (state.entityList || []).filter((e) => e && e.alive !== false);
    const station = live().find((e) => e.type === 'station' && e.data
      && !e.data.isGate && e.data.stationId);
    if (!station) throw new Error('no station holds jurisdiction in the live sector');

    // WHERE THE KILL HAPPENS, and why it is not simply "inside the station's protection volume".
    // The bench (world.reaction_trio) stages at station + (200, 90) and reads the split off the
    // responders' own state, so it never cares how far away the patrol is. A CAMERA does: the
    // first run of this driver killed a hauler 456 WU from the only lawful hull in the sector, and
    // every frame came back empty while the event stream happily reported one holder and two
    // chasers. So the kill is staged NEXT TO THE WITNESS — the patrol that already exists, on the
    // beat it is already flying — and the player stands between the two. Nothing about the
    // response is spawned; only the thing that gets killed.
    const lawful = live().filter((e) => e.data && e.data.ai && e.data.ai.lawful
      && e.type === 'ship');
    const player0 = state.entities.get(state.playerId);
    lawful.sort((a, b) => (
      Math.hypot(a.pos.x - player0.pos.x, a.pos.z - player0.pos.z)
      - Math.hypot(b.pos.x - player0.pos.x, b.pos.z - player0.pos.z)));
    const witness = lawful[0] || null;
    const anchor = witness ? witness.pos : { x: station.pos.x + 200, z: station.pos.z + 90 };

    const victim = SF.helpers.spawnEntity(makeShipEntitySpec('ship_mule', {
      pos: { x: anchor.x + input.victimOffset, z: anchor.z },
      team: 2,
      factionId: 'faction_scn',
      fittings: [],
    }));
    victim.data.trafficRole = 'hauler';
    victim.data.role = 'hauler';
    victim.vel.x = 0;
    victim.vel.z = 120;

    world.relocatePlayerInSector(
      { x: (anchor.x + victim.pos.x) / 2, z: victim.pos.z + input.standoff },
      { reason: 'capture:witness_choice' },
    );
    const player = state.entities.get(state.playerId);
    player.vel.x = 0;
    player.vel.z = 0;
    SF.bus.emit('camera:zoom', { level: input.zoom });

    window.__witness = {
      victimId: victim.id,
      attackerId: state.playerId,
      stationId: station.data.stationId,
      events: [],
      killed: false,
      wreckId: null,
      deathSimTime: null,
    };
    for (const name of ['law:incidentOpened', 'law:dispatchStarted', 'law:witnessChoice',
      'aftermathWreck:spawned', 'aftermathWreck:recorded', 'survivorPod:ejected']) {
      SF.bus.on(name, (p) => window.__witness.events.push({
        name, t: state.simTime, responderIds: p && p.responderIds, id: p && p.id,
      }));
    }
    return {
      stationId: station.data.stationId,
      stationPos: { x: Math.round(station.pos.x), z: Math.round(station.pos.z) },
      witnessId: witness ? witness.id : null,
      witnessPos: witness ? { x: Math.round(witness.pos.x), z: Math.round(witness.pos.z) } : null,
      victimId: victim.id,
      victimPos: { x: Math.round(victim.pos.x), z: Math.round(victim.pos.z) },
      playerPos: { x: Math.round(player.pos.x), z: Math.round(player.pos.z) },
    };
  }, { standoff: PLAYER_STANDOFF_WU, zoom: CAPTURE_ZOOM_WU, victimOffset: VICTIM_OFFSET_WU });

  console.log(`[witness] staged at ${staging.stationId}: victim ${staging.victimId} at `
    + `${staging.victimPos.x},${staging.victimPos.z}; player ${staging.playerPos.x},${staging.playerPos.z}`);

  // Let the victim be admitted and seen. A hull that is not drawn cannot be photographed dying.
  await page.waitForFunction(() => {
    const v = window.SF.state.entities.get(window.__witness.victimId);
    return !!v && v.presentationAdmission === 'ready';
  }, null, { timeout: 180_000 }).catch(() => {});
  {
    const t = await page.evaluate(() => window.SF.state.simTime);
    await page.waitForFunction((x) => window.SF.state.simTime >= x + 6, t, { timeout: 120_000 });
  }

  const witnessCheck = await page.evaluate(() => {
    const state = window.SF.state;
    const victim = state.entities.get(window.__witness.victimId);
    const lawful = (state.entityList || []).filter((e) => e && e.alive !== false
      && e.data && e.data.ai && e.data.ai.lawful);
    const distances = lawful
      .map((w) => ({ id: w.id, d: Math.hypot(w.pos.x - victim.pos.x, w.pos.z - victim.pos.z) }))
      .sort((a, b) => a.d - b.d);
    return {
      lawfulCount: lawful.length,
      nearest: distances.slice(0, 4).map((r) => ({ id: r.id, wu: Math.round(r.d) })),
      witnessPresent: distances.length > 0 && distances[0].d <= 450,
      victimAdmitted: victim.presentationAdmission,
    };
  });
  console.log(`[witness] lawful hulls ${witnessCheck.lawfulCount}; nearest `
    + `${JSON.stringify(witnessCheck.nearest)}; witness present ${witnessCheck.witnessPresent}`);
  report.witnessCheck = witnessCheck;

  // The kill. Production payload shapes, both of them: `lawSecurity._handleDamage` gates on
  // `applied > 0`, and the aftermath route keys off `entity:killed` with a civilian victim class.
  const kill = await page.evaluate(() => {
    const SF = window.SF;
    const state = SF.state;
    const victim = state.entities.get(window.__witness.victimId);
    SF.bus.emit('combat:damage', {
      id: victim.id, targetId: victim.id, attackerId: state.playerId, sourceId: state.playerId,
      applied: 40, amount: 40, pos: { x: victim.pos.x, z: victim.pos.z },
    });
    return { simTime: state.simTime };
  });
  await page.waitForFunction((t) => window.SF.state.simTime >= t + 0.1, kill.simTime,
    { timeout: 30_000 });
  const death = await page.evaluate(() => {
    const SF = window.SF;
    const state = SF.state;
    const victim = state.entities.get(window.__witness.victimId);
    victim.hull = 0;
    victim.alive = false;
    window.__witness.killed = true;
    window.__witness.deathSimTime = state.simTime;
    SF.bus.emit('entity:killed', {
      id: victim.id, killerId: state.playerId, type: victim.type,
      pos: { x: victim.pos.x, z: victim.pos.z }, factionId: victim.factionId,
      victimClass: 'civilian',
    });
    return { simTime: state.simTime, pos: { x: victim.pos.x, z: victim.pos.z } };
  });
  console.log(`[witness] killed at sim ${death.simTime.toFixed(2)}`);
  report.death = death;

  const frames = [];
  const count = Math.round(WINDOW_S / FRAME_EVERY_S);
  for (let i = 0; i < count; i += 1) {
    const target = death.simTime + i * FRAME_EVERY_S;
    await page.waitForFunction((t) => window.SF.state.simTime >= t, target, { timeout: 120_000 });
    const shot = await page.screenshot({ type: 'png' });
    const probe = await page.evaluate((deathPos) => {
      const state = window.SF.state;
      const w = window.__witness;
      const dispatch = w.events.filter((e) => e.name === 'law:dispatchStarted').pop();
      const ids = (dispatch && dispatch.responderIds) || [];
      const wreck = (state.entityList || []).find((e) => e && e.alive !== false
        && e.type === 'wreck' && e.data && e.data.markerId);
      const anchor = wreck ? wreck.pos : deathPos;
      const player = state.entities.get(state.playerId);
      const responders = ids.map((id) => {
        const e = state.entities.get(id);
        if (!e || e.alive === false) return { id, gone: true };
        const ai = (e.data && e.data.ai) || {};
        const act = ai.activity || {};
        return {
          id,
          role: ai.witnessRole || null,
          kind: act.kind || null,
          toWreck: Math.round(Math.hypot(e.pos.x - anchor.x, e.pos.z - anchor.z)),
          toPlayer: Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)),
          speed: Number(Math.hypot(e.vel?.x || 0, e.vel?.z || 0).toFixed(1)),
          onScreen: Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)) < 220,
        };
      });
      // WHERE THE CAMERA ACTUALLY IS. A frame with nothing in it has two very different causes —
      // nothing happened, or the rig is looking somewhere else — and only this tells them apart.
      const cam = state.camera && state.camera.obj && state.camera.obj.position;
      const focus = state.camera && state.camera.focus;
      return {
        simTime: state.simTime,
        sinceDeath: Number((state.simTime - w.deathSimTime).toFixed(2)),
        cameraFocusOffWU: focus
          ? Math.round(Math.hypot(focus.x - player.pos.x, (focus.z ?? 0) - player.pos.z))
          : null,
        cameraPos: cam ? { x: Math.round(cam.x), y: Math.round(cam.y), z: Math.round(cam.z) } : null,
        wreckOnScreenWU: null,
        wreckId: wreck ? wreck.id : null,
        wreckToPlayer: wreck ? Math.round(Math.hypot(wreck.pos.x - player.pos.x, wreck.pos.z - player.pos.z)) : null,
        wreckAdmitted: wreck ? wreck.presentationAdmission : null,
        wreckSpeed: wreck ? Number(Math.hypot(wreck.vel?.x || 0, wreck.vel?.z || 0).toFixed(1)) : null,
        witnessChoiceEvents: w.events.filter((e) => e.name === 'law:witnessChoice').length,
        incidentOpened: w.events.some((e) => e.name === 'law:incidentOpened'),
        dispatchStarted: w.events.some((e) => e.name === 'law:dispatchStarted'),
        responders,
      };
    }, death.pos);
    const name = `w${String(i).padStart(2, '0')}_t${probe.sinceDeath.toFixed(2)}.png`;
    await writeFile(path.join(OUT, name), shot);
    frames.push({ name, ...probe });
    console.log(`  ${name} +${probe.sinceDeath}s wreck ${probe.wreckId}@${probe.wreckToPlayer}WU `
      + `(${probe.wreckAdmitted}) camFocusOff=${probe.cameraFocusOffWU} choice=${probe.witnessChoiceEvents} `
      + `responders ${JSON.stringify(probe.responders)}`);
  }

  report.staging = staging;
  report.frames = frames;
  report.events = await page.evaluate(() => window.__witness.events);
  report.pageErrors = pageErrors;
  await writeFile(path.join(OUT, 'manifest.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`[witness] manifest -> ${path.relative(ROOT, path.join(OUT, 'manifest.json'))}`);
} finally {
  await browser.close();
  await server.close?.();
}
