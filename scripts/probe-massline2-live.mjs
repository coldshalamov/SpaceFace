#!/usr/bin/env node
// Real-browser MASSLINE Physics Identity acceptance probe.
//
// The probe boots the canonical root route, launches a normal new game, then uses window.SF only
// to arrange deterministic actors and inventory. Outcomes are driven by the shipped input,
// system, event, HUD, and Rapier paths: no latch/throw/kill/loot/cloak events are synthesized.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { collectPageIssues, summarizeIssues } from './lib/browser-issues.mjs';
import { loadPlaywright } from './lib/load-playwright.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const OUT_DIR = join(ROOT, '.devshots', 'spec2');
const SCREENSHOT = join(OUT_DIR, 'massline2-live.png');
const ORBIT_SCREENSHOT = join(OUT_DIR, 'massline-orbit-assist-live.png');
const START_TIMEOUT_MS = 120_000;
const WIDTH = 1440;
const HEIGHT = 900;
const ORBIT_ASSIST_ONLY = process.argv.includes('--orbit-assist-only');
const REPORT_SCHEMA = ORBIT_ASSIST_ONLY
  ? 'spaceface.masslineOrbitAssistLiveProbe.v1'
  : 'spaceface.massline2LiveProbe.v1';

const { chromium } = await loadPlaywright();
let server = null;
let browser = null;
let report = null;

