import test from 'node:test';
import assert from 'node:assert/strict';
import RAPIER from '@dimforge/rapier3d-compat';
import { createBus } from '../src/core/eventBus.js';
import { createGameState } from '../src/core/gameState.js';
import { planWave } from '../src/systems/survivalWavePlanner.js';
import { runSession } from '../src/systems/runSession.js';
import { swarmArena, SWARM_DEBRIS_TAG } from '../src/systems/swarmArena.js';
import { planOpeningThrowables, swarmArenaTierForRun } from '../src/data/swarmArenaLadder.js';
import { asteroidColliderRadius } from '../src/data/asteroidColliders.js';
import { sweptDiscsOverlap } from '../src/systems/swarmSafety.js';

await RAPIER.init();
function fixture({ ratingT = 0, deferred = false, fail = false } = {}) {
  const state = createGameState(4242), bus = createBus(), spawned = [];
  state.rockCore = { ratingT }; state.simTime = 1;
  const native = { records: new Map(), _frameOrigin: { x: 1000, z: -500 } };
  const registry = { get: name => name === 'physics' ? { _sg02: native } : null };
  const add = spec => {
    const e = { id: state.nextEntityId++, alive: true, ...spec };
    state.entities.set(e.id, e); state.entityList.push(e); return e;
  };
  const player = add({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8, rot: 0 });
  state.playerId = player.id;
  const helpers = { spawnEntity(spec) {
    if (fail && spec.data?.openingPocket) return null;
    const e = deferred ? { id: state.nextEntityId++, alive: true, ...spec } : add(spec);
    spawned.push(e); return e;
  } };
  const owner = Object.create(swarmArena), session = Object.create(runSession);
  session.init({ state, bus, helpers, registry }); owner.init({ state, bus, helpers, registry });
  bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 4242, arenaId: 'helios_core' });
  const pocket = () => spawned.filter(e => e.data?.openingPocket);
  return { state, bus, owner, session, add, player, native, pocket,
    install: () => owner._installOpeningPocket(state.run),
    close: () => { owner.destroy(); session.destroy?.(); } };
}

test('empty ordinary opening keeps authored proposals and immediately owns accepted IDs', () => {
  const h = fixture(); h.install();
  const expected = planOpeningThrowables({ tier: swarmArenaTierForRun({ wave: 1, ratingT: 0 }) });
  assert.deepEqual(h.pocket().map(e => [e.pos.x, e.pos.z, e.radius]), expected.map(p => [p.x, p.z, p.radiusWu]));
  assert.deepEqual(h.owner._ids, h.pocket().map(e => e.id));
  assert.ok(h.pocket().every(e => e.physicsBody.radius === asteroidColliderRadius('ast_common_rock', e.radius)));
  assert.equal(h.state.run.wave, 0); assert.equal(h.state.run.phase, 'loadout'); h.close();
});

test('live map admission sees a wide cold collider even when the list/index omits its hull', () => {
  const h = fixture();
  const hull = h.add({ type: 'ship', pos: { x: 120, z: 60 }, vel: { x: 0, z: 0 }, radius: 8,
    physicsBody: { radius: 90 } });
  h.state.entityList = h.state.entityList.filter(e => e !== hull);
  h.install(); assert.ok(h.pocket().length < 5);
  assert.ok(h.pocket().every(e => !sweptDiscsOverlap(e.pos, e.physicsBody.radius, hull)));
  assert.deepEqual(hull.pos, { x: 120, z: 60 }); h.close();
});

