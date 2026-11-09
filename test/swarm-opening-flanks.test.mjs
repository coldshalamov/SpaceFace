import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { planSwarmOpeningFlanks } from '../src/systems/swarmOpeningFlanks.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction, sweptDiscsOverlap } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
const POPULATION = swarmBroodPopulation(2);
const MITE_RADIUS = 2.4;

function fixture({ seed = 4242, wave = 2, arenaId = 'helios_core', mutators = [], tier = 0 } = {}) {
  const state = createGameState(seed);
  state.mode = 'flight';
  state.rockCore = { ratingT: tier };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed }),
    phase: 'active', wave, arenaId, arenaMutators: mutators };
  const add = spec => {
    const entity = { id: state.nextEntityId++, alive: true, collides: true,
      vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(entity.id, entity);
    state.entityList.push(entity);
    return entity;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, data: {} });
  state.playerId = player.id;
  const shoulders = [[150, -100], [150, 100], [-150, -100], [-150, 100]].map(([x, z], slot) =>
    add({ type: 'asteroid', pos: { x, z }, radius: 9, mass: 50,
      data: { swarmArenaDebris: true, openingTerrainSlot: slot } }));
  // This genuine opening-pocket position exposed the interrupted patch's unreachable course.
  const pebble = add({ type: 'asteroid', pos: { x: 120, z: 0 }, radius: 9, mass: 50,
    data: { swarmArenaDebris: true, openingPocket: true } });
  const events = [];
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (type, payload) => events.push({ type, payload }) } });
  engine.prepareWave(state.run, wave);
  return { state, player, shoulders, pebble, add, engine, events };
}

function course(f) {
  return planSwarmOpeningFlanks(f.state, f.state.run, f.state.run.wave,
    [{ id: 'mite', count: POPULATION }], MITE_RADIUS);
}
function advance(f, ticks = 1) {
  for (let i = 0; i < ticks; i++) {
    f.state.tick++;
    f.state.simTime += DT;
    f.engine.step(f.state);
  }
}
function bodies(engine, fromLife = 0) {
  const b = engine._bodies;
  return Array.from(b.alive, (_, i) => i).filter(i => b.alive[i] && b.serial[i] > fromLife)
    .map(i => ({ x: b.px[i], z: b.pz[i], life: b.serial[i], hp: b.hp[i] }));
}
function assertPacket(packet, x, z, count = 18) {
  assert.equal(packet.length, count);
  for (const b of packet) assert.ok(Math.hypot(b.x - x, b.z - z) <= 30.001,
    `body ${b.life} (${b.x}, ${b.z}) remains in the authored entrance`);
}
function conserved(f) {
  assert.equal(f.engine.view.aliveCount + f.engine.view.pendingCount, POPULATION);
}
function stockSnapshot(state) {
  return structuredClone({ run: state.run, rockCore: state.rockCore, inventory: state.inventory,
    credits: state.credits, nextEntityId: state.nextEntityId,
    entities: state.entityList.map(e => ({ id: e.id, pos: { ...e.pos }, vel: { ...e.vel }, data: e.data })) });
}

test('the surviving court clears both full entrance discs, including the real starter pebble', () => {
  const f = fixture();
  const before = stockSnapshot(f.state);
  const c = course(f);
  assert.ok(c);
  assert.deepEqual([c.x, c.z, c.ux, c.uz], [0, 0, 1, 0]);
  for (const side of [-1, 1]) for (const entity of f.state.entities.values()) {
    assert.equal(sweptDiscsOverlap({ x: c.x + side * c.distance, z: c.z }, 30 + MITE_RADIUS,
      entity, { clearance: 8 }), false);
  }
  assert.deepEqual(stockSnapshot(f.state), before, 'planning is read-only');
});

test('two surviving opposite shoulders suffice, without replacing destroyed furniture', () => {
  const f = fixture();
  f.shoulders[1].alive = false;
  f.shoulders[2].alive = false;
  assert.ok(course(f));
  f.shoulders[0].alive = false;
  assert.equal(course(f), null);
});

test('the other surviving diagonal independently identifies the same court', () => {
  const f = fixture();
  f.shoulders[0].alive = false;
  f.shoulders[3].alive = false;
  const c = course(f);
  assert.ok(c);
  assert.deepEqual([c.x, c.z], [0, 0]);
});

