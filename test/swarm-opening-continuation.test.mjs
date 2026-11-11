import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { physics } from '../src/core/physics.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { combat } from '../src/systems/combat.js';
import { swarmArena, SWARM_DEBRIS_MAX } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';

const DT = 1 / 60;
function fixture(t, { wave = 3, arenaId = 'helios_core', ruleset = 'swarm', tier = 0, mutators = [], phase = 'active', native = false } = {}) {
  const sim = createSimulation({ seed: 4242, systems: native ? [swarmArena, combat, physics] : [swarmArena] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.rockCore = { ratingT: tier };
  state.run = { ...createRunState({ kind: 'survival', ruleset, seed: 4242 }), wave, arenaId, arenaMutators: mutators, phase };
  const player = sim.spawn({ type: 'ship', pos: { x: -1500, z: -2000 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id;
  const arena = sim.registry.get('swarmArena'), engine = arena._brood;
  engine.prepareWave(state.run, wave);
  const add = (pos, data = {}, extra = {}) => sim.spawn({ type: 'asteroid', pos, vel: { x: 0, z: 0 },
    radius: 6, mass: 50, hull: 100, hullMax: 100, collides: true, data, ...extra });
  const old = add({ x: 88, z: 0 }, { swarmArenaDebris: true, openingPocket: true });
  const continued = () => state.entityList.filter(e => e.alive && e.data?.openingContinuation);
  return { sim, state, bus, player, arena, engine, add, old, continued };
}
const census = engine => {
  const b = engine._bodies, result = {};
  for (let i = 0; i < b.alive.length; i++) if (b.alive[i]) {
    const family = b.liveFamilyId[b.family[i]]; result[family] = (result[family] || 0) + 1;
  }
  return result;
};
const prepare = f => f.arena._prepareOpeningContinuation(f.state.run, f.state.simTime);

for (const wave of [3, 4]) test(`round ${wave} continues at the pilot's earned location without moving the old court`, t => {
  const f = fixture(t, { wave }), before = structuredClone(f.old);
  assert.equal(f.engine.planOpeningContinuation(f.state), null);
  f.bus.emit('run:waveStarted', { wave });
  const rocks = f.continued(); assert.equal(rocks.length, 1);
  assert.ok(Math.abs(Math.hypot(rocks[0].pos.x - f.player.pos.x, rocks[0].pos.z - f.player.pos.z) - 88) < 1e-8);
  assert.deepEqual({ ...f.old.pos }, before.pos); assert.equal(f.old.id, before.id); assert.equal(f.old.alive, true);
  assert.deepEqual(census(f.engine), wave === 3 ? { spitter: 1 } : { mite: 3, spitter: 1 });
  assert.equal(f.engine.view.pendingCount, swarmBroodPopulation(wave) - (wave === 3 ? 1 : 4));
  const pending = f.engine.view.pendingCount;
  f.bus.emit('run:waveStarted', { wave });
  assert.equal(f.continued().length, 1); assert.equal(f.engine.view.pendingCount, pending);
});

test('a surviving eligible stone is reused, not replaced or cloned', t => {
  const f = fixture(t), original = f.add({ x: -1412, z: -2000 }, { swarmArenaDebris: true, openingPocket: true });
  assert.ok(f.engine.planOpeningContinuation(f.state));
  assert.equal(prepare(f), null); assert.equal(f.continued().length, 0);
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.deepEqual(census(f.engine), { spitter: 1 }); assert.equal(original.alive, true);
});

test('the entire proposed throw and dodge are checked before any physical admission', t => {
  const f = fixture(t); f.add({ ...f.player.pos }, {}, { radius: 300, physicsBody: { radius: 300, dynamic: false } });
  const count = f.state.entityList.length;
  assert.equal(prepare(f), null); assert.equal(f.state.entityList.length, count);
  assert.equal(f.engine.view.aliveCount, 0); assert.equal(f.engine.view.pendingCount, swarmBroodPopulation(3));
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.equal(f.continued().length, 0, 'ordinary fallback never forces a pebble into a full scene');
});

test('a blocked forward proposal rotates rather than moving the obstruction', t => {
  const f = fixture(t), obstacle = f.add({ x: -1412, z: -2000 }, {}, { radius: 20 });
  const before = { ...obstacle.pos };
  assert.ok(prepare(f) != null); assert.equal(f.continued().length, 1);
  assert.deepEqual({ ...obstacle.pos }, before);
  assert.ok(Math.abs(f.continued()[0].pos.z - f.player.pos.z) > 1);
  assert.ok(f.engine.planOpeningContinuation(f.state));
});

for (const [label, near, far, allowed] of [
  ['full local field', SWARM_DEBRIS_MAX, 0, false],
  ['last local seat', SWARM_DEBRIS_MAX - 1, 0, true],
  ['released field does not starve the new room', 0, SWARM_DEBRIS_MAX, true],
  ['full released-body ceiling', 0, SWARM_DEBRIS_MAX * 2 - 1, false],
]) test(label, t => {
  const f = fixture(t);
  for (let i = 0; i < near; i++) f.add({ x: -1180, z: -2000 }, { swarmArenaDebris: true });
  for (let i = 0; i < far; i++) f.add({ x: 2000 + i * 20, z: 2000 }, { swarmArenaDebris: true });
  assert.equal(prepare(f) != null, allowed);
  assert.equal(f.continued().length, allowed ? 1 : 0);
});

for (const options of [{ wave: 1 }, { wave: 2 }, { wave: 5 }, { arenaId: 'the_hive' },
  { ruleset: 'classic' }, { tier: 1 }, { mutators: ['reef'] }, { phase: 'draft' }, { phase: 'ended' }]) {
  test(`ordinary setup is preserved: ${JSON.stringify(options)}`, t => {
    const f = fixture(t, options), count = f.state.entityList.length;
    assert.equal(prepare(f), null); assert.equal(f.state.entityList.length, count);
  });
}

test('preview is read-only and does not consume the ordinary plan or shared RNG', t => {
  const f = fixture(t), other = fixture(t);
  // As in live physics, normalize the existing body specs before comparing gameplay state.
  for (const entity of f.state.entityList) resolvePhysicsBodySpec(entity);
  const initial = JSON.stringify({ entities: f.state.entityList, run: f.state.run, pending: f.engine.view.pendingCount });
  const candidate = { id: 'preview', type: 'asteroid', alive: true, collides: true, pos: { x: -1412, z: -2000 },
    vel: { x: 0, z: 0 }, radius: 6, mass: 50, data: { swarmArenaDebris: true, openingPocket: true } };
  assert.ok(f.engine.planOpeningContinuation(f.state, candidate));
  assert.equal(JSON.stringify({ entities: f.state.entityList, run: f.state.run, pending: f.engine.view.pendingCount }), initial);
  assert.equal(f.state.entities.has('preview'), false); assert.equal(f.state.rng(), other.state.rng());
});

test('failed spawn does not claim a stone or consume any population', t => {
  const f = fixture(t), before = f.engine.view.pendingCount, ids = [...f.arena._ids];
  f.arena.helpers = { ...f.arena.helpers, spawnEntity: () => null };
  assert.equal(prepare(f), null); assert.deepEqual(f.arena._ids, ids);
  assert.equal(f.engine.view.pendingCount, before); assert.equal(f.continued().length, 0);
});

test('a late repeat cannot mint new scenery after the scene was consumed', t => {
  const f = fixture(t); f.bus.emit('run:waveStarted', { wave: 3 });
  const rock = f.continued()[0]; rock.alive = false;
  assert.equal(prepare(f), null); assert.equal(f.continued().length, 0);
});

test('native continuation waits for pilot input, then makes a real marked acid impact before the crowd', async t => {
  const f = fixture(t, { native: true });
  f.state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  assert.equal(await f.sim.registry.get('physics').prepareBackend(f.state), true);
  const tells = [], damage = [];
  f.bus.on('swarm:broodTelegraph', p => tells.push({ tick: f.state.tick, ...p }));
  f.bus.on('combat:damage', p => damage.push(p));
  f.bus.emit('run:waveStarted', { wave: 3 });
  const rock = f.continued()[0]; assert.ok(rock);
  for (let i = 0; i < 600; i++) f.sim.step(DT);
  assert.equal(f.player.hull, 100); assert.equal(tells.length, 0);
  assert.equal(f.engine.view.pendingCount, swarmBroodPopulation(3) - 1);
  noteSwarmPilotAction(f.state);
  for (let i = 0; i < 359 && f.player.hull === 100; i++) f.sim.step(DT);
  assert.ok(tells.some(p => p.familyId === 'spitter'));
  assert.ok(f.player.hull < 100); assert.ok(damage.length > 0);
  assert.equal(f.engine.view.pendingCount, swarmBroodPopulation(3) - 1);
  assert.equal(rock.alive, true);
  t.diagnostic(`continued stone ${rock.id}; first marker ${tells[0].tick}; real impact ${f.state.tick}; hull ${f.player.hull}; pending ${f.engine.view.pendingCount}`);
});

for (const mode of ['pause', 'loading', 'menu']) test(`${mode} cannot admit a continuation rock`, t => {
  const f = fixture(t); f.state.mode = mode;
  assert.equal(prepare(f), null); assert.equal(f.continued().length, 0);
});

test('the next wave and run teardown retire continuation eligibility', t => {
  const f = fixture(t);
  f.state.run.wave = 4; assert.equal(prepare(f), null, 'old plan is not a new wave');
  f.state.run.wave = 3; f.engine.clear('run_ended');
  assert.equal(prepare(f), null); assert.equal(f.continued().length, 0);
});

for (const wave of [3, 4]) test(`round ${wave} reuses a plain eligible arena pebble without adding clutter`, t => {
  const f = fixture(t, { wave });
  const rock = f.add({ x: -1412, z: -2000 }, { swarmArenaDebris: true });
  assert.equal(prepare(f), null); assert.equal(f.continued().length, 0);
  f.bus.emit('run:waveStarted', { wave });
  assert.equal(rock.alive, true);
  assert.deepEqual(census(f.engine), wave === 3 ? { spitter: 1 } : { mite: 3, spitter: 1 });
});

for (const existing of [false, true]) test(`actual admission respects an offset native collider${existing ? ', including an earlier existing pebble' : ''}`, async t => {
  const { default: RAPIER } = await import('@dimforge/rapier3d-compat'); await RAPIER.init();
  const f = fixture(t), world = new RAPIER.World({ x: 0, y: 0, z: 0 }); t.after(() => world.free());
  const x = f.player.pos.x, z = f.player.pos.z;
  if (existing) f.add({ x: x + 88, z }, { swarmArenaDebris: true, openingPocket: true });
  const hull = f.add({ x: x + 148, z: z + 40 }, {},
    { type: 'wreck', radius: 2, physicsBody: { radius: 2, dynamic: false } });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x + 148, 0, z + 40));
  const collider = world.createCollider(RAPIER.ColliderDesc.ball(12).setTranslation(0, 0, -40), body);
  const native = { records: new Map([[hull.id, { entity: hull, body, colliders: [collider] }]]), _frameOrigin: { x: 0, z: 0 } };
  const registry = f.arena.registry;
  f.arena.registry = { ...registry, get: name => name === 'physics' ? { _sg02: native } : registry.get(name) };
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.deepEqual(census(f.engine), { spitter: 1 });
  assert.equal(f.continued().length, 1, 'unsafe original is bypassed for a different complete clear scene');
  const b = f.engine._bodies, slot = Array.from(b.alive).findIndex(Boolean);
  const point = { x: b.px[slot], y: 0, z: b.pz[slot] };
  assert.equal(collider.containsPoint(point), false);
  assert.ok(Math.hypot(point.x - (x + 148), point.z - (z + 40)) >= 52 + 3.4 + 8,
    'actual target clears the full offset-body envelope, not only its point');
  const rock = f.continued()[0];
  const dx = point.x - rock.pos.x, dz = point.z - rock.pos.z;
  const along = Math.max(0, Math.min(1, ((x + 148 - rock.pos.x) * dx + (z + 40 - rock.pos.z) * dz) / (dx * dx + dz * dz)));
  assert.ok(Math.hypot(rock.pos.x + along * dx - (x + 148), rock.pos.z + along * dz - (z + 40)) >= 52 + 6 + 2,
    'the complete physical throw corridor also clears that envelope');
});

for (const replace of [false, true]) test(`spawn publication cannot claim a stone after ${replace ? 'a same-seed run replacement' : 'run end'}`, t => {
  const f = fixture(t), success = [];
  f.bus.on('swarmArena:debris', p => { if (p.layoutId === 'opening_continuation') success.push(p); });
  let accepted = null;
  f.bus.on('entity:spawned', ({ entity }) => {
    if (!entity.data?.openingContinuation || accepted) return;
    accepted = entity; f.state.run.phase = 'ended'; f.bus.emit('run:ended', {});
    if (replace) {
      f.state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }), wave: 3, phase: 'active', arenaId: 'helios_core' };
      f.arena.newGame(); f.engine.prepareWave(f.state.run, 3);
    }
  });
  assert.equal(prepare(f), null); assert.ok(accepted);
  assert.equal(f.arena._ids.includes(accepted.id), false); assert.equal(success.length, 0);
  assert.equal(accepted.data.despawnAt, f.state.simTime + 20);
});


