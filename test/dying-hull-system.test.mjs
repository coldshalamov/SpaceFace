// Controlled Chaos packet 08 - the dying hull, driven through the real survival run.
//
// Boots the real arena run (runSession, survivalWave, survivalRun, aftermathWrecks, mining) with
// dyingHull on the same bus, kills hostiles through the same `entity:killed` shape combat.kill()
// publishes, and pins the lifecycle law:
//   * the kill is the ONE canonical transition: credit/loot/run-count happen on the kill tick and the
//     dying window grants nothing and replays nothing;
//   * the successor wreck reads 'dying' for a bounded, mass-shaped window, keeps the victim's real
//     momentum, then ruptures EXACTLY ONCE (single event, finite fragments, cargo identity intact);
//   * the wave clears on the same tick with or without the dying window - nothing waits on smoke;
//   * pause / sector teardown / save-Continue / id reuse / early destruction leave no ghost record,
//     no late explosion and no reference to a destroyed body.
import assert from 'node:assert/strict';
import test, { afterEach, beforeEach } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { makeEntity } from '../src/core/entity.js';
import { consumePhysicsCommand } from '../src/core/physicsAuthority.js';
import { runSession } from '../src/systems/runSession.js';
import {
  SURVIVAL_ARENA_INTRO_TICKS,
  SURVIVAL_WAVE_INTRO_TICKS,
  WAVE_CLEARED_SEAM,
  survivalRun,
} from '../src/systems/survivalRun.js';
import { survivalWave } from '../src/systems/survivalWave.js';
import { aftermathWrecks } from '../src/systems/aftermathWrecks.js';
import { mining } from '../src/systems/mining.js';
import { dyingHull } from '../src/systems/dyingHull.js';
import { resetPendingSlams } from '../src/systems/hullFracture.js';
import { makeBudgetApi } from '../src/systems/spawnBudget.js';
import {
  applyFeatureConfigToMaps,
  PRODUCTION_FEATURES,
  restoreFeatureMaps,
  snapshotFeatureMaps,
} from '../src/data/featureFlags.js';
import {
  LIFECYCLE,
  dyingWindowS,
  isCombatant,
  isIrreversiblyDying,
  lifecycleOf,
  readDying,
} from '../src/combat/lifecycle.js';

const DT = 1 / 60;
const ARENA = 'helios_core';

let previousFlags;
let sessions;
beforeEach(() => {
  previousFlags = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  sessions = [];
});
afterEach(() => {
  for (const h of sessions) h.dyingSystem?.destroy?.();
  restoreFeatureMaps(previousFlags);
});

function boot({ seed = 4242, withDying = true, rngSeed = seed } = {}) {
  resetPendingSlams();
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) {
      emitted.push({ event, payload, tick: state.tick });
      raw.emit(event, payload);
    },
  };
  const budget = makeBudgetApi(state);
  const spawned = [];
  const helpers = {
    spawnBudget: budget,
    spawnEntity(spec) {
      const entity = makeEntity(spec);
      entity.id = state.nextEntityId++;
      entity.alive = true;
      state.entities.set(entity.id, entity);
      state.entityList.push(entity);
      spawned.push(entity);
      return entity;
    },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', team: 1, radius: 16, mass: 58,
    pos: { x: 400, z: 0 }, vel: { x: 0, z: 0 }, rot: 0, data: {},
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  raw.on('entity:destroyed', (p) => budget.releaseEntity(p && p.id));

  const registry = { get: (name) => (name === 'aftermathWrecks' ? aftermathWrecks : null) };
  const ctx = { state, bus, helpers, registry };
  runSession.init(ctx);
  survivalWave.init(ctx);
  aftermathWrecks.init(ctx);
  mining.init(ctx);
  survivalRun.init(ctx);
  let dyingSystem = null;
  if (withDying) {
    dyingSystem = Object.create(dyingHull);
    dyingSystem.init(ctx);
  }
  state.mode = 'flight';

  const tick = (n = 1) => {
    for (let i = 0; i < n; i++) {
      state.tick += 1;
      state.simTime += DT;
      survivalWave.update(DT);
      survivalRun.update(DT);
      aftermathWrecks.update(DT, state);
      if (dyingSystem) dyingSystem.update(DT, state);
    }
  };
  bus.on('entity:killed', () => {});
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: rngSeed, arenaId: ARENA });
  bus.emit('run:loadoutReady', {});
  tick(1 + SURVIVAL_ARENA_INTRO_TICKS + SURVIVAL_WAVE_INTRO_TICKS + 90);
  const h = { state, bus, emitted, helpers, budget, spawned, player, tick, dyingSystem };
  sessions.push(h);
  return h;
}