for (const [name, mutate] of [
  ['missing both right shoulders', f => { f.shoulders[0].alive = f.shoulders[1].alive = false; }],
  ['thrown shoulders', f => { f.shoulders[0].vel.x = f.shoulders[1].vel.x = 20; }],
  ['moved shoulders', f => { f.shoulders[0].pos.x += 60; f.shoulders[1].pos.x += 60; }],
  ['noncolliding shoulders', f => { f.shoulders[0].collides = f.shoulders[1].collides = false; }],
  ['conflicting slot identity', f => f.add({ ...f.shoulders[0], id: 100, pos: { x: 400, z: 400 } })],
  ['pilot beyond the actual court', f => { f.player.pos.x = 97; }],
  ['dead pilot', f => { f.player.alive = false; }],
  ['invalid pilot pose', f => { f.player.pos.z = NaN; }],
]) test(`${name} cannot manufacture a court`, () => {
  const f = fixture();
  mutate(f);
  assert.equal(course(f), null);
});

for (const options of [{ wave: 1 }, { wave: 3 }, { arenaId: 'anvil_yard' },
  { tier: 1 }, { mutators: ['crowded'] }]) test(`other opening scope keeps existing arrivals: ${JSON.stringify(options)}`, () => {
  const f = fixture(options);
  assert.equal(course(f), null);
});

test('a native-size or moving obstacle on either entrance rejects the specialized course', () => {
  for (const side of [-1, 1]) {
    const f = fixture();
    f.add({ type: 'asteroid', pos: { x: side * 180, z: 100 }, radius: 1,
      physicsBody: { schemaVersion: 1, radius: 75, mass: 50, dynamic: true } });
    assert.equal(course(f), null, 'native collider wins over small display radius');
    const g = fixture();
    const blocker = g.add({ type: 'asteroid', pos: { x: side * 180, z: 100 }, radius: 1,
      vel: { x: 0, z: -100 } });
    assert.equal(course(g), null, 'the shared swept lookahead also guards the entire entrance');
    blocker.vel.z = 0;
    assert.ok(course(g));
  }
});

test('translated court anchors to live furniture instead of the world origin or pilot offset', () => {
  const f = fixture();
  for (const e of f.state.entities.values()) { e.pos.x += 900; e.pos.z -= 600; }
  f.player.pos.z += 35;
  const c = course(f);
  assert.deepEqual([c.x, c.z], [900, -600]);
  assert.equal(f.engine.spawnWave(f.state), 18);
  assertPacket(bodies(f.engine), 900 + c.distance, -600);
});

test('first two packets arrive on opposing ends on the existing 45-tick cadence', () => {
  const f = fixture();
  assert.equal(f.engine.spawnWave(f.state), 18);
  assertPacket(bodies(f.engine), 180, 0);
  conserved(f);
  for (let i = 0; i < 100; i++) assert.equal(f.engine.spawnWave(f.state), 0);
  advance(f, 44);
  assert.equal(f.engine.view.pendingCount, POPULATION - 18);
  advance(f);
  assertPacket(bodies(f.engine, 18), -180, 0);
  assert.equal(f.engine.view.pendingCount, POPULATION - 36);
  conserved(f);
});

test('all finite plan bodies arrive once, with no stock, props, quota or rewards minted', () => {
  const f = fixture();
  const stock = stockSnapshot(f.state);
  f.engine.spawnWave(f.state);
  let pending = f.engine.view.pendingCount;
  const arrivals = [18];
  for (let i = 0; i < 360; i++) {
    advance(f);
    if (pending !== f.engine.view.pendingCount) arrivals.push(pending - f.engine.view.pendingCount);
    pending = f.engine.view.pendingCount;
    conserved(f);
  }
  assert.deepEqual(arrivals, [18, 18, 18, 18, 18, 18, 7]);
  assert.equal(f.engine.view.pendingCount, 0);
  assert.equal(new Set(bodies(f.engine).map(b => b.life)).size, POPULATION);
  assert.equal(f.engine.spawnWave(f.state), 0);
  assert.deepEqual(stockSnapshot(f.state), stock);
  assert.equal(f.events.some(e => ['run:awardRequested', 'swarm:broodKills', 'entity:killed'].includes(e.type)), false);
});

