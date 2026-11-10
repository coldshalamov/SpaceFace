import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createRunState } from '../src/core/runState.js';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { flightV3 } from '../src/systems/flightV3.js';
import { combat } from '../src/systems/combat.js';
import { swarmArena } from '../src/systems/swarmArena.js';
import { planSwarmBank } from '../src/systems/swarmBank.js';
import { createBroodEngine, BROOD_PHASE_WINDUP, BROOD_PHASE_DASH } from '../src/systems/swarmBrood.js';
import { swarmBroodPopulation } from '../src/data/swarmBrood.js';
import { noteSwarmPilotAction } from '../src/systems/swarmSafety.js';

const DT = 1 / 60;
const PLAN = [{ id: 'charger', count: 2 }, { id: 'spitter', count: 1 }];
function fixture() {
  const state = createGameState(4242);
  state.mode = 'flight';
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 7, arenaId: 'helios_core', arenaMutators: [] };
  const add = spec => {
    const entity = { id: state.nextEntityId++, alive: true, collides: true,
      vel: { x: 0, z: 0 }, ...spec };
    state.entities.set(entity.id, entity); state.entityList.push(entity); return entity;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8, mass: 40 });
  const rock = add({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    data: { swarmArenaDebris: true } });
  state.playerId = player.id;
  resolvePhysicsBodySpec(player); resolvePhysicsBodySpec(rock);
  return { state, add, player, rock };
}
const layout = h => planSwarmBank(h.state, h.state.run, 7, PLAN);
const block = (h, side = -1, overrides = {}) => h.add({ type: 'asteroid',
  pos: { x: 0, z: 32 * side }, radius: 6, mass: 50, ...overrides });

test('an obstacle halfway through the default sidestep chooses the other clear flank', () => {
  const h = fixture();
  assert.equal(layout(h).flankZ, 1);
  block(h);
  assert.equal(layout(h).flankZ, -1, 'the escape is opposite the marked Spitter flank');
});

test('both obstructed corridors fall back without moving terrain or spending the finite wave', () => {
  const h = fixture(); block(h); block(h, 1);
  const before = h.state.entityList.map(e => ({ pos: { ...e.pos }, vel: { ...e.vel } }));
  assert.equal(layout(h), null);
  const engine = createBroodEngine({ getState: () => h.state, bus: { emit() {} } });
  engine.prepareWave(h.state.run, 7); engine.spawnWave(h.state);
  assert.equal(engine.view.aliveCount + engine.view.pendingCount, swarmBroodPopulation(7));
  assert.notEqual(engine._bodies.liveFamilyId[engine._bodies.family[0]], 'charger');
  assert.deepEqual(h.state.entityList.map(e => ({ pos: { ...e.pos }, vel: { ...e.vel } })), before);
});

test('the actual pilot envelope, not just its display radius, clears the whole path', () => {
  const h = fixture(); block(h, -1, { pos: { x: 19, z: -32 }, radius: 2 });
  assert.equal(layout(h).flankZ, 1);
  h.player.physicsBody.radius = 15; h.player.physicsBody.revision++;
  assert.equal(layout(h).flankZ, -1);
});

test('native-sized collidable dressing blocks the corridor even with a tiny display radius', () => {
  const h = fixture();
  block(h, -1, { type: 'fx', radius: 1,
    physicsBody: { schemaVersion: 1, radius: 9, mass: 100, dynamic: false } });
  assert.equal(layout(h).flankZ, -1);
});

for (const [label, overrides] of [
  ['dead', { alive: false }], ['noncolliding', { collides: false }],
  ['bodyless', { physicsBody: false }], ['decoration', { type: 'fx' }],
  ['sensor', { physicsBody: { schemaVersion: 1, radius: 6, mass: 1, material: 'sensor' } }],
  ['line sensor', { physicsBody: { schemaVersion: 1, radius: 6, mass: 1, material: 'massline_sensor' } }],
]) test(`${label} does not pretend to block a clear physical sidestep`, () => {
  const h = fixture(); block(h, -1, overrides); assert.equal(layout(h).flankZ, 1);
});

