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
// Wide enough to hold the whole choice: the holder parked on the wreck beside the player AND the
// chasers burning in from the port's dock ring (~500-650 WU out). At 320 the pursuit spent the
// whole window off-frame; the picture of the split needs the inbound legs in shot.
const CAPTURE_ZOOM_WU = 640;
const PLAYER_STANDOFF_WU = 140;
// How far from the witnessing patrol the hauler is killed, along the bearing AWAY from the
// station. The beat holds the patrol inside the port's own footprint (Helios's panel field spans
// ~400 WU — every early staging was photographed from inside the mesh), so the kill is pushed far
// enough out that the camera looks at open space and the holder's run crosses the frame.
const VICTIM_OFFSET_WU = 300;

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

    // The patrol's beat holds it inside the station's own footprint; a player staged beside it
    // ends up buried in the station mesh and a camera that has to ease across the sector misses
    // the whole window. The kill goes on the side of the witness AWAY from the station and the
    // player beyond that, so the shot is open space with the port in the far background.
    const sdx = anchor.x - station.pos.x;
    const sdz = anchor.z - station.pos.z;
    const sd = Math.hypot(sdx, sdz) || 1;
    const outDir = { x: sdx / sd, z: sdz / sd };

    const victim = SF.helpers.spawnEntity(makeShipEntitySpec('ship_mule', {
      pos: {
        x: anchor.x + outDir.x * input.victimOffset,
        z: anchor.z + outDir.z * input.victimOffset,
      },
      team: 2,
      factionId: 'faction_scn',
      fittings: [],
    }));
    victim.data.trafficRole = 'hauler';
    victim.data.role = 'hauler';
    victim.vel.x = 0;
    victim.vel.z = 120;

    world.relocatePlayerInSector(
      {
        x: victim.pos.x + outDir.x * input.standoff,
        z: victim.pos.z + outDir.z * input.standoff,
      },
      { reason: 'capture:witness_choice' },
    );
    const player = state.entities.get(state.playerId);
    player.vel.x = 0;
    player.vel.z = 0;
    SF.bus.emit('camera:zoom', { level: input.zoom });
    // The chase camera eases toward its focus at a fixed rate — a relocation across the sector
    // leaves it a thousand WU behind for the whole bar window. Pin the focus where the driver
    // stood the player; the follow logic then keeps it there on its own.
    if (state.camera && state.camera.focus) {
      if (typeof state.camera.focus.set === 'function') {
        state.camera.focus.set(player.pos.x, 0, player.pos.z);
      } else {
        state.camera.focus.x = player.pos.x;
        state.camera.focus.z = player.pos.z;
      }
    }

    window.__witness = {
      victimId: victim.id,
      attackerId: state.playerId,
      stationId: station.data.stationId,
      events: [],
      killed: false,
      wreckId: null,
      deathSimTime: null,
      deathPos: null,
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

  // The camera focus is snapped at staging; once hostiles register, the chase composition
  // legitimately pulls the focus toward them (camFocusOff ~300 is the composed midpoint, not a
  // miss). Only a still-travelling camera is a failed shot — check it moved at all.
  {
    const off = await page.evaluate(() => {
      const state = window.SF.state;
      const player = state.entities.get(state.playerId);
      const focus = state.camera && state.camera.focus;
      return player && focus
        ? Math.round(Math.hypot(focus.x - player.pos.x, (focus.z ?? 0) - player.pos.z))
        : null;
    });
    console.log(`[witness] camera focus ${off == null ? 'unknown' : `${off} WU off player`} at staging`);
  }

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
    window.__witness.deathPos = { x: victim.pos.x, z: victim.pos.z };
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
    const probe = await page.evaluate(({ deathPos, zoom }) => {
      const state = window.SF.state;
      const w = window.__witness;
      const dispatch = w.events.filter((e) => e.name === 'law:dispatchStarted').pop();
      const ids = (dispatch && dispatch.responderIds) || [];
      // Other wrecks exist in a live sector (a second aftermath spawn landed 284k WU out in one
      // run); the incident's wreck is the marker nearest the recorded kill point, not the first
      // in entity order.
      let wreck = null;
      let wreckD2 = Infinity;
      const dp = w.deathPos || deathPos;
      for (const e of state.entityList || []) {
        if (!e || e.alive === false || e.type !== 'wreck' || !e.data || !e.data.markerId) continue;
        const d2 = (e.pos.x - dp.x) ** 2 + (e.pos.z - dp.z) ** 2;
        if (d2 < wreckD2) { wreckD2 = d2; wreck = e; }
      }
      const anchor = wreck ? wreck.pos : deathPos;
      const incidentAnchor = (() => {
        const law = state.lawSecurity || state.law || {};
        const incidents = law.incidents || {};
        for (const key of Object.keys(incidents)) {
          const va = incidents[key] && incidents[key].victimAnchor;
          if (va) return { incidentId: incidents[key].id, x: Math.round(va.x || 0), z: Math.round(va.z || 0), wreckEntityId: va.wreckEntityId ?? null, podEntityId: va.podEntityId ?? null };
        }
        return null;
      })();
      const wrecks = (state.entityList || []).filter((e) => e && e.type === 'wreck')
        .map((e) => ({ id: e.id, alive: e.alive !== false, x: Math.round(e.pos.x), z: Math.round(e.pos.z), marker: !!e.data?.markerId }));
      const player = state.entities.get(state.playerId);
      // The stack's last decision shows what each responder was actually ORDERED to fly — the
      // activity kind alone cannot distinguish a wreck-ward intercept from a combat-doctrine
      // flyby leg that overwrote it (measured: a holder's activity read scan_approach while a
      // doctrine egress flightPoint dragged it 600+ WU off the body).
      const decisions = (() => {
        try {
          const aiSys = window.SF.registry && window.SF.registry.get && window.SF.registry.get('aiSlot');
          const stack = aiSys && aiSys.stack;
          const list = stack && stack.lastResult && stack.lastResult.decisions;
          return Array.isArray(list) ? list : [];
        } catch { return []; }
      })();
      const responders = ids.map((id) => {
        const e = state.entities.get(id);
        if (!e || e.alive === false) return { id, gone: true };
        const ai = (e.data && e.data.ai) || {};
        const act = ai.activity || {};
        const decision = decisions.find((d) => d && d.entityId === id) || null;
        const mv = decision && decision.maneuver || {};
        const doc = decision && decision.combatDoctrine || null;
        return {
          id,
          role: ai.witnessRole || null,
          kind: act.kind || null,
          actTarget: act.targetId ?? null,
          mvKind: mv.kind || null,
          // The planner request does not carry a target; the doctrine snapshot's
          // maneuverTargetId is the field that proves what the ship was ordered toward.
          mvTarget: (doc && doc.maneuverTargetId) ?? mv.targetId ?? null,
          mvReason: mv.reason || null,
          flightPoint: mv.flightPoint ? { x: Math.round(mv.flightPoint.x), z: Math.round(mv.flightPoint.z) } : null,
          docPhase: doc ? `${doc.doctrineId}:${doc.phase}` : null,
          toWreck: Math.round(Math.hypot(e.pos.x - anchor.x, e.pos.z - anchor.z)),
          toPlayer: Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)),
          speed: Number(Math.hypot(e.vel?.x || 0, e.vel?.z || 0).toFixed(1)),
          onScreen: Math.round(Math.hypot(e.pos.x - player.pos.x, e.pos.z - player.pos.z)) < zoom,
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
        incidentAnchor,
        wrecks,
        wreckToPlayer: wreck ? Math.round(Math.hypot(wreck.pos.x - player.pos.x, wreck.pos.z - player.pos.z)) : null,
        wreckAdmitted: wreck ? wreck.presentationAdmission : null,
        wreckSpeed: wreck ? Number(Math.hypot(wreck.vel?.x || 0, wreck.vel?.z || 0).toFixed(1)) : null,
        witnessChoiceEvents: w.events.filter((e) => e.name === 'law:witnessChoice').length,
        incidentOpened: w.events.some((e) => e.name === 'law:incidentOpened'),
        dispatchStarted: w.events.some((e) => e.name === 'law:dispatchStarted'),
        responders,
      };
    }, { deathPos: death.pos, zoom: CAPTURE_ZOOM_WU });
    const name = `w${String(i).padStart(2, '0')}_t${probe.sinceDeath.toFixed(2)}.png`;
    await writeFile(path.join(OUT, name), shot);
    frames.push({ name, ...probe });
    console.log(`  ${name} +${probe.sinceDeath}s wreck ${probe.wreckId}@${probe.wreckToPlayer}WU `
      + `(${probe.wreckSpeed}wu/s) camFocusOff=${probe.cameraFocusOffWU} choice=${probe.witnessChoiceEvents} `
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
