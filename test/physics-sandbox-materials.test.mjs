import assert from 'node:assert/strict';
import test from 'node:test';
import { createGameState } from '../src/core/gameState.js';
import { createBus } from '../src/core/eventBus.js';
import { core } from '../src/core/coreSystem.js';
import { createSg02DynamicBodyOwner } from '../src/core/sg02DynamicBodyOwner.js';
import { environmentMaterials, addEnvironmentHeat, queueEnvironmentImpact } from '../src/systems/environmentMaterials.js';
import { resolvePhysicsBodySpec } from '../src/core/physicsAuthority.js';
import { ENVIRONMENT_FAMILIES, adventureMaterialFor, environmentMaterialOf, environmentSurfaceData } from '../src/data/environmentMaterials.js';
import { swarmArena, SWARM_DEBRIS_TAG } from '../src/systems/swarmArena.js';
import { runSession } from '../src/systems/runSession.js';
import { survivalRun } from '../src/systems/survivalRun.js';
import { COMBAT_LAB_ARENAS } from '../src/data/combatLabSetups.js';
import { world as worldSystem } from '../src/systems/world.js';
import { insertAsteroidFieldRock } from '../src/world/asteroidField.js';
import { captureResourceBodyRecord, applyResourceBodyToEntity, normalizeResourceBodyRecord } from '../src/world/resourceBodyRecords.js';
import { mulberry32 } from '../src/core/rng.js';

function boot(seed = 42) {
  const state = createGameState(seed); state.mode = 'flight';
  const bus = createBus(); const helpers = {};
  const ctx = { state, bus, helpers, registry: null };
  core.init(ctx);
  const owner = Object.create(environmentMaterials); owner.init(ctx);
  return { state, bus, helpers, ctx, owner };
}
function body(h, material, x = 0, radius = 30, extra = {}) {
  return h.helpers.spawnEntity({ type: material === 'debris' ? 'wreck' : 'asteroid', pos: { x, z: 0 },
    vel: { x: 0, z: 0 }, radius, hull: 600, hullMax: 600, collides: true,
    data: environmentSurfaceData(material, { typeId: material === 'crystal' ? 'ast_crystalline' : 'ast_common_rock',
      oreHP: 600, oreHPMax: 600, yieldU: 20, fieldId: 'f_test', asteroidSlotId: String(x), homeSectorId: 'sector_ceres_belt' }), ...extra });
}

test('material queues retire missing recipients and remap saved live identities', () => {
  const h = boot();
  h.owner.deserialize({ reactions: [{ id: 7, material: 'crystal', origin: { actorId: 1 } }],
    blasts: [{ sourceId: 9, origin: { actorId: 1 }, pending: [{ ref: { id: 8 }, direction: { x: 1, z: 0 }, fall: 1 }] }] },
  new Map([['7', 70], ['8', 80], ['9', 90], ['1', 10]]));
  assert.equal(h.state.materialReactions[0].id, 70);
  assert.equal(h.state.materialReactions[0].origin.actorId, 10);
  assert.equal(h.state.materialBlasts[0].pending[0].ref.id, 80);
  assert.equal(h.state.materialBlasts[0].sourceId, 90);
  h.owner.update(1 / 60, h.state);
  assert.deepEqual(h.state.materialReactions, []);
  assert.deepEqual(h.state.materialBlasts, []);
  h.owner.destroy();
});