function liveHostiles(h) {
  return h.state.entityList.filter((e) => e && e.alive !== false && e !== h.player
    && (e.type === 'ship' || e.type === 'drone'));
}

function liveWrecks(h) {
  return h.state.entityList.filter((e) => e && e.alive !== false && e.type === 'wreck');
}

function events(h, name) {
  return h.emitted.filter((e) => e.event === name);
}

// The payload shape combat.kill() publishes (killerId = the player, a gunfire kill).
function killByGunfire(h, entity) {
  const pos = { x: entity.pos.x, z: entity.pos.z };
  entity.alive = false;
  h.bus.emit('entity:killed', {
    id: entity.id, killerId: h.player.id, type: entity.type, pos,
    factionId: entity.factionId || null,
    victimClass: (entity.data && entity.data.shipClass) || entity.type,
    presentation: Object.freeze({
      cause: 'gun', position: pos, direction: { x: 1, z: 0 }, normal: null, surface: null,
      targetVelocity: { x: entity.vel.x, z: entity.vel.z }, playerCaused: true,
    }),
  });
}

function dyingWreckOf(h) {
  return liveWrecks(h).find((w) => w.data && w.data.markerId && lifecycleOf(h.state, w) === LIFECYCLE.DYING);
}

test('a gunfire kill leaves a dying successor with the victim momentum, then ruptures exactly once', () => {
  const h = boot();
  const victim = liveHostiles(h)[0];
  victim.vel = { x: 132, z: -47 };
  victim.rot = 0.9;
  victim.mass = 16;
  killByGunfire(h, victim);
  h.tick(1);

  const begins = events(h, 'dyingHull:begin');
  assert.equal(begins.length, 1, 'one begin for one kill');
  const wreck = dyingWreckOf(h);
  assert.ok(wreck, 'the successor reads dying');
  assert.equal(isIrreversiblyDying(h.state, wreck), true);
  assert.equal(isCombatant(h.state, wreck), false, 'no target bracket / combat affordance on a dying hull');
  const begin = begins[0].payload;
  assert.equal(begin.wreckId, wreck.id);
  assert.equal(begin.victimId, victim.id);
  assert.equal(begin.tier, 'light');
  assert.ok(begin.windowS > 0 && begin.windowS <= 1.2, `fodder window ${begin.windowS}s`);
  assert.equal(begin.windowS, dyingWindowS({ mass: 16, radius: victim.radius }));
  assert.ok(Math.hypot(wreck.vel.x - 132, wreck.vel.z + 47) < 1, 'the successor carries the real momentum, not a reset');

  // Exactly the two finite forces of a failing hull went through the physics membrane.
  const command = consumePhysicsCommand(wreck);
  assert.equal((command.impulses || []).length, 1, 'one damaged-nozzle impulse');
  assert.equal((command.torqueImpulses || []).length, 1, 'one yaw/tumble impulse');
  const impulse = command.impulses[0];
  const dv = Math.hypot(impulse.x, impulse.z) / wreck.mass;
  assert.ok(dv >= 1 && dv <= 11, `bounded nozzle dv ${dv}`);

  // Not before the window...
  h.tick(Math.floor(begin.windowS * 60) - 4);
  assert.equal(events(h, 'dyingHull:ruptured').length, 0, 'no rupture inside the window');
  assert.equal(lifecycleOf(h.state, wreck), LIFECYCLE.DYING);

  // ...and then once, no matter how long we keep ticking.
  h.tick(600);
  const ruptured = events(h, 'dyingHull:ruptured');
  assert.equal(ruptured.length, 1, 'exactly one rupture');
  assert.equal(ruptured[0].payload.wreckId, wreck.id);
  assert.equal(ruptured[0].payload.victimId, victim.id);
  assert.equal(ruptured[0].payload.pos.x, wreck.pos.x, 'the rupture is reported where the wreck actually is');
  assert.equal(lifecycleOf(h.state, wreck), LIFECYCLE.WRECK);
  assert.equal(readDying(h.state, wreck), null);
  assert.equal(h.state.dyingHullRuntime.count, 0, 'no record outlives the rupture');
  assert.equal(h.state.dyingHullRuntime.begun, 1);
  assert.equal(h.state.dyingHullRuntime.ruptured, 1);
});

