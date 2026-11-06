import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { mulberry32 } from '../src/core/rng.js';
import { createBus } from '../src/core/eventBus.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { swarmBroodPlan, swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { planSwarmBank } from '../src/systems/swarmBank.js';
import { broodStreamSeed, createBroodEngine, BROOD_PHASE_WINDUP,
  BROOD_PHASE_DASH, BROOD_PHASE_RECOVER, broodAttackLimit } from '../src/systems/swarmBrood.js';

function fixture({ seed = 4242, rock = true, wave = 7 } = {}) {
  const state = createGameState(seed);
  const player = { id: 1, type: 'ship', alive: true, pos: { x: 0, z: 0 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 20 };
  state.entities.set(1, player); state.entityList.push(player); state.playerId = 1;
  const stone = { id: 2, type: 'asteroid', alive: true, pos: { x: 88, z: 0 },
    vel: { x: 0, z: 0 }, radius: 8, collides: true, physicsBody: { dynamic: true },
    data: { swarmArenaDebris: true, terrainAnchor: true } };
  if (rock) { state.entities.set(2, stone); state.entityList.push(stone); }
  state.entityIndex = { __spacefaceEntityIndexV1: true, ready: true,
    asteroids: rock ? [stone] : [], shipLike: [player] };
  state.run = createRunState({ kind: 'survival', ruleset: 'swarm', seed });
  Object.assign(state.run, { phase: 'active', wave, arenaId: 'helios_core', arenaMutators: [] });
  state.mode = 'flight';
  const events = [];
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (type, payload) => events.push({ type, payload }) } });
  engine.prepareWave(state.run, wave);
  return { state, engine, events, stone, player };
}
function tick(f, n = 1) {
  for (let i = 0; i < n; i++) { f.state.tick++; f.state.simTime += 1 / 60; f.engine.step(f.state); }
}
function plan(seed = 4242, wave = 7) {
  return swarmBroodPlan(wave, mulberry32(broodStreamSeed(seed, wave)));
}

test('bank admits existing stock-throwable terrain and preserves population and seed', () => {
  const a = fixture(), b = fixture();
  const before = { ...a.stone.pos };
  const layout = planSwarmBank(a.state, a.state.run, 7, plan());
  assert.equal(layout.rockId, 2);
  assert.deepEqual(layout, planSwarmBank(b.state, b.state.run, 7, plan()));
  const n = a.engine.spawnWave(a.state), m = b.engine.spawnWave(b.state);
  assert.equal(n + a.engine.view.pendingCount, swarmBroodPopulation(7));
  assert.equal(n, m);
  assert.deepEqual(a.stone.pos, before);
  assert.deepEqual(Array.from(a.engine._bodies.px), Array.from(b.engine._bodies.px));
  const body = a.engine._bodies;
  assert.equal(body.liveFamilyId[body.family[0]], 'charger');
  assert.equal(body.liveFamilyId[body.family[1]], 'spitter');
  assert.equal(body.liveFamilyId[body.family[2]], 'charger');
  assert.equal(body.px[0], layout.first.x);
  for (const row of plan()) {
    const actual = Array.from(body.alive).reduce((count, live, i) =>
      count + (live && body.liveFamilyId[body.family[i]] === row.id ? 1 : 0), 0);
    assert.equal(actual, row.count, `the ${row.id} family spends its ordinary share`);
  }
});

test('bank rejects invalid geometry, boss/mutator/arena and absent roster without altering normal arrivals', () => {
  const f = fixture({ rock: false });
  assert.equal(planSwarmBank(f.state, f.state.run, 7, plan()), null);
  const spawned = f.engine.spawnWave(f.state);
  assert.equal(spawned + f.engine.view.pendingCount, swarmBroodPopulation(7));
  assert.equal(f.engine._bodies.liveFamilyId[f.engine._bodies.family[0]], 'spitter');
  const g = fixture();
  assert.equal(planSwarmBank(g.state, { ...g.state.run, arenaId: 'the_hive' }, 7, plan()), null);
  assert.equal(planSwarmBank(g.state, { ...g.state.run, arenaMutators: ['reef'] }, 7, plan()), null);
  assert.equal(planSwarmBank(g.state, g.state.run, 10, plan(4242, 10)), null);
  assert.equal(planSwarmBank(g.state, g.state.run, 7, [{ id: 'charger', count: 1 }]), null);
  g.stone.radius = 10;
  assert.equal(planSwarmBank(g.state, g.state.run, 7, plan()), null);
});