for (const phase of ['pause', 'draft']) test(`${phase} preserves remaining packet time without catch-up`, () => {
  const f = fixture();
  f.engine.spawnWave(f.state);
  advance(f, 20);
  if (phase === 'pause') f.state.mode = 'pause'; else f.state.run.phase = 'draft';
  advance(f, 600);
  assert.equal(f.engine.spawnWave(f.state), 0);
  f.state.mode = 'flight'; f.state.run.phase = 'active';
  advance(f, 24);
  assert.equal(f.engine.view.pendingCount, POPULATION - 18);
  advance(f);
  assertPacket(bodies(f.engine, 18), -180, 0);
});

test('duplicate ticks and sim-time jumps cannot spend additional packets', () => {
  const f = fixture();
  f.engine.spawnWave(f.state);
  f.state.simTime += 1000;
  for (let i = 0; i < 100; i++) f.engine.step(f.state);
  assert.equal(f.engine.view.pendingCount, POPULATION - 18);
  advance(f, 45);
  assert.equal(f.engine.view.pendingCount, POPULATION - 36);
});

test('seats remain separated and avoid a pilot moving into the opposite entrance', () => {
  const f = fixture();
  f.engine.spawnWave(f.state);
  f.player.pos.x = -95;
  f.player.vel.x = -40;
  advance(f, 45);
  const packet = bodies(f.engine, 18);
  assert.ok(packet.length > 0);
  for (let i = 0; i < packet.length; i++) {
    const a = packet[i];
    assert.ok(Math.hypot(a.x - f.player.pos.x, a.z - f.player.pos.z) >= 72);
    assert.equal(sweptDiscsOverlap(a, MITE_RADIUS, f.player, { clearance: 8 }), false);
    for (const b of packet.slice(i + 1)) assert.ok(Math.hypot(a.x - b.x, a.z - b.z) >= 2 * MITE_RADIUS + 1 - 1e-5);
  }
  conserved(f);
});

test('new obstruction defers rather than discards unsafe stock and recovers after removal', () => {
  const f = fixture();
  f.engine.spawnWave(f.state);
  const obstacle = f.add({ type: 'asteroid', pos: { x: -180, z: 0 }, radius: 80 });
  advance(f, 45);
  assert.equal(f.engine.view.pendingCount, POPULATION - 18);
  obstacle.alive = false;
  advance(f, 45);
  assert.equal(f.engine.view.pendingCount, POPULATION - 36);
  conserved(f);
});

test('a sidestep keeps the court anchored but observed departure retires it permanently', () => {
  const f = fixture();
  f.engine.spawnWave(f.state);
  f.player.pos.z = 50;
  advance(f, 45);
  assertPacket(bodies(f.engine, 18), -180, 0);
  const g = fixture();
  g.engine.spawnWave(g.state);
  g.player.pos.x = 121;
  advance(g);
  g.player.pos.x = 0;
  advance(g, 44);
  const second = bodies(g.engine, 18);
  assert.equal(second.length, 18);
  assert.ok(second.every(b => b.x > 70 && b.z < -70), 'retired course uses ordinary second gate');
});

test('replacement pilot cannot inherit the committed course or release a catch-up burst', () => {
  const f = fixture();
  f.engine.spawnWave(f.state);
  const replacement = { ...f.player, pos: { x: 400, z: 0 } };
  f.state.entities.set(f.player.id, replacement);
  f.state.entityList[0] = replacement;
  advance(f, 45);
  const packet = bodies(f.engine, 18);
  assert.equal(packet.length, 18);
  assert.ok(packet.every(b => Math.hypot(b.x - 400, b.z) <= 195.001));
  conserved(f);
});

test('unrecognized geometry falls back once and cannot switch mid-wave after repair', () => {
  const f = fixture();
  f.shoulders[0].alive = f.shoulders[1].alive = false;
  assert.equal(f.engine.spawnWave(f.state), POPULATION);
  f.shoulders[0].alive = f.shoulders[1].alive = true;
  assert.equal(f.engine.spawnWave(f.state), 0);
  conserved(f);
});