try {
  await mkdir(OUT_DIR, { recursive: true });
  server = process.env.SF_PROBE_URL
    ? { baseUrl: process.env.SF_PROBE_URL, child: null }
    : await startFreshServer();
  browser = await chromium.launch({ headless: !process.argv.includes('--headed') });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT }, deviceScaleFactor: 1 });
  // This acceptance is intentionally strict: a warning is evidence of a dirty player route.
  const pageIssues = collectPageIssues(page, {
    includeWarnings: true,
    // The focused route takes a screenshot, so Chrome may publish the same ReadPixels/unsupported
    // extension diagnostics already classified by the clean-flight probe. App warnings stay fatal.
    ignoreProbeWarnings: ORBIT_ASSIST_ONLY,
  });

  await page.addInitScript(() => {
    try { sessionStorage.setItem('sf.cinematicSeen', '1'); } catch (_) {}
  });
  await page.goto(server.baseUrl, { waitUntil: 'domcontentloaded' });
  assert.equal(new URL(page.url()).search, '', 'probe must boot the normal root route without debug query flags');
  await page.waitForFunction(() => !!(window.SF && window.SF.state && window.SF.bus && window.SF.registry && window.SF.helpers), null, { timeout: 20_000 });

  const flagState = await page.evaluate(async () => {
    const mod = await import('/src/data/featureFlags.js');
    for (const key of Object.keys(mod.MASSLINE2_FLAGS)) mod.MASSLINE2_FLAGS[key] = true;
    return Object.fromEntries(Object.keys(mod.MASSLINE2_FLAGS).map((key) => [key, mod.massline2Flag(key)]));
  });
  assert.ok(Object.values(flagState).every(Boolean), 'every MASSLINE2 flag must be enabled in the browser page');

  await page.waitForSelector('[data-screen="mainMenu"]', { state: 'visible', timeout: 30_000 });
  await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((button) =>
    /new game/i.test((button.textContent || '').trim()) && !button.disabled), null, { timeout: 30_000 });
  await clickNamedButton(page, 'New Game');
  await page.waitForSelector('[data-screen="newGame"]', { timeout: 20_000 });
  await clickNamedButton(page, 'Launch');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(state && state.mode === 'flight' && player && player.alive !== false && player.hull > 0);
  }, null, { timeout: START_TIMEOUT_MS });
  await dismissTutorial(page);
  await page.evaluate(() => window.SF.bus.emit('ui:closeAll', {}));
  await waitForSimTicks(page, 8);

  const fixture = await installFixture(page);
  await waitForSimTicks(page, 18);
  const physicsBefore = await physicsEvidence(page);
  assertRapierV3(physicsBefore);

  if (ORBIT_ASSIST_ONLY) {
    // PQ-005: arrange only the qualifying heavy anchor, then drive the shipped Space + arrow-key
    // grammar. A pointer move during the held orbit proves trackpad weapon aim remains independent.
    const orbitAssist = await exerciseOrbitAssist(page, fixture.anchorId);
    assert.equal(orbitAssist.engaged.active, true, 'Space + forward + one lateral must engage orbit assist');
    assert.equal(orbitAssist.engaged.targetId, fixture.anchorId, 'orbit assist must remain anchor-relative');
    assert.match(orbitAssist.engaged.hudText, /ORBIT ASSIST/, 'the existing tether HUD must expose assist state');
    assert.equal(orbitAssist.afterPointer.active, true, 'trackpad aim motion must not drop held orbit intent');
    assert.equal(orbitAssist.afterPointer.direction, orbitAssist.engaged.direction,
      'trackpad aim motion must not become the orbit controller');
    assert.notEqual(orbitAssist.afterPointer.aimAngle, orbitAssist.engaged.aimAngle,
      'the pointer still owns independent weapon aim while orbit assist is active');
    assert.equal(orbitAssist.afterLateralRelease.active, false, 'lateral release must drop assist on the next fixed tick');
    assert.equal(orbitAssist.afterLateralRelease.reason, 'no-lateral-intent');

    const physicsAfter = await physicsEvidence(page);
    assertRapierV3(physicsAfter);
    const issues = pageIssues.issues;
    const checks = {
      normalRootRoute: new URL(page.url()).search === '',
      allMasslineFlagsOn: Object.values(flagState).every(Boolean),
      rapierDynamicV3: physicsAfter.backend === 'rapier-dynamic' && physicsAfter.rapierReady
        && physicsAfter.sg02Ready && physicsAfter.flightIsV3,
      orbitAssistViaPublicInput: orbitAssist.engaged.active && orbitAssist.engaged.targetId === fixture.anchorId
        && /ORBIT ASSIST/.test(orbitAssist.engaged.hudText),
      trackpadAimIndependent: orbitAssist.afterPointer.active
        && orbitAssist.afterPointer.direction === orbitAssist.engaged.direction
        && orbitAssist.afterPointer.aimAngle !== orbitAssist.engaged.aimAngle,
      lateralReleaseOneTick: !orbitAssist.afterLateralRelease.active
        && orbitAssist.afterLateralRelease.reason === 'no-lateral-intent',
      noPageErrorsOrWarnings: issues.length === 0,
    };
    report = {
      schema: REPORT_SCHEMA,
      ok: Object.values(checks).every(Boolean),
      route: server.baseUrl,
      screenshot: ORBIT_SCREENSHOT,
      checks,
      flags: flagState,
      physics: { before: physicsBefore, after: physicsAfter },
      orbitAssist,
      pageIssues: summarizeIssues(issues),
    };
    assert.deepEqual(issues, [], 'normal player route must produce no page errors or warnings');
    assert.ok(report.ok, 'all live PQ-005 orbit-assist checks must pass');
  } else {
  // Case A: the real F edge latches the selected hostile. Holding F after the latch grace reels
  // the live joint; LMB is routed through weapons and tether-lock fire control.
  await aimAt(page, fixture.hostileId);
  await page.keyboard.press('KeyF');
  await waitForProbeEvent(page, 'tether:latched', 8_000, { payloadField: 'targetId', payloadValue: fixture.hostileId });
  await waitForSimTicks(page, 8);
  const latch = await tetherEvidence(page);
  assert.equal(latch.active, true, 'KeyF must create a live player tether');
  assert.equal(latch.targetId, fixture.hostileId, 'the selected hostile must be the latch target');
  assert.ok(latch.attachment && latch.attachment.physicsHandle, 'live tether must own a Rapier attachment handle');

  await page.waitForTimeout(650);
  const restBefore = (await tetherEvidence(page)).attachment.restLength;
  await page.keyboard.down('KeyF');
  await page.waitForTimeout(320);
  const reelDuringHold = await tetherEvidence(page);
  await page.keyboard.up('KeyF');
  await waitForSimTicks(page, 3);
  const reel = await tetherEvidence(page);
  const reelReleaseDiagnostics = await reelFailureEvidence(page, latch.attachment.id, fixture.hostileId);
  assert.equal(reelDuringHold.active, true, 'holding F must keep the line live while it reels');
  assert.ok(reelDuringHold.attachment.restLength < restBefore - 1,
    `holding F must shorten the real joint (${restBefore} -> ${reelDuringHold.attachment.restLength})`);
  assert.equal(reel.active, true,
    `releasing a completed reel gesture must not cut the line: ${JSON.stringify(reelReleaseDiagnostics)}`);
  assert.ok(reel.mirror && reel.mirror.reeling === false && reel.mirror.phase,
    'the player-facing tether mirror must expose the settled physical phase');

  const firesBefore = await probeEventCount(page, 'combat:fire');
  await aimAt(page, fixture.hostileId);
  await page.mouse.down({ button: 'left' });
  await page.waitForTimeout(1_500);
  await page.mouse.up({ button: 'left' });
  await page.waitForFunction((before) => {
    const events = window.__SF_MASSLINE_LIVE_EVENTS__ || [];
    return events.filter((event) => event.type === 'combat:fire' && event.payload && event.payload.ownerId === window.SF.state.playerId).length > before;
  }, firesBefore, { timeout: 8_000 });
  const fire = await playerFireEvidence(page, fixture.hostileId);
  assert.ok(fire.count > firesBefore, 'held LMB must release player rounds while tethered');
  assert.ok(fire.targetStillTethered, 'tether-lock fire evidence must be sampled while the target is still constrained');

  // Case D: switch the throw aim to the large anchor and use the actual RMB arbitration. The
  // release assist is set to OFF only to make the browser probe deterministic; OFF is a shipped
  // player option and still executes the requested throw through masslineThrow.
  await page.evaluate((anchorId) => {
    const sf = window.SF;
    const state = sf.state;
    state.player.targetId = anchorId;
    state.settings.gameplay.masslineReleaseAssist = 'off';
    const tetherTarget = state.entities.get(state.player.tether.targetId);
    if (tetherTarget && sf.helpers.combatPhysics && typeof sf.helpers.combatPhysics.applyImpulse === 'function') {
      const speed = Math.hypot(tetherTarget.vel.x || 0, tetherTarget.vel.z || 0);
      if (speed < 38) {
        const mass = Math.max(1, tetherTarget.mass || 1);
        sf.helpers.combatPhysics.applyImpulse({
          entityId: tetherTarget.id,
          impulse: { x: 0, z: (55 - (tetherTarget.vel.z || 0)) * mass },
          point: null,
          reason: 'massline_live_probe_spinup',
          tick: state.tick,
        });
      }
    }
  }, fixture.anchorId);
  await aimAt(page, fixture.anchorId);
  await waitForSimTicks(page, 5);
  const hudBeforeThrow = await hudEvidence(page);
  await page.mouse.down({ button: 'right' });
  await waitForProbeEvent(page, 'massline:throw', 8_000);
  await page.mouse.up({ button: 'right' });
  await waitForSimTicks(page, 5);
  const thrown = await throwEvidence(page);
  assert.equal(thrown.tetherActive, false, 'RMB throw must cut the live tether');
  assert.equal(thrown.lastThrow.payloadId, fixture.hostileId, 'RMB must throw THEM, not the player');
  assert.equal(thrown.lastThrow.aimTargetId, fixture.anchorId, 'throw must preserve the selected large-anchor aim');

  // A second actual combat target proves hostile kill -> loot:drop -> pickup magnetism. It is
  // deliberately fragile and broad, but still dies only from the player's real LMB weapon path.
  const lootFixture = await installLootTarget(page);
  await aimAt(page, lootFixture.id);
  await page.mouse.down({ button: 'left' });
  await waitForProbeEvent(page, 'entity:killed', 12_000, { payloadField: 'id', payloadValue: lootFixture.id });
  await page.mouse.up({ button: 'left' });
  await waitForProbeEvent(page, 'loot:drop', 5_000);
  await waitForSimTicks(page, 12);
  const loot = await lootEvidence(page, lootFixture);
  assert.ok(loot.dropCount > 0, 'a real player hostile kill must emit the loot shard seam');
  assert.ok(loot.spawnedPickupCount > 0 || loot.collectedCount > 0,
    'loot shards must become live pickups or already have magnet-collected');

  // Cloak uses the real Backquote edge and HUD. The AI sensor port and customs initiation gate
  // are sampled with one observer outside and one inside the live detection ring.
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => !!(window.SF.state.massline2 && window.SF.state.massline2.cloak && window.SF.state.massline2.cloak.active), null, { timeout: 5_000 });
  await waitForSimTicks(page, 8);
  const cloak = await cloakEvidence(page);
  assert.equal(cloak.active, true, 'Backquote must engage the fitted cloak');
  assert.equal(cloak.outsideSensorSeesPlayer, false, 'outside-ring AI sensor frame must not contain the player');
  assert.equal(cloak.insideSensorSeesPlayer, true, 'inside-ring AI sensor frame must contain the player');
  assert.equal(cloak.outsidePatrolCanScan, false, 'outside-ring customs patrol must not initiate a scan');
  assert.equal(cloak.insidePatrolCanScan, true, 'inside-ring customs patrol must still initiate a scan');
  assert.equal(cloak.hud.ringVisible, true, 'cloak detection ring must be visible in the player HUD');
  assert.equal(cloak.hud.cloakPillVisible, true, 'cloak energy pill must be visible in the player HUD');

  await page.screenshot({ path: SCREENSHOT });
  await page.keyboard.press('Backquote');
  await page.waitForFunction(() => window.SF.state.massline2 && window.SF.state.massline2.cloak && !window.SF.state.massline2.cloak.active, null, { timeout: 5_000 });

  // Cargo has no flight shortcut; the HUD calls cargo.jettison(), so the probe calls that same
  // registered method. First prove story-locked cargo cannot leave or kick, then prove a legal dump
  // emits the receipt and changes the Rapier-owned player velocity.
  const jettison = await exerciseJettison(page);
  assert.equal(jettison.lockedDumped, 0, 'persistent story cargo must remain jettison-locked');
  assert.equal(jettison.lockedEventsAdded, 0, 'a rejected locked dump must not emit cargo:jettisoned');
  assert.ok(jettison.scrapDumped > 0, 'ordinary cargo must jettison through the registered cargo system');
  assert.ok(jettison.speedAfter > jettison.speedBefore + 0.5,
    `jettison receipt must produce a Rapier reaction kick (${jettison.speedBefore} -> ${jettison.speedAfter})`);

  const physicsAfter = await physicsEvidence(page);
  assertRapierV3(physicsAfter);
  const issues = pageIssues.issues;
  const checks = {
    normalRootRoute: new URL(page.url()).search === '',
    allMasslineFlagsOn: Object.values(flagState).every(Boolean),
    rapierDynamicV3: physicsAfter.backend === 'rapier-dynamic' && physicsAfter.rapierReady && physicsAfter.sg02Ready && physicsAfter.flightIsV3,
    latchViaKeyF: latch.active && latch.targetId === fixture.hostileId,
    physicalAttachment: !!(latch.attachment && latch.attachment.physicsHandle),
    reelViaHeldF: reelDuringHold.attachment.restLength < restBefore - 1,
    tetheredFireViaLmb: fire.count > firesBefore && fire.targetStillTethered,
    throwViaRmb: thrown.lastThrow && thrown.lastThrow.payloadId === fixture.hostileId,
    hostileKillLoot: loot.dropCount > 0 && (loot.spawnedPickupCount > 0 || loot.collectedCount > 0),
    cloakDetectionAndCustoms: cloak.active && !cloak.outsideSensorSeesPlayer && cloak.insideSensorSeesPlayer
      && !cloak.outsidePatrolCanScan && cloak.insidePatrolCanScan,
    playerFacingHud: cloak.hud.ringVisible && cloak.hud.cloakPillVisible,
    jettisonLockAndImpulse: jettison.lockedDumped === 0 && jettison.lockedEventsAdded === 0
      && jettison.scrapDumped > 0 && jettison.speedAfter > jettison.speedBefore + 0.5,
    noPageErrorsOrWarnings: issues.length === 0,
  };
  report = {
    schema: 'spaceface.massline2LiveProbe.v1',
    ok: Object.values(checks).every(Boolean),
    route: server.baseUrl,
    screenshot: SCREENSHOT,
    checks,
    flags: flagState,
    physics: { before: physicsBefore, after: physicsAfter },
    latch: { ...latch, restBefore, restDuringHold: reelDuringHold.attachment.restLength, restAfter: reel.attachment.restLength, phaseAfter: reel.mirror && reel.mirror.phase },
    fire,
    throw: { hudBeforeThrow, ...thrown },
    loot,
    cloak,
    jettison,
    pageIssues: summarizeIssues(issues),
  };
  assert.deepEqual(issues, [], 'normal player route must produce no page errors or warnings');
  assert.ok(report.ok, 'all live MASSLINE browser checks must pass');
  }
} catch (error) {
  const message = String(error && error.stack || error && error.message || error);
  report = report || { schema: REPORT_SCHEMA, ok: false, error: message };
  report.ok = false;
  report.error = message;
  process.exitCode = 1;
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server && server.child) server.child.kill();
}

