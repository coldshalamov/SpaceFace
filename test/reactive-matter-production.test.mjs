import test from 'node:test';
import assert from 'node:assert/strict';
import { createSimulation } from '../src/core/sim.js';
import { physics } from '../src/core/physics.js';
import { reactiveMatter, installReactiveEntity } from '../src/systems/reactiveMatter.js';
import { consumeAnchoredPhysicsImpulse, consumePhysicsCommand, resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { PRODUCTION_FEATURES, applyFeatureConfigToMaps, snapshotFeatureMaps, restoreFeatureMaps } from '../src/data/featureFlags.js';

function fixture(systems = [reactiveMatter], sectorId = 'sector_helios_prime') {
  const sim = createSimulation({ seed: 19, systems });
  sim.state.mode = 'flight'; sim.state.world.currentSectorId = sectorId;
  sim.state.run = { kind: 'adventure' };
  const player = sim.spawn({ type: 'ship', isPlayer: true, mass: 16, radius: 3,
    pos: { x: -100, z: -100 }, vel: { x: 0, z: 0 }, collides: true,
    physicsBody: { shape: 'ball', mass: 16, radius: 3, dynamic: true }, data: {} });
  sim.state.playerId = player.id;
  return { sim, state: sim.state, player, system: sim.registry.get('reactiveMatter') };
}

test('Adventure habitat uses real numeric entities and one equal/opposite anchored crane recoil', () => {
  const f = fixture();
  f.sim.runTicks(1);
  const owned = f.state.entityList.filter((e) => e.data?.persistenceOwner === 'reactiveMatter');
  assert.equal(owned.length, 5);
  assert.ok(owned.every((e) => Number.isSafeInteger(e.id)));
  const crate = owned.find((e) => e.data.reactiveMatter.modelId === 'ferro_crate');
  const crane = owned.find((e) => e.data.reactiveMachine);
  const impulse = consumePhysicsCommand(crate).impulses.reduce((sum, row) => sum + row.x, 0);
  const recoil = consumeAnchoredPhysicsImpulse(crane);
  assert.ok(impulse > 0 && recoil.x < 0);
  assert.ok(Math.abs(impulse + recoil.x * resolvePhysicsBodySpec(crane).mass) < 1e-8);
  assert.equal(Object.hasOwn(f.state, 'physicsOwner'), false);
  assert.equal(Object.hasOwn(f.state, 'fieldsKernel'), false);
  assert.ok(crane.data.placeId && crate.data.authoredPayloadAssetId);
  f.sim.dispose();
});

test('a saved demo tape never commands the real Adventure player', () => {
  const f = fixture();
  f.state.reactiveMatterDemo = { tape: [{ from: 0, to: 100, thrust: 1, heading: 0, brake: 1 }] };
  f.sim.runTicks(1);
  assert.equal(consumePhysicsCommand(f.player)?.impulses.length || 0, 0);
  assert.deepEqual([f.player.vel.x, f.player.vel.z], [0, 0]);
  f.sim.dispose();
});

test('the production physics impact bus spends a canister once without a native owner on GameState', async (t) => {
  const prior = snapshotFeatureMaps();
  applyFeatureConfigToMaps(PRODUCTION_FEATURES);
  t.after(() => restoreFeatureMaps(prior));
  const f = fixture([physics, reactiveMatter], 'sector_reactive_fixture');
  f.player.pos.set(-8, 0, 0); f.player.vel.set(120, 0, 0);
  const can = installReactiveEntity(f.state, { key: 'can', modelId: 'volatile_canister', x: 0, z: 0 }, f.sim.helpers);
  const receipts = [];
  f.sim.bus.on('physics:impact', (p) => receipts.push({ aId: p.aId, bId: p.bId, speed: p.preSolveClosingSpeed }));
  const owner = f.sim.registry.get('physics');
  assert.equal(await owner.prepareBackend(f.state), true);
  f.sim.runTicks(12);
  assert.ok(receipts.some((r) => (r.aId === can.id || r.bId === can.id) && r.speed >= 48),
    JSON.stringify({ receipts, player: f.player.pos, can: can.pos, native: !!owner._sg02 }));
  assert.equal(f.state.reactiveMatterWorld.bodies.get('can').phase, 'spent');
  assert.equal(f.state.reactiveMatterWorld.reactionLog.filter((r) => r.kind === 'volatile-spent').length, 1);
  assert.equal(Object.hasOwn(f.state, 'physicsOwner'), false);
  owner.destroy?.(); f.system.destroy(); f.sim.dispose();
});

test('derived shard mass and spent custody survive the production save/return path', () => {
  const f = fixture([reactiveMatter], 'sector_ceres_belt');
  const key = 'reactive:sector_ceres_belt:gate';
  const gate = installReactiveEntity(f.state, { key, modelId: 'cryo_gate', x: 100, z: 200 }, f.sim.helpers);
  gate.heat = 100;
  f.sim.runTicks(1);
  const saved = f.system.serialize();
  const shards = saved.bodies.filter((b) => b.parentId === key);
  assert.equal(shards.length, 2);
  assert.deepEqual(shards.map((b) => b.mass), [20, 20]);
  f.system.deserialize(saved);
  f.sim.runTicks(1);
  for (const shard of shards) {
    const live = f.state.entityList.find((e) => e.alive && e.data?.reactiveMatter?.key === shard.id);
    assert.ok(live);
    assert.equal(live.mass, 20);
    assert.equal(resolvePhysicsBodySpec(live).mass, 20);
  }
  assert.equal(f.state.reactiveMatterWorld.terminal.get(key), 'fractured');
  f.sim.dispose();
});