test('the dying window grants nothing: one kill, one reward event set, no replay at rupture', () => {
  const h = boot();
  const victim = liveHostiles(h)[0];
  killByGunfire(h, victim);
  h.tick(1);
  const rewardNames = ['entity:killed', 'economy:grantCredits', 'loot:drop', 'combat:kill', 'xp:grant', 'mission:progress'];
  const atKill = Object.fromEntries(rewardNames.map((n) => [n, events(h, n).length]));
  assert.equal(atKill['entity:killed'], 1);
  const wreck = dyingWreckOf(h);
  assert.ok(wreck);
  const poolBefore = JSON.stringify(wreck.data.salvagePool);
  const markerBefore = wreck.data.markerId;
  h.tick(300);
  assert.equal(events(h, 'dyingHull:ruptured').length, 1);
  for (const name of rewardNames) {
    assert.equal(events(h, name).length, atKill[name], `${name} is untouched by the dying window and the rupture`);
  }
  assert.equal(JSON.stringify(wreck.data.salvagePool), poolBefore, 'loot / salvage identity carried unchanged to the wreck');
  assert.equal(wreck.data.markerId, markerBefore);
  assert.equal(liveWrecks(h).filter((w) => w.data && w.data.markerId === markerBefore).length, 1, 'one successor, never two');
});

test('a same-tick duplicate kill receipt mints no second dying record', () => {
  const h = boot();
  const victim = liveHostiles(h)[0];
  killByGunfire(h, victim);
  killByGunfire(h, victim);
  h.tick(2);
  assert.equal(events(h, 'dyingHull:begin').length, 1);
  assert.equal(h.state.dyingHullRuntime.count, 1);
  h.tick(300);
  assert.equal(events(h, 'dyingHull:ruptured').length, 1);
});

test('the wave clears on the same tick with or without a dying window - nothing waits on smoke', () => {
  // Same scripted massacre in both runs: every tick, kill whatever hostile the wave has fielded, until
  // the run owner publishes the clear. The tick of the clear is the whole claim.
  const clearTick = (withDying) => {
    const h = boot({ withDying });
    const startTick = h.state.tick;
    let clearedAt = null;
    for (let i = 0; i < 4000 && clearedAt == null; i++) {
      for (const victim of liveHostiles(h)) killByGunfire(h, victim);
      h.tick(1);
      const cleared = events(h, WAVE_CLEARED_SEAM)[0];
      if (cleared) clearedAt = cleared.tick - startTick;
    }
    return { h, clearedAt };
  };
  const plain = clearTick(false);
  const dying = clearTick(true);
  assert.notEqual(plain.clearedAt, null, 'fixture: the wave clears after its last kill');
  assert.equal(dying.clearedAt, plain.clearedAt, 'the dying successor does not delay or advance the wave clear');
  assert.ok(events(dying.h, 'dyingHull:begin').length >= 1, 'fixture: dying hulls really existed during the clear');
  // The run keeps moving afterwards and every dying hull resolves exactly once.
  dying.h.tick(240);
  assert.equal(dying.h.state.dyingHullRuntime.count, 0);
  assert.equal(dying.h.state.dyingHullRuntime.ruptured + dying.h.state.dyingHullRuntime.lost,
    dying.h.state.dyingHullRuntime.begun, 'every begun hull ended exactly once (rupture or loss)');
});