console.log(JSON.stringify(report, null, 2));

async function installFixture(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    if (!player || typeof sf.helpers.spawnEntity !== 'function') throw new Error('runtime fixture helpers unavailable');
    state.settings.gameplay.physicsBackend = 'rapier-dynamic';
    state.settings.gameplay.flightBackend = 'v3';
    state.settings.gameplay.controlScheme = 'pilot';
    state.settings.controls.flightMode = 'newtonian';
    state.settings.gameplay.masslineReleaseAssist = 'off';
    state.physicsRuntime = state.physicsRuntime || {};
    state.physicsRuntime.publishSg02Snapshot = true;
    sf.eventTrace && sf.eventTrace.clear && sf.eventTrace.clear();
    window.__SF_MASSLINE_LIVE_EVENTS__ = [];
    const names = [
      'tether:latched', 'tether:strain', 'tether:cut', 'tether:released', 'tether:broke', 'tether:releaseRated',
      'combat:fire', 'combat:damage', 'entity:killed', 'massline:throw', 'massline:selfSling',
      'loot:drop', 'pickup:collected', 'cloak:engaged', 'cloak:dropped', 'cargo:jettisoned',
    ];
    for (const type of names) {
      sf.bus.on(type, (payload = {}) => {
        window.__SF_MASSLINE_LIVE_EVENTS__.push({ type, payload: clone(payload), tick: state.tick, simTime: state.simTime });
      });
    }

    let lane = 0;
    for (const entity of state.entities.values()) {
      if (!entity || entity.id === state.playerId) continue;
      if (!['ship', 'drone', 'projectile', 'payload', 'wreck', 'pickup'].includes(entity.type)) continue;
      entity.alive = false;
      entity.collides = false;
      if (entity.pos) { entity.pos.x = 50_000 + lane * 80; entity.pos.z = 50_000 + lane * 80; }
      if (entity.vel) { entity.vel.x = 0; entity.vel.z = 0; }
      if (entity.physicsBody) entity.physicsBody.revision = (entity.physicsBody.revision || 0) + 1;
      lane++;
    }
    resetBody(player, { x: 0, z: 0 }, { x: 0, z: 0 }, 0);
    state.input.autoFire = false;
    state.player.targetId = null;
    const owned = state.player.ownedShips && state.player.ownedShips[state.player.activeShipIndex];
    if (owned) {
      if (!Array.isArray(owned.fittings)) owned.fittings = [];
      if (!owned.fittings.includes('mod_cloak_mk1')) {
        const empty = owned.fittings.findIndex((id) => !id);
        if (empty >= 0) owned.fittings[empty] = 'mod_cloak_mk1'; else owned.fittings.push('mod_cloak_mk1');
      }
    }

    const hostile = sf.helpers.spawnEntity({
      type: 'ship', factionId: 'faction_pirates', team: 2,
      // Start the reel contract from a controlled hold. The throw case below supplies its own
      // Rapier impulse after this assertion, so reel-release is not confounded by a preloaded snap.
      pos: { x: 105, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
      radius: 18, mass: 52, inertia: 160, hull: 900, hullMax: 900,
      shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, cap: 0, capMax: 0,
      collides: true, data: { probe: 'massline-live-hostile', combat: {} },
    });
    const anchor = sf.helpers.spawnEntity({
      type: 'asteroid', pos: { x: 250, z: 0 }, vel: { x: 0, z: 0 },
      radius: 36, mass: 9_000, hull: 9_000, hullMax: 9_000, collides: true,
      data: { typeId: 'ast_common_rock', probe: 'massline-live-anchor', terrainAnchor: true },
    });
    const outside = sf.helpers.spawnEntity({
      type: 'ship', factionId: 'faction_scn', team: 2,
      pos: { x: -520, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 14, mass: 40, hull: 500, hullMax: 500, collides: true,
      data: { probe: 'massline-live-outside-observer', combat: {}, ai: { passive: true, lawful: true } },
    });
    const inside = sf.helpers.spawnEntity({
      type: 'ship', factionId: 'faction_scn', team: 2,
      pos: { x: -120, z: 0 }, vel: { x: 0, z: 0 }, rot: 0,
      radius: 14, mass: 40, hull: 500, hullMax: 500, collides: true,
      data: { probe: 'massline-live-inside-observer', combat: {}, ai: { passive: true, lawful: true } },
    });
    state.player.targetId = hostile.id;
    return { hostileId: hostile.id, anchorId: anchor.id, outsideObserverId: outside.id, insideObserverId: inside.id };

    function clone(value) {
      try { return JSON.parse(JSON.stringify(value)); } catch (_) { return { uncloneable: true }; }
    }
    function resetBody(entity, pos, vel, rot) {
      entity.pos.x = pos.x; entity.pos.z = pos.z;
      if (entity.prevPos) { entity.prevPos.x = pos.x; entity.prevPos.z = pos.z; }
      entity.vel.x = vel.x; entity.vel.z = vel.z;
      entity.rot = rot; entity.prevRot = rot; entity.angVel = 0;
      if (entity.physicsBody) entity.physicsBody.revision = (entity.physicsBody.revision || 0) + 1;
      if (entity.data) entity.data.propulsionRuntime = null;
    }
  });
}

