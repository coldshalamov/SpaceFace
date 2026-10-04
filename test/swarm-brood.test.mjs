// SWARM-07 B1 — the Brood tier: population law, determinism, the field kernel, deaths by
// rock and explosion, the throw/rope interactions, the kill receipts (chain + juice), the
// instanced render contract, and flat per-frame allocation (SWARM_EXPANSION §4 B1).
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmChain } from '../src/systems/swarmChain.js';
import { swarmJuice } from '../src/systems/swarmJuice.js';
import { createBroodEngine, broodStreamSeed } from '../src/systems/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import {
  BROOD_EXPLOSION_EVENTS,
  SWARM_BROOD_MAX,
  SWARM_BROOD_MIN,
  swarmBroodIssues,
  swarmBroodPlan,
  swarmBroodPopulation,
} from '../src/data/swarmBrood.js';
import { swarmKillCauseWord } from '../src/data/swarmJuice.js';
import { createBroodPresentation } from '../src/render/broodPresentation.js';

const DT = 1 / 60;
const SEED = 4242;

/** A minimal live-swarm GameState with a player, optional asteroids and movers. */
function boot({ wave = 3, seed = SEED, phase = 'active' } = {}) {
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
    vel: { x: 0, z: 0 }, radius: 6, mass: 400,
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

function makeEngine(h, { fieldList = null } = {}) {
  const engine = createBroodEngine({
    bus: h.bus,
    getState: () => h.state,
    fieldList: fieldList || (() => null),
  });
  // The arena host wires these in production; standalone tests wire the same receipts here.
  for (const name of BROOD_EXPLOSION_EVENTS) {
    h.bus.on(name, (p) => engine.onExplosion(p));
  }
  return engine;
}

function stepSeconds(engine, state, seconds) {
  const ticks = Math.round(seconds / DT);
  for (let i = 0; i < ticks; i++) {
    state.simTime += DT;
    state.tick += 1;
    engine.step(state);
  }
}

test('brood catalog is lawful: mite present, telegraphs shaped, population inside the band', () => {
  assert.deepEqual(swarmBroodIssues(), []);
  // The population law: every wave's total sits in [100, 400], forever.
  for (let wave = 1; wave <= 120; wave++) {
    const plan = swarmBroodPlan(wave, mulberry32(broodStreamSeed(SEED, wave)));
    const total = plan.reduce((sum, part) => sum + part.count, 0);
    assert.ok(total >= SWARM_BROOD_MIN && total <= SWARM_BROOD_MAX,
      `wave ${wave} population ${total} outside the cap band`);
    assert.equal(total, swarmBroodPopulation(wave));
    for (const part of plan) assert.ok(part.count > 0);
  }
  assert.equal(swarmBroodPopulation(1), SWARM_BROOD_MIN);
  // The curve tops out exactly at FULL_WAVE — wave 21 is past the boss-wave discount's
  // reach, so the unbent ceiling reads here. (Wave 400 is a boss wave: 0.4 × 400.)
  assert.equal(swarmBroodPopulation(21), SWARM_BROOD_MAX);
});

test('engine census: the cap holds and spawn honours it', () => {
  const h = boot({ wave: 40 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 40);
  const spawned = engine.spawnWave(h.state);
  assert.equal(spawned, swarmBroodPopulation(40));
  assert.ok(engine.census().alive <= SWARM_BROOD_MAX);
  assert.ok(engine.census().alive >= SWARM_BROOD_MIN);
  // A second spawn attempt with no plan left is a no-op, never an overflow.
  assert.equal(engine.spawnWave(h.state), 0);
  assert.ok(engine.census().alive <= SWARM_BROOD_MAX);
});

test('same seed => identical positions tick-over-tick; different seed => a different flock', () => {
  const mk = (seed) => {
    const h = boot({ wave: 5, seed });
    const engine = makeEngine(h);
    engine.prepareWave(h.state.run, 5);
    engine.spawnWave(h.state);
    return { h, engine };
  };
  const a = mk(SEED);
  const b = mk(SEED);
  const c = mk(777);
  stepSeconds(a.engine, a.h.state, 5);
  stepSeconds(b.engine, b.h.state, 5);
  stepSeconds(c.engine, c.h.state, 5);
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    assert.equal(a.engine._bodies.alive[i], b.engine._bodies.alive[i]);
    if (a.engine._bodies.alive[i]) {
      assert.equal(a.engine._bodies.px[i], b.engine._bodies.px[i]);
      assert.equal(a.engine._bodies.pz[i], b.engine._bodies.pz[i]);
    }
  }
  let differs = false;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (a.engine._bodies.alive[i] && c.engine._bodies.alive[i]
      && a.engine._bodies.px[i] !== c.engine._bodies.px[i]) { differs = true; break; }
  }
  assert.ok(differs, 'a different seed must produce a different flock');
});

