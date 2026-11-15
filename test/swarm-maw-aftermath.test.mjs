// PRI-11c — what the Maw leaves. The round-five champion's wreckage seats in clear space
// (ballast at fight start, chunks at the death), one hand-sized offcut stays through round
// six under the arena's ordinary lifetime, and thrown chunks bowl the Brood through the
// room's existing thrown-body law. Every case drives the real owners with a real seed —
// the blocked and packed rooms below are the ones the old code got wrong.
import test from 'node:test';
import assert from 'node:assert/strict';

import { createSimulation } from '../src/core/sim.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createBus } from '../src/core/eventBus.js';
import { requireCapitalBossEncounter } from '../src/data/encounters/capital-boss.js';
import { createProductionCapitalBossEncounters } from '../src/systems/capitalBossRuntime.js';
import {
  spawnSwarmCapitalBallast,
  capitalBossBallastPosition,
} from '../src/missions/capitalBossSpawn.js';
import { swarmArena, SWARM_WRECK_KEEP } from '../src/systems/swarmArena.js';
import { sweptDiscsOverlap } from '../src/systems/swarmSafety.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { SWARM_MAW_OFFCUT, SWARM_MAW_OFFCUT_TAG } from '../src/data/swarmMawOffcut.js';
import { createBroodEngine, BROOD_PHASE_WINDUP } from '../src/systems/swarmBrood.js';

const SEED = 4242;
const DT = 1 / 60;
const FIGHT_ID = 'swarm:w5:iron_maw';
const MAW = requireCapitalBossEncounter('capital_boss_hulk');

function fightFixture(t, { seed = SEED } = {}) {
  let sim;
  const helpers = {
    routeCombatDamage(packet) { return packet; },
    // The minimal spawn port — the same shape helpers.spawnEntity has under the registry.
    spawnEntity(spec) {
      const { state } = sim;
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 },
        vel: spec.vel ? { x: spec.vel.x, z: spec.vel.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  sim = createSimulation({ seed, systems: [createProductionCapitalBossEncounters()], helpers });
  t.after(() => sim.dispose());
  const { state } = sim;
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    arenaId: 'helios_core', phase: 'active', wave: 5, telemetry: {} };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: -250, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true });
  state.playerId = player.id;
  const boss = sim.spawn({ type: 'ship', team: 1, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 28, mass: 420, hull: 680, hullMax: 680, collides: true,
    data: { scanLabel: "Dreadnought 'Iron Maw'" } });
  const owner = sim.registry.get('capitalBossEncounters');
  const start = (fightId = FIGHT_ID, encounterId = MAW.id) =>
    owner.start({ encounterId, fightId, bossId: boss.id, targetId: player.id });
  const killBoss = () => sim.bus.emit('entity:killed', { id: boss.id });
  return { sim, state, player, boss, owner, helpers, start, killBoss };
}

// --- the ballast beat (F9) ---------------------------------------------------------------

test('ballast seats on the authored offsets when the room is clear', (t) => {
  const h = fightFixture(t);
  const ledger = {};
  const ids = spawnSwarmCapitalBallast({ state: h.state, fightId: FIGHT_ID,
    encounter: MAW, boss: h.boss, ledger, spawnEntity: h.helpers.spawnEntity });
  assert.equal(ids.length, 3, 'the Maw fields three KEEL BALLAST actors');
  for (let i = 0; i < ids.length; i++) {
    const authored = capitalBossBallastPosition(MAW, { pos: h.boss.pos, rot: 0 }, i);
    const b = h.state.entities.get(ids[i]);
    assert.equal(b.pos.x, authored.x, `slot ${i} keeps its authored seat`);
    assert.equal(b.pos.z, authored.z);
  }
});

