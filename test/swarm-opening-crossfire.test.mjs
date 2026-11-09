import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { createBroodEngine } from '../src/systems/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { planSwarmOpeningCrossfire } from '../src/systems/swarmOpeningCrossfire.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';

const DT = 1 / 60, TOTAL = swarmBroodPopulation(4);
const PLAN = [{ id: 'spitter', count: 58 }, { id: 'mite', count: 87 }];
function fixture({ wave = 4, arenaId = 'helios_core', tier = 0, mutators = [] } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight'; state.rockCore = { ratingT: tier };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave, arenaId, arenaMutators: mutators };
  const add = spec => {
    const e = { id: state.nextEntityId++, alive: true, collides: true, vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 40, hull: 100, data: {} });
  state.playerId = player.id;
  const rock = add({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    data: { swarmArenaDebris: true, openingPocket: true } });
  resolvePhysicsBodySpec(player); resolvePhysicsBodySpec(rock);
  const events = [];
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (type, payload) => events.push({ type, payload }) } });
  engine.prepareWave(state.run, wave);
  return { state, player, rock, add, engine, events };
}
const layout = f => planSwarmOpeningCrossfire(f.state, f.state.run, f.state.run.wave, PLAN, 2.4, 3.4);
function tick(f, count = 1) {
  for (let i = 0; i < count; i++) { f.state.tick++; f.state.simTime += DT; f.engine.step(f.state); }
}
function census(engine) {
  const b = engine._bodies, result = {};
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
    const id = b.liveFamilyId[b.family[i]];
    result[id] = (result[id] || 0) + 1;
  }
  return result;
}

test('a real throwable fronts three mites while one opposite spitter provides the second learned threat', () => {
  const f = fixture(), before = structuredClone({ entities: f.state.entityList, run: f.state.run, core: f.state.rockCore });
  const lane = layout(f);
  assert.deepEqual(lane.mites, [{ x: 133, z: 0 }, { x: 148, z: 0 }, { x: 163, z: 0 }]);
  assert.deepEqual(lane.spitter, { x: -140, z: 0 });
  assert.equal(f.engine.spawnWave(f.state), 4);
  assert.deepEqual(census(f.engine), { mite: 3, spitter: 1 });
  assert.equal(f.engine.view.pendingCount, TOTAL - 4);
  assert.deepEqual({ entities: f.state.entityList, run: f.state.run, core: f.state.rockCore }, before);
});

for (const options of [{ wave: 1 }, { wave: 2 }, { wave: 3 }, { wave: 5 },
  { arenaId: 'the_hive' }, { tier: 1 }, { mutators: ['dense'] }])
  test(`mixed scene stays in the basic Foundry fourth round: ${JSON.stringify(options)}`, () => {
    assert.equal(layout(fixture(options)), null);
  });

for (const [name, mutate] of [
  ['missing stone', f => { f.state.entities.delete(f.rock.id); }],
  ['unmarked stone', f => { f.rock.data = {}; }],
  ['thrown stone', f => { f.rock.vel.x = 20; }],
  ['too far stone', f => { f.rock.pos.x = 121; }],
  ['oversized stone', f => { f.rock.radius = 10; }],
  ['noncolliding stone', f => { f.rock.collides = false; }],
  ['static stone', f => { f.rock.physicsBody = { schemaVersion: 1, dynamic: false, mass: 50, radius: 8 }; }],
  ['dead pilot', f => { f.player.alive = false; }],
  ['invalid pilot pose', f => { f.player.pos.x = NaN; }],
]) test(`${name} cannot manufacture an authored encounter`, () => {
  const f = fixture(); mutate(f); assert.equal(layout(f), null);
});

test('missing budget or invalid radii cannot overspend or invent the mixed group', () => {
  const f = fixture();
  for (const plan of [[{ id: 'mite', count: 2 }, PLAN[0]], [PLAN[1]], [PLAN[0]], []])
    assert.equal(planSwarmOpeningCrossfire(f.state, f.state.run, 4, plan, 2.4, 3.4), null);
  for (const radius of [0, -1, NaN, Infinity])
    assert.equal(planSwarmOpeningCrossfire(f.state, f.state.run, 4, PLAN, radius, 3.4), null);
});

