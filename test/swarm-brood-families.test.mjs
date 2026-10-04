// SWARM-07 B2 — the Brood attack language: the family roster clock, the spitter's marked arc,
// the charger's line-telegraphed pass, the leecher's latch-and-scrape-to-shed, and the law that
// the ship wave's quota/concurrency semantics are untouched (SWARM_EXPANSION §4 B2).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import { createBroodEngine, broodStreamSeed, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH, BROOD_PHASE_RECOVER, BROOD_PHASE_LATCHED } from '../src/systems/swarmBrood.js';
import {
  BROOD_CHARGER_DASH_SPEED,
  BROOD_CHARGER_WINDUP_S,
  BROOD_SPITTER_SPLASH_DAMAGE,
  BROOD_SPITTER_WINDUP_S,
  SWARM_BROOD_FAMILIES,
  SWARM_BROOD_MAX,
  SWARM_BROOD_MIN,
  swarmBroodIssues,
  swarmBroodPlan,
  swarmBroodPopulation,
  swarmBroodRosterFor,
} from '../src/data/swarmBrood.js';
import {
  SWARM_BOSS_EVERY,
  SWARM_CONCURRENT_MAX,
  SWARM_OPENING_QUOTA,
  SWARM_ROSTER,
  swarmConcurrent,
  swarmPlanBlock,
  swarmQuota,
} from '../src/data/swarmMode.js';
import { createBroodPresentation } from '../src/render/broodPresentation.js';

const DT = 1 / 60;
const SEED = 4242;

function boot({ wave = 12, seed = SEED, phase = 'active' } = {}) {
  const state = createGameState(seed);
  const raw = createBus();
  const emitted = [];
  const bus = {
    on: raw.on.bind(raw),
    off: raw.off.bind(raw),
    once: raw.once.bind(raw),
    emit(event, payload) { emitted.push({ event, payload }); raw.emit(event, payload); },
  };
  const player = {
    id: state.nextEntityId++, alive: true, type: 'ship', pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 400, hull: 200, hullMax: 200,
  };
  state.entities.set(player.id, player);
  state.entityList.push(player);
  state.playerId = player.id;
  state.entityIndex = {
    __spacefaceEntityIndexV1: true, ready: true,
    shipLike: [player], asteroids: [],
  };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  state.run.phase = phase;
  state.run.wave = wave;
  state.mode = 'flight';
  state.player = state.player || { tether: null };
  return { state, bus, emitted, player };
}

function makeEngine(h, { damage = [] } = {}) {
  const engine = createBroodEngine({
    bus: h.bus,
    getState: () => h.state,
    fieldList: () => null,
    routeDamage: (request) => { damage.push(request); return { ok: true }; },
  });
  return engine;
}

function stepSeconds(engine, state, seconds) {
  const ticks = Math.max(1, Math.round(seconds / DT));
  for (let i = 0; i < ticks; i++) {
    state.simTime += DT;
    state.tick += 1;
    engine.step(state);
  }
}

function familySlot(engine, familyId) {
  const idx = SWARM_BROOD_FAMILIES.findIndex((f) => f.id === familyId);
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && engine._bodies.family[i] === idx) return i;
  }
  return -1;
}

test('the family roster clock unlocks one silhouette at a time, lawfully', () => {
  assert.deepEqual(swarmBroodIssues(), []);
  assert.deepEqual(swarmBroodRosterFor(1).map((r) => r.id), ['mite']);
  assert.deepEqual(swarmBroodRosterFor(3).map((r) => r.id), ['mite', 'spitter']);
  assert.deepEqual(swarmBroodRosterFor(7).map((r) => r.id), ['mite', 'spitter', 'charger']);
  assert.deepEqual(swarmBroodRosterFor(11).map((r) => r.id), ['mite', 'spitter', 'charger', 'leecher']);
  // Every family telegraphs {bark,line,cue} — the FB-016/017 language, verbatim shape.
  for (const family of SWARM_BROOD_FAMILIES) {
    assert.ok(family.telegraph.bark && family.telegraph.line && family.telegraph.cue,
      `${family.id} telegraphs`);
  }
});