test('a hard common-rock slam crumbles into moving mass without breaking anchored landmarks', () => {
  const h = boot();
  const rock = body(h, 'rock', 0, 30);
  const initialMass = resolvePhysicsBodySpec(rock).mass;
  const landmark = body(h, 'crystal', 500, 80, { data: { material: 'crystal', isLandmark: true } });
  assert.equal(queueEnvironmentImpact(h.state, rock, 109), false);
  assert.equal(queueEnvironmentImpact(h.state, rock, 150, { actorId: 1 }), true);
  assert.equal(queueEnvironmentImpact(h.state, landmark, 150), false);
  assert.equal(addEnvironmentHeat(h.state, landmark, 999), false);
  h.owner.update(1 / 60, h.state);
  const fragments = h.state.entityList.filter(e => e.alive && e.data?.materialFragment);
  assert.equal(fragments.length, 4);
  assert.equal(rock.alive, false);
  assert.equal(landmark.alive, true);
  assert.ok(fragments.every(e => e.data.material === 'rock' && Math.hypot(e.vel.x, e.vel.z) > 40));
  assert.ok(Math.abs(fragments.reduce((sum, e) => sum + resolvePhysicsBodySpec(e).mass, 0) - initialMass) < 1e-6);
  assert.ok(Math.abs(fragments.reduce((sum, e) => sum + e.mass * e.vel.x, 0)) < 1e-6);
  h.owner.destroy();
});

test('old material tags infer the five families and mining RNG is independent of material pockets', () => {
  assert.equal(environmentMaterialOf({ type: 'asteroid', data: { typeId: 'ast_crystalline' } }), 'crystal');
  assert.equal(environmentMaterialOf({ type: 'asteroid', data: { opticMaterial: 'metal' } }), 'metal');
  assert.equal(environmentMaterialOf({ type: 'wreck', data: {} }), 'debris');
  const h = boot(); const world = Object.create(worldSystem); world.init(h.ctx);
  const rng = mulberry32(300); const twin = mulberry32(300);
  const samples = [];
  for (let i = 0; i < 32; i++) {
    const rock = world._spawnAsteroid({ id: 'f_test', type: 'ast_common_rock' }, { _homeSectorId: 'sector_ceres_belt' }, { x: 0, z: 0 }, 400, rng, null, null, null, i);
    for (let draw = 0; draw < 5; draw++) twin(); // angle, distance, ore HP, size, spin
    assert.equal(rock.data.material, adventureMaterialFor('ast_common_rock', 42, 'f_test', i));
    samples.push(rock.data.material);
  }
  assert.equal(rng(), twin(), 'material stamping consumes no extra geology RNG');
  assert.ok(new Set(samples).size >= 3, 'ordinary belts contain material pockets');
});

test('every ordinary Crucible arena gets all five material opportunities on its opener', () => {
  for (const arena of COMBAT_LAB_ARENAS) {
    const h = boot();
    const player = h.helpers.spawnEntity({ type: 'ship', pos: { x: 0, z: 0 }, radius: 8 }); h.state.playerId = player.id;
    runSession.init(h.ctx); survivalRun.init(h.ctx); swarmArena.init(h.ctx);
    h.bus.emit('run:beginRequested', { kind: 'survival', ruleset: 'swarm', seed: 42, arenaId: arena.id });
    h.bus.emit('run:wavePlanned', { wave: 1, plan: {} });
    const materials = new Set(h.state.entityList.filter(e => e.alive !== false && e.data?.[SWARM_DEBRIS_TAG]).map(environmentMaterialOf));
    // Every registered family, except the Hive's deliberate five-body target (no ice in the Hive):
    // that exception is named here so it cannot widen to other arenas.
    const wanted = arena.id === 'the_hive' ? ENVIRONMENT_FAMILIES.filter((m) => m !== 'cryo') : ENVIRONMENT_FAMILIES;
    for (const material of wanted) assert.ok(materials.has(material), `${arena.id} carries ${material}`);
    swarmArena.destroy();
  }
});