test('native offset compound in rebased world refuses the overlapping authored proposal', () => {
  const h = fixture(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const hull = h.add({ type: 'ship', pos: { x: 120, z: 60 }, vel: { x: 0, z: 0 }, radius: 8 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-880, 0, 560));
  const collider = world.createCollider(RAPIER.ColliderDesc.ball(12).setTranslation(0, 0, -60), body);
  h.native.records.set(hull.id, { entity: hull, body, colliders: [collider] });
  h.bus.emit('run:wavePlanned', { wave: 1, plan: planWave({ seed: 4242, arenaId: 'helios_core', wave: 1, ruleset: 'swarm' }) });
  assert.ok(!h.pocket().some(e => e.pos.x === 120 && e.pos.z === 0));
  assert.ok(h.pocket().length > 0);
  assert.ok(h.pocket().every(e => h.owner._ids.includes(e.id)));
  world.free(); h.close();
});

test('swept pilot escape path stays free; no existing motion is parked to admit the pocket', () => {
  const h = fixture(); h.player.vel = { x: 180, z: 0 }; h.install();
  assert.ok(!h.pocket().some(e => e.pos.x === 120 && e.pos.z === 0));
  assert.deepEqual(h.player.vel, { x: 180, z: 0 });
  assert.ok(h.pocket().every(e => !sweptDiscsOverlap(e.pos, e.physicsBody.radius, h.player))); h.close();
});

test('accepted batch reserves actual collider footprints before helper map publication', () => {
  const h = fixture({ ratingT: 180, deferred: true }); h.install();
  assert.ok(h.pocket().length > 0);
  for (const [i, a] of h.pocket().entries()) for (const b of h.pocket().slice(i + 1)) {
    assert.equal(sweptDiscsOverlap(a.pos, a.physicsBody.radius, b), false);
  }
  assert.deepEqual(h.owner._ids, h.pocket().map(e => e.id)); h.close();
});

test('failed helper admission creates no ownership or geometry reservation', () => {
  const h = fixture({ fail: true }); h.install();
  assert.deepEqual(h.pocket(), []); assert.deepEqual(h.owner._ids, []); h.close();
});

test('run-ended event releases accepted pocket before a terrain census', () => {
  const h = fixture(); h.install(); const ids = h.owner._ids.slice();
  assert.equal(ids.length, 5);
  const deadlines = h.pocket().map(e => e.data.despawnAt);
  h.bus.emit('run:ended', { reason: 'abandon' });
  assert.deepEqual(h.owner._ids, []);
  assert.ok(h.pocket().every((e, i) => e.data[SWARM_DEBRIS_TAG] && e.data.despawnAt < deadlines[i]));
  h.close();
});

test('new-game reset carries no pocket admission state to the next ordinary arena', () => {
  const h = fixture(); h.install(); const oldIds = h.owner._ids.slice();
  h.state.entities.clear(); h.state.entityList.length = 0;
  h.owner.newGame(); assert.deepEqual(h.owner._ids, []);
  const player = h.add({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8 });
  h.state.playerId = player.id; h.install();
  assert.equal(h.owner._ids.length, 5); assert.ok(h.owner._ids.every(id => !oldIds.includes(id))); h.close();
});

test('recycled native record identity cannot block the current far-away occupant', () => {
  const h = fixture(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const current = h.add({ type: 'ship', pos: { x: 1000, z: 1000 }, vel: { x: 0, z: 0 }, radius: 8 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(-880, 0, 500));
  const collider = world.createCollider(RAPIER.ColliderDesc.ball(100), body);
  h.native.records.set(current.id, { entity: { ...current }, body, colliders: [collider] });
  h.install(); assert.equal(h.pocket().length, 5); world.free(); h.close();
});

test('native hull velocity, not a stale presentation pose, owns swept admission', () => {
  const h = fixture(), world = new RAPIER.World({ x: 0, y: 0, z: 0 });
  const hull = h.add({ type: 'ship', pos: { x: 800, z: 800 }, vel: { x: 0, z: 0 }, radius: 8 });
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic()
    .setTranslation(-880, 0, 600).setLinvel(0, 0, -150));
  const collider = world.createCollider(RAPIER.ColliderDesc.ball(8), body);
  h.native.records.set(hull.id, { entity: hull, body, colliders: [collider] });
  h.install(); assert.ok(!h.pocket().some(e => e.pos.x === 120 && e.pos.z === 0));
  assert.deepEqual(hull.pos, { x: 800, z: 800 }); world.free(); h.close();
});

test('extreme occupied room refuses all proposals, without fallback or minimum-count manufacture', () => {
  const h = fixture();
  h.add({ type: 'ship', pos: { x: 0, z: 0 }, vel: { x: 0, z: 0 }, radius: 8,
    physicsBody: { radius: 1e6 } });
  h.install(); assert.deepEqual(h.pocket(), []); assert.deepEqual(h.owner._ids, []); h.close();
});

test('nonphysical distant objects do not become unknown native bounds', () => {
  const h = fixture();
  const effect = h.add({ type: 'ship', pos: { x: 1000, z: 1000 }, radius: 8, physicsBody: false });
  h.native.records.set(effect.id, { entity: effect });
  h.install(); assert.equal(h.pocket().length, 5); h.close();
});