test('a blocked authored offset seats clear of the bank instead of inside it', (t) => {
  const h = fightFixture(t);
  const authored = capitalBossBallastPosition(MAW, { pos: h.boss.pos, rot: 0 }, 0);
  const bank = h.sim.spawn({ type: 'asteroid', pos: { x: authored.x, z: authored.z },
    vel: { x: 0, z: 0 }, radius: 34, mass: 500, hull: 500, collides: true });
  const ids = spawnSwarmCapitalBallast({ state: h.state, fightId: FIGHT_ID,
    encounter: MAW, boss: h.boss, ledger: {}, spawnEntity: h.helpers.spawnEntity });
  assert.equal(ids.length, 3, 'a blocked seat steps aside, it is not lost');
  for (const id of ids) {
    const b = h.state.entities.get(id);
    const d = Math.hypot(b.pos.x - bank.pos.x, b.pos.z - bank.pos.z);
    assert.ok(d >= b.radius + bank.radius + 8 - 1e-6,
      `ballast ${id} keeps the clearance rule off the bank (${d})`);
  }
  // And it stays local: the reseated piece is still beside its authored slot.
  const moved = h.state.entities.get(ids[0]);
  assert.ok(Math.hypot(moved.pos.x - authored.x, moved.pos.z - authored.z) <= 160,
    'the seat walks to the nearest clear spot, not across the room');
});

test('a packed room spends the authored slots once — and never inside the pilot', (t) => {
  const h = fightFixture(t);
  h.sim.spawn({ type: 'station', pos: { x: h.boss.pos.x, z: h.boss.pos.z },
    vel: { x: 0, z: 0 }, radius: 2000, mass: 1e6, hull: 1000, collides: true });
  const ledger = {};
  const ids = spawnSwarmCapitalBallast({ state: h.state, fightId: FIGHT_ID,
    encounter: MAW, boss: h.boss, ledger, spawnEntity: h.helpers.spawnEntity });
  assert.deepEqual(ids, []);
  assert.equal(Object.keys(ledger).length, 3);
  for (const slot of Object.values(ledger)) {
    assert.equal(slot.state, 'unplaced');
    assert.equal(slot.entityId, null);
  }
  // The tombstone is durable: removing the wall cannot mint the actors back.
  assert.deepEqual(spawnSwarmCapitalBallast({ state: h.state, fightId: FIGHT_ID,
    encounter: MAW, boss: h.boss, ledger, spawnEntity: h.helpers.spawnEntity }), []);
});

test('the real fight start seats ballast clear — and a second start mints nothing', (t) => {
  const h = fightFixture(t);
  const authored = capitalBossBallastPosition(MAW, { pos: h.boss.pos, rot: 0 }, 1);
  const bank = h.sim.spawn({ type: 'asteroid', pos: { x: authored.x, z: authored.z },
    vel: { x: 0, z: 0 }, radius: 40, mass: 500, hull: 500, collides: true });
  h.start();
  const ballast = h.state.entityList.filter((e) => e.data && e.data.physicalRole === 'throw_mass');
  assert.equal(ballast.length, 3);
  for (const b of ballast) {
    assert.equal(sweptDiscsOverlap(b.pos, b.radius, bank, { clearance: 8 }), false,
      'ballast never lands inside the pilot\'s immediate flight path');
  }
  const count = h.state.entityList.length;
  h.start();
  assert.equal(h.state.entityList.length, count, 'the ledger keeps re-starts idempotent');
});

// --- the wreck scatter (F10) -------------------------------------------------------------

test('the fallen champion seats its chunks clear of the death site\'s furniture', (t) => {
  const h = fightFixture(t);
  // A bank parked exactly where the hull dies: every authored scatter seat sits inside it.
  const bank = h.sim.spawn({ type: 'station', pos: { x: h.boss.pos.x, z: h.boss.pos.z },
    vel: { x: 0, z: 0 }, radius: 90, mass: 1e6, hull: 1000, collides: true });
  h.start();
  h.killBoss();
  const record = h.state.capitalBossEncounters.fights[FIGHT_ID];
  assert.ok(Array.isArray(record.swarmAmmoChunks));
  assert.ok(record.swarmAmmoChunks.length >= 1, 'the search finds seats outside the bank');
  for (const id of record.swarmAmmoChunks) {
    const c = h.state.entities.get(id);
    assert.equal(sweptDiscsOverlap(c.pos, c.radius, bank,
      { velocity: c.vel, clearance: 4 }), false, `chunk ${id} seated clear of the bank`);
    assert.ok(Math.hypot(c.pos.x - h.boss.pos.x, c.pos.z - h.boss.pos.z) <= 64 + 160 + 1,
      'a reseated chunk stays at the death site, not across the room');
  }
});