test('first pass, flank marker and second pass use normal windup and recovery, then release', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  const b = f.engine._bodies;
  let firstWind = false, firstDash = false, firstRecovery = false, spitWind = false, secondWind = false;
  let marker = null;
  for (let t = 0; t < 480 && !secondWind; t++) {
    tick(f);
    const attacks = Array.from(b.alive).reduce((n, live, i) => n + (live &&
      (b.phase[i] === BROOD_PHASE_WINDUP || b.phase[i] === BROOD_PHASE_DASH) ? 1 : 0), 0)
      + Array.from(f.engine._lobs.alive).reduce((n, alive) => n + alive, 0);
    assert.ok(attacks <= broodAttackLimit(7), 'the existing attention cap still holds');
    if (b.phase[0] === BROOD_PHASE_WINDUP) firstWind = true;
    if (b.phase[0] === BROOD_PHASE_DASH) {
      firstDash = true;
      // A natural dodge after the committed bearing is fixed; no enemy is moved.
      f.player.pos.z = -70;
    }
    if (b.phase[0] === BROOD_PHASE_RECOVER) firstRecovery = true;
    if (b.phase[1] === BROOD_PHASE_WINDUP) {
      spitWind = true; marker = { x: b.teleX[1], z: b.teleZ[1] };
      assert.ok(firstDash || !b.alive[0]);
    }
    if (b.phase[2] === BROOD_PHASE_WINDUP) {
      secondWind = true;
      assert.ok(firstRecovery || !b.alive[0]);
    }
  }
  assert.ok(firstWind && firstDash && (firstRecovery || !b.alive[0]) && spitWind && secondWind,
    'the first pass either recovers or physically ends on the nearby stone');
  assert.ok(marker && marker.z > f.player.pos.z, 'the marked lob pressures the other flank');
});

test('a redirected real stone intercepts the committed pass and leaves its horn plate', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  const b = f.engine._bodies;
  let committed = false;
  for (let t = 0; t < 400 && b.alive[0]; t++) {
    tick(f);
    if (!committed && b.phase[0] === BROOD_PHASE_DASH) {
      committed = true;
      // Fixture moves the existing stone to model a player redirect; the engine does not.
      f.player.pos.z = -70;
      f.stone.pos.x = 40; f.stone.pos.z = 0;
    }
  }
  assert.ok(committed && !b.alive[0], 'the existing terrain contact kills the dash');
  assert.ok(f.events.some(e => e.type === 'swarm:broodRemains'
    && e.payload.familyId === 'charger' && e.payload.kind === 'horn_plate'));
});

test('missing staged attackers cannot deadlock the wave or leak the once-per-run latch', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  f.engine._killDirectForTest(0, 'direct');
  f.engine._killDirectForTest(1, 'direct');
  tick(f, 140);
  assert.ok(f.events.some(e => e.type === 'swarm:broodTelegraph' && e.payload.familyId === 'charger'));
  f.engine.clear('run_ended');
  f.engine.prepareWave(f.state.run, 7);
  f.engine.spawnWave(f.state);
  assert.equal(f.engine._bodies.liveFamilyId[f.engine._bodies.family[0]], 'charger');
});

test('an out-of-reach staged Spitter releases the next Charger without waiting eight seconds', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  const b = f.engine._bodies;
  // Model a pilot who has already moved away from the flank, with the first attacker gone.
  f.player.pos.x = -330;
  f.engine._killDirectForTest(0, 'direct');
  let nextWindupAt = null;
  for (let i = 0; i < 150 && nextWindupAt == null; i++) {
    tick(f);
    if (b.phase[2] === BROOD_PHASE_WINDUP) nextWindupAt = f.state.simTime;
  }
  assert.ok(nextWindupAt != null && nextWindupAt < 2.5,
    'a reachable Charger resumes ordinary attacks after the selected Spitter falls behind');
});

test('a paused room keeps the selected opening until simulation resumes', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  const b = f.engine._bodies, start = { tick: f.state.tick, time: f.state.simTime, x: b.px[0], z: b.pz[0] };
  f.state.mode = 'paused';
  for (let i = 0; i < 60; i++) assert.equal(f.engine.step(f.state), false);
  assert.deepEqual({ tick: f.state.tick, time: f.state.simTime, x: b.px[0], z: b.pz[0] }, start);
  f.state.mode = 'flight';
  let firstWindup = false;
  for (let i = 0; i < 180 && !firstWindup; i++) { tick(f); firstWindup = b.phase[0] === BROOD_PHASE_WINDUP; }
  assert.equal(firstWindup, true, 'the first Charger can still open after resuming');
});