test('composition is lawful and stays inside the population band with all families', () => {
  for (let wave = 1; wave <= 90; wave++) {
    const roster = swarmBroodRosterFor(wave);
    const plan = swarmBroodPlan(wave, mulberry32(broodStreamSeed(SEED, wave)));
    const total = plan.reduce((sum, part) => sum + part.count, 0);
    assert.ok(total >= SWARM_BROOD_MIN && total <= SWARM_BROOD_MAX,
      `wave ${wave} population ${total} outside the band`);
    assert.equal(total, swarmBroodPopulation(wave));
    for (const part of plan) {
      assert.ok(roster.some((r) => r.id === part.id),
        `wave ${wave} fields unlocked family ${part.id} only`);
      assert.ok(part.count > 0, `wave ${wave} never plans an empty family`);
    }
    // Specialists stay specialists: the mite floor is at least half the room at every wave.
    const mites = plan.find((p) => p.id === 'mite');
    assert.ok(mites && mites.count >= total * 0.5, `wave ${wave} keeps the fodder floor`);
  }
});

test('the ship wave is untouched: quota, concurrency and roster pins hold', () => {
  // Wave-1 opening quota and the concurrency curve are the ship wave's own; the Brood never
  // touch them (swarmMode.js is not this packet's file).
  assert.equal(SWARM_OPENING_QUOTA, 15);
  assert.equal(SWARM_CONCURRENT_MAX, 30);
  assert.equal(SWARM_BOSS_EVERY, 10);
  assert.equal(swarmConcurrent(1), 10);
  assert.equal(swarmQuota(1), 15);
  assert.equal(swarmQuota(2), 24);
  assert.equal(swarmConcurrent(30), 18); // a boss round holds fewer bodies
  assert.equal(swarmConcurrent(31), 30);
  assert.equal(swarmQuota(10), 26);
  // The ship plan block carries no brood families and no brood keys.
  const block = swarmPlanBlock(12);
  assert.ok(block.roster.every((r) => !SWARM_BROOD_FAMILIES.some((f) => f.id === r.enemyId)));
  assert.ok(!('brood' in block));
  // The ship roster itself is unchanged by this packet: every entry is a known ship archetype
  // id (the mite is not among them).
  assert.ok(SWARM_ROSTER.every((r) => r.enemyId !== 'mite'));
});

test('spitters lob a marked arc: the marker leads, the splash punishes standing on it', () => {
  const h = boot({ wave: 3 });
  const damage = [];
  const engine = makeEngine(h, { damage });
  engine.prepareWave(h.state.run, 3);
  engine.spawnWave(h.state);
  const i = familySlot(engine, 'spitter');
  assert.ok(i >= 0, 'wave 3 fields spitters');
  // Isolate this spitter so the splash receipt is exactly its own.
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine._bodies.alive[k] && engine._bodies.family[k] !== engine._bodies.family[i]) {
      engine._killDirectForTest(k, 'terrain');
    }
  }
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine._bodies.alive[k] && k !== i) engine._killDirectForTest(k, 'terrain');
  }
  // Inside lob range, cooldown fresh: the very first tick arms the windup and paints the mark.
  engine._bodies.px[i] = 120;
  engine._bodies.pz[i] = 0;
  h.state.simTime += DT;
  engine.step(h.state);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'the windup arms in range');
  const markX = engine._bodies.teleX[i];
  const markZ = engine._bodies.teleZ[i];
  assert.ok(Number.isFinite(markX) && Number.isFinite(markZ), 'the ground marker exists');
  // The pilot parks ON the marker and eats the splash.
  h.player.pos.x = markX;
  h.player.pos.z = markZ;
  stepSeconds(engine, h.state, BROOD_SPITTER_WINDUP_S + DT);
  assert.ok(engine._lobs.alive.some((a) => a === 1), 'the lob is in flight');
  const flightS = Math.sqrt((120 - markX) ** 2 + markZ ** 2) / 95 + 0.2;
  stepSeconds(engine, h.state, flightS);
  const splashed = damage.filter((r) => r.origin && r.origin.id === 'brood_acid');
  assert.ok(splashed.length >= 1, 'the splash hit the pilot on the marker');
  assert.ok(Math.abs(splashed[0].packet.channels.thermal - BROOD_SPITTER_SPLASH_DAMAGE) < 1e-6,
    'the splash burns thermal at its authored figure');
  // The splash leaves the acid pool it promised.
  assert.ok(engine.view.poolCount >= 1, 'the acid pool exists');
  // A pilot who left the marker takes nothing.
  const damage2 = [];
  const h2 = boot({ wave: 3 });
  const engine2 = makeEngine(h2, { damage: damage2 });
  engine2.prepareWave(h2.state.run, 3);
  engine2.spawnWave(h2.state);
  const j = familySlot(engine2, 'spitter');
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine2._bodies.alive[k] && k !== j) engine2._killDirectForTest(k, 'terrain');
  }
  engine2._bodies.px[j] = 120;
  engine2._bodies.pz[j] = 0;
  h2.state.simTime += DT;
  engine2.step(h2.state);
  const mx = engine2._bodies.teleX[j];
  const mz = engine2._bodies.teleZ[j];
  h2.player.pos.x = mx + 90; // well outside the 26wu splash
  h2.player.pos.z = mz;
  stepSeconds(engine2, h2.state, BROOD_SPITTER_WINDUP_S + 2.2);
  assert.equal(damage2.length, 0, 'dodging the marker takes nothing');
});