test('a packed death site spends slots rather than spawning inside a solid', (t) => {
  const h = fightFixture(t);
  h.sim.spawn({ type: 'station', pos: { x: h.boss.pos.x, z: h.boss.pos.z },
    vel: { x: 0, z: 0 }, radius: 2000, mass: 1e6, hull: 1000, collides: true });
  h.start();
  h.killBoss();
  const record = h.state.capitalBossEncounters.fights[FIGHT_ID];
  assert.deepEqual(record.swarmAmmoChunks, [], 'no seat inside the band means no spawn');
});

// --- the kept offcut (F11/F12) -----------------------------------------------------------

test('the Maw leaves one hand-sized offcut — ordinary throw-mass, flagged for the arena', (t) => {
  const h = fightFixture(t);
  h.start();
  h.killBoss();
  const record = h.state.capitalBossEncounters.fights[FIGHT_ID];
  assert.ok(record.swarmAmmoChunks.length >= 4);
  const offcut = h.state.entities.get(record.swarmAmmoChunks[0]);
  assert.ok(offcut, 'the first piece is the kept offcut');
  assert.equal(offcut.data[SWARM_MAW_OFFCUT_TAG], true);
  assert.equal(offcut.radius, SWARM_MAW_OFFCUT.radius);
  assert.equal(offcut.mass, SWARM_MAW_OFFCUT.mass);
  // The authored native body is what the massline and the room feel — radius-derived wreck
  // mass would make it far too heavy to throw.
  const body = resolvePhysicsBodySpec(offcut);
  assert.equal(body.mass, SWARM_MAW_OFFCUT.mass);
  assert.equal(body.radius, SWARM_MAW_OFFCUT.radius);
  assert.equal(offcut.data.tetherable, true);
  assert.equal(offcut.data.physicalRole, 'throw_mass');
  assert.equal(offcut.data.swarmBossChunk, true, 'an ordinary boss chunk in every other way');
  assert.match(offcut.data.scanLabel, /OFFCUT$/);
  for (const id of record.swarmAmmoChunks.slice(1)) {
    const c = h.state.entities.get(id);
    assert.equal(c.data[SWARM_MAW_OFFCUT_TAG], undefined, 'only one piece is kept small');
    assert.ok(c.radius >= 14, 'the rest of the scatter is full plate');
  }
});

test('a hulk felled on another wave leaves full plate — no offcut', (t) => {
  const h = fightFixture(t);
  const fightId = 'swarm:w10:iron_maw';
  h.start(fightId);
  h.killBoss();
  const record = h.state.capitalBossEncounters.fights[fightId];
  assert.ok(record.swarmAmmoChunks.length >= 4);
  for (const id of record.swarmAmmoChunks) {
    const c = h.state.entities.get(id);
    assert.notEqual(c.data[SWARM_MAW_OFFCUT_TAG], true);
    assert.ok(c.radius >= 14);
  }
});

test('the offcut holds its lifetime through round six, then releases normally', (t) => {
  const state = createGameState(SEED);
  const bus = createBus();
  const helpers = {
    spawnEntity(spec) {
      const id = state.nextEntityId++;
      const entity = { ...spec, id, alive: true,
        pos: spec.pos ? { x: spec.pos.x, z: spec.pos.z } : { x: 0, z: 0 } };
      state.entities.set(id, entity);
      state.entityList.push(entity);
      return entity;
    },
  };
  const player = { id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 } };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.run = { kind: 'survival', ruleset: 'swarm', phase: 'active', wave: 6, telemetry: {} };
  swarmArena.init({ state, bus, helpers });
  t.after(() => swarmArena.destroy());
  // A room at the cap: the furthest ordinary wreck is the release candidate, and the
  // flagged offcut sits furthest of all — exactly what the old cull would drop first.
  for (let i = 0; i < SWARM_WRECK_KEEP + 1; i++) {
    helpers.spawnEntity({ type: 'wreck', pos: { x: 100 + i, z: 0 }, vel: { x: 0, z: 0 },
      radius: 12, mass: 90, collides: true, data: {} });
  }
  const offcut = helpers.spawnEntity({ type: 'wreck', pos: { x: 5000, z: 0 },
    vel: { x: 0, z: 0 }, radius: 7, mass: 35, collides: true,
    data: { [SWARM_MAW_OFFCUT_TAG]: true, swarmBossChunk: true } });
  swarmArena._cullWrecks(6);
  assert.ok(!Number.isFinite(offcut.data.despawnAt), 'kept through the round-six plan');
  const marked = state.entityList.filter((e) => e.type === 'wreck'
    && e !== offcut && Number.isFinite(e.data && e.data.despawnAt));
  assert.equal(marked.length, 1, 'the cap still releases the furthest ordinary wreck');
  swarmArena._cullWrecks(7);
  assert.ok(Number.isFinite(offcut.data.despawnAt),
    'once the window closes it releases through the same deadline as every wreck');
});