test('interrupted wave-start does not admit or settle a newly prepared replacement cohort', t => {
  const f = fixture(t); let replaced = false;
  f.bus.on('entity:spawned', ({ entity }) => {
    if (!entity.data?.openingContinuation || replaced) return;
    replaced = true; f.state.run = { ...f.state.run };
    f.arena.newGame(); f.engine.prepareWave(f.state.run, 3); f.player.vel.x = 33;
  });
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.equal(f.engine.view.aliveCount, 0); assert.equal(f.engine.view.pendingCount, swarmBroodPopulation(3));
  assert.equal(f.arena._ids.length, 0); assert.equal(f.player.vel.x, 33);
});


test('pause during stone publication defers, then resumes the existing wave request', t => {
  const f = fixture(t); let paused = false;
  f.bus.on('entity:spawned', ({ entity }) => {
    if (!entity.data?.openingContinuation || paused) return;
    paused = true; f.state.mode = 'pause';
  });
  f.bus.emit('run:waveStarted', { wave: 3 });
  assert.equal(f.engine.view.aliveCount, 0); assert.equal(f.engine.view.pendingCount, 130);
  assert.equal(f.arena._ids.length, 0);
  for (let i = 0; i < 600; i++) f.engine.step(f.state);
  assert.equal(f.engine.view.aliveCount, 0); assert.equal(f.engine.view.pendingCount, 130);
  f.state.mode = 'flight'; f.state.tick++; f.engine.step(f.state);
  assert.deepEqual(census(f.engine), { spitter: 1 }); assert.equal(f.engine.view.pendingCount, 129);
  noteSwarmPilotAction(f.state);
  for (let i = 0; i < 360; i++) { f.state.tick++; f.state.simTime += DT; f.engine.step(f.state); }
  assert.equal(f.engine.view.pendingCount, 111, 'the normal six-second release remains live');
});