test('either blocked threat seat or an intervening throw obstacle falls back without a partial scene', () => {
  for (const pos of [{ x: 163, z: 0 }, { x: -140, z: 0 }, { x: 110, z: 0 }]) {
    const f = fixture(); f.add({ type: 'asteroid', pos, radius: 8 });
    assert.equal(layout(f), null);
    assert.ok(f.engine.spawnWave(f.state) > 4);
    assert.equal(f.engine.view.aliveCount + f.engine.view.pendingCount, TOTAL);
  }
});

test('native-size dressing and swept blockers are considered, not just display centers', () => {
  const f = fixture();
  const blocker = f.add({ type: 'fx', pos: { x: -140, z: 35 }, radius: 1,
    physicsBody: { schemaVersion: 1, mass: 40, radius: 40, dynamic: false } });
  assert.equal(layout(f), null);
  blocker.pos = { x: 148, z: 50 }; blocker.physicsBody.radius = 5; blocker.vel.z = -65;
  assert.equal(layout(f), null);
});

test('crosswise escape clears the entire native pilot path and accepts either side', () => {
  const f = fixture();
  f.add({ type: 'fx', pos: { x: 0, z: 30 }, radius: 1,
    physicsBody: { schemaVersion: 1, mass: 40, radius: 15, dynamic: false } });
  assert.equal(layout(f).escape.z, -1);
  const block = f.add({ type: 'asteroid', pos: { x: 0, z: -30 }, radius: 15 });
  assert.equal(layout(f), null);
  block.alive = false;
  f.player.physicsBody = { schemaVersion: 1, mass: 40, radius: 48, dynamic: true };
  assert.equal(layout(f), null);
});

test('sensors, noncolliding bodies and decoration do not pretend to be cover', () => {
  const f = fixture();
  f.add({ type: 'fx', pos: { x: 110, z: 0 }, radius: 50 });
  f.add({ type: 'fx', pos: { x: 110, z: 0 }, radius: 50, collides: false,
    physicsBody: { schemaVersion: 1, mass: 40, radius: 50, dynamic: false } });
  f.add({ type: 'fx', pos: { x: 110, z: 0 }, radius: 50,
    physicsBody: { schemaVersion: 1, mass: 0, radius: 50, material: 'massline_sensor' } });
  assert.ok(layout(f));
});

test('closest blocked throwable can yield to the next genuine clear one without moving either', () => {
  const f = fixture(); f.rock.vel.x = 20;
  const other = f.add({ ...structuredClone(f.rock), id: 30, pos: { x: 0, z: 100 }, vel: { x: 0, z: 0 } });
  assert.equal(layout(f).rockId, other.id);
  assert.equal(f.rock.pos.x, 88); assert.deepEqual(other.pos, { x: 0, z: 100 });
});

test('idle, pause and draft do not consume the mixed beat or pre-fire an acid pool', () => {
  const f = fixture(); f.engine.spawnWave(f.state); tick(f, 600);
  assert.equal(f.engine.view.aliveCount, 4); assert.equal(f.engine.view.pendingCount, TOTAL - 4);
  assert.equal(f.engine.view.lobCount, 0); assert.equal(f.engine.view.poolCount, 0);
  assert.equal(f.events.filter(e => e.type === 'swarm:broodTelegraph').length, 0);
  noteSwarmPilotAction(f.state);
  f.state.mode = 'pause'; tick(f, 600); f.state.mode = 'flight';
  f.state.run.phase = 'draft'; tick(f, 600); f.state.run.phase = 'active';
  assert.equal(f.engine.spawnWave(f.state), 0);
  tick(f, 359); assert.equal(f.engine.view.pendingCount, TOTAL - 4);
  tick(f); assert.equal(f.engine.view.pendingCount, TOTAL - 22);
});

test('duplicate ticks and spawn calls cannot shorten the six-active-second encounter', () => {
  const f = fixture(); f.engine.spawnWave(f.state); noteSwarmPilotAction(f.state);
  for (let i = 0; i < 600; i++) { f.engine.step(f.state); assert.equal(f.engine.spawnWave(f.state), 0); }
  assert.equal(f.engine.view.pendingCount, TOTAL - 4);
  tick(f, 359); assert.equal(f.engine.view.pendingCount, TOTAL - 4);
  tick(f); assert.equal(f.engine.view.pendingCount, TOTAL - 22);
});

