import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { createBroodEngine, BROOD_PHASE_WINDUP } from '../src/systems/swarmBrood.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { planSwarmOpeningSpitter } from '../src/systems/swarmOpeningSpitter.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { BROOD_SPITTER_SPLASH_DAMAGE, BROOD_SPITTER_WINDUP_S, swarmBroodPopulation } from '../src/data/swarmBrood.js';

const DT = 1 / 60;
const TOTAL = swarmBroodPopulation(3);
const PLAN = [{ id: 'spitter', count: 52 }, { id: 'mite', count: 78 }];
function fixture({ wave = 3, arenaId = 'helios_core', tier = 0, mutators = [] } = {}) {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.rockCore = { ratingT: tier };
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
  const events = [], damage = [];
  const engine = createBroodEngine({ getState: () => state,
    bus: { emit: (type, payload) => events.push({ type, payload }) },
    routeDamage: request => { damage.push(request); return { ok: true }; } });
  engine.prepareWave(state.run, wave);
  return { state, player, rock, add, engine, events, damage };
}
const layout = f => planSwarmOpeningSpitter(f.state, f.state.run, f.state.run.wave, PLAN, 3.4);
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

test('one real spitter stands beyond the remaining throwable, with a clear crosswise dodge', () => {
  const f = fixture(), before = f.state.entityList.map(e => ({ pos: { ...e.pos }, vel: { ...e.vel } }));
  assert.deepEqual(layout(f).pos, { x: 148, z: 0 });
  assert.deepEqual(f.state.entityList.map(e => ({ pos: { ...e.pos }, vel: { ...e.vel } })), before, 'the planner never relocates bodies');
  assert.equal(f.engine.spawnWave(f.state), 1);
  assert.deepEqual(census(f.engine), { spitter: 1 });
  assert.equal(f.engine.view.pendingCount, TOTAL - 1);
  assert.equal(f.engine._bodies.px[0], 148);
});

for (const options of [{ wave: 1 }, { wave: 2 }, { wave: 4 }, { arenaId: 'the_hive' }, { tier: 1 }, { mutators: ['dense'] }])
  test(`debut stays confined to the basic Foundry third round: ${JSON.stringify(options)}`, () => {
    assert.equal(layout(fixture(options)), null);
  });

for (const [name, mutate] of [
  ['missing stone', f => { f.rock.alive = false; }],
  ['unmarked stone', f => { f.rock.data = {}; }],
  ['thrown stone', f => { f.rock.vel.x = 20; }],
  ['too far stone', f => { f.rock.pos.x = 121; }],
  ['noncolliding stone', f => { f.rock.collides = false; }],
  ['static stone', f => { f.rock.physicsBody = { schemaVersion: 1, dynamic: false, mass: 50, radius: 8 }; }],
  ['dead pilot', f => { f.player.alive = false; }],
  ['invalid pilot pose', f => { f.player.pos.x = NaN; }],
]) test(`${name} cannot manufacture a debut`, () => {
  const f = fixture(); mutate(f); assert.equal(layout(f), null);
});

test('blocked throw and measured-size obstacles keep ordinary arrivals', () => {
  for (const spec of [
    { pos: { x: 118, z: 0 }, radius: 7 },
    { pos: { x: 148, z: 40 }, radius: 1, physicsBody: { schemaVersion: 1, mass: 40, radius: 45, dynamic: true } },
  ]) {
    const f = fixture(); f.add({ type: 'asteroid', ...spec });
    assert.equal(layout(f), null);
    assert.ok(f.engine.spawnWave(f.state) > 1, 'fallback does not stall the existing plan');
  }
});

test('an open endpoint cannot disguise a blocked dodge path, while one clear side is enough', () => {
  const f = fixture();
  f.add({ type: 'fx', pos: { x: 0, z: 30 }, radius: 1,
    physicsBody: { schemaVersion: 1, mass: 40, radius: 15, dynamic: false } });
  assert.ok(layout(f), 'one crosswise escape remains');
  const other = f.add({ type: 'asteroid', pos: { x: 0, z: -30 }, radius: 15 });
  assert.equal(layout(f), null, 'both routes cross solid bodies before their empty endpoints');
  other.alive = false;
  f.player.physicsBody = { schemaVersion: 1, dynamic: true, mass: 40, radius: 48 };
  assert.equal(layout(f), null, 'native pilot envelope, not display radius, controls clearance');
});

test('noncolliding decoration and sensor fields cannot block a valid physical scene', () => {
  const f = fixture();
  f.add({ type: 'fx', pos: { x: 118, z: 0 }, radius: 50 });
  f.add({ type: 'fx', pos: { x: 118, z: 0 }, radius: 50, collides: false,
    physicsBody: { schemaVersion: 1, mass: 40, radius: 50, dynamic: false } });
  f.add({ type: 'fx', pos: { x: 118, z: 0 }, radius: 50,
    physicsBody: { schemaVersion: 1, mass: 0, radius: 50, material: 'massline_sensor' } });
  assert.ok(layout(f));
});