test('clear and next-wave preparation retire every pending flank body and course', () => {
  const f = fixture();
  f.engine.spawnWave(f.state);
  f.engine.clear('run_ended');
  advance(f, 400);
  assert.equal(f.engine.view.aliveCount, 0);
  assert.equal(f.engine.view.pendingCount, 0);
  // Round three has its own authored Spitter debut; use the next ordinary round
  // to prove this cleared flank course cannot leave an inherited packet hold.
  f.state.run.wave = 4;
  f.engine.prepareWave(f.state.run, 4);
  assert.ok(f.engine.spawnWave(f.state) > 18);
  assert.equal(f.engine.view.aliveCount + f.engine.view.pendingCount, swarmBroodPopulation(4));
});

test('same seeded round produces identical packets and conserves its independent RNG stream', () => {
  const a = fixture({ seed: 88 }), b = fixture({ seed: 88 });
  const nextRng = b.state.rng();
  a.engine.spawnWave(a.state); b.engine.spawnWave(b.state);
  advance(a, 90); advance(b, 90);
  assert.deepEqual(bodies(a.engine), bodies(b.engine));
  assert.equal(a.state.rng(), nextRng);
});

async function nativeFixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, physics] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight';
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 1, arenaId: 'helios_core' };
  const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, collides: true, data: {} });
  state.playerId = player.id;
  // Production room events create and retain the real terrain. This deliberately sets
  // the wave at the owner seam; it is not a claim that a player cleared round one.
  bus.emit('run:wavePlanned', { wave: 1, plan: { swarm: {}, openingLesson: { holdTicks: 600 } } });
  const retained = state.entityList.filter(e => Number.isInteger(e.data?.openingTerrainSlot));
  state.run.wave = 2;
  bus.emit('run:wavePlanned', { wave: 2, plan: { swarm: {} } });
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const engine = sim.registry.get('swarmArena')._brood;
  return { sim, state, bus, player, retained, engine };
}

test('native arena events reach opposing packets without relocating or replacing the surviving court', async t => {
  const f = await nativeFixture(t);
  const { sim, state, bus, engine } = f;
  const before = f.retained.map(e => ({ entity: e, x: e.pos.x, z: e.pos.z }));
  const arrivals = [];
  bus.emit('run:waveStarted', { wave: 2 });
  assertPacket(bodies(engine), 180, 0);
  let pending = engine.view.pendingCount;
  arrivals.push({ tick: state.tick, count: POPULATION - pending });
  for (let i = 0; i < 315; i++) {
    sim.step(DT);
    if (engine.view.pendingCount !== pending) {
      arrivals.push({ tick: state.tick, count: pending - engine.view.pendingCount });
      pending = engine.view.pendingCount;
      if (arrivals.length === 2) assertPacket(bodies(engine, 18), -180, 0);
    }
  }
  assert.deepEqual(arrivals.map(a => a.count), [18, 18, 18, 18, 18, 18, 7]);
  for (let i = 1; i < arrivals.length; i++) assert.equal(arrivals[i].tick - arrivals[i - 1].tick, 45);
  assert.equal(engine.view.aliveCount, POPULATION, 'idle arrival protection does not award free terrain kills');
  for (const prior of before) {
    assert.equal(state.entities.get(prior.entity.id), prior.entity);
    assert.ok(Math.hypot(prior.entity.pos.x - prior.x, prior.entity.pos.z - prior.z) < 0.01);
  }
  bus.emit('run:ended', {});
  for (let i = 0; i < 60; i++) sim.step(DT);
  assert.equal(engine.view.aliveCount, 0);
  assert.equal(engine.view.pendingCount, 0);
});

test('native flanking bodies actually pursue after the pilot acts, with no new movement owner', async t => {
  const f = await nativeFixture(t);
  f.bus.emit('run:waveStarted', { wave: 2 });
  const first = bodies(f.engine).map(b => b.life);
  const distance = () => {
    const live = bodies(f.engine).filter(b => first.includes(b.life));
    return live.reduce((sum, b) => sum + Math.hypot(b.x - f.player.pos.x, b.z - f.player.pos.z), 0) / live.length;
  };
  const before = distance();
  noteSwarmPilotAction(f.state);
  for (let i = 0; i < 30; i++) f.sim.step(DT);
  assert.ok(distance() < before - 1);
  assert.equal(f.engine.view.pendingCount, POPULATION - 18);
});
