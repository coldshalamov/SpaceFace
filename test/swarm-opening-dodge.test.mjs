import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { physics } from '../src/core/physics.js';
import { combat } from '../src/systems/combat.js';
import { swarmArena, SWARM_DEBRIS_MAX } from '../src/systems/swarmArena.js';
import { planSwarmOpeningDodge, planSwarmOpeningSpitter } from '../src/systems/swarmOpeningSpitter.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';

const DT = 1 / 60, PLAN = [{ id: 'spitter', count: 52 }, { id: 'mite', count: 78 }];
function fixture(t, { native = false, wave = 3, crowded = true } = {}) {
  const sim = createSimulation({ seed: 4242, systems: native ? [swarmArena, combat, physics] : [swarmArena] });
  t.after(() => sim.dispose()); const { state, bus } = sim;
  state.mode = 'flight'; state.rockCore = { ratingT: 0 };
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave, arenaId: 'helios_core', arenaMutators: [] };
  const player = sim.spawn({ type: 'ship', pos: { x: -1500, z: -2000 }, radius: 8, mass: 40,
    rot: 0, vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, collides: true, data: {} }); state.playerId = player.id;
  const add = (x, z, extra = {}) => sim.spawn({ type: 'asteroid', pos: { x, z }, radius: 6, mass: 50,
    vel: { x: 0, z: 0 }, hull: 100, hullMax: 100, collides: true, data: { swarmArenaDebris: true }, ...extra });
  if (crowded) for (let i = 0; i < SWARM_DEBRIS_MAX; i++) add(-1800, -2100 + i * 10);
  const arena = sim.registry.get('swarmArena'), engine = arena._brood; engine.prepareWave(state.run, wave);
  return { sim, state, bus, player, add, arena, engine };
}
const layout = f => planSwarmOpeningDodge(f.arena._openingPlacementState(f.state), f.state.run, f.state.run.wave, PLAN, 3.4);
const census = engine => {
  const b = engine._bodies, out = {};
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) { const k = b.liveFamilyId[b.family[i]]; out[k] = (out[k] || 0) + 1; }
  return out;
};
const tick = (f, count = 1) => { for (let i = 0; i < count; i++) f.sim.step(DT); };

test('a full earned field gets one real acid threat without another prop or a larger budget', t => {
  const f = fixture(t), bodies = [...f.state.entityList], positions = bodies.map(b => ({ ...b.pos }));
  assert.equal(planSwarmOpeningSpitter(f.state, f.state.run, 3, PLAN, 3.4), null);
  assert.deepEqual(layout(f).pos, { x: -1360, z: -2000 });
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.deepEqual(census(f.engine), { spitter: 1 });
  assert.equal(f.engine.view.pendingCount, swarmBroodPopulation(3) - 1);
  assert.deepEqual(f.state.entityList, bodies); assert.deepEqual(bodies.map(b => ({ ...b.pos })), positions);
  assert.equal(f.state.entityList.some(b => b.data?.openingContinuation), false);
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.deepEqual(census(f.engine), { spitter: 1 }); assert.equal(f.engine.view.pendingCount, 129);
});

test('the existing stone scene still wins, including the normal arena-created stone', t => {
  const f = fixture(t, { crowded: false });
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.equal(f.state.entityList.filter(b => b.data?.openingContinuation === 3).length, 1);
  assert.deepEqual(census(f.engine), { spitter: 1 });
  assert.equal(layout(f), null);
  assert.equal(f.engine._bodies.px[0], -1352);
});

test('an eligible stone with a blocked throw does not get replaced by an unrelated dodge scene', t => {
  const f = fixture(t); f.add(-1412, -2000); f.add(-1382, -2000, { radius: 12 });
  assert.equal(layout(f), null);
  assert.equal(planSwarmOpeningSpitter(f.state, f.state.run, 3, PLAN, 3.4), null);
});

test('blocked approach rotates to a clear seat without moving the bank', t => {
  const f = fixture(t), bank = f.add(-1430, -2000, { radius: 20 });
  const pos = { ...bank.pos }, scene = layout(f);
  assert.ok(scene); assert.ok(Math.abs(scene.pos.z + 2000) > 10); assert.deepEqual({ ...bank.pos }, pos);
});