test('idle waiting keeps the real spitter alive and does not spend the active six-second beat', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  tick(f, 600);
  assert.deepEqual(census(f.engine), { spitter: 1 });
  assert.equal(f.engine.view.pendingCount, TOTAL - 1);
  assert.equal(f.damage.length, 0);
  assert.equal(f.events.filter(e => e.type === 'swarm:broodTelegraph').length, 0);
  noteSwarmPilotAction(f.state); tick(f, 359);
  assert.equal(f.engine.view.pendingCount, TOTAL - 1);
  tick(f);
  assert.equal(f.engine.view.pendingCount, TOTAL - 19);
});

for (const mode of ['pause', 'draft']) test(`${mode} preserves the exact remaining debut time`, () => {
  const f = fixture(); f.engine.spawnWave(f.state); noteSwarmPilotAction(f.state); tick(f, 120);
  if (mode === 'pause') f.state.mode = 'pause'; else f.state.run.phase = 'draft';
  tick(f, 600); assert.equal(f.engine.spawnWave(f.state), 0);
  f.state.mode = 'flight'; f.state.run.phase = 'active'; tick(f, 239);
  assert.equal(f.engine.view.pendingCount, TOTAL - 1); tick(f);
  assert.equal(f.engine.view.pendingCount, TOTAL - 19);
});

test('clearing the debut life releases finite packets without minting another specialist', () => {
  const f = fixture(); f.engine.spawnWave(f.state);
  f.engine.onExplosion({ pos: { x: 148, z: 0 }, radius: 8, ownerId: f.player.id });
  assert.equal(f.engine.view.aliveCount, 0);
  tick(f);
  assert.equal(f.engine.view.aliveCount, 18);
  tick(f, 400);
  assert.equal(f.engine.view.pendingCount, 0);
  assert.deepEqual(census(f.engine), { spitter: 51, mite: 78 });
  assert.equal(f.events.filter(e => e.type === 'swarm:broodKills').reduce((sum, e) => sum + e.payload.count, 0), 1);
});

test('duplicate spawn calls and duplicate ticks cannot spend the hold twice', () => {
  const f = fixture(); f.engine.spawnWave(f.state); noteSwarmPilotAction(f.state);
  for (let i = 0; i < 600; i++) { f.engine.step(f.state); assert.equal(f.engine.spawnWave(f.state), 0); }
  assert.equal(f.engine.view.pendingCount, TOTAL - 1);
  tick(f, 359); assert.equal(f.engine.view.pendingCount, TOTAL - 1);
  tick(f); assert.equal(f.engine.view.pendingCount, TOTAL - 19);
});

test('clear and next-wave preparation cannot inherit the debut or pending crowd', () => {
  const f = fixture(); f.engine.spawnWave(f.state); f.engine.clear('run_ended'); tick(f, 400);
  assert.equal(f.engine.view.aliveCount, 0); assert.equal(f.engine.view.pendingCount, 0);
  f.state.run.wave = 5; f.engine.prepareWave(f.state.run, 5);
  assert.ok(f.engine.spawnWave(f.state) > 18);
});

test('translated placement and same seeded admissions leave the shared RNG and stock untouched', () => {
  const a = fixture(), b = fixture(); const nextRng = b.state.rng();
  for (const e of a.state.entities.values()) { e.pos.x += 900; e.pos.z -= 600; }
  assert.deepEqual(layout(a).pos, { x: 1048, z: -600 });
  const before = structuredClone({ entities: a.state.entityList, run: a.state.run, core: a.state.rockCore });
  a.engine.spawnWave(a.state); b.engine.spawnWave(b.state);
  assert.equal(a.state.rng(), nextRng);
  assert.deepEqual({ entities: a.state.entityList, run: a.state.run, core: a.state.rockCore }, before);
  assert.equal(a.engine._bodies.heading[0], b.engine._bodies.heading[0]);
});

async function nativeFixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, combat, physics] });
  t.after(() => sim.dispose()); const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), phase: 'active', wave: 1, arenaId: 'helios_core' };
  const player = sim.spawn({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, mass: 40,
    hull: 100, hullMax: 100, collides: true, data: {} }); state.playerId = player.id;
  bus.emit('run:wavePlanned', { wave: 1, plan: { swarm: {}, openingLesson: { holdTicks: 600 } } });
  for (const wave of [2, 3]) { state.run.wave = wave; bus.emit('run:wavePlanned', { wave, plan: { swarm: {} } }); }
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const engine = sim.registry.get('swarmArena')._brood;
  return { sim, state, bus, player, engine };
}