test('heated production crystal makes four physical moving shards and preserves remaining ore', async () => {
  const h = boot(); const crystal = body(h, 'crystal', 0, 30); crystal.data.pctEjected = 0.25;
  addEnvironmentHeat(h.state, crystal, 48); h.owner.update(1 / 60);
  assert.equal(crystal.alive, false);
  const shards = h.state.entityList.filter(e => e.alive && e.data?.materialFragment);
  assert.equal(shards.length, 4);
  assert.equal(shards.reduce((sum, e) => sum + e.data.yieldU, 0), 15);
  const native = await createSg02DynamicBodyOwner();
  native.syncFromEntities(shards); native.step(1 / 60);
  for (const shard of shards) {
    assert.ok(native.records.get(shard.id)?.body, 'the shard is a native collider');
    assert.ok(Math.hypot(shard.vel.x, shard.vel.z) > 30, 'the physical fragment keeps destructive momentum');
    assert.equal(shard.flags.persistent, true, 'flying fragments survive Continue');
  }
  native.dispose?.();
});

test('impact speed 60 triggers crystal fracture and volatile blasts ignite neighboring fuel once', () => {
  const h = boot(); const crystal = body(h, 'crystal', -300, 16);
  const fuel = body(h, 'volatile', 0, 16); const neighbor = body(h, 'volatile', 34, 16);
  h.bus.emit('physics:impact', { aId: crystal.id, bId: fuel.id, preSolveClosingSpeed: 60 });
  h.owner.update(1 / 60);
  assert.equal(crystal.alive, false); assert.equal(fuel.alive, false);
  assert.ok(neighbor.data.materialCondition.pending, 'adjacent intact fuel receives ignition heat');
  h.state.tick++; h.owner.update(1 / 60);
  assert.equal(neighbor.alive, false); assert.equal(neighbor.data.fuelVolatile, 0);
  assert.equal(h.state.materialReactions.length, 0);
});

test('eight-job limit and material save/restore retain partial heat and pending stable identities', () => {
  const h = boot();
  for (let i = 0; i < 10; i++) addEnvironmentHeat(h.state, body(h, 'crystal', i * 200), 48);
  h.owner.update(1 / 60);
  assert.equal(h.state.entityList.filter(e => e.data?.fractured && !e.data.materialFragment).length, 8);
  assert.equal(h.state.materialReactions.length, 2);
  const saved = h.owner.serialize();
  const oldId = saved.reactions[0].id;
  const pending = h.state.entities.get(oldId); h.state.entities.delete(oldId); pending.id = 999;
  h.state.entities.set(999, pending);
  h.owner.deserialize(saved); h.state.tick++; h.owner.update(1 / 60);
  assert.equal(pending.alive, false, 'saved field/slot survives a regenerated entity ID');
  const partial = body(h, 'metal', 3000); addEnvironmentHeat(h.state, partial, 15);
  const record = captureResourceBodyRecord(partial, { sectorId: 'sector_ceres_belt', fieldId: 'f_test', slotId: '3000' });
  const restored = { pos: { x: 0, z: 0 }, vel: {}, data: {} };
  applyResourceBodyToEntity(restored, normalizeResourceBodyRecord(JSON.parse(JSON.stringify(record))));
  assert.equal(restored.data.material, 'metal'); assert.equal(restored.heat, 15);
  assert.equal(restored.data.materialCondition.reacted, false);
});

test('an instantaneous material blast retains compact recipients beyond the shared promotion budget', () => {
  const h = boot(); const fuel = body(h, 'volatile', 0, 44);
  for (let i = 0; i < 25; i++) insertAsteroidFieldRock(h.state, { pos: { x: 80 + i, z: 50 }, radius: 10,
    data: { typeId: 'ast_common_rock', homeSectorId: 'sector_ceres_belt', fieldId: 'f_dense', asteroidSlotId: String(i) } });
  addEnvironmentHeat(h.state, fuel, 36); h.owner.update(1 / 60);
  assert.ok(h.state.materialBlasts[0]?.pending.length > 0, 'unpromoted recipients are retained');
  const save = h.owner.serialize(); h.owner.deserialize(save);
  for (let i = 0; i < 4; i++) { h.state.tick++; h.owner.update(1 / 60); }
  assert.equal(h.state.materialBlasts.length, 0);
  assert.equal(h.state.entityList.filter(e => e.data?.fieldId === 'f_dense').length, 25);
});