async function installLootTarget(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    player.pos.x = 0; player.pos.z = 0; player.vel.x = 0; player.vel.z = 0;
    player.rot = 0; player.prevRot = 0; player.angVel = 0;
    if (player.prevPos) { player.prevPos.x = 0; player.prevPos.z = 0; }
    if (player.physicsBody) player.physicsBody.revision = (player.physicsBody.revision || 0) + 1;
    const target = sf.helpers.spawnEntity({
      type: 'ship', factionId: 'faction_pirates', team: 2,
      pos: { x: 82, z: 0 }, vel: { x: 0, z: 0 }, rot: Math.PI,
      radius: 24, mass: 35, hull: 1, hullMax: 1,
      shield: 0, shieldMax: 0, armorHp: 0, armorMax: 0, cap: 0, capMax: 0,
      collides: true, data: { probe: 'massline-live-loot-target', combat: {} },
    });
    state.player.targetId = target.id;
    const cargo = state.player.cargo;
    return {
      id: target.id,
      scrapBefore: Number(cargo.items.cmdty_scrap_metal || 0),
      electronicsBefore: Number(cargo.items.cmdty_salvage_electronics || 0),
      eventIndex: (window.__SF_MASSLINE_LIVE_EVENTS__ || []).length,
    };
  });
}