test('destroying only the pack keeps the live spitter beat, while defeating all four releases early', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  f.engine.onExplosion({ pos: { x: 148, z: 0 }, radius: 40, ownerId: f.player.id });
  assert.deepEqual(census(f.engine), { spitter: 1 });
  assert.equal(f.engine.spawnWave(f.state), 0);
  f.engine.onExplosion({ pos: { x: -140, z: 0 }, radius: 40, ownerId: f.player.id });
  assert.equal(f.engine.spawnWave(f.state), 18);
  assert.equal(f.engine.view.pendingCount, TOTAL - 22);
});

test('finite family budgets arrive through ordinary packets, with no duplicated lives', () => {
  const f = fixture(); f.engine.spawnWave(f.state); noteSwarmPilotAction(f.state);
  const removed = { mite: 0, spitter: 0 };
  for (let guard = 0; f.engine.view.pendingCount && guard < 30; guard++) {
    for (const [id, count] of Object.entries(census(f.engine))) removed[id] += count;
    // Test-only clean defeat through the public blast owner, never writes live slots.
    f.engine.onExplosion({ pos: { ...f.player.pos }, radius: 2000, ownerId: f.player.id });
    tick(f, 45);
  }
  for (const [id, count] of Object.entries(census(f.engine))) removed[id] += count;
  assert.equal(f.engine.view.pendingCount, 0);
  assert.deepEqual(removed, { mite: 87, spitter: 58 });
});

test('pilot departure retires the anchored course and cleanup/new wave discard all old lives', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  f.player.pos.x = 121; tick(f); f.player.pos.x = 0;
  f.engine.onExplosion({ pos: { x: 0, z: 0 }, radius: 2000, ownerId: f.player.id });
  assert.equal(f.engine.spawnWave(f.state), 18);
  const b = f.engine._bodies;
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) assert.ok(Math.hypot(b.px[i], b.pz[i] + 165) <= 30.001);
  f.engine.clear('run_ended'); tick(f, 400);
  assert.equal(f.engine.view.aliveCount, 0); assert.equal(f.engine.view.pendingCount, 0);
  f.state.run.wave = 5; f.engine.prepareWave(f.state.run, 5);
  assert.ok(f.engine.spawnWave(f.state) > 18);
});

test('translated composition is deterministic and spends no shared random stream or stock', () => {
  const a = fixture(), b = fixture(); const expectedRng = b.state.rng();
  const lane = layout(a);
  for (const entity of a.state.entities.values()) { entity.pos.x += 900; entity.pos.z -= 600; }
  const translated = layout(a);
  for (let i = 0; i < 3; i++) assert.deepEqual(translated.mites[i], { x: lane.mites[i].x + 900, z: lane.mites[i].z - 600 });
  assert.deepEqual(translated.spitter, { x: lane.spitter.x + 900, z: lane.spitter.z - 600 });
  a.engine.spawnWave(a.state); b.engine.spawnWave(b.state);
  assert.equal(a.state.rng(), expectedRng);
  assert.equal(a.engine._bodies.heading[3], b.engine._bodies.heading[3]);
});

async function nativeFixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, combat, physics] });
  t.after(() => sim.dispose()); const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), phase: 'active', wave: 1, arenaId: 'helios_core' };
  const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, collides: true, data: {} }); state.playerId = player.id;
  bus.emit('run:wavePlanned', { wave: 1, plan: { swarm: {}, openingLesson: { holdTicks: 600 } } });
  for (const wave of [2, 3, 4]) { state.run.wave = wave; bus.emit('run:wavePlanned', { wave, plan: { swarm: {} } }); }
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const engine = sim.registry.get('swarmArena')._brood;
  const lane = planSwarmOpeningCrossfire(state, state.run, 4, PLAN, 2.4, 3.4);
  assert.ok(lane, 'the production room offers the mixed route');
  return { sim, state, bus, player, engine, lane };
}