test('the Brood feel the field kernel: a well pulls the flock toward its centre', () => {
  const well = {
    id: 'test_well', kind: 'well',
    center: { x: 400, z: 0 },
    radius: 300, strength: 220, falloff: 1.4,
    createdAt: 0, expireAt: Infinity,
  };
  const mk = (fields) => {
    const h = boot({ wave: 2 });
    const engine = makeEngine(h, { fieldList: () => fields });
    engine.prepareWave(h.state.run, 2);
    engine.spawnWave(h.state);
    return { h, engine };
  };
  const withField = mk([well]);
  const without = mk([]);
  // Only bodies that started inside the well's volume can feel it; remember which those are.
  const startedInside = [];
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (!withField.engine._bodies.alive[i]) continue;
    const dx0 = withField.engine._bodies.px[i] - well.center.x;
    const dz0 = withField.engine._bodies.pz[i] - well.center.z;
    if (dx0 * dx0 + dz0 * dz0 < well.radius * well.radius) startedInside.push(i);
  }
  stepSeconds(withField.engine, withField.h.state, 3);
  stepSeconds(without.engine, without.h.state, 3);
  // Bodies near the well are measurably closer to its centre than the field-free control.
  let closer = 0;
  let compared = 0;
  for (const i of startedInside) {
    if (!withField.engine._bodies.alive[i] || !without.engine._bodies.alive[i]) continue;
    const dx = withField.engine._bodies.px[i] - well.center.x;
    const dz = withField.engine._bodies.pz[i] - well.center.z;
    const dWith = Math.sqrt(dx * dx + dz * dz);
    const dx2 = without.engine._bodies.px[i] - well.center.x;
    const dz2 = without.engine._bodies.pz[i] - well.center.z;
    const dWithout = Math.sqrt(dx2 * dx2 + dz2 * dz2);
    compared += 1;
    if (dWith < dWithout) closer += 1;
  }
  assert.ok(compared > 8, 'the comparison saw a real population');
  assert.ok(closer > compared * 0.5, `well pulled bodies toward it (${closer}/${compared})`);
});