async function physicsEvidence(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const diag = state.physicsRuntime && state.physicsRuntime.diagnostics || {};
    const flight = sf.registry && sf.registry.get && sf.registry.get('flight');
    const playerBody = Array.isArray(state.physicsRuntime && state.physicsRuntime.sg02Snapshot)
      ? state.physicsRuntime.sg02Snapshot.find((body) => body && body.id === state.playerId) : null;
    return {
      backend: diag.backend || state.settings.gameplay.physicsBackend,
      rapierReady: diag.rapierReady === true,
      sg02Ready: diag.sg02Ready === true,
      sg02Bodies: diag.sg02Bodies || 0,
      flightName: flight && flight.name || null,
      flightIsV3: !!(flight && (flight.id === 'flightV3' || flight.name === 'flight' && typeof flight._stepCraft === 'function')),
      playerBody,
      tick: state.tick,
    };
  });
}

function assertRapierV3(evidence) {
  assert.equal(evidence.backend, 'rapier-dynamic', 'normal route must use rapier-dynamic');
  assert.equal(evidence.rapierReady, true, 'Rapier runtime must be ready');
  assert.equal(evidence.sg02Ready, true, 'SG-02 authority must be ready');
  assert.ok(evidence.sg02Bodies > 0, 'SG-02 must own dynamic bodies');
  assert.equal(evidence.flightIsV3, true, 'registered flight system must be V3');
  assert.ok(evidence.playerBody, 'published SG-02 snapshot must contain the player body');
}

async function tetherEvidence(page) {
  return page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const mirror = state.player.tether || null;
    const combat = sf.registry.get('combat');
    const actions = sf.registry.get('actions');
    const attachments = actions && actions.kernel && actions.kernel.attachments
      || combat && combat.kernel && combat.kernel.attachments;
    const attachment = mirror && mirror.attachmentId != null && attachments && attachments.get
      ? attachments.get(mirror.attachmentId) : null;
    return {
      active: !!(mirror && mirror.active), targetId: mirror && mirror.targetId,
      mirror: mirror ? { ...mirror } : null,
      attachment: attachment ? {
        id: attachment.id, state: attachment.state, restLength: attachment.restLength,
        lastTension: attachment.lastTension, lastImpulse: attachment.lastImpulse,
        physicsHandle: attachment.physicsHandle ? { ...attachment.physicsHandle } : null,
        runtimeState: attachment.masslineRuntime && attachment.masslineRuntime.state,
      } : null,
    };
  });
}