test('chargers line-telegraph, then dash — and a rock on the pass is their end', () => {
  const h = boot({ wave: 7 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 7);
  engine.spawnWave(h.state);
  const i = familySlot(engine, 'charger');
  assert.ok(i >= 0, 'wave 7 fields chargers');
  engine._bodies.px[i] = 250;
  engine._bodies.pz[i] = 0;
  h.state.simTime += DT;
  engine.step(h.state);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'the line draws in range');
  const lineDir = engine._bodies.teleDir[i];
  assert.ok(Number.isFinite(lineDir), 'the line telegraph exists');
  // The windup is the dodge budget: the dash only starts after it.
  stepSeconds(engine, h.state, BROOD_CHARGER_WINDUP_S - DT);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_WINDUP, 'still telegraphing');
  stepSeconds(engine, h.state, DT * 2);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_DASH, 'the pass commits');
  const speed = Math.sqrt(engine._bodies.vx[i] ** 2 + engine._bodies.vz[i] ** 2);
  assert.ok(Math.abs(speed - BROOD_CHARGER_DASH_SPEED) < 1, 'the dash runs at its authored speed');
  // A rock on the line: the pass ends in the rock.
  const rx = engine._bodies.px[i] + engine._bodies.vx[i] * 0.3;
  const rz = engine._bodies.pz[i] + engine._bodies.vz[i] * 0.3;
  const rock = {
    id: 9100, alive: true, type: 'asteroid', collides: true,
    pos: { x: rx, z: rz }, vel: { x: 0, z: 0 }, radius: 22, mass: 99999,
  };
  h.state.entityIndex.asteroids.push(rock);
  const before = engine.census().alive;
  stepSeconds(engine, h.state, 0.5);
  assert.ok(engine.census().alive < before, 'the charger died in the rock it was fed');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills' && e.payload.cause === 'terrain');
  assert.ok(kills.length >= 1, 'the rock kill reads terrain (SLAMMED)');
});

test('a charger pass that reaches the hull lands once, shoves, and recovers', () => {
  const h = boot({ wave: 7 });
  const damage = [];
  const engine = makeEngine(h, { damage });
  engine.prepareWave(h.state.run, 7);
  engine.spawnWave(h.state);
  const i = familySlot(engine, 'charger');
  assert.ok(i >= 0);
  // Isolate this charger so every slam receipt is its own.
  for (let k = 0; k < SWARM_BROOD_MAX; k++) {
    if (engine._bodies.alive[k] && k !== i) engine._killDirectForTest(k, 'terrain');
  }
  engine._bodies.px[i] = 40;
  engine._bodies.pz[i] = 0;
  h.state.simTime += DT;
  engine.step(h.state); // arm
  stepSeconds(engine, h.state, BROOD_CHARGER_WINDUP_S + DT); // commit
  const dashHeading = Math.atan2(0 - engine._bodies.pz[i], 0 - engine._bodies.px[i]);
  assert.ok(Math.abs(dashHeading - engine._bodies.teleDir[i]) < 1e-4,
    'the dash runs down the line it drew');
  stepSeconds(engine, h.state, 0.5);
  const slams = damage.filter((r) => r.origin && r.origin.id === 'brood_charger');
  assert.ok(slams.length >= 1, 'the pass damaged the hull');
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_RECOVER, 'the pass is spent');
  const slamCount = slams.length;
  stepSeconds(engine, h.state, 0.3);
  assert.equal(damage.filter((r) => r.origin && r.origin.id === 'brood_charger').length, slamCount,
    'the recover beat prevents an instant re-slam');
});