test('ordinary arena wave callbacks offer the composition against their live terrain', () => {
  const f = fixture({ rock: false });
  const bus = createBus();
  let nextId = 10;
  swarmArena.init({ state: f.state, bus, registry: { get: () => null }, helpers: {
    spawnEntity(spec) {
      const e = { ...spec, id: nextId++, alive: true };
      f.state.entities.set(e.id, e); f.state.entityList.push(e);
      if (e.type === 'asteroid') f.state.entityIndex.asteroids.push(e);
      return e;
    },
  } });
  try {
    bus.emit('run:wavePlanned', { wave: 7 });
    assert.equal(planSwarmBank(f.state, f.state.run, 7, plan()), null,
      'the normal seeded terrain alone has no close first-pass pebble');
    bus.emit('run:waveStarted', { wave: 7 });
    const layout = planSwarmBank(f.state, f.state.run, 7, plan());
    assert.ok(layout, 'arena supplies a reachable pebble and safe approaches before Brood admission');
    assert.equal(f.state.entities.get(layout.rockId).data.bankOpportunity, true);
    assert.equal(f.state.swarmBrood.family[0], 3, 'the real host spawns the first Charger');
  } finally { swarmArena.destroy(); }
});

test('a full debris budget falls back to the ordinary wave without adding or moving rocks', () => {
  const f = fixture({ rock: false });
  for (let i = 0; i < 20; i++) {
    const rock = { id: 100 + i, type: 'asteroid', alive: true, collides: true,
      pos: { x: 1000 + i * 50, z: 0 }, radius: 8, physicsBody: { dynamic: true },
      data: { swarmArenaDebris: true } };
    f.state.entities.set(rock.id, rock); f.state.entityList.push(rock); f.state.entityIndex.asteroids.push(rock);
  }
  const positions = f.state.entityIndex.asteroids.map(e => ({ ...e.pos }));
  const arena = Object.create(swarmArena);
  arena.init({ state: f.state, bus: createBus(), registry: { get: () => null }, helpers: {
    spawnEntity() { assert.fail('full room must not create another rock'); },
  } });
  try {
    arena._brood.prepareWave(f.state.run, 7);
    assert.equal(arena._prepareBankStone(f.state.run, 0), null);
    assert.deepEqual(f.state.entityIndex.asteroids.map(e => e.pos), positions);
    const spawned = arena._brood.spawnWave(f.state);
    assert.equal(spawned + arena._brood.view.pendingCount, swarmBroodPopulation(7));
    assert.equal(arena._brood._bodies.liveFamilyId[arena._brood._bodies.family[0]], 'spitter');
  } finally { arena.destroy(); }
});

test('a pilot leaving the staged second Charger does not silence nearby unrelated attackers', () => {
  const f = fixture({ rock: false });
  f.player.vel.x = 100;
  const bus = createBus(), attacks = [];
  bus.on('swarm:broodTelegraph', payload => {
    if (payload.familyId === 'charger' || payload.familyId === 'spitter') {
      attacks.push({ family: payload.familyId, at: f.state.simTime });
    }
  });
  let nextId = 10;
  const arena = Object.create(swarmArena);
  arena.init({ state: f.state, bus, registry: { get: () => null }, helpers: {
    spawnEntity(spec) {
      const e = { ...spec, id: nextId++, alive: true };
      f.state.entities.set(e.id, e); f.state.entityList.push(e);
      if (e.type === 'asteroid') f.state.entityIndex.asteroids.push(e);
      return e;
    },
  } });
  try {
    bus.emit('run:wavePlanned', { wave: 7 });
    bus.emit('run:waveStarted', { wave: 7 });
    const engine = arena._brood, b = engine._bodies;
    assert.equal(b.liveFamilyId[b.family[0]], 'charger', 'the Bank is admitted on actual seeded terrain');
    assert.equal(b.alive.reduce((sum, alive) => sum + alive, 0) + engine.view.pendingCount, swarmBroodPopulation(7));
    let unrelatedWindup = false;
    for (let i = 0; i < 240; i++) {
      f.state.tick++; f.state.simTime += 1 / 60; f.player.pos.x += 100 / 60;
      engine.step(f.state);
      const concurrent = b.alive.reduce((sum, alive, j) => sum + (alive
        && (b.phase[j] === BROOD_PHASE_WINDUP || b.phase[j] === BROOD_PHASE_DASH) ? 1 : 0), 0)
        + engine._lobs.alive.reduce((sum, alive) => sum + alive, 0);
      assert.ok(concurrent <= broodAttackLimit(7), 'other attackers still use the shared attack cap');
      if (f.state.simTime < 1.25) continue;
      for (let j = 3; j < b.alive.length; j++) {
        const family = b.liveFamilyId[b.family[j]];
        if (b.alive[j] && (family === 'charger' || family === 'spitter') && b.phase[j] === BROOD_PHASE_WINDUP) {
          unrelatedWindup = true;
        }
      }
    }
    assert.ok(attacks.some(row => row.family === 'charger' && row.at < 1.3), 'the opening Charger still speaks first');
    assert.ok(unrelatedWindup, 'other attackers can use normal attack slots before the eight-second timeout');
  } finally { arena.destroy(); }
});