test('a heavier hull fails longer and sheds fragments through the fracture owner; fodder just bursts', () => {
  const h = boot();
  const [a, b] = liveHostiles(h);
  assert.ok(a && b, 'fixture: two hostiles');
  a.mass = 12; a.radius = 11;
  b.mass = 120; b.radius = 24;
  const piecesBefore = h.state.entityList.filter((e) => e.data && e.data.collisionTearOff).length;
  killByGunfire(h, a);
  killByGunfire(h, b);
  h.tick(1);
  const [lightBegin, heavyBegin] = events(h, 'dyingHull:begin').map((e) => e.payload);
  assert.equal(lightBegin.tier, 'light');
  assert.equal(heavyBegin.tier, 'heavy');
  assert.ok(heavyBegin.windowS > lightBegin.windowS, `${heavyBegin.windowS} > ${lightBegin.windowS}`);
  assert.ok(heavyBegin.windowS <= 3, 'large hull still capped');
  h.tick(300);
  const ruptured = events(h, 'dyingHull:ruptured').map((e) => e.payload);
  assert.equal(ruptured.length, 2);
  const light = ruptured.find((r) => r.wreckId === lightBegin.wreckId);
  const heavy = ruptured.find((r) => r.wreckId === heavyBegin.wreckId);
  assert.equal(light.pieceIds.length, 0, 'fodder sheds no fragments');
  assert.ok(heavy.pieceIds.length >= 1 && heavy.pieceIds.length <= 2, `heavy sheds real pieces (${heavy.pieceIds.length})`);
  for (const id of heavy.pieceIds) {
    const piece = h.state.entities.get(id);
    assert.ok(piece && piece.type === 'wreck' && piece.data.collisionTearOff === true, 'a physical tear-off body, not a particle');
    assert.ok(piece.mass < heavyBegin.mass * 0.1, 'cosmetic count never sets the hull mass');
  }
  assert.equal(h.state.entityList.filter((e) => e.data && e.data.collisionTearOff).length, piecesBefore + heavy.pieceIds.length);
  // The wreck that shed them is spent: a later impact cannot shed it again.
  const heavyWreck = h.state.entities.get(heavy.wreckId);
  assert.equal(heavyWreck.data.physicalBreakup, true);
});

test('with the hull-burst switch off (the frozen profile) nothing is staged and nothing is stamped', () => {
  const prev = snapshotFeatureMaps();
  try {
    applyFeatureConfigToMaps({ ...PRODUCTION_FEATURES, combat: { ...PRODUCTION_FEATURES.combat, tumbleFling: false } });
    const h = boot();
    const victim = liveHostiles(h)[0];
    killByGunfire(h, victim);
    h.tick(120);
    assert.equal(events(h, 'dyingHull:begin').length, 0);
    assert.equal(events(h, 'dyingHull:ruptured').length, 0);
    assert.equal(h.state.dyingHullRuntime.begun, 0);
    assert.ok(liveWrecks(h).length >= 1, 'the kill still leaves its ordinary wreck');
  } finally {
    restoreFeatureMaps(prev);
  }
});

test('pause: a hull dying through a pause neither ruptures nor stalls; on resume it ruptures once, late and quiet', () => {
  const h = boot();
  const victim = liveHostiles(h)[0];
  killByGunfire(h, victim);
  h.tick(1);
  assert.equal(events(h, 'dyingHull:begin').length, 1);
  h.state.mode = 'docked';
  h.tick(600);
  assert.equal(events(h, 'dyingHull:ruptured').length, 0, 'no rupture while the sim is not flying');
  h.state.mode = 'flight';
  h.tick(1);
  const ruptured = events(h, 'dyingHull:ruptured');
  assert.equal(ruptured.length, 1);
  assert.equal(ruptured[0].payload.late, true, 'a rupture resumed far past its time is flagged so presenters skip the staged beat');
  assert.equal(ruptured[0].payload.pieceIds.length, 0, 'and sheds nothing');
  h.tick(300);
  assert.equal(events(h, 'dyingHull:ruptured').length, 1);
});