test('brood die against rocks: contact death, terrain receipt, run pay', () => {
  const h = boot({ wave: 1 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 1);
  engine.spawnWave(h.state);
  const bodyCount = engine.census().alive;
  assert.ok(bodyCount >= SWARM_BROOD_MIN);
  // Park a rock on the first live body.
  let slot = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (engine._bodies.alive[i]) { slot = i; break; }
  assert.ok(slot >= 0);
  const rock = {
    id: 9001, alive: true, type: 'asteroid', collides: true,
    pos: { x: engine._bodies.px[slot], z: engine._bodies.pz[slot] },
    vel: { x: 0, z: 0 }, radius: 20, mass: 99999,
  };
  h.state.entityIndex.asteroids.push(rock);
  h.state.entityList.push(rock);
  const before = engine.census().alive;
  stepSeconds(engine, h.state, DT);
  assert.ok(engine.census().alive < before, 'bodies on the rock died');
  assert.ok(before - engine.census().alive >= 1);
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills');
  assert.ok(kills.length >= 1);
  const terrain = kills.find((e) => e.payload.cause === 'terrain');
  assert.ok(terrain, 'rock contact reads terrain');
  assert.ok(terrain.payload.count >= 1);
  const pay = h.emitted.filter((e) => e.event === 'run:awardRequested'
    && e.payload.reason === 'brood');
  assert.ok(pay.length >= 1, 'the kill paid through the run envelope');
  assert.equal(pay[0].payload.credits, terrain.payload.count);
});

test('brood die in explosions: the shared blast receipts reach the tier', () => {
  const h = boot({ wave: 1 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 1);
  engine.spawnWave(h.state);
  // Detonate on the flock centroid.
  let cx = 0; let cz = 0; let n = 0;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (!engine._bodies.alive[i]) continue;
    cx += engine._bodies.px[i]; cz += engine._bodies.pz[i]; n += 1;
  }
  cx /= n; cz /= n;
  const before = engine.census().alive;
  h.bus.emit('charge:detonated', { pos: { x: cx, z: cz }, radius: 90, trigger: 'test', hits: [], shoves: [] });
  const after = engine.census().alive;
  assert.ok(after < before, 'bodies inside the blast died');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills'
    && e.payload.cause === 'explosive');
  assert.equal(kills.length, 1, 'one batched receipt per tick');
  assert.equal(kills[0].payload.count, before - after);
  // Survivors outside the blast were shoved, not left untouched.
  let shoved = 0;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) {
    if (engine._bodies.alive[i] && (engine._bodies.vx[i] !== 0 || engine._bodies.vz[i] !== 0)) shoved += 1;
  }
  assert.ok(shoved > 0, 'the blast impulse reached survivors');
});

test('thrown bodies plow the pack: a heavy fast mover shreds brood it touches', () => {
  const h = boot({ wave: 1 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 1);
  engine.spawnWave(h.state);
  // A thrown hull: a heavy ship-like body, fast, parked inside the flock's edge.
  let slot = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (engine._bodies.alive[i]) { slot = i; break; }
  const thrown = {
    id: 9002, alive: true, type: 'ship',
    pos: { x: engine._bodies.px[slot], z: engine._bodies.pz[slot] },
    vel: { x: 80, z: 0 }, radius: 18, mass: 36000,
  };
  h.state.entityIndex.shipLike.push(thrown);
  const before = engine.census().alive;
  stepSeconds(engine, h.state, DT);
  assert.ok(engine.census().alive < before, 'the thrown body took brood with it');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills'
    && e.payload.cause === 'collision');
  assert.ok(kills.length >= 1, 'plow kills read collision (SLUNG)');
});

test('the rope reaches the tier: a taut fast swing shreds brood crossing the line', () => {
  const h = boot({ wave: 1 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 1);
  engine.spawnWave(h.state);
  // Player tether latched to a fast-swinging payload; the line runs through the flock edge.
  let slot = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (engine._bodies.alive[i]) { slot = i; break; }
  const bx = engine._bodies.px[slot];
  const bz = engine._bodies.pz[slot];
  h.state.player.tether = {
    active: true, targetId: 9003, phase: 'taut', load: 1,
  };
  const payload = {
    id: 9003, alive: true, type: 'asteroid', collides: true,
    pos: { x: bx, z: bz }, vel: { x: 0, z: 90 }, radius: 16, mass: 36000,
  };
  h.state.entities.set(payload.id, payload);
  h.state.entityList.push(payload);
  h.state.entityIndex.asteroids.push(payload);
  const before = engine.census().alive;
  stepSeconds(engine, h.state, DT);
  assert.ok(engine.census().alive < before, 'the swept line took brood');
  const kills = h.emitted.filter((e) => e.event === 'swarm:broodKills'
    && e.payload.cause === 'collision');
  assert.ok(kills.length >= 1);
});

test('the engine is a no-op outside a live active swarm flight', () => {
  const h = boot({ wave: 1, phase: 'draft' });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 1);
  engine.spawnWave(h.state);
  const x = engine._bodies.px[0];
  stepSeconds(engine, h.state, 1);
  assert.equal(engine._bodies.px[0], x, 'draft pause freezes the population');
  const h2 = boot({ wave: 1 });
  h2.state.run.ruleset = 'authored';
  const engine2 = makeEngine(h2);
  engine2.prepareWave(h2.state.run, 1);
  engine2.spawnWave(h2.state);
  const alive = engine2.census().alive;
  stepSeconds(engine2, h2.state, 1);
  assert.equal(engine2.census().alive, alive, 'non-swarm runs never step the tier');
});