async function reelFailureEvidence(page, attachmentId, targetId) {
  return page.evaluate(({ attachmentId, targetId }) => {
    const sf = window.SF;
    const state = sf.state;
    const target = state.entities.get(targetId);
    const combat = sf.registry.get('combat');
    const actions = sf.registry.get('actions');
    const attachments = actions && actions.kernel && actions.kernel.attachments
      || combat && combat.kernel && combat.kernel.attachments;
    const attachment = attachments && attachments.get ? attachments.get(attachmentId) : null;
    const retained = state.combat && state.combat.attachments && state.combat.attachments.byId
      ? state.combat.attachments.byId[attachmentId] : null;
    const tetherSystem = sf.registry.get('tetherGameplay');
    return {
      tick: state.tick,
      simTime: state.simTime,
      mirror: state.player.tether ? { ...state.player.tether } : null,
      actions: state.input && state.input.actions ? { ...state.input.actions } : null,
      gesture: tetherSystem ? {
        active: tetherSystem._active ? { ...tetherSystem._active } : null,
        pendingCut: tetherSystem._pendingCut ? { ...tetherSystem._pendingCut } : null,
        ignoreReleaseCutUntilReelIdle: tetherSystem._ignoreReleaseCutUntilReelIdle,
        latchGraceUntil: tetherSystem._latchGraceUntil,
        noRelatchUntil: tetherSystem._noRelatchUntil,
      } : null,
      attachment: summarizeAttachment(attachment || retained),
      target: target ? {
        alive: target.alive !== false,
        speed: Math.hypot(target.vel && target.vel.x || 0, target.vel && target.vel.z || 0),
        pos: target.pos && { x: target.pos.x, z: target.pos.z },
      } : null,
      tetherEvents: (window.__SF_MASSLINE_LIVE_EVENTS__ || [])
        .filter((event) => event.type.startsWith('tether:')),
    };

    function summarizeAttachment(value) {
      if (!value) return null;
      return {
        id: value.id,
        state: value.state,
        breakReason: value.breakReason,
        restLength: value.restLength,
        lastTension: value.lastTension,
        lastImpulse: value.lastImpulse,
        break: value.break ? { ...value.break } : null,
        masslineRuntime: value.masslineRuntime ? { ...value.masslineRuntime } : null,
        masslineTelemetry: value.masslineTelemetry ? { ...value.masslineTelemetry } : null,
        physicsHandle: value.physicsHandle ? { ...value.physicsHandle } : null,
      };
    }
  }, { attachmentId, targetId });
}

async function playerFireEvidence(page, targetId) {
  return page.evaluate((targetId) => {
    const events = window.__SF_MASSLINE_LIVE_EVENTS__ || [];
    const state = window.SF.state;
    return {
      count: events.filter((event) => event.type === 'combat:fire' && event.payload && event.payload.ownerId === state.playerId).length,
      targetStillTethered: !!(state.player.tether && state.player.tether.active && state.player.tether.targetId === targetId),
      damageEvents: events.filter((event) => event.type === 'combat:damage' && event.payload && event.payload.targetId === targetId).length,
    };
  }, targetId);
}

async function throwEvidence(page) {
  return page.evaluate(() => ({
    tetherActive: !!(window.SF.state.player.tether && window.SF.state.player.tether.active),
    lastThrow: window.SF.state.massline2 && window.SF.state.massline2.throw && window.SF.state.massline2.throw.lastThrow,
    events: (window.__SF_MASSLINE_LIVE_EVENTS__ || []).filter((event) => event.type === 'massline:throw'),
  }));
}

async function lootEvidence(page, fixture) {
  return page.evaluate((fixture) => {
    const state = window.SF.state;
    const events = (window.__SF_MASSLINE_LIVE_EVENTS__ || []).slice(fixture.eventIndex);
    const pickups = Array.from(state.entities.values()).filter((entity) => entity && entity.alive !== false
      && entity.type === 'pickup' && entity.data && !entity.data.jettisonedCargo);
    const cargo = state.player.cargo;
    return {
      dropCount: events.filter((event) => event.type === 'loot:drop').length,
      collectedCount: events.filter((event) => event.type === 'pickup:collected').length,
      spawnedPickupCount: pickups.length,
      nearestPickupDistance: pickups.length ? Math.min(...pickups.map((pickup) => {
        const player = state.entities.get(state.playerId);
        return Math.hypot(pickup.pos.x - player.pos.x, pickup.pos.z - player.pos.z);
      })) : null,
      cargoDelta: {
        scrap: Number(cargo.items.cmdty_scrap_metal || 0) - fixture.scrapBefore,
        electronics: Number(cargo.items.cmdty_salvage_electronics || 0) - fixture.electronicsBefore,
      },
    };
  }, fixture);
}