test('native hull envelope and an occupied escape reject a deceptively open endpoint', t => {
  const f = fixture(t);
  f.add(-1500, -2000, { radius: 1, physicsBody: { radius: 100, dynamic: false } });
  assert.equal(layout(f), null);
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.notEqual(f.engine.view.aliveCount, 1);
});

test('one clear crosswise side suffices but the entire escape is checked', t => {
  const f = fixture(t); f.add(-1500, -1955, { radius: 12 });
  assert.deepEqual(layout(f).pos, { x: -1360, z: -2000 });
  f.add(-1500, -2045, { radius: 12 });
  const scene = layout(f); assert.ok(!scene || scene.pos.x !== -1360 || scene.pos.z !== -2000);
});

test('only real colliding bodies obstruct the fallback', t => {
  const f = fixture(t);
  f.add(-1500, -2000, { radius: 200, collides: false });
  f.add(-1500, -2000, { type: 'fx', radius: 200, physicsBody: false });
  assert.ok(layout(f));
});

for (const mutate of [
  f => { f.state.run.wave = 1; }, f => { f.state.run.wave = 2; }, f => { f.state.run.wave = 4; },
  f => { f.state.run.ruleset = 'classic'; }, f => { f.state.run.arenaId = 'the_hive'; },
  f => { f.state.run.arenaMutators = ['dense']; }, f => { f.state.rockCore.ratingT = 1; },
  f => { f.player.alive = false; }, f => { f.player.pos.x = NaN; },
]) test(`unrelated or invalid scene stays untouched: ${mutate}`, t => {
  const f = fixture(t); mutate(f); assert.equal(layout(f), null);
});

test('zero or invalid population and radius cannot invent a specialist', t => {
  const f = fixture(t);
  for (const plan of [[], [{ id: 'spitter', count: 0 }], [{ id: 'mite', count: 99 }]])
    assert.equal(planSwarmOpeningDodge(f.state, f.state.run, 3, plan, 3.4), null);
  for (const r of [0, -1, Infinity, NaN]) assert.equal(planSwarmOpeningDodge(f.state, f.state.run, 3, PLAN, r), null);
});

test('idle, pause and duplicate calls preserve the same six active seconds', t => {
  const f = fixture(t); f.bus.emit('run:waveStarted', { wave: 3 }); tick(f, 600);
  assert.equal(f.player.hull, 100); assert.equal(f.engine.view.pendingCount, 129);
  noteSwarmPilotAction(f.state); tick(f, 120); f.state.mode = 'pause'; tick(f, 600);
  for (let i = 0; i < 50; i++) assert.equal(f.engine.spawnWave(f.state), 0);
  f.state.mode = 'flight'; tick(f, 239); assert.equal(f.engine.view.pendingCount, 129);
  tick(f); assert.equal(f.engine.view.pendingCount, 111);
});

test('the first real kill releases the same finite plan and teardown cannot recreate it', t => {
  const f = fixture(t); f.bus.emit('run:waveStarted', { wave: 3 });
  f.engine.onExplosion({ pos: { x: -1360, z: -2000 }, radius: 10, ownerId: f.player.id });
  tick(f); assert.equal(f.engine.view.aliveCount, 18); assert.equal(f.engine.view.pendingCount, 111);
  f.engine.clear('run_ended'); tick(f, 400); assert.equal(f.engine.view.aliveCount, 0); assert.equal(f.engine.view.pendingCount, 0);
});

test('native fallback produces a real marked acid hit before the held crowd', async t => {
  const f = fixture(t, { native: true }); f.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await f.sim.registry.get('physics').prepareBackend(f.state), true);
  const tells = [], hits = []; f.bus.on('swarm:broodTelegraph', p => tells.push({ tick: f.state.tick, ...p }));
  f.bus.on('combat:damage', p => hits.push({ tick: f.state.tick, ...p }));
  f.bus.emit('run:waveStarted', { wave: 3 }); tick(f, 600);
  assert.equal(tells.length, 0); noteSwarmPilotAction(f.state);
  for (let i = 0; i < 359 && f.player.hull === 100; i++) tick(f);
  assert.equal(tells[0].familyId, 'spitter'); assert.ok(f.player.hull < 100);
  assert.ok(hits.length); assert.equal(f.engine.view.pendingCount, 129);
});