test('a currently clear moving blocker is considered at its crossing time', () => {
  const h = fixture(); block(h, -1, { pos: { x: 55, z: -32 }, vel: { x: -110, z: 0 } });
  assert.equal(layout(h).flankZ, -1);
});

for (const type of ['asteroid', 'ship', 'drone', 'wreck', 'station'])
  test(`bodyless ${type} remains disabled through repeated preview and admission queries`, () => {
    for (const pos of [{ x: 0, z: -32 }, { x: 0, z: -65 }, { x: -90, z: 0 }, { x: 0, z: 150 }]) {
      const h = fixture(), expected = layout(h);
      const sentinel = block(h, -1, { type, pos, physicsBody: false });
      const before = structuredClone(sentinel), count = h.state.entities.size;
      for (let query = 0; query < 3; query++) {
        assert.deepEqual(layout(h), expected);
        assert.deepEqual(sentinel, before, 'a read-only Bank query cannot enable or move this body');
        assert.equal(h.state.entities.size, count);
        assert.equal(h.state.entities.get(sentinel.id), sentinel);
      }
    }
  });

test('a bodyless pilot cannot be normalized into a physical Bank participant', () => {
  const h = fixture(); h.player.physicsBody = false;
  assert.equal(layout(h), null); assert.equal(layout(h), null);
  assert.equal(h.player.physicsBody, false);
});

for (const material of ['projectile', 'massline_sensor', 'sensor'])
  test(`${material} collision material never becomes a physical corridor or endpoint obstruction`, () => {
    for (const pos of [{ x: 0, z: -32 }, { x: 0, z: -65 }, { x: -90, z: 0 }, { x: 0, z: 150 }]) {
      const h = fixture(), expected = layout(h);
      const ghost = block(h, -1, { type: 'projectile', pos,
        physicsBody: { schemaVersion: 1, radius: 6, mass: 1, material, dynamic: true } });
      const before = structuredClone(ghost);
      assert.deepEqual(layout(h), expected); assert.deepEqual(layout(h), expected);
      assert.deepEqual(ghost, before);
    }
  });

test('a disabled or ghost original stone cannot stage a Bank counter', () => {
  for (const material of ['projectile', 'massline_sensor', 'sensor']) {
    const h = fixture(); h.rock.physicsBody.material = material; h.rock.physicsBody.revision++;
    assert.equal(layout(h), null); assert.equal(layout(h), null);
  }
});

test('a body moving away does not block an otherwise clear path', () => {
  const h = fixture(); block(h, -1, { pos: { x: 55, z: -32 }, vel: { x: 110, z: 0 } });
  assert.equal(layout(h).flankZ, 1);
});

test('removing the original obstruction restores the original composition deterministically', () => {
  const h = fixture(), base = layout(h), obstacle = block(h);
  assert.equal(layout(h).flankZ, -1);
  h.state.entities.delete(obstacle.id);
  assert.deepEqual(layout(h), base);
});

test('translation and rotation preserve flank choice without consuming shared RNG or stock', () => {
  const h = fixture(), control = fixture(); block(h);
  const before = structuredClone(h.state.run), base = layout(h);
  for (const entity of h.state.entities.values()) {
    const { x, z } = entity.pos; entity.pos = { x: 900 - z, z: -600 + x };
  }
  const rotated = layout(h);
  assert.deepEqual(rotated.first, { x: 900 - base.first.z, z: -600 + base.first.x });
  assert.equal(rotated.flankX, -base.flankZ);
  assert.ok(Math.abs(rotated.flankZ - base.flankX) < 1e-12);
  assert.equal(h.state.rng(), control.state.rng()); assert.deepEqual(h.state.run, before);
});