async function exerciseOrbitAssist(page, anchorId) {
  await page.evaluate((anchorId) => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const anchor = state.entities.get(anchorId);
    // A 90 m fixture is inside the production matrix and makes the heavy anchor the nearest
    // public Ctrl+Space candidate without synthesizing a latch event or action packet.
    player.pos.x = 0; player.pos.z = 0; player.vel.x = 0; player.vel.z = 0;
    player.rot = 0; player.prevRot = 0; player.angVel = 0;
    if (player.prevPos) { player.prevPos.x = 0; player.prevPos.z = 0; }
    if (player.physicsBody) player.physicsBody.revision = (player.physicsBody.revision || 0) + 1;
    anchor.pos.x = 90; anchor.pos.z = 0; anchor.vel.x = 0; anchor.vel.z = 0;
    if (anchor.prevPos) { anchor.prevPos.x = 90; anchor.prevPos.z = 0; }
    if (anchor.physicsBody) anchor.physicsBody.revision = (anchor.physicsBody.revision || 0) + 1;
    state.player.targetId = anchorId;
    state.settings.gameplay.orbitAssistStrength = 'standard';
  }, anchorId);
  await aimAt(page, anchorId);

  await page.keyboard.down('ControlLeft');
  await page.keyboard.down('Space');
  await waitForProbeEvent(page, 'tether:latched', 8_000, { payloadField: 'targetId', payloadValue: anchorId });
  await page.keyboard.up('ControlLeft');
  await page.keyboard.down('ArrowUp');
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => {
    const state = window.SF && window.SF.state;
    const player = state && state.entities && state.entities.get(state.playerId);
    return !!(player && player._flightFrame && player._flightFrame.orbitAssist
      && player._flightFrame.orbitAssist.active);
  }, null, { timeout: 8_000 });

  // Forward is acquisition/reel only; lateral holds the acquired orbit at the chosen line length.
  await page.keyboard.up('ArrowUp');
  await waitForSimTicks(page, 3);
  const engaged = await orbitAssistEvidence(page);
  await page.screenshot({ path: ORBIT_SCREENSHOT });

  await page.mouse.move(WIDTH * 0.18, HEIGHT * 0.22);
  await waitForSimTicks(page, 4);
  const afterPointer = await orbitAssistEvidence(page);

  await page.keyboard.up('ArrowRight');
  await waitForSimTicks(page, 1);
  const afterLateralRelease = await orbitAssistEvidence(page);
  await page.keyboard.up('Space');
  await waitForSimTicks(page, 2);

  return { engaged, afterPointer, afterLateralRelease };
}

async function orbitAssistEvidence(page) {
  return page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const telemetry = player && player._flightFrame && player._flightFrame.orbitAssist || {};
    const tetherHud = document.querySelector('#sf-tetherstat [data-k=tether]');
    return {
      active: !!telemetry.active,
      reason: telemetry.reason || null,
      direction: Number(telemetry.direction || 0),
      selectedDirection: Number(telemetry.selectedDirection || 0),
      targetId: state.player.tether && state.player.tether.targetId,
      aimAngle: Number(state.input.aimAngle || 0),
      hudText: tetherHud ? String(tetherHud.textContent || '').trim() : '',
    };
  });
}

async function cloakEvidence(page) {
  return page.evaluate(async () => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    const outside = Array.from(state.entities.values()).find((e) => e && e.data && e.data.probe === 'massline-live-outside-observer');
    const inside = Array.from(state.entities.values()).find((e) => e && e.data && e.data.probe === 'massline-live-inside-observer');
    if (!outside || !inside || !sf.helpers.aiSensors) throw new Error('cloak observer fixture unavailable');
    const outsideFrame = sf.helpers.aiSensors.liveFrameFor(outside.id, state.tick);
    const insideFrame = sf.helpers.aiSensors.liveFrameFor(inside.id, state.tick);
    const scripts = await import('/src/systems/encounterScripts.js');
    const ring = document.querySelector('#sf-ml2 svg.ml2-ring');
    const pill = document.querySelector('#sf-ml2 .ml2-pill.ml2-cloak');
    return {
      active: !!state.massline2.cloak.active,
      radius: state.massline2.cloak.radius,
      outsideDistance: Math.hypot(outside.pos.x - player.pos.x, outside.pos.z - player.pos.z),
      insideDistance: Math.hypot(inside.pos.x - player.pos.x, inside.pos.z - player.pos.z),
      outsideSensorSeesPlayer: outsideFrame.contacts.some((contact) => contact.id === player.id),
      insideSensorSeesPlayer: insideFrame.contacts.some((contact) => contact.id === player.id),
      outsidePatrolCanScan: scripts.patrolCanInitiateScan(state, outside, player),
      insidePatrolCanScan: scripts.patrolCanInitiateScan(state, inside, player),
      hud: {
        rootPresent: !!document.getElementById('sf-ml2'),
        ringVisible: !!(ring && getComputedStyle(ring).display !== 'none'),
        cloakPillVisible: !!(pill && getComputedStyle(pill).display !== 'none' && pill.classList.contains('ml2-on')),
      },
    };
  });
}

async function hudEvidence(page) {
  return page.evaluate(() => {
    const q = (selector) => document.querySelector(selector);
    const visible = (selector) => {
      const el = q(selector); return !!(el && getComputedStyle(el).display !== 'none');
    };
    return {
      rootPresent: !!q('#sf-ml2'),
      selfReleaseMarkVisible: visible('#sf-ml2 .ml2-self'),
      throwMarkVisible: visible('#sf-ml2 .ml2-throw'),
    };
  });
}