test('leechers latch and drag; a wall scrape sheds them', () => {
  const h = boot({ wave: 11 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 11);
  engine.spawnWave(h.state);
  const i = familySlot(engine, 'leecher');
  assert.ok(i >= 0, 'wave 11 fields leechers');
  // Onto the hull: the latch.
  engine._bodies.px[i] = 8;
  engine._bodies.pz[i] = 0;
  h.player.vel.x = 40;
  h.player.vel.z = 0;
  h.state.simTime += DT;
  engine.step(h.state);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_LATCHED, 'the leecher latched');
  const gluedX = engine._bodies.px[i];
  // It rides the hull, not the spot it latched on.
  h.player.pos.x += 30;
  h.state.simTime += DT;
  engine.step(h.state);
  assert.ok(Math.abs(engine._bodies.px[i] - gluedX - 30) < 4, 'the leecher rides the host');
  // Open space: no shed.
  stepSeconds(engine, h.state, 0.5);
  assert.equal(engine._bodies.phase[i], BROOD_PHASE_LATCHED, 'a plain flight does not shed it');
  // The shed: scrape a wall fast.
  const rock = {
    id: 9101, alive: true, type: 'asteroid', collides: true,
    pos: { x: h.player.pos.x, z: h.player.pos.z }, vel: { x: 0, z: 0 }, radius: 24, mass: 99999,
  };
  h.state.entityIndex.asteroids.push(rock);
  stepSeconds(engine, h.state, DT);
  assert.equal(engine._bodies.alive[i], 0, 'the scrape shed it — shedding kills the leecher');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills'
    && e.payload.cause === 'collision' && e.payload.wave === 11);
  assert.ok(kills.length >= 1, 'the shed reads as a collision kill');
});

test('the whole family set stays deterministic: same seed, identical 10 seconds', () => {
  const mk = (seed) => {
    const h = boot({ wave: 12, seed });
    const engine = makeEngine(h);
    engine.prepareWave(h.state.run, 12);
    engine.spawnWave(h.state);
    return { h, engine };
  };
  const a = mk(SEED);
  const b = mk(SEED);
  stepSeconds(a.engine, a.h.state, 10);
  stepSeconds(b.engine, b.h.state, 10);
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    assert.equal(a.engine._bodies.alive[i], b.engine._bodies.alive[i]);
    if (a.engine._bodies.alive[i]) {
      assert.equal(a.engine._bodies.px[i], b.engine._bodies.px[i]);
      assert.equal(a.engine._bodies.pz[i], b.engine._bodies.pz[i]);
      assert.equal(a.engine._bodies.phase[i], b.engine._bodies.phase[i]);
    }
  }
});

test('the renderer speaks the attack language: markers, lines, pools, lobs, families', () => {
  const h = boot({ wave: 12 });
  const damage = [];
  const engine = makeEngine(h, { damage });
  engine.prepareWave(h.state.run, 12);
  engine.spawnWave(h.state);
  const scene = { objects: [], add(o) { this.objects.push(o); }, remove(o) { const i = this.objects.indexOf(o); if (i >= 0) this.objects.splice(i, 1); } };
  const pres = createBroodPresentation(scene, 400);
  pres.update(engine.view, DT, { simTime: 0 });
  assert.equal(scene.objects.length, 6, 'bodies + marks + pools + lines + lobs + tendril segs');
  const [mesh, rings, pools, lines, lobs, segs] = scene.objects;
  assert.equal(segs.count, 0, 'no champion wave, no worm — the chain mesh stays empty');
  assert.equal(mesh.count, engine.census().alive);

  // A winding spitter draws its marker ring; a winding charger draws its line.
  const si = familySlot(engine, 'spitter');
  const ci = familySlot(engine, 'charger');
  engine._bodies.px[si] = 120; engine._bodies.pz[si] = 0;
  engine._bodies.px[ci] = 240; engine._bodies.pz[ci] = 0;
  h.state.simTime += DT;
  engine.step(h.state);
  assert.equal(engine._bodies.phase[si], BROOD_PHASE_WINDUP);
  assert.equal(engine._bodies.phase[ci], BROOD_PHASE_WINDUP);
  pres.update(engine.view, DT, { simTime: 0.1 });
  assert.ok(rings.count >= 1, 'the spitter marker is drawn');
  assert.ok(lines.count >= 1, 'the charger line is drawn');
  // The lob lands and leaves its pool: the instruments follow the facts.
  h.player.pos.x = engine._bodies.teleX[si];
  h.player.pos.z = engine._bodies.teleZ[si];
  stepSeconds(engine, h.state, BROOD_SPITTER_WINDUP_S + 0.1);
  pres.update(engine.view, DT, { simTime: 0.2 });
  assert.ok(lobs.count >= 1, 'the lob in flight is drawn');
  stepSeconds(engine, h.state, 2.0);
  pres.update(engine.view, DT, { simTime: 0.3 });
  assert.ok(pools.count >= 1, 'the acid pool is drawn');
  pres.dispose();
});
