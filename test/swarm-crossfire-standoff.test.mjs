import assert from 'node:assert/strict';
import test from 'node:test';
import { createSimulation } from '../src/core/sim.js';
import { createRunState } from '../src/core/runState.js';
import { physics } from '../src/core/physics.js';
import { queuePhysicsImpulse, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { combat } from '../src/systems/combat.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
async function fixture(t) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, combat, physics] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.rockCore = { ratingT: 0 };
  state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    wave: 4, arenaId: 'helios_core', arenaMutators: [], phase: 'active' };
  const player = sim.spawn({ type: 'ship', pos: { x: -1500, z: -2000 }, vel: { x: 0, z: 0 },
    rot: 0, radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id;
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const arena = sim.registry.get('swarmArena'), engine = arena._brood;
  engine.prepareWave(state.run, 4);
  const tells = [], kills = [], damage = [];
  for (const [event, sink] of [['swarm:broodTelegraph', tells], ['swarm:broodKills', kills], ['combat:damage', damage]])
    bus.on(event, payload => sink.push({ tick: state.tick, ...payload }));
  bus.emit('run:waveStarted', { wave: 4 });
  const tick = (count = 1) => { for (let i = 0; i < count; i++) sim.step(DT); };
  const bodies = engine._bodies;
  const spitter = () => Array.from(bodies.alive).findIndex((alive, i) => alive && bodies.liveFamilyId[bodies.family[i]] === 'spitter');
  assert.equal(engine.view.aliveCount, 4); assert.equal(engine.view.pendingCount, 141);
  return { sim, state, bus, player, engine, bodies, tick, spitter, tells, kills, damage };
}

for (const idleTicks of [600, 3600]) test(`round four retains both threats through ${idleTicks} idle native ticks`, async t => {
  const f = await fixture(t); f.tick(idleTicks);
  assert.equal(f.engine.view.aliveCount, 4); assert.equal(f.engine.view.pendingCount, 141);
  assert.ok(f.spitter() >= 0); assert.equal(f.tells.length, 0); assert.equal(f.kills.length, 0);
  assert.equal(f.damage.length, 0); assert.equal(f.player.hull, 100);
  const i = f.spitter();
  assert.ok(Math.hypot(f.bodies.px[i] - f.player.pos.x, f.bodies.pz[i] - f.player.pos.z) > 120);
});

test('delayed first action still gets a damaging acid marker before the crowd', async t => {
  const f = await fixture(t); f.tick(600); noteSwarmPilotAction(f.state);
  for (let i = 0; i < 359 && !f.damage.length; i++) f.tick();
  assert.equal(f.tells[0]?.familyId, 'spitter'); assert.ok(f.tells[0].tick > 600);
  assert.ok(f.damage.length > 0); assert.ok(f.player.hull < 100);
  assert.equal(f.engine.view.pendingCount, 141);
});

test('pause preserves the active beat and ordinary crowd release still ends it', async t => {
  const f = await fixture(t); f.tick(600); noteSwarmPilotAction(f.state); f.tick(120);
  f.state.mode = 'pause'; f.tick(600); assert.equal(f.engine.view.pendingCount, 141);
  f.state.mode = 'flight'; f.tick(239); assert.equal(f.engine.view.pendingCount, 141);
  f.tick(); assert.equal(f.engine.view.pendingCount, 123);
});

test('the opener follows a moving pilot through forces rather than a frozen pose', async t => {
  const f = await fixture(t); f.tick(30); const i = f.spitter(), x = f.bodies.px[i], z = f.bodies.pz[i];
  const mass = resolvePhysicsBodySpec(f.player).mass;
  queuePhysicsImpulse(f.player, { x: 0, y: 0, z: mass * 30 }, { kind: 'test_crossfire_displace', actorId: f.player.id });
  f.tick(180);
  assert.ok(Math.abs(f.player.pos.z + 2000) > 20);
  assert.ok(Math.hypot(f.bodies.px[i] - x, f.bodies.pz[i] - z) > 1);
  assert.equal(f.spitter(), i); assert.equal(f.tells.length, 0); assert.equal(f.engine.view.pendingCount, 141);
});