async function exerciseJettison(page) {
  const before = await page.evaluate(() => {
    const sf = window.SF;
    const state = sf.state;
    const player = state.entities.get(state.playerId);
    player.vel.x = 0; player.vel.z = 0;
    if (player.physicsBody) player.physicsBody.revision = (player.physicsBody.revision || 0) + 1;
    const cargo = sf.registry.get('cargo');
    state.story.persistentCargo = state.story.persistentCargo || [];
    if (!state.story.persistentCargo.includes('cmdty_47a_assay_sample')) state.story.persistentCargo.push('cmdty_47a_assay_sample');
    cargo.addCargo('cmdty_47a_assay_sample', 1);
    cargo.addCargo('cmdty_scrap_metal', 20);
    const eventsBefore = (window.__SF_MASSLINE_LIVE_EVENTS__ || []).filter((event) => event.type === 'cargo:jettisoned').length;
    const lockedDumped = cargo.jettison('cmdty_47a_assay_sample', 1);
    const eventsAfterLock = (window.__SF_MASSLINE_LIVE_EVENTS__ || []).filter((event) => event.type === 'cargo:jettisoned').length;
    return {
      lockedDumped,
      lockedEventsAdded: eventsAfterLock - eventsBefore,
      speedBefore: Math.hypot(player.vel.x || 0, player.vel.z || 0),
      scrapDumped: cargo.jettison('cmdty_scrap_metal', 20),
    };
  });
  await waitForProbeEvent(page, 'cargo:jettisoned', 5_000);
  await waitForSimTicks(page, 5);
  const after = await page.evaluate(() => {
    const state = window.SF.state;
    const player = state.entities.get(state.playerId);
    const snapshot = state.physicsRuntime && state.physicsRuntime.sg02Snapshot;
    const body = Array.isArray(snapshot) ? snapshot.find((entry) => entry && entry.id === state.playerId) : null;
    return {
      speedAfter: Math.hypot(player.vel.x || 0, player.vel.z || 0),
      physicsBodySpeedAfter: body ? Math.hypot(body.vx || 0, body.vz || 0) : null,
    };
  });
  return { ...before, ...after };
}

async function aimAt(page, entityId) {
  const screen = await page.evaluate((entityId) => {
    const sf = window.SF;
    const entity = sf.state.entities.get(entityId);
    if (!entity) throw new Error('aim entity missing: ' + entityId);
    const projected = sf.helpers.worldToScreen && sf.helpers.worldToScreen({ x: entity.pos.x, y: 0, z: entity.pos.z });
    return projected && Number.isFinite(projected.x) && Number.isFinite(projected.y)
      ? { x: projected.x, y: projected.y }
      : { x: innerWidth * 0.62, y: innerHeight * 0.5 };
  }, entityId);
  await page.mouse.move(Math.max(4, Math.min(WIDTH - 4, screen.x)), Math.max(4, Math.min(HEIGHT - 4, screen.y)));
  await waitForSimTicks(page, 3);
}

async function waitForProbeEvent(page, type, timeoutMs, match = null) {
  await page.waitForFunction(({ type, match }) => {
    return (window.__SF_MASSLINE_LIVE_EVENTS__ || []).some((event) => {
      if (event.type !== type) return false;
      if (!match) return true;
      return event.payload && event.payload[match.payloadField] === match.payloadValue;
    });
  }, { type, match }, { timeout: timeoutMs });
}

async function probeEventCount(page, type) {
  return page.evaluate((type) => (window.__SF_MASSLINE_LIVE_EVENTS__ || []).filter((event) => event.type === type).length, type);
}

async function waitForSimTicks(page, count) {
  const start = await page.evaluate(() => window.SF.state.tick);
  await page.waitForFunction(({ start, count }) => window.SF && window.SF.state && window.SF.state.tick >= start + count,
    { start, count }, { timeout: Math.max(5_000, count * 300) });
}

async function clickNamedButton(page, label) {
  const clicked = await page.evaluate((label) => {
    const re = new RegExp(label, 'i');
    const button = Array.from(document.querySelectorAll('button')).find((el) => re.test((el.textContent || '').trim()));
    if (!button || button.disabled) return false;
    button.click();
    return true;
  }, label);
  assert.equal(clicked, true, `button must be available: ${label}`);
}

async function dismissTutorial(page) {
  try {
    await page.waitForFunction(() => Array.from(document.querySelectorAll('button')).some((b) => /begin/i.test(b.textContent || '')), null, { timeout: 3_000 });
    await clickNamedButton(page, 'Begin');
  } catch (_) {
    // Some first-hour paths skip the modal; flight readiness above remains authoritative.
  }
}

async function startFreshServer() {
  const port = await freePort();
  const child = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env: { ...process.env, PORT: String(port), SF_PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += String(chunk); });
  const baseUrl = `http://127.0.0.1:${port}/`;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (child.exitCode != null) throw new Error(`server exited early (${child.exitCode}): ${stderr.slice(-1000)}`);
    try {
      const response = await fetch(baseUrl);
      if (response.ok) return { child, baseUrl };
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  child.kill();
  throw new Error(`server failed to start: ${stderr.slice(-1000)}`);
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createNetServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close(() => resolve(address.port));
    });
  });
}