// --- chunk bowling (F31) -----------------------------------------------------------------

function broodFixture({ wave = 6 } = {}) {
  const state = createGameState(SEED);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = { id: state.nextEntityId++, alive: true, type: 'ship',
    pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200 };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [], wrecks: [] };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed: SEED });
  state.run.phase = 'active';
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  const engine = createBroodEngine({ bus, getState: () => state, fieldList: () => null,
    routeDamage: () => ({ ok: true }) });
  engine.prepareWave(state.run, wave);
  engine.spawnWave(state);
  return { state, bus, emitted, player, engine };
}

function bossChunk(state, id, pos, vel) {
  const chunk = { id, alive: true, type: 'wreck', collides: true,
    pos: { x: pos.x, z: pos.z }, vel: { x: vel.x, z: vel.z },
    radius: 16, mass: 120,
    data: { swarmBossChunk: true, physicalRole: 'throw_mass', tetherable: true } };
  state.entities.set(chunk.id, chunk);
  state.entityList.push(chunk);
  state.entityIndex.wrecks.push(chunk);
  return chunk;
}

function firstAlive(bodies) {
  for (let i = 0; i < bodies.alive.length; i++) if (bodies.alive[i]) return i;
  return -1;
}

function stepN(engine, state, n) {
  for (let s = 0; s < n; s++) {
    state.simTime += DT;
    state.tick += 1;
    engine.step(state);
  }
}

test('a thrown boss chunk bowls through the Brood — the room\'s thrown-body law', () => {
  const h = broodFixture({ wave: 6 });
  const bodies = h.engine._bodies;
  const i = firstAlive(bodies);
  assert.ok(i >= 0, 'the wave fields bodies');
  // A chunk crossing the flock at throw speed is a thrown rock under the existing law.
  bossChunk(h.state, 9400, { x: bodies.px[i], z: bodies.pz[i] }, { x: 60, z: 0 });
  stepN(h.engine, h.state, 3);
  assert.equal(bodies.alive[i], 0, 'the thrown chunk kills the body it passes through');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills'
    && e.payload.cause === 'collision');
  assert.ok(kills.length >= 1, 'the kill reads collision (SLUNG), like any thrown rock');
});

test('a still boss chunk is cover — bodies slide off it, nobody dies on it', () => {
  const h = broodFixture({ wave: 6 });
  const bodies = h.engine._bodies;
  const i = firstAlive(bodies);
  assert.ok(i >= 0);
  const chunk = bossChunk(h.state, 9401, { x: bodies.px[i], z: bodies.pz[i] }, { x: 0, z: 0 });
  // A winding body holds its position while the telegraph speaks: the slide-solve is the
  // only thing that can move it off the piece.
  bodies.phase[i] = BROOD_PHASE_WINDUP;
  bodies.timer[i] = 30;
  stepN(h.engine, h.state, 10);
  assert.equal(bodies.alive[i], 1, 'a still piece does not kill on contact');
  const d = Math.hypot(bodies.px[i] - chunk.pos.x, bodies.pz[i] - chunk.pos.z);
  assert.ok(d >= chunk.radius * 1.05 - 1e-6,
    `the body slides off the cover instead of standing inside it (${d})`);
});

// --- the seed stays the seed --------------------------------------------------------------

test('the aftermath is deterministic: same seed, same wreckage', (t) => {
  const a = fightFixture(t);
  const b = fightFixture(t);
  a.start();
  b.start();
  a.killBoss();
  b.killBoss();
  const poses = (h) => h.state.capitalBossEncounters.fights[FIGHT_ID].swarmAmmoChunks
    .map((id) => { const e = h.state.entities.get(id); return [e.pos.x, e.pos.z]; });
  assert.deepEqual(poses(a), poses(b), 'same seed → same seats, same count');
});