test('teardown boundaries leave no ghost: sector exit, save load and new game drop the record without a rupture', () => {
  for (const boundary of ['sector:exit', 'sector:enter', 'save:loaded', 'game:newGame']) {
    const h = boot();
    killByGunfire(h, liveHostiles(h)[0]);
    h.tick(1);
    assert.equal(h.state.dyingHullRuntime.count, 1, `${boundary}: fixture dying`);
    const wreckId = dyingWreckOf(h).id;
    h.bus.emit(boundary, {});
    assert.equal(h.state.dyingHullRuntime.count, 0, `${boundary}: record dropped`);
    const lost = events(h, 'dyingHull:lost');
    assert.equal(lost.length, 1, `${boundary}: presenters are told to release their hold`);
    assert.equal(lost[0].payload.wreckId, wreckId);
    h.tick(600);
    assert.equal(events(h, 'dyingHull:ruptured').length, 0, `${boundary}: no late explosion for a world that is gone`);
    assert.equal(Object.keys(h.state.dyingHullRuntime.byWreckId).length, 0);
  }
});

test('early destruction and id reuse: a destroyed or replaced successor never ruptures and is never referenced', () => {
  const h = boot();
  killByGunfire(h, liveHostiles(h)[0]);
  h.tick(1);
  const wreck = dyingWreckOf(h);
  const id = wreck.id;
  wreck.alive = false; // salvaged / shot / swept away mid-window
  h.tick(2);
  assert.equal(events(h, 'dyingHull:lost').length, 1);
  assert.equal(events(h, 'dyingHull:lost')[0].payload.reason, 'gone');
  assert.equal(h.state.dyingHullRuntime.count, 0);
  h.tick(300);
  assert.equal(events(h, 'dyingHull:ruptured').length, 0);

  // A second hull dies; then its body is replaced by a stranger that reuses the id.
  killByGunfire(h, liveHostiles(h)[0]);
  h.tick(1);
  const second = dyingWreckOf(h);
  assert.ok(second);
  h.state.entities.delete(second.id);
  const stranger = makeEntity({ type: 'wreck', pos: { x: 9, z: 9 }, radius: 8, mass: 20, hull: 1, hullMax: 1, data: { killedAt: 999 } });
  stranger.id = second.id;
  stranger.alive = true;
  h.state.entities.set(stranger.id, stranger);
  assert.equal(lifecycleOf(h.state, stranger), LIFECYCLE.WRECK, 'a reused id never inherits a stranger\'s failure');
  h.tick(300);
  assert.equal(events(h, 'dyingHull:ruptured').length, 0, 'the replaced body never ruptured');
  assert.equal(events(h, 'dyingHull:lost').length, 2);
  assert.notEqual(id, undefined);
});

test('a re-delivered aftermath spawn for an old wreck (sector re-entry) is simply a wreck', () => {
  const h = boot();
  killByGunfire(h, liveHostiles(h)[0]);
  h.tick(1);
  const wreck = dyingWreckOf(h);
  assert.ok(wreck);
  h.tick(400);
  assert.equal(events(h, 'dyingHull:ruptured').length, 1);
  const before = events(h, 'dyingHull:begin').length;
  // rematerialization announces the same old wreck again
  h.bus.emit('aftermathWreck:spawned', {
    markerId: wreck.data.markerId, entityId: wreck.id, sectorId: wreck.data.homeSectorId, zoneId: null,
  });
  h.tick(3);
  assert.equal(events(h, 'dyingHull:begin').length, before, 'an old kill stamp cannot begin a new failure');
  assert.equal(lifecycleOf(h.state, wreck), LIFECYCLE.WRECK);
});