test('native fourth-round stone breaks the three living mites and a sideways flight dodges the acid', async t => {
  const { sim, state, bus, player, engine, lane } = await nativeFixture(t);
  const terrain = state.entityList.filter(e => e.type === 'asteroid').map(e => ({ e, x: e.pos.x, z: e.pos.z }));
  const kills = [], tells = [], damage = [];
  bus.on('swarm:broodKills', p => kills.push({ tick: state.tick, ...p }));
  bus.on('swarm:broodTelegraph', p => tells.push({ tick: state.tick, ...p }));
  bus.on('combat:damage', p => damage.push(p));
  bus.emit('run:waveStarted', { wave: 4 });
  assert.deepEqual(census(engine), { mite: 3, spitter: 1 });
  for (const before of terrain) assert.deepEqual([before.e.pos.x, before.e.pos.z], [before.x, before.z]);
  const rock = state.entities.get(lane.rockId), initialRock = { ...rock.pos };
  const mass = resolvePhysicsBodySpec(rock).mass;
  noteSwarmPilotAction(state);
  // Actual native forces stand in for a loaded player throw and sideways thrust.
  // No body, target or damage pose is scripted after admission.
  queuePhysicsImpulse(rock, { x: lane.course.ux * mass * 120, y: 0, z: lane.course.uz * mass * 120 },
    { kind: 'test_crossfire_throw', actorId: player.id });
  let marker = null, stopped = false;
  for (let ticks = 0; !engine.view.poolCount && ticks < 359; ticks++) {
    sim.step(DT);
    if (tells.length && !marker) {
      marker = { x: engine._bodies.teleX[3], z: engine._bodies.teleZ[3] };
      queuePhysicsImpulse(player, { x: lane.escape.x * 2400, y: 0, z: lane.escape.z * 2400 },
        { kind: 'test_crossfire_dodge', actorId: player.id });
    }
    if (marker && !stopped && Math.hypot(player.pos.x - marker.x, player.pos.z - marker.z) >= 65) {
      stopped = true;
      const mass = resolvePhysicsBodySpec(player).mass;
      queuePhysicsImpulse(player, { x: -player.vel.x * mass, y: 0, z: -player.vel.z * mass },
        { kind: 'test_crossfire_brake', actorId: player.id });
    }
  }
  assert.ok(Math.hypot(rock.pos.x - initialRock.x, rock.pos.z - initialRock.z) > 60);
  assert.equal(kills.filter(k => k.cause === 'collision').reduce((sum, k) => sum + k.removedCount, 0), 3);
  assert.deepEqual(census(engine), { spitter: 1 });
  assert.equal(tells[0].familyId, 'spitter');
  assert.ok(engine.view.poolCount > 0);
  assert.ok(Math.hypot(player.pos.x - marker.x, player.pos.z - marker.z) >= 65);
  assert.ok(Math.hypot(player.pos.x - marker.x, player.pos.z - marker.z) < 67);
  assert.equal(engine.view.pendingCount, TOTAL - 4);
  assert.equal(damage.length, 0); assert.equal(player.hull, 100);
  t.diagnostic(`native collision kills ticks ${kills.map(k => k.tick)}; marker ${tells[0].tick}; pool ${state.tick}; hull ${player.hull}; pending ${engine.view.pendingCount}`);
  bus.emit('run:ended', {});
  assert.equal(engine.view.aliveCount, 0); assert.equal(engine.view.pendingCount, 0);
});

test('native no-dodge control retains the same damaging acid attack after the mixed throw', async t => {
  const { sim, state, bus, player, engine, lane } = await nativeFixture(t);
  bus.emit('run:waveStarted', { wave: 4 });
  const rock = state.entities.get(lane.rockId), mass = resolvePhysicsBodySpec(rock).mass;
  noteSwarmPilotAction(state);
  queuePhysicsImpulse(rock, { x: lane.course.ux * mass * 120, y: 0, z: lane.course.uz * mass * 120 },
    { kind: 'test_crossfire_throw', actorId: player.id });
  for (let ticks = 0; player.hull === 100 && ticks < 359; ticks++) sim.step(DT);
  assert.ok(player.hull < 100);
  assert.equal(engine.view.pendingCount, TOTAL - 4);
  t.diagnostic(`native no-dodge damage at ${state.tick}; hull ${player.hull}`);
});