test('kill receipts speak the kill words and pay one credit a mite', () => {
  const h = boot({ wave: 1 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 1);
  engine.spawnWave(h.state);
  let slot = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (engine._bodies.alive[i]) { slot = i; break; }
  const x = engine._bodies.px[slot];
  const z = engine._bodies.pz[slot];
  const rock = {
    id: 9004, alive: true, type: 'asteroid', collides: true,
    pos: { x, z }, vel: { x: 0, z: 0 }, radius: 20, mass: 99999,
  };
  h.state.entityIndex.asteroids.push(rock);
  stepSeconds(engine, h.state, DT);
  const receipt = h.emitted.find((e) => e.event === 'swarm:broodKills');
  assert.ok(receipt);
  assert.equal(receipt.payload.cause, 'terrain');
  assert.equal(swarmKillCauseWord({ cause: receipt.payload.cause }), 'SLAMMED');
  assert.equal(receipt.payload.credits, receipt.payload.count);
  assert.equal(receipt.payload.score, receipt.payload.count * 12);
  assert.equal(receipt.payload.wave, 1);
});

test('the chain owner consumes brood receipts: steps, varied cause, milestones', () => {
  const h = boot({ wave: 3 });
  const ctx = { state: h.state, bus: h.bus, helpers: {} };
  runSession.init(ctx);
  swarmChain.init(ctx);
  h.emitted.length = 0;
  swarmChain._onBroodKills({ count: 40, cause: 'explosive', pos: { x: 0, z: 0 }, wave: 3 });
  assert.equal(swarmChain.chainState().chain, 40, '40 bodies = 40 same-cause steps');
  // A different cause continues the chain with the varied step.
  const before = swarmChain.chainState().chain;
  swarmChain._onBroodKills({ count: 1, cause: 'terrain', pos: { x: 0, z: 0 }, wave: 3 });
  assert.equal(swarmChain.chainState().chain, before + 2, 'varied cause pays the ×2 step');
  const chainEvents = h.emitted.filter((e) => e.event === 'swarm:chain');
  assert.ok(chainEvents.length >= 2);
  const bonuses = h.emitted.filter((e) => e.event === 'run:awardRequested'
    && e.payload.reason === 'chain');
  assert.ok(bonuses.length >= 1, 'chain bonus paid through the run envelope');
  // Milestone toasts are queued and spoken one per tick by the chain owner's own update.
  h.state.simTime += DT;
  swarmChain.update(DT, h.state);
  const milestones = h.emitted.filter((e) => e.event === 'toast'
    && typeof e.payload.text === 'string' && e.payload.text.startsWith('CHAIN'));
  assert.ok(milestones.length >= 1, 'the 10/25 milestones fired');
});

test('the juice layer celebrates brood wipes: one popup per receipt, SWARM WIPE, tally', () => {
  const h = boot({ wave: 3 });
  const ctx = { state: h.state, bus: h.bus, helpers: {}, timeEffects: null };
  runSession.init(ctx);
  swarmJuice.init(ctx);
  h.emitted.length = 0;
  swarmJuice._onBroodKills({ count: 40, cause: 'explosive', pos: { x: 4, z: 5 }, credits: 40, score: 480, wave: 3 });
  const popups = h.emitted.filter((e) => e.event === 'swarm:killPopup');
  assert.equal(popups.length, 1, 'one popup per receipt — the pool is not one-per-mite');
  assert.equal(popups[0].payload.word, 'MINED');
  assert.equal(popups[0].payload.count, 40);
  const announces = h.emitted.filter((e) => e.event === 'swarm:announce');
  assert.ok(announces.some((e) => e.payload.text === 'SWARM WIPE'), '40 bodies in a window read SWARM WIPE');
  // The round tally counts brood as room kills.
  swarmJuice._onWaveStarted();
  swarmJuice._onBroodKills({ count: 7, cause: 'terrain', pos: { x: 0, z: 0 }, credits: 7, score: 84, wave: 3 });
  h.state.simTime += 0.1;
  swarmJuice._onWaveCleared({ wave: 3 });
  const clear = h.emitted.find((e) => e.event === 'swarm:roundClear');
  assert.ok(clear, 'the clear tally published');
  const killsRow = clear.payload.tally.find((r) => r.id === 'kills');
  assert.ok(killsRow && killsRow.value === '×7', `room kills counted brood (${JSON.stringify(killsRow)})`);
});

test('the swarmArena host plans, spawns, steps and clears the tier', () => {
  const h = boot({ wave: 2 });
  const ctx = { state: h.state, bus: h.bus, helpers: {}, registry: { get: () => null } };
  swarmArena.init(ctx);
  try {
    h.bus.emit('run:wavePlanned', { wave: 2 });
    h.bus.emit('run:waveStarted', { wave: 2 });
    assert.ok(h.state.swarmBrood, 'the engine published its view on the state');
    assert.ok(h.state.swarmBrood.aliveCount >= SWARM_BROOD_MIN);
    assert.equal(h.state.swarmBrood.schema, 'spaceface.swarmBrood.v3');
    h.state.simTime += DT;
    swarmArena.update();
    assert.ok(h.state.swarmBrood.aliveCount > 0, 'one tick stepped the flock');
    h.bus.emit('run:ended', {});
    assert.equal(h.state.swarmBrood.aliveCount, 0, 'run end clears the population');
  } finally {
    swarmArena.destroy();
  }
});

test('the renderer draws the tier from the published arrays: instanced census', () => {
  const h = boot({ wave: 1 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 1);
  engine.spawnWave(h.state);
  const scene = { objects: [], add(o) { this.objects.push(o); }, remove(o) { const i = this.objects.indexOf(o); if (i >= 0) this.objects.splice(i, 1); } };
  const pres = createBroodPresentation(scene, 400);
  const mesh = scene.objects[0];
  assert.ok(mesh && mesh.isInstancedMesh, 'the tier renders as ONE instanced draw');
  assert.equal(mesh.count, 0);
  const drew = pres.update(engine.view, DT, { simTime: 0 });
  assert.ok(drew);
  assert.equal(mesh.count, engine.census().alive);
  assert.ok(mesh.visible);
  // A second draw after deaths keeps the census honest.
  let slot = -1;
  for (let i = 0; i < SWARM_BROOD_MAX; i++) if (engine._bodies.alive[i]) { slot = i; break; }
  engine._killDirectForTest(slot, 'terrain');
  pres.update(engine.view, DT, { simTime: 0.1 });
  assert.equal(mesh.count, engine.census().alive);
  // Empty population hides the mesh.
  engine.clear('test');
  const drewEmpty = pres.update(engine.view, DT, { simTime: 0.2 });
  assert.equal(drewEmpty, false);
  assert.equal(mesh.visible, false);
  pres.dispose();
  assert.equal(scene.objects.length, 0);
});

test('per-frame allocation stays flat: buffers are retained, step allocates nothing', () => {
  const h = boot({ wave: 30 });
  const engine = makeEngine(h);
  engine.prepareWave(h.state.run, 30);
  engine.spawnWave(h.state);
  const before = engine.view;
  stepSeconds(engine, h.state, 2);
  assert.equal(engine.view, before, 'the published view identity is stable');
  // Retained-buffer contract: the same typed arrays serve every tick.
  const arrays = ['px', 'pz', 'vx', 'vz', 'heading', 'family', 'alive', 'seedPhase'];
  for (const key of arrays) assert.ok(before[key] instanceof Float32Array || before[key] instanceof Uint8Array);
  // Where forced GC is available, measure the steady-state growth of a fixed workload.
  if (typeof globalThis.gc === 'function') {
    globalThis.gc();
    const base = process.memoryUsage().heapUsed;
    for (let round = 0; round < 6; round++) stepSeconds(engine, h.state, 2);
    globalThis.gc();
    const growth = process.memoryUsage().heapUsed - base;
    assert.ok(growth < 262144, `six 2-second windows grew the heap by ${growth}B (ceiling 256KB)`);
  }
});