test('native round-three room reaches one marked lob and a physical dodge before the crowd', async t => {
  const f = await nativeFixture(t), { sim, state, bus, engine, player } = f;
  const bodies = state.entityList.filter(e => e.type === 'asteroid').map(e => ({ e, x: e.pos.x, z: e.pos.z }));
  const tells = [], damage = [];
  bus.on('swarm:broodTelegraph', p => tells.push({ tick: state.tick, ...p }));
  bus.on('combat:damage', p => damage.push(p));
  bus.emit('run:waveStarted', { wave: 3 });
  assert.deepEqual(census(engine), { spitter: 1 });
  for (const before of bodies) assert.deepEqual([before.e.pos.x, before.e.pos.z], [before.x, before.z]);
  noteSwarmPilotAction(state);
  let ticks = 0;
  while (!tells.length && ticks++ < 300) sim.step(DT);
  assert.equal(tells.length, 1); assert.equal(tells[0].familyId, 'spitter');
  assert.equal(engine._bodies.phase[0], BROOD_PHASE_WINDUP);
  const marker = { x: engine._bodies.teleX[0], z: engine._bodies.teleZ[0] };
  const tellTick = state.tick;
  // A physical impulse stands in for the pilot's sideways thrust; no pose teleport.
  queuePhysicsImpulse(player, { x: 0, y: 0, z: -2400 }, { kind: 'test_spitter_dodge', actorId: player.id });
  let stopped = false;
  const dodgeStep = () => {
    sim.step(DT);
    if (!stopped && Math.hypot(player.pos.x - marker.x, player.pos.z - marker.z) >= 65) {
      const mass = resolvePhysicsBodySpec(player).mass;
      queuePhysicsImpulse(player, { x: -player.vel.x * mass, y: 0, z: -player.vel.z * mass },
        { kind: 'test_spitter_dodge_brake', actorId: player.id });
      stopped = true;
    }
  };
  while (!engine.view.lobCount && ticks++ < 350) dodgeStep();
  assert.ok(engine.view.lobCount > 0);
  assert.ok(state.tick - tellTick >= Math.ceil(BROOD_SPITTER_WINDUP_S / DT));
  while (!engine.view.poolCount && ticks++ < 359) dodgeStep();
  assert.ok(engine.view.poolCount > 0, 'ordinary ballistic arc lands in an acid pool');
  assert.ok(Math.hypot(player.pos.x - marker.x, player.pos.z - marker.z) >= 65, 'native hull left the marked splash');
  assert.ok(Math.hypot(player.pos.x - marker.x, player.pos.z - marker.z) < 67, 'native braking holds the planned crosswise escape');
  assert.equal(engine.view.pendingCount, TOTAL - 1, 'the first lob reads before reinforcement');
  assert.equal(damage.length, 0, 'the dodge takes no routed damage');
  assert.equal(player.hull, 100);
  t.diagnostic(`marker tick ${tellTick}; pool tick ${state.tick}; physical dodge ${Math.hypot(player.pos.x - marker.x, player.pos.z - marker.z).toFixed(2)} WU; hull ${player.hull}; pending ${engine.view.pendingCount}`);
  bus.emit('run:ended', {});
  assert.equal(engine.view.pendingCount, 0); assert.equal(engine.view.aliveCount, 0);
});

test('staying on the debut marker still routes the authored splash damage', () => {
  const f = fixture(); f.engine.spawnWave(f.state); noteSwarmPilotAction(f.state);
  for (let i = 0; i < 359 && !f.damage.length; i++) tick(f);
  assert.ok(f.damage.some(d => d.packet?.channels?.thermal === BROOD_SPITTER_SPLASH_DAMAGE), JSON.stringify(f.damage));
  assert.equal(f.engine.view.pendingCount, TOTAL - 1);
});

test('native no-dodge control takes real hull damage from the same isolated acid arc', async t => {
  const { sim, state, bus, engine, player } = await nativeFixture(t);
  const damage = []; bus.on('combat:damage', p => damage.push(p));
  bus.emit('run:waveStarted', { wave: 3 });
  for (let i = 0; i < 600; i++) sim.step(DT);
  assert.equal(player.hull, 100); assert.equal(engine.view.poolCount, 0);
  assert.equal(engine.view.lobCount, 0); assert.equal(engine.view.pendingCount, TOTAL - 1);
  noteSwarmPilotAction(state);
  for (let i = 0; i < 359 && player.hull === 100; i++) sim.step(DT);
  assert.ok(player.hull < 100, 'canonical combat owner applies the undodged splash');
  assert.ok(damage.length > 0); assert.equal(engine.view.pendingCount, TOTAL - 1);
  t.diagnostic(`after 600 protected ticks, first acid impact tick ${state.tick}; hull ${player.hull}; pending ${engine.view.pendingCount}`);
});