async function native(t) {
  const sim = createSimulation({ seed: 4242, systems: [swarmArena, flightV3, physics, combat] });
  t.after(() => sim.dispose());
  const { state, bus } = sim;
  state.mode = 'flight'; state.settings.gameplay.physicsBackend = 'rapier-dynamic';
  state.render.sectorShellAdmission = false;
  state.run = { ...createRunState({ kind: 'survival', ruleset: 'swarm', seed: 4242 }),
    phase: 'active', wave: 7, arenaId: 'helios_core', arenaMutators: [] };
  const player = sim.spawn({ type: 'ship', team: 0, pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 },
    radius: 8, mass: 40, hull: 100, hullMax: 100, collides: true, data: {} });
  state.playerId = player.id;
  const rock = sim.spawn({ type: 'asteroid', pos: { x: 88, z: 0 }, radius: 8, mass: 50,
    hull: 100, collides: true, data: { swarmArenaDebris: true } });
  const obstruction = sim.spawn({ type: 'asteroid', pos: { x: 0, z: -32 }, radius: 6, mass: 500,
    hull: 100, collides: true, physicsBody: { schemaVersion: 1, dynamic: false, radius: 6, mass: 500 } });
  assert.equal(await sim.registry.get('physics').prepareBackend(state), true);
  const lane = planSwarmBank(state, state.run, 7, PLAN); assert.ok(lane);
  const engine = sim.registry.get('swarmArena')._brood;
  engine.prepareWave(state.run, 7); engine.spawnWave(state);
  const b = engine._bodies;
  assert.equal(b.liveFamilyId[b.family[0]], 'charger');
  // Keep the real finite roster, placing unrelated bodies outside this isolated native beat.
  for (let i = 3; i < b.alive.length; i++) if (b.alive[i]) { b.px[i] = 4000 + i * 50; b.pz[i] = 4000; }
  const contacts = [], awards = [];
  bus.on('physics:contact', p => contacts.push(p)); bus.on('run:awardRequested', p => awards.push(p));
  noteSwarmPilotAction(state);
  return { sim, state, bus, player, rock, obstruction, lane, engine, b, contacts, awards };
}

test('native strafe and brake use the clear flank while the real Charger passes into the original stone', async t => {
  const h = await native(t); let moved = false, stopped = false, dashed = false;
  for (let tick = 0; tick < 400 && h.b.alive[0]; tick++) {
    if (h.b.phase[0] === BROOD_PHASE_WINDUP && !moved) {
      h.state.input.moveX = -h.lane.flankZ; moved = true;
    }
    if (moved && !stopped && Math.abs(h.player.pos.z) > 40) {
      h.state.input.moveX = 0; h.state.input.brake = true; stopped = true;
    }
    h.sim.step(DT); dashed ||= h.b.phase[0] === BROOD_PHASE_DASH;
  }
  assert.ok(moved && stopped && dashed);
  assert.ok(h.player.pos.z > 40); assert.equal(h.player.hull, 100);
  assert.equal(h.contacts.length, 0); assert.equal(h.b.alive[0], 0);
  assert.equal(h.rock.alive, true); assert.deepEqual({ ...h.obstruction.pos }, { x: 0, y: 0, z: -32 });
  assert.deepEqual(h.awards, [], 'an unassisted terrain death is not a free player award');
  t.diagnostic(`Native Bank: z ${h.player.pos.z.toFixed(2)}, hull ${h.player.hull}, tick ${h.state.tick}, contacts ${h.contacts.length}.`);
});

test('native no-dodge control still receives the unchanged Charger attack', async t => {
  const h = await native(t); let dashed = false;
  for (let tick = 0; tick < 400 && h.player.hull === 100; tick++) {
    h.sim.step(DT); dashed ||= h.b.phase[0] === BROOD_PHASE_DASH;
  }
  assert.ok(dashed); assert.ok(h.player.hull < 100, `hull ${h.player.hull}`);
  t.diagnostic(`Native Bank no-dodge: hull ${h.player.hull}, tick ${h.state.tick}.`);
});
